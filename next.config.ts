import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-XSS-Protection',           value: '1; mode=block' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          {
            key:   'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net fonts.googleapis.com",
              "font-src 'self' cdn.jsdelivr.net fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self' *.supabase.co api.anthropic.com",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
