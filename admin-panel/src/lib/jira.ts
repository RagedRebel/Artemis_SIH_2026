import { db } from './db'

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com'
const ATLASSIAN_API_URL = 'https://api.atlassian.com'

export interface JiraConnection {
  id: string
  site_url: string
  cloud_id: string
  access_token: string
  refresh_token: string
  token_expires_at: Date
  scopes: string | null
  project_key: string | null
  issue_type: string
  connected_by: string | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  critical: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Lowest',
}

export function getJiraAuthUrl(state: string): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID!,
    scope: 'read:jira-work write:jira-work offline_access',
    redirect_uri: process.env.JIRA_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/jira/callback`,
    state,
    response_type: 'code',
    prompt: 'consent',
  })
  return `${ATLASSIAN_AUTH_URL}/authorize?${params.toString()}`
}

export async function exchangeJiraCode(code: string) {
  const res = await fetch(`${ATLASSIAN_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID!,
      client_secret: process.env.JIRA_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.JIRA_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/jira/callback`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Jira token exchange failed: ${res.status} ${body}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }>
}

export async function getAccessibleResources(accessToken: string) {
  const res = await fetch(`${ATLASSIAN_API_URL}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`Failed to fetch accessible resources: ${res.status}`)
  return res.json() as Promise<Array<{ id: string; url: string; name: string }>>
}

async function refreshToken(connection: JiraConnection): Promise<string> {
  if (new Date(connection.token_expires_at) > new Date(Date.now() + 60_000)) {
    return connection.access_token
  }

  const res = await fetch(`${ATLASSIAN_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.JIRA_CLIENT_ID!,
      client_secret: process.env.JIRA_CLIENT_SECRET!,
      refresh_token: connection.refresh_token,
    }),
  })

  if (!res.ok) throw new Error(`Jira token refresh failed: ${res.status}`)

  const data = await res.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await db.query(
    `UPDATE jira_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
    [data.access_token, data.refresh_token, expiresAt, connection.id]
  )

  return data.access_token as string
}

async function jiraFetch(connection: JiraConnection, path: string, init?: RequestInit) {
  const token = await refreshToken(connection)
  const url = `${ATLASSIAN_API_URL}/ex/jira/${connection.cloud_id}/rest/api/3${path}`

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Jira API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function getProjects(connection: JiraConnection) {
  return jiraFetch(connection, '/project/search?maxResults=50')
}

export async function createIssue(
  connection: JiraConnection,
  opts: { summary: string; description: string; severity: string; labels?: string[] }
) {
  const projectKey = connection.project_key
  if (!projectKey) throw new Error('No project_key configured for this Jira connection')

  const body = {
    fields: {
      project: { key: projectKey },
      summary: opts.summary,
      description: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: opts.description }] }],
      },
      issuetype: { name: connection.issue_type || 'Task' },
      priority: { name: SEVERITY_TO_PRIORITY[opts.severity] || 'Medium' },
      labels: opts.labels ?? [],
    },
  }

  return jiraFetch(connection, '/issue', { method: 'POST', body: JSON.stringify(body) }) as Promise<{
    id: string
    key: string
    self: string
  }>
}

export async function getTransitions(connection: JiraConnection, issueKey: string) {
  const data = await jiraFetch(connection, `/issue/${issueKey}/transitions`)
  return data.transitions as Array<{ id: string; name: string }>
}

export async function transitionIssue(connection: JiraConnection, issueKey: string, targetStatus: string) {
  const transitions = await getTransitions(connection, issueKey)

  const match = transitions.find(
    (t) => t.name.toLowerCase() === targetStatus.toLowerCase()
  )
  if (!match) {
    const doneish = transitions.find((t) =>
      ['done', 'resolved', 'closed', 'complete'].includes(t.name.toLowerCase())
    )
    if (!doneish) throw new Error(`No matching transition to "${targetStatus}" for ${issueKey}`)
    await jiraFetch(connection, `/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: doneish.id } }),
    })
    return
  }

  await jiraFetch(connection, `/issue/${issueKey}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: match.id } }),
  })
}

export async function getActiveJiraConnections(): Promise<JiraConnection[]> {
  const result = await db.query(`SELECT * FROM jira_connections WHERE is_active = true`)
  return result.rows
}
