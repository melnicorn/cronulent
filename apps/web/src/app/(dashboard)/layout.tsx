import Link from 'next/link'
import { logoutAction } from '../../actions/auth'
import { LayoutList, Settings } from 'lucide-react'
import { ThemeToggle } from '../../components/theme-toggle'
import { Button } from '@heroui/react'

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 98 96" fill="currentColor" aria-hidden="true">
      <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
  )
}

function Footer() {
  const currentYear = new Date().getFullYear()
  const startYear = 2026
  const yearDisplay = currentYear > startYear ? `${startYear}–${currentYear}` : `${startYear}`

  return (
    <footer className="flex-none h-10 border-t border-border flex items-center justify-between px-4 sm:px-6 text-xs text-muted-foreground shrink-0 bg-footer">
      <a
        href="https://reachingrandom.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors"
      >
        © {yearDisplay} Reaching Random LLC
      </a>
      <a
        href="https://github.com/melnicorn/cronulent"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <GitHubIcon size={14} />
        <span className="hidden sm:inline">GitHub</span>
      </a>
    </footer>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex-none h-14 border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0 bg-header">
        <div className="flex flex-col">
          <span className="text-xl font-light text-foreground tracking-wide">Cronulent</span>
          <span className="text-xs font-light text-muted-foreground tracking-wide">An acceptable and fine cron scheduler</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutList size={16} />
            <span className="hidden sm:inline">Tasks</span>
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">Out</span>
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-auto overscroll-contain p-4 sm:p-6">{children}</main>
      <Footer />
    </div>
  )
}
