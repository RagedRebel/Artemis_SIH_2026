export const dynamic = 'force-dynamic'

import { Sidebar } from '@/components/sidebar'
import { getNavBadges } from '@/lib/nav-badges'
import { AutoRefresh } from '@/components/auto-refresh'

/** Outer shell radius — keep in sync with `Sidebar` left corners */
const SHELL = 'rounded-[1.5rem] sm:rounded-[1.75rem] lg:rounded-[2rem]'
const MAIN_INSET = 'rounded-[1.125rem] sm:rounded-[1.35rem] lg:rounded-[1.5rem]'

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const badges = await getNavBadges()

  return (
    <div
      className={`flex min-h-0 flex-1 overflow-hidden border border-zinc-800 bg-[#0a0a0b] shadow-2xl shadow-black/50 ring-1 ring-white/5 ${SHELL}`}
    >
      <AutoRefresh interval={15000} />
      <Sidebar badges={badges} shellRadiusClass={SHELL} />
      {/* Dark gutter: same fill as sidebar so the light workspace reads as an inset card */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col py-2 pr-2 pb-2 pl-1 pt-2 sm:py-2.5 sm:pr-2.5 sm:pl-1.5 lg:py-3 lg:pr-3">
        <div
          className={`app-main-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-zinc-300/70 bg-zinc-100 ${MAIN_INSET}`}
        >
          <div className="app-main-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
