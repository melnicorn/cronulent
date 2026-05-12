import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'My App',
  description: 'Clean Next.js App'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body>
        <header>Header</header>
        <div className='layout-body'>
          <aside>Side Panel</aside>
          <main>{children}</main>
        </div>
        <footer>Footer</footer>
      </body>
    </html>
  )
}
