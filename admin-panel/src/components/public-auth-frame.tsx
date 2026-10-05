import type { ReactNode } from 'react'

/**
 * Login / setup layout: dark rounded shell (app shell colours), white hero copy on top,
 * nested light card(s) below — same palette as the rest of ARTEMIS, not the mockup tints.
 */
export function PublicAuthFrame({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-[#0a0a0b] p-5 shadow-2xl shadow-black/40 ring-1 ring-white/5 sm:rounded-[1.75rem] sm:p-7 lg:rounded-[2rem]">
      <div className="flex flex-col">
        <div className="min-h-0 flex-1 pb-6 sm:pb-8">{hero}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
