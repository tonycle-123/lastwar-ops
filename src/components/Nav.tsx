'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ALLIANCE_TAG, SERVER_NUM } from '@/lib/types'

const links = [
  { href: '/',          label: 'Roster'    },
  { href: '/duel',      label: 'Alliance Duel' },
  { href: '/train',     label: 'Train Log' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 font-bold text-lg tracking-wide">
            ⚔️ {ALLIANCE_TAG}
          </span>
          <span className="text-gray-500 text-sm">Server {SERVER_NUM}</span>
        </div>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-yellow-400 text-gray-950'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
