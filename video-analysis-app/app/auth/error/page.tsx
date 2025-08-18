'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, RefreshCw, Video } from 'lucide-react'

export default function AuthErrorPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl mb-4 shadow-2xl shadow-purple-500/25">
            <Video className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Error Container */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-gray-200">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Error</h2>
            
            <p className="text-gray-700 mb-8">
              The authentication link is invalid or has expired. This can happen if:
            </p>
            
            <ul className="text-left text-gray-600 mb-8 space-y-2">
              <li className="flex items-start">
                <span className="text-red-600 mr-2">•</span>
                The link has already been used
              </li>
              <li className="flex items-start">
                <span className="text-red-600 mr-2">•</span>
                The link expired (links are valid for 1 hour)
              </li>
              <li className="flex items-start">
                <span className="text-red-600 mr-2">•</span>
                The link was incomplete or corrupted
              </li>
            </ul>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/forgot-password')}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-300 flex items-center justify-center cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Request New Reset Link
              </button>
              
              <button
                onClick={() => router.push('/login')}
                className="w-full py-3 px-4 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all duration-300 flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}