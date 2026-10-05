'use client'

interface TopologyNode {
  id: string
  label: string
  os: string
  ports: unknown[]
  findingsCount: number
  maxSeverity: string
}

function severityNodeColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#ef4444'
    case 'high':
      return '#f97316'
    case 'medium':
      return '#ca8a04'
    case 'low':
      return '#16a34a'
    default:
      return '#a3e635'
  }
}

export function TopologyMap({ nodes }: { nodes: TopologyNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="flex min-h-88 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300/80 bg-zinc-50/50 px-6 py-12 text-center">
        <p className="text-sm font-medium text-zinc-700">No hosts discovered yet</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Run a campaign to populate the network topology from reconnaissance data.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {nodes.map(node => (
        <div
          key={node.id}
          className="space-y-2 rounded-xl border border-zinc-200/90 bg-zinc-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-zinc-300/90 hover:bg-white"
        >
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: severityNodeColor(node.maxSeverity) }}
            />
            <span className="font-mono text-sm font-semibold text-zinc-900">{node.id}</span>
          </div>

          {node.label !== node.id && <p className="text-xs text-zinc-500">{node.label}</p>}

          {node.os && <p className="text-xs text-zinc-600">OS: {node.os}</p>}

          <p className="text-xs">
            <span className="font-medium text-zinc-500">Ports</span>{' '}
            <span className="font-mono text-zinc-800">
              {(node.ports as Array<{ port: number }>).map(p => p.port).join(', ') || '—'}
            </span>
          </p>

          <p className="text-xs">
            <span className="font-medium text-zinc-500">Findings</span>{' '}
            <span
              className={
                node.findingsCount > 0 ? 'font-semibold text-red-600' : 'font-medium text-emerald-600'
              }
            >
              {node.findingsCount}
            </span>
          </p>
        </div>
      ))}
    </div>
  )
}
