'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ALLIANCE_TAG, SERVER_NUM } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/',       label: 'Roster',        icon: 'ti-users'   },
  { href: '/duel',   label: 'Alliance Duel',  icon: 'ti-trophy'  },
  { href: '/train',  label: 'Train Log',      icon: 'ti-train'   },
  { href: '/import', label: 'Import',         icon: 'ti-upload'  },
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
    <header style={{ background: '#0d0d0f', borderBottom: '1px solid #2a1f0a', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #b8860b, #ffd700)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
            ⚔️
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#ffd700', letterSpacing: '0.05em' }}>
            {ALLIANCE_TAG} OPS
          </span>
          <span style={{ fontSize: 11, color: '#4a3820', marginLeft: 4 }}>Server {SERVER_NUM}</span>
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
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none',
                  transition: 'all 0.15s',
                  background:   active ? '#1a1200' : 'transparent',
                  border:       active ? '1px solid #b8860b' : '1px solid transparent',
                  color:        active ? '#ffd700' : '#7a6030',
                }}
              >
                <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 13 }} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          style={{ fontSize: 11, color: '#4a3820', border: '1px solid #2a1f0a', background: 'transparent', padding: '4px 12px', borderRadius: 5, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
