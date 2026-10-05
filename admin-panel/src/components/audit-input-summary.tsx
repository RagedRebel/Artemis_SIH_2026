import { getAuditInputSummary } from '@/lib/describe-audit-input'

export function AuditInputSummary({ toolName, input }: { toolName: string; input: unknown }) {
  const rows = getAuditInputSummary(toolName, input)

  return (
    <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
      <dl className="space-y-3.5">
        {rows.map((row, i) => (
          <div key={`${row.label}-${i}`}>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">{row.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
