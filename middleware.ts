import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as jose from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-for-development-only');

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  // Protect /dashboard and API routes (except login and seed)
  if (
    request.nextUrl.pathname.startsWith('/dashboard') ||
    (request.nextUrl.pathname.startsWith('/api') &&
     !request.nextUrl.pathname.startsWith('/api/auth') &&
     !request.nextUrl.pathname.startsWith('/api/seed'))
  ) {
    if (!token) {
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      await jose.jwtVerify(token, secret);
      return NextResponse.next();
    } catch (err) {
      // Invalid token
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
