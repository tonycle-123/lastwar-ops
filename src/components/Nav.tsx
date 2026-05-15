'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ALLIANCE_TAG, ALLIANCE_NAME, SERVER_NUM } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/',       label: 'Roster',       icon: 'ti-users'   },
  { href: '/duel',   label: 'Alliance Duel', icon: 'ti-trophy'  },
  { href: '/train',  label: 'Train Log',     icon: 'ti-train'   },
  { href: '/import', label: 'Import',        icon: 'ti-upload'  },
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
    <header style={{ background: '#0a1020', borderBottom: '2px solid #1e3a6e', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: '#1a2d5a', border: '2px solid #f5a623', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
            ⚔️
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#f5a623', letterSpacing: '0.06em' }}>
            [{ALLIANCE_TAG}]
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7ab4f5' }}>{ALLIANCE_NAME}</span>
          <span style={{ fontSize: 11, color: '#2a4a7a', marginLeft: 2 }}>· S{SERVER_NUM}</span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 2 }}>
          {links.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none',
                  transition: 'all 0.15s',
                  background:   active ? '#1a3060' : 'transparent',
                  border:       active ? '1px solid #2a5090' : '1px solid transparent',
                  color:        active ? '#7ab4f5' : '#4a6a9a',
                }}
              >
                <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 13, color: active ? '#f5a623' : '#2a4a7a' }} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          style={{ fontSize: 11, color: '#2a4a7a', border: '1px solid #1e3a6e', background: 'transparent', padding: '4px 12px', borderRadius: 5, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
