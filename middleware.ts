import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BASIC_AUTH_REALM = 'Restricted Area';
const BASIC_AUTH_USERNAME = (process.env.BASIC_AUTH_USERNAME || 'admin').trim();
const BASIC_AUTH_PASSWORD = (process.env.BASIC_AUTH_PASSWORD || 'xuhhin-keXpiz-0mipbi').trim();

function requiresAuth(pathname: string): boolean {
  // Allow test page and its API endpoint without auth
  if (pathname === '/test-damac-map' || pathname.startsWith('/test-damac-map/')) return false;
  if (pathname === '/api/damac/map' || pathname.startsWith('/api/damac/map/')) return false;
  if (pathname === '/api/damac/ler' || pathname.startsWith('/api/damac/ler/')) return false;

  // Protect other damac routes
  if (pathname === '/damac') return true;
  if (pathname.startsWith('/damac/')) return true;
  if (pathname === '/api/damac') return true;
  if (pathname.startsWith('/api/damac/')) return true;

  // Protect admin routes
  if (pathname === '/admin') return true;
  if (pathname.startsWith('/admin/')) return true;
  if (pathname === '/api/admin') return true;
  if (pathname.startsWith('/api/admin/')) return true;

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!requiresAuth(pathname)) {
    return NextResponse.next();
  }

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const encoded = header.substring(6);
    try {
      const decoded = atob(encoded);
      const separator = decoded.indexOf(':');
      if (separator !== -1) {
        const username = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        if (username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD) {
          return NextResponse.next();
        }
      }
    } catch {
      // Fall through to unauthorized when decoding fails
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`,
    },
  });
}

export const config = {
  matcher: ['/test-damac-map', '/test-damac-map/:path*', '/damac', '/damac/:path*', '/api/damac', '/api/damac/:path*', '/admin', '/admin/:path*', '/api/admin', '/api/admin/:path*'],
};
