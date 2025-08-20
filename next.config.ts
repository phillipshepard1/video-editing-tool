import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Disable TypeScript errors during builds (optional)
  typescript: {
    ignoreBuildErrors: true,
  },
  
  experimental: {
    // Increase body size limit for video uploads
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  
  // API routes config
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: '100mb',
  },
  
  // Allow video domains for Next.js Image component if needed
  images: {
    domains: [
      'leeslkgwtmgfewsbxwyu.supabase.co', // Your Supabase domain
      'render-api.chillin.online',
    ],
  },
  
  // Webpack config for handling large files
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(mp4|webm|ogg|swf|ogv)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/videos/',
          outputPath: 'static/videos/',
        },
      },
    });
    
    return config;
  },
};

export default nextConfig;