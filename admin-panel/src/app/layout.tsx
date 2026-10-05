import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Artemis - Dashboard',
  description: 'Security operations console for campaigns, findings, and intelligence.',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-dvh overflow-hidden`}
      suppressHydrationWarning
    >
      <body className={`${GeistSans.className} h-full min-h-0 overflow-hidden antialiased`}>
        <Providers>
          <div className="app-canvas relative z-10 box-border flex h-full min-h-0 flex-col p-3 sm:p-4">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-col">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
