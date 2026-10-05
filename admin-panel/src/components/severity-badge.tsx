import { cn, severityColor } from '@/lib/utils'

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        severityColor(severity)
      )}
    >
      {severity}
    </span>
  )
}
