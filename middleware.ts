import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BASIC_AUTH_REALM = 'Restricted Area';
const BASIC_AUTH_USERNAME = (process.env.BASIC_AUTH_USERNAME || 'admin').trim();
const BASIC_AUTH_PASSWORD = (process.env.BASIC_AUTH_PASSWORD || 'xuhhin-keXpiz-0mipbi').trim();

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt') return true;
  if (/\.[^/]+$/.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
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
  matcher: ['/:path*'],
};
