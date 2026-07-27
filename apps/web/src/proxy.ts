import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/setup', '/api']

export function proxy(request: NextRequest) {
  const token = request.cookies.get('cronulent_token')?.value
  const { pathname } = request.nextUrl

  // Prefix match, but only on a path boundary: a bare startsWith('/api') would
  // also make the /api-keys admin page public.
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
