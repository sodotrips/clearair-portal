import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Tech users can only access /tech
    if (token?.role === 'Tech') {
      if (!path.startsWith('/tech') && !path.startsWith('/api')) {
        return NextResponse.redirect(new URL('/tech', req.url));
      }
    }

    // Dispatchers can only access main dashboard (no analytics, financials, reminders, tech portal)
    if (token?.role === 'Dispatcher') {
      if (path.startsWith('/dashboard/financials') ||
          path.startsWith('/dashboard/analytics') ||
          path.startsWith('/dashboard/reminders') ||
          path.startsWith('/tech')) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Allow public paths
        if (path === '/login' || path.startsWith('/api/auth')) {
          return true;
        }

        // All other paths require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/tech/:path*',
    '/login',
  ],
};
