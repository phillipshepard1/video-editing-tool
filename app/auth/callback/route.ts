import { createClient } from '../../../utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')
  
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data?.session) {
      // Check if this is a password recovery session
      const isRecovery = data.session?.user?.recovery_sent_at
      
      if (isRecovery || next === '/reset-password') {
        // This is a password reset flow, redirect to reset-password
        return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
      }
      
      // Regular auth flow, redirect to dashboard or next page
      return NextResponse.redirect(new URL(next ?? '/dashboard', requestUrl.origin))
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/error', requestUrl.origin))
}