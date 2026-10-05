import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type AppPageHeaderProps = {
  eyebrow: string
  title: string
  description?: string
  /** Toolbar on the right (e.g. primary link button). */
  aside?: ReactNode
  className?: string
}

/** Shared page title block: lime dot, uppercase eyebrow, large title, zinc subtitle. */
export function AppPageHeader({ eyebrow, title, description, aside, className }: AppPageHeaderProps) {
  return (
    <div className={cn('border-b border-zinc-200/80 pb-8', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-800">
            <span
              className="size-2 shrink-0 rounded-full bg-lime-500 shadow-[0_0_0_3px_rgba(163,230,53,0.45)]"
              aria-hidden
            />
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-base text-zinc-500">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </div>
  )
}

/** Small section label above lists (e.g. Pending, History). */
export function AppSectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500',
        className
      )}
    >
      {children}
    </h2>
  )
}
