import { logoutAction } from '../../actions/auth'
import { LogOut } from 'lucide-react'
import { ThemeToggle } from '../../components/theme-toggle'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center justify-between px-6">
        <span className="font-semibold text-foreground">Cronulent</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
