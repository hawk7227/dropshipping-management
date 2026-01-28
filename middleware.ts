/**
 * Next.js Middleware
 * Protects routes requiring authentication or membership
 * 
 * Route types:
 * - Public: No auth required
 * - Auth required: Must be logged in
 * - Member required: Must have active membership
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

// ============================================================================
// ROUTE CONFIGURATION
// ============================================================================

const ROUTES = {
  // Routes requiring authentication
  authRequired: [
    '/account',
    '/account/:path*',
    '/dashboard',
    '/dashboard/:path*',
    '/products',
    '/products/:path*',
    '/prices',
    '/prices/:path*',
    '/social',
    '/social/:path*',
    '/channels',
    '/channels/:path*',
    '/ai',
    '/ai/:path*',
    '/analytics',
    '/analytics/:path*',
    '/sourcing',
    '/sourcing/:path*',
    '/orders',
    '/orders/:path*',
    '/membership/checkout',
    '/membership/success',
  ],

  // Routes requiring active membership
  memberRequired: [
    '/member-deals',
    '/member-deals/:path*',
    '/early-access',
    '/early-access/:path*',
  ],

  // Routes only for non-members (redirect members away)
  nonMemberOnly: ['/membership/join'],

  // API routes requiring authentication
  authApiRoutes: [
    '/api/membership/:path*',
    '/api/orders/:path*',
    '/api/account/:path*',
  ],

  // Public routes (no auth needed)
  publicRoutes: [
    '/',
    '/cart',
    '/checkout',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/membership',
    '/membership/:path*',
    '/about',
    '/contact',
    '/faq',
    '/terms',
    '/privacy',
    '/api/webhooks/:path*',
    '/api/auth/:path*',
    '/api/cart/:path*',
    '/api/products/public',
    '/api/checkout',
  ],
};

// ============================================================================
// ROUTE MATCHING
// ============================================================================

/**
 * Check if path matches a route pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Convert route pattern to regex
  const regexPattern = pattern
    .replace(/\//g, '\\/') // Escape slashes
    .replace(/:path\*/g, '.*') // :path* matches anything
    .replace(/:\w+/g, '[^/]+'); // :param matches single segment

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Check if path is in a list of route patterns
 */
function isInRouteList(path: string, routes: string[]): boolean {
  return routes.some((route) => matchesPattern(path, route));
}

// ============================================================================
// MEMBERSHIP CHECK
// ============================================================================

/**
 * Check if user has active membership
 */
async function checkMembershipStatus(
  supabase: ReturnType<typeof createMiddlewareClient>,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('status')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return ['active', 'trialing'].includes(data.status);
  } catch (error) {
    console.error('[middleware] Membership check error:', error);
    return false;
  }
}

// ============================================================================
// MIDDLEWARE FUNCTION
// ============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Skip public routes
  if (isInRouteList(pathname, ROUTES.publicRoutes)) {
    return NextResponse.next();
  }

  // Create response for Supabase client
  const response = NextResponse.next();

  // Create Supabase middleware client
  const supabase = createMiddlewareClient({ req: request, res: response });

  // Get session
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('[middleware] Session error:', sessionError);
  }

  const isAuthenticated = !!session?.user;
  const userId = session?.user?.id;

  // ============================================================================
  // AUTH REQUIRED ROUTES
  // ============================================================================

  if (
    isInRouteList(pathname, ROUTES.authRequired) ||
    isInRouteList(pathname, ROUTES.authApiRoutes)
  ) {
    if (!isAuthenticated) {
      console.log('[middleware] Auth required, user not authenticated');

      // API routes return 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // Page routes redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ============================================================================
  // MEMBER REQUIRED ROUTES
  // ============================================================================

  if (isInRouteList(pathname, ROUTES.memberRequired)) {
    if (!isAuthenticated) {
      console.log('[middleware] Member route, user not authenticated');

      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const isMember = await checkMembershipStatus(supabase, userId!);

    if (!isMember) {
      console.log('[middleware] Member route, user is not a member');

      const membershipUrl = new URL('/membership', request.url);
      membershipUrl.searchParams.set('upgrade', 'required');
      membershipUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(membershipUrl);
    }
  }

  // ============================================================================
  // NON-MEMBER ONLY ROUTES
  // ============================================================================

  if (isInRouteList(pathname, ROUTES.nonMemberOnly)) {
    if (isAuthenticated && userId) {
      const isMember = await checkMembershipStatus(supabase, userId);

      if (isMember) {
        console.log('[middleware] Member accessing non-member route');
        return NextResponse.redirect(new URL('/account', request.url));
      }
    }
  }

  // ============================================================================
  // ADD USER INFO TO HEADERS
  // ============================================================================

  if (isAuthenticated && userId) {
    response.headers.set('x-user-id', userId);
    response.headers.set('x-user-email', session.user.email || '');
  }

  return response;
}

// ============================================================================
// MIDDLEWARE CONFIG
// ============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
