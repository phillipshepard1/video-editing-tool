'use client'

import { useState } from 'react'
import { useAuth } from '../../src/contexts/AuthContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Loader2, Video, Check, Eye, EyeOff, Sparkles, ArrowRight, Shield, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  
  // Add debug logging
  console.log('RegisterPage: Rendering component')
  
  const { signUp } = useAuth()
  const router = useRouter()
  
  console.log('RegisterPage: Component rendered successfully')

  const passwordRequirements = [
    { text: 'At least 8 characters', met: password.length >= 8 },
    { text: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { text: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { text: 'Contains number', met: /[0-9]/.test(password) },
  ]

  const passwordStrength = passwordRequirements.filter(req => req.met).length
  const strengthText = ['Weak', 'Fair', 'Good', 'Strong'][passwordStrength - 1] || 'Too Weak'
  const strengthColor = ['red', 'orange', 'yellow', 'green'][passwordStrength - 1] || 'gray'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate passwords match
    if (password !== confirmPassword) {
      const errorMsg = 'Passwords do not match'
      setError(errorMsg)
      toast.error(errorMsg)
      setLoading(false)
      return
    }

    // Validate password strength
    if (!passwordRequirements.every(req => req.met)) {
      const errorMsg = 'Password does not meet all requirements'
      setError(errorMsg)
      toast.error(errorMsg)
      setLoading(false)
      return
    }

    // Show loading toast
    const loadingToast = toast.loading('Creating your account...')

    const { error } = await signUp(email, password, fullName)
    
    if (error) {
      const errorMessage = error.message || 'Failed to create account'
      setError(errorMessage)
      toast.error(errorMessage, { id: loadingToast })
      setLoading(false)
    } else {
      setSuccess(true)
      toast.success('Account created successfully! Check your email to verify.', { 
        id: loadingToast,
        duration: 5000 
      })
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }

  return (
    <div className="h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4 relative overflow-hidden overflow-y-auto">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title with animation */}
        <div className="text-center mb-4 animate-fade-in-down">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-2 shadow-2xl shadow-purple-500/25 animate-pulse-slow">
            <Video className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Join the Journey
          </h1>
          <p className="text-gray-600 text-sm flex items-center justify-center gap-2">
            <Zap className="w-3 h-3 text-yellow-400" />
            Start creating amazing videos today
            <Zap className="w-3 h-3 text-yellow-400" />
          </p>
        </div>

        {/* Registration Form with glassmorphism effect */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-2xl border border-gray-200 animate-fade-in-up">
          {success ? (
            <div className="text-center py-12 animate-scale-in">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-4 animate-bounce-slow">
                <Check className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-2">Welcome Aboard!</h3>
              <p className="text-gray-600 mb-2">Your account has been created successfully</p>
              <p className="text-sm text-gray-500">Redirecting to login...</p>
              <div className="mt-4 flex justify-center">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-200"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-400"></div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Full Name Input */}
              <div className="space-y-1">
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 ml-1">
                  Full Name
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'fullName' ? 'scale-[1.02]' : ''}`}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className={`h-4 w-4 transition-colors duration-300 ${focusedField === 'fullName' ? 'text-purple-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">
                  Email Address
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'email' ? 'scale-[1.02]' : ''}`}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className={`h-4 w-4 transition-colors duration-300 ${focusedField === 'email' ? 'text-purple-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 ml-1">
                  Password
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'password' ? 'scale-[1.02]' : ''}`}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className={`h-4 w-4 transition-colors duration-300 ${focusedField === 'password' ? 'text-purple-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
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
                
                {/* Password Strength Indicator - Compact */}
                {password && (
                  <div className="space-y-1 mt-2">
                    <div className="flex gap-1">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i < passwordStrength
                              ? `bg-${strengthColor}-500`
                              : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                      {passwordRequirements.map((req, index) => (
                        <div key={index} className="flex items-center text-xs">
                          {req.met ? (
                            <Check className="w-3 h-3 mr-1 text-green-400" />
                          ) : (
                            <div className="w-3 h-3 mr-1 rounded-full border border-gray-400" />
                          )}
                          <span className={`${req.met ? 'text-green-400' : 'text-gray-500'} text-xs`}>
                            {req.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 ml-1">
                  Confirm Password
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'confirmPassword' ? 'scale-[1.02]' : ''}`}>
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className={`h-4 w-4 transition-colors duration-300 ${focusedField === 'confirmPassword' ? 'text-purple-500' : 'text-gray-400'}`} />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 hover:bg-gray-50"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-purple-500 transition-colors duration-300 cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1 animate-fade-in">
                    <Shield className="w-3 h-3" />
                    Passwords do not match
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/50 rounded-lg animate-shake">
                  <p className="text-xs text-red-400 flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    {error}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden cursor-pointer"
              >
                <span className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
                {loading ? (
                  <span className="flex items-center justify-center relative text-base">
                    <Loader2 className="animate-spin -ml-1 mr-3 h-4 w-4" />
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center justify-center relative text-base">
                    Create Account
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </button>
            </form>
          )}

          {/* Sign In Link */}
          {!success && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-purple-600 hover:text-purple-700 transition-all duration-200">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Features badges - Compact */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="bg-white/60 backdrop-blur-sm rounded-full px-3 py-1.5 border border-gray-200 flex items-center gap-1.5 hover:bg-white/80 transition-all duration-300">
            <Shield className="w-3 h-3 text-purple-500" />
            <span className="font-medium text-gray-700 text-xs">Secure</span>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-full px-3 py-1.5 border border-gray-200 flex items-center gap-1.5 hover:bg-white/80 transition-all duration-300">
            <Zap className="w-3 h-3 text-yellow-500" />
            <span className="font-medium text-gray-700 text-xs">Fast</span>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-full px-3 py-1.5 border border-gray-200 flex items-center gap-1.5 hover:bg-white/80 transition-all duration-300">
            <Sparkles className="w-3 h-3 text-pink-500" />
            <span className="font-medium text-gray-700 text-xs">AI-Powered</span>
          </div>
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
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
        .animation-delay-400 {
          animation-delay: 0.4s;
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
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        @keyframes scale-in {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.5s ease-out;
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