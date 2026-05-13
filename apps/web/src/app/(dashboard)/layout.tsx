import { logoutAction } from '../../actions/auth'
import { LogOut, Github } from 'lucide-react'
import { ThemeToggle } from '../../components/theme-toggle'

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
        <Github size={14} />
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      <Footer />
    </div>
  )
}
