'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [info, setInfo] = useState<any>({});
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setInfo({
        url: window.location.href,
        userAgent: navigator.userAgent,
        env: {
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          NODE_ENV: process.env.NODE_ENV,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Information</h1>
      <pre className="bg-gray-800 p-4 rounded overflow-auto">
        {JSON.stringify(info, null, 2)}
      </pre>
      <div className="mt-4">
        <p className="text-green-400">✓ Next.js app is loading</p>
        <p className="text-green-400">✓ React is rendering</p>
        <p className="text-green-400">✓ Client-side JavaScript is executing</p>
      </div>
    </div>
  );
}