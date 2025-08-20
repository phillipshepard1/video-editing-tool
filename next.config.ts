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
      bodySizeLimit: '2gb',  // Updated to match 2GB limit across the system
    },
  },
  
  // API routes config
  api: {
    bodyParser: {
      sizeLimit: '2gb',  // Updated to match 2GB limit
    },
    responseLimit: '2gb',  // Updated to match 2GB limit
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