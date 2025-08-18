import { NextResponse } from 'next/server'
import { supabase } from '@/src/lib/supabase'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    
    console.log('Testing auth with:', email)
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      console.error('Supabase auth error:', error)
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    
    console.log('Auth successful:', data.user?.email)
    
    return NextResponse.json({ 
      success: true, 
      user: data.user?.email,
      session: !!data.session 
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}