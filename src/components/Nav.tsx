'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ALLIANCE_TAG, ALLIANCE_NAME, SERVER_NUM } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/',       label: 'Roster',       icon: 'ti-users'  },
  { href: '/duel',   label: 'Duel',         icon: 'ti-trophy' },
  { href: '/train',  label: 'Train',        icon: 'ti-train'  },
  { href: '/import', label: 'Import',       icon: 'ti-upload' },
]

export default function Nav() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (pathname === '/login') return null

  return (
    <header style={{ background: '#1e3a7a', borderBottom: '2px solid #2a4a8a', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-sword" aria-hidden="true" style={{ fontSize: 20, color: '#f5c842' }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: '#f5c842', letterSpacing: '0.04em' }}>[{ALLIANCE_TAG}]</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7aaaff' }}>{ALLIANCE_NAME}</span>
          <span style={{ fontSize: 11, color: '#4a6aaa', marginLeft: 2 }}>· S{SERVER_NUM}</span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 6 }}>
          {links.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none',
                  transition: 'all 0.15s',
                  background: '#1e3060',
                  border: active ? '1.5px solid #f5c842' : '1.5px solid #2e4a80',
                  color: active ? '#f5c842' : '#ffffff',
                }}
              >
                <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 12 }} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          style={{ background: '#1e3060', border: '1.5px solid #2e4a80', color: '#ffffff', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
