'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Search, Bell, ChevronDown, LogOut, UserRound, Server, Target, ShieldAlert } from 'lucide-react'

type Props = {
  userName: string
  userEmail: string
  userImage?: string | null
  notificationDot?: boolean
}

export function DashboardTopBar({ userName, userEmail, userImage, notificationDot = true }: Props) {
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLLabelElement>(null)
  const [campaignsList, setCampaignsList] = useState<{ id: string; name: string }[]>([])
  const [hostsList, setHostsList] = useState<{ id: string; hostname: string }[]>([])
  const [fetchedSearch, setFetchedSearch] = useState(false)

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [notifList, setNotifList] = useState<any[]>([])
  const [fetchedNotif, setFetchedNotif] = useState(false)

  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoverTimer = () => {
    if (hoverOpenTimer.current) {
      clearTimeout(hoverOpenTimer.current)
      hoverOpenTimer.current = null
    }
  }

  const initials = userName
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Click outside handlers
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (searchFocused && searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setSearchFocused(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, searchFocused, notifOpen])

  // Lazy fetch search data
  useEffect(() => {
    if (!searchFocused || fetchedSearch) return
    let mounted = true
    async function loadData() {
      try {
        const [cRes, hRes] = await Promise.all([
          fetch('/api/campaigns').then(r => r.json()),
          fetch('/api/topology').then(r => r.json()),
        ])
        if (!mounted) return
        if (cRes.campaigns) setCampaignsList(cRes.campaigns)
        if (hRes.nodes) setHostsList(hRes.nodes)
        setFetchedSearch(true)
      } catch (err) {
        console.error('Failed search lazy fetch:', err)
      }
    }
    loadData()
    return () => { mounted = false }
  }, [searchFocused, fetchedSearch])

  // Fetch notifications periodically
  useEffect(() => {
    let mounted = true
    async function loadNotif() {
      try {
        const res = await fetch('/api/notifications').then(r => r.json())
        if (!mounted) return
        if (res.items) setNotifList(res.items)
        setFetchedNotif(true)
      } catch (err) {
        console.error('Failed notif fetch:', err)
      }
    }
    
    loadNotif()
    const intervalId = setInterval(loadNotif, 1000)
    
    return () => { 
      mounted = false
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current)
    }
  }, [])

  const searchResults: { type: string; text: string; id: string; icon: any; href: string }[] = []
  if (searchQuery.length > 1) {
    const q = searchQuery.toLowerCase()
    campaignsList.forEach(c => {
      if (c.name.toLowerCase().includes(q)) {
        searchResults.push({ type: 'campaign', text: c.name, id: c.id, icon: Target, href: `/campaigns?id=${c.id}` })
      }
    })
    hostsList.forEach(h => {
      if ((h.hostname || '').toLowerCase().includes(q) || h.id.includes(q)) {
        searchResults.push({ type: 'host', text: h.hostname || h.id, id: h.id, icon: Server, href: `/topology?ip=${h.id}` })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 pb-8 lg:flex-row lg:items-center lg:justify-between relative z-50">
      <div
        ref={menuRef}
        className="relative shrink-0 pb-1.5 z-50"
        onMouseEnter={() => {
          clearHoverTimer()
          hoverOpenTimer.current = setTimeout(() => setMenuOpen(true), 220)
        }}
        onMouseLeave={() => {
          clearHoverTimer()
          setMenuOpen(false)
        }}
      >
        <button
          type="button"
          className="group flex w-full max-w-full items-center gap-3 rounded-2xl px-1 py-1 text-left outline-none ring-offset-2 transition-colors hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:pr-2"
          onClick={() => {
            clearHoverTimer()
            setMenuOpen(o => !o)
          }}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-full bg-zinc-900 text-sm font-semibold text-white ring-2 ring-white shadow-sm">
            {userImage && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center" aria-hidden>
                {initials}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="flex items-center gap-1 text-base font-semibold tracking-tight text-zinc-900">
              <span className="truncate">{userName}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </p>
            <p className="truncate text-sm text-zinc-500">{userEmail}</p>
          </div>
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Account"
            className="absolute left-0 top-full z-[200] min-w-[12rem] pt-1"
          >
            <div className="rounded-xl border border-zinc-200 bg-white py-1.5 shadow-lg shadow-zinc-900/10">
              <Link
                role="menuitem"
                href="/profile"
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
                onClick={() => setMenuOpen(false)}
              >
                <UserRound className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                Edit profile
              </Link>
              <div className="my-1 h-px bg-zinc-100" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-start gap-3 lg:justify-end">
        <label ref={searchRef} className="relative hidden w-full max-w-md flex-1 sm:block z-50">
          <span className="sr-only">Search</span>
          <Search
            className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200 ${searchFocused ? 'text-[#bef264]' : 'text-zinc-400'}`}
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search campaigns or hosts..."
            className="h-11 w-full rounded-full border border-zinc-200/90 bg-white pl-11 pr-4 text-sm text-zinc-900 shadow-sm outline-none transition-shadow placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/[0.04]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
          />
          
          {/* Autocomplete Dropdown */}
          {searchFocused && (searchQuery.length > 1 || !fetchedSearch) && (
            <div className="absolute top-full right-0 left-0 mt-2 z-[300] bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="max-h-80 overflow-y-auto p-2">
                {!fetchedSearch && (
                  <div className="p-4 text-sm text-zinc-400 text-center flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-zinc-200 border-t-zinc-400 rounded-full animate-spin block" />
                    Searching database...
                  </div>
                )}
                
                {fetchedSearch && searchResults.length === 0 && (
                  <p className="p-4 text-sm text-zinc-500 text-center">No campaigns or hosts found.</p>
                )}
                
                {fetchedSearch && searchResults.length > 0 && searchResults.map((res, i) => (
                  <Link 
                    key={res.id + i}
                    href={res.href}
                    onClick={() => {
                      setSearchFocused(false)
                      setSearchQuery('')
                    }}
                    className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer group"
                  >
                    <div className="bg-zinc-100 p-2 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all text-zinc-600">
                      <res.icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-semibold text-zinc-900">{res.text}</span>
                      <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">{res.type}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </label>

        <div ref={notifRef} className="relative z-40">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 shadow-sm transition-colors ${notifOpen ? 'bg-zinc-100' : 'bg-white hover:bg-zinc-50'}`}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-zinc-600" />
            {notificationDot && notifList.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#bef264] ring-2 ring-white" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 z-[300] bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
                <span className="text-sm font-bold text-zinc-900">Recent Alerts</span>
                <Link href="/alerts" onClick={() => setNotifOpen(false)} className="text-[11px] font-bold text-zinc-400 hover:text-zinc-600 uppercase tracking-wider">
                  View all
                </Link>
              </div>
              <div className="max-h-[350px] overflow-y-auto p-2">
                {!fetchedNotif && (
                  <div className="p-6 text-sm text-zinc-400 text-center flex flex-col items-center justify-center gap-3">
                    <span className="h-5 w-5 border-2 border-zinc-200 border-t-zinc-400 rounded-full animate-spin block" />
                    Loading alerts...
                  </div>
                )}

                {fetchedNotif && notifList.length === 0 && (
                  <p className="p-6 text-sm text-zinc-500 text-center">No recent alerts found.</p>
                )}

                {fetchedNotif && notifList.length > 0 && notifList.map((alert, i) => (
                  <Link 
                    key={alert.id || i}
                    href={alert.type === 'approval' ? '/approvals' : alert.type === 'incident' ? '/incidents' : '/alerts'}
                    onClick={() => setNotifOpen(false)}
                    className="flex items-start gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer group"
                  >
                    <div className={`mt-0.5 p-1.5 rounded-md flex-shrink-0 ${
                      alert.severity === 'critical' || alert.severity === 'high' ? 'bg-red-100 text-red-600' : 
                      alert.severity === 'medium' ? 'bg-orange-100 text-orange-600' : 
                      'bg-zinc-100 text-zinc-500'
                    }`}>
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col text-left overflow-hidden">
                      <span className="text-sm font-semibold text-zinc-900 truncate" title={alert.title || 'Notification'}>
                        {alert.title || 'Notification'}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-medium text-zinc-500 capitalize">
                          {alert.type || 'System'}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-zinc-300" />
                        <span className="text-[10px] text-zinc-400">
                          {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
