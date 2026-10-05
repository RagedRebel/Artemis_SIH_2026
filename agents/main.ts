import { fork, type ChildProcess } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface AgentDef {
  name: string
  script: string
  restartDelay: number
}

const AGENTS: AgentDef[] = [
  {
    name: 'campaign-handler',
    script: resolve(__dirname, 'orchestrator/campaign-handler.js'),
    restartDelay: 3_000,
  },
  {
    name: 'blue-team',
    script: resolve(__dirname, 'blue-team/runner.js'),
    restartDelay: 5_000,
  },
  {
    name: 'cve-intel',
    script: resolve(__dirname, 'cve-intel/scheduler.js'),
    restartDelay: 5_000,
  },
  {
    name: 'cve-executor',
    script: resolve(__dirname, 'orchestrator/cve-executor.js'),
    restartDelay: 5_000,
  }
]

const children = new Map<string, ChildProcess>()
let shuttingDown = false

function ts() {
  return new Date().toISOString()
}

function startAgent(agent: AgentDef) {
  if (shuttingDown) return

  console.log(`[${ts()}] [main] Starting ${agent.name} → ${agent.script}`)

  const child = fork(agent.script, [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: process.env,
  })

  children.set(agent.name, child)

  child.on('exit', (code, signal) => {
    children.delete(agent.name)
    if (shuttingDown) return

    console.error(
      `[${ts()}] [main] ${agent.name} exited (code=${code}, signal=${signal}). ` +
        `Restarting in ${agent.restartDelay / 1000}s...`,
    )
    setTimeout(() => startAgent(agent), agent.restartDelay)
  })

  child.on('error', (err) => {
    console.error(`[${ts()}] [main] ${agent.name} error: ${err.message}`)
  })
}

function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n[${ts()}] [main] Received ${signal} — shutting down all agents...`)

  for (const [name, child] of children) {
    console.log(`[${ts()}] [main] Stopping ${name} (pid=${child.pid})`)
    child.kill('SIGTERM')
  }

  setTimeout(() => {
    for (const [name, child] of children) {
      console.log(`[${ts()}] [main] Force killing ${name}`)
      child.kill('SIGKILL')
    }
    process.exit(0)
  }, 5_000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

console.log(`[${ts()}] [main] ╔════════════════════════════════════════╗`)
console.log(`[${ts()}] [main] ║   ARTEMIS Agent Supervisor             ║`)
console.log(`[${ts()}] [main] ║   Starting ${AGENTS.length} agents...                 ║`)
console.log(`[${ts()}] [main] ╚════════════════════════════════════════╝`)

for (const agent of AGENTS) {
  startAgent(agent)
}
