import { type NextRequest, NextResponse } from 'next/server'
import { clearSessionToken } from '../../../../lib/session'

export async function GET(request: NextRequest) {
  await clearSessionToken()
  return NextResponse.redirect(new URL('/login', request.url))
}
