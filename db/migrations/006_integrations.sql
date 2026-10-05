-- 006_integrations.sql — Jira & Slack integration tables

-- ── Jira Connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_connections (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_url         TEXT NOT NULL,
  cloud_id         TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes           TEXT,
  project_key      TEXT,
  issue_type       TEXT NOT NULL DEFAULT 'Task',
  connected_by     UUID REFERENCES users(id),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Slack Connections ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_connections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id             TEXT NOT NULL,
  team_name           TEXT NOT NULL,
  bot_token           TEXT NOT NULL,
  bot_user_id         TEXT,
  channel_id          TEXT,
  channel_name        TEXT,
  incoming_webhook_url TEXT,
  connected_by        UUID REFERENCES users(id),
  notify_incidents    BOOLEAN NOT NULL DEFAULT true,
  notify_approvals    BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Incident ↔ Jira Mapping ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_jira_map (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id        UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  jira_connection_id UUID NOT NULL REFERENCES jira_connections(id) ON DELETE CASCADE,
  jira_issue_id      TEXT NOT NULL,
  jira_issue_key     TEXT NOT NULL,
  jira_issue_url     TEXT NOT NULL,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_jira_map_incident ON incident_jira_map(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_jira_map_key      ON incident_jira_map(jira_issue_key);

-- ── Approval ↔ Slack Message Mapping ─────────────────────────────
CREATE TABLE IF NOT EXISTS approval_slack_map (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id         UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  slack_connection_id UUID NOT NULL REFERENCES slack_connections(id) ON DELETE CASCADE,
  slack_channel_id    TEXT NOT NULL,
  slack_message_ts    TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_slack_map_approval ON approval_slack_map(approval_id);
