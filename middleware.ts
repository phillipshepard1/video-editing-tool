import { type NextRequest } from 'next/server'
import { updateSession } from './utils/supabase/middleware'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Update user session
  const { response, user } = await updateSession(request)
  
  const pathname = request.nextUrl.pathname
  console.log('Middleware - Path:', pathname, 'User:', !!user, user?.email)

  // Define public routes (no authentication required)
  const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/callback', '/auth/error']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  // Define auth routes that should redirect to dashboard if already logged in
  const authRoutes = ['/login', '/register']
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route))

  // If accessing protected route without user, redirect to login
  if (!isPublicRoute && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If accessing auth routes with active session, redirect to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect root to dashboard if authenticated
  if (pathname === '/' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect root to login if not authenticated
  if (pathname === '/' && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - files with extensions (e.g., .css, .js, .png)
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
}