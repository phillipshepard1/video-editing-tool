'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../../src/contexts/AuthContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2, Video, Eye, EyeOff, Sparkles, ArrowRight, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const { signIn } = useAuth()
  const router = useRouter()

  // Check for reset password errors in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const errorCode = urlParams.get('error_code')
    const errorDescription = urlParams.get('error_description')
    
    if (errorCode === 'otp_expired') {
      toast.error('Your password reset link has expired. Please request a new one.')
      // Clean up URL
      router.replace('/login')
    } else if (errorCode) {
      toast.error(errorDescription || 'An error occurred. Please try again.')
      // Clean up URL
      router.replace('/login')
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Show loading toast
    const loadingToast = toast.loading('Signing in...')

    try {
      const result = await signIn(email, password)
      
      if (result.error) {
        console.error('Login error:', result.error)
        const errorMessage = result.error.message || 'Failed to sign in'
        setError(errorMessage)
        toast.error(errorMessage, { id: loadingToast })
        setLoading(false)
      } else {
        console.log('Login successful, redirecting...')
        toast.success('Welcome back!', { id: loadingToast })
        // Small delay to show success message
        setTimeout(() => {
          router.replace('/dashboard')
        }, 500)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      const errorMessage = 'An unexpected error occurred'
      setError(errorMessage)
      toast.error(errorMessage, { id: loadingToast })
      setLoading(false)
    }
  }

  return (
    <div className="h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title with animation */}
        <div className="text-center mb-6 animate-fade-in-down">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-3 shadow-2xl shadow-purple-500/25 animate-pulse-slow">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h1>
          <p className="text-gray-600 text-base flex items-center justify-center gap-2">
            <Sparkles className="w-3 h-3 text-purple-400" />
            Sign in to your creative workspace
            <Sparkles className="w-3 h-3 text-pink-400" />
          </p>
        </div>

        {/* Login Form with glassmorphism effect */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-gray-200 animate-fade-in-up">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input with enhanced styling */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">
                Email Address
              </label>
              <div className={`relative transition-all duration-300 ${focusedField === 'email' ? 'scale-[1.02]' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 transition-colors duration-300 ${focusedField === 'email' ? 'text-purple-500' : 'text-gray-400'}`} />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full pl-10 pr-3 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Input with enhanced styling */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 ml-1">
                Password
              </label>
              <div className={`relative transition-all duration-300 ${focusedField === 'password' ? 'scale-[1.02]' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors duration-300 ${focusedField === 'password' ? 'text-purple-500' : 'text-gray-400'}`} />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full pl-10 pr-12 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-purple-500 transition-colors duration-300 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password with better styling */}
            <div className="flex items-center justify-between">
              <div className="flex items-center group">
                <input
                  id="remember"
                  type="checkbox"
                  className="h-4 w-4 text-purple-500 focus:ring-purple-500 border-gray-300 rounded bg-white transition-transform duration-200 group-hover:scale-110 cursor-pointer"
                />
                <label htmlFor="remember" className="ml-2 block text-sm text-gray-600 group-hover:text-gray-700 transition-colors cursor-pointer">
                  Remember me
                </label>
              </div>
              <Link href="/forgot-password" className="text-sm text-purple-600 hover:text-purple-700 transition-colors duration-200 hover:underline cursor-pointer">
                Forgot password?
              </Link>
            </div>

            {/* Error Message with animation */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg animate-shake">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button with enhanced animation */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden cursor-pointer"
            >
              <span className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
              {loading ? (
                <span className="flex items-center justify-center relative text-lg">
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center justify-center relative text-lg">
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          {/* Sign Up Link with better styling */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-center text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium text-purple-600 hover:text-purple-700 transition-all duration-200 underline">
                Sign up for free
              </Link>
            </p>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center text-xs text-gray-600 bg-white/60 backdrop-blur-sm rounded-full px-4 py-2 border border-gray-200">
          <Shield className="w-3 h-3 mr-2 text-purple-500" />
          <span className="font-medium">Secured with end-to-end encryption</span>
        </div>
      </div>

      {/* Add CSS for animations */}
      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out;
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out 0.2s both;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}