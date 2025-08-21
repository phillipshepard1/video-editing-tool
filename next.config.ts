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
  
  // Allow video domains for Next.js Image component if needed
  images: {
    domains: [
      'leeslkgwtmgfewsbxwyu.supabase.co', // Your Supabase domain
      'render-api.chillin.online',
      'shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com', // Shotstack output CDN
      'shotstack-assets.s3.ap-southeast-2.amazonaws.com', // Shotstack assets CDN
      'cdn.shotstack.io', // Shotstack main CDN
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