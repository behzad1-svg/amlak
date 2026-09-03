import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_secret_key_for_development'
);

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  // Protect /api and /dashboard routes
  if (
    request.nextUrl.pathname.startsWith('/api/customers') ||
    request.nextUrl.pathname.startsWith('/api/properties') ||
    request.nextUrl.pathname.startsWith('/dashboard')
  ) {
    if (!token) {
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      await jwtVerify(token, secret);
    } catch (err) {
      if (request.nextUrl.pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/customers/:path*', '/api/properties/:path*', '/dashboard/:path*'],
};
