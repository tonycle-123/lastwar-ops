import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import { ALLIANCE_TAG, SERVER_NUM } from '@/lib/types'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: `${ALLIANCE_TAG} Ops — Server ${SERVER_NUM}`,
  description: `Alliance management for Server ${SERVER_NUM} / ${ALLIANCE_TAG}`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Nav />
        <main className="lw-page">
          {children}
        </main>
      </body>
    </html>
  )
}
