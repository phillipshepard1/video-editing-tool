#!/bin/bash

echo "🚀 Deploying Video Editor to Production Server"
echo "=============================================="

# Create logs directory if it doesn't exist
mkdir -p logs

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the Next.js application
echo "🔨 Building Next.js application..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please check the errors above."
    exit 1
fi

# Copy production env file if exists
if [ -f ".env.production" ]; then
    echo "📋 Using .env.production for environment variables"
    cp .env.production .env.local
fi

# Stop existing PM2 processes
echo "🛑 Stopping existing PM2 processes..."
pm2 stop ecosystem.config.js

# Delete old PM2 processes
pm2 delete ecosystem.config.js

# Start new PM2 processes
echo "🚀 Starting PM2 processes..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script (optional)
# pm2 startup

echo "✅ Deployment complete!"
echo ""
echo "📊 Check status with: pm2 status"
echo "📝 View logs with: pm2 logs"
echo "🔍 Debug at: http://YOUR_SERVER_IP:3002/debug"
echo ""
echo "If you see a white page, check:"
echo "1. Browser console for errors (F12)"
echo "2. PM2 logs: pm2 logs video-editor-web"
echo "3. Debug page: http://YOUR_SERVER_IP:3002/debug"