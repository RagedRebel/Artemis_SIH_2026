'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  BarChart2,
  Swords,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Database,
  CheckSquare,
  Network,
  ClipboardList,
  Plug,
  Plus,
  Sparkles,
  LogOut,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { NavBadges } from '@/lib/nav-badges'

const NAV_ITEMS: {
  href: string
  label: string
  icon: typeof BarChart2
  badgeKey?: keyof NavBadges
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart2 },
  { href: '/campaigns', label: 'Campaigns', icon: Swords },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/incidents', label: 'Incidents', icon: ShieldAlert, badgeKey: 'openIncidents' },
  { href: '/cve', label: 'CVE Intel', icon: Database },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, badgeKey: 'pendingApprovals' },
  { href: '/findings/review', label: 'Review queue', icon: ShieldCheck },
  { href: '/topology', label: 'Topology', icon: Network },
  { href: '/audit', label: 'Audit log', icon: ClipboardList },
  { href: '/integrations', label: 'Integrations', icon: Plug },
]

export function Sidebar({
  badges,
  shellRadiusClass = 'rounded-[1.5rem] sm:rounded-[1.75rem] lg:rounded-[2rem]',
}: {
  badges: NavBadges
  /** Must match app shell outer radius (left corners only) */
  shellRadiusClass?: string
}) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-[268px] shrink-0 flex-col overflow-hidden rounded-r-none bg-[#0a0a0b] text-zinc-300',
        // Mirror only the left side of the parent shell radius
        shellRadiusClass.replace(/rounded-/g, 'rounded-l-')
      )}
    >
      <div className="px-6 pb-2 pt-7">
        <Link href="/dashboard" className="inline-flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Logo" className="h-7 w-auto" />
          <div className="inline-flex items-baseline gap-0.5">
            <span className="text-xl font-bold tracking-tight text-white">artemis</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">ai</span>
          </div>
        </Link>
      </div>

      <Separator className="mx-5 bg-white/8" />

      <ScrollArea className="mt-2 flex min-h-0 flex-1 px-3 pb-4 pt-2">
        <nav className="space-y-1 pr-2" aria-label="Primary">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const count = item.badgeKey ? badges[item.badgeKey] : 0
            const showBadge = count > 0

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-200',
                      active
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:bg-white/6 hover:text-white'
                    )}
                  >
                    <item.icon
                      className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-zinc-900' : 'opacity-80')}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {showBadge && (
                      <span
                        className={cn(
                          'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                          active ? 'bg-primary text-zinc-900' : 'bg-primary text-zinc-900'
                        )}
                      >
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="hidden border-zinc-700 bg-zinc-900 lg:block">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="mt-auto p-4 space-y-3">
        <div className="overflow-hidden rounded-2xl bg-linear-to-br from-[#d9f99d] via-primary to-[#84cc16] p-5 shadow-lg shadow-lime-900/20">
          <div className="mb-1 flex items-center gap-2 text-zinc-900">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wide">Quick action</span>
          </div>
          <p className="mb-4 text-sm font-semibold leading-snug text-zinc-900">
            Launch a new assessment campaign against your scope.
          </p>
          <Link
            href="/campaigns/new"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New campaign
          </Link>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-800 bg-transparent py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/6 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  )
}
