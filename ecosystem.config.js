require('dotenv').config({ path: '.env.production' });

module.exports = {
  apps: [
    {
      // Web application (Next.js)
      name: 'video-editor-web',
      script: 'npm',
      args: 'start',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        NEXT_PUBLIC_APP_URL: 'http://159.65.177.149:3002',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        CHILLIN_API_KEY: process.env.CHILLIN_API_KEY,
        CHILLIN_API_URL: process.env.CHILLIN_API_URL,
        SHOTSTACK_API_KEY: process.env.SHOTSTACK_API_KEY,
        SHOTSTACK_ENV: process.env.SHOTSTACK_ENV
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      time: true
    },
    {
      // Background workers (same server)
      name: 'video-editor-workers',
      script: 'npm',
      args: 'run workers',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        CHILLIN_API_KEY: process.env.CHILLIN_API_KEY,
        CHILLIN_API_URL: process.env.CHILLIN_API_URL,
        SHOTSTACK_API_KEY: process.env.SHOTSTACK_API_KEY,
        SHOTSTACK_ENV: process.env.SHOTSTACK_ENV
      },
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      time: true
    }
  ]
};