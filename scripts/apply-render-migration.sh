#!/bin/bash

# Script to apply the render video URL migration to Supabase

echo "🔄 Applying render video URL migration to Supabase..."

# Check if we have Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Apply the migration
echo "📝 Running migration: add-rendered-video-url.sql"

# Option 1: Using Supabase CLI (if you have it configured)
# supabase db push --file supabase/add-rendered-video-url.sql

# Option 2: Direct PostgreSQL connection (requires DATABASE_URL)
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set. Trying to read from .env.local"
    if [ -f .env.local ]; then
        export $(cat .env.local | grep DATABASE_URL | xargs)
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found. Please set it in your environment or .env.local"
    echo ""
    echo "You can manually run the migration by:"
    echo "1. Going to your Supabase dashboard"
    echo "2. Opening the SQL editor"
    echo "3. Pasting the contents of supabase/add-rendered-video-url.sql"
    echo "4. Running the query"
    exit 1
fi

# Apply migration using psql
echo "🚀 Applying migration to database..."
psql "$DATABASE_URL" < supabase/add-rendered-video-url.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "The following columns have been added to video_sessions table:"
    echo "  - rendered_video_url (TEXT)"
    echo "  - rendered_at (TIMESTAMPTZ)"
    echo "  - render_service (TEXT)"
    echo "  - render_settings (JSONB)"
else
    echo "❌ Migration failed. Please check your database connection."
    exit 1
fi

echo ""
echo "🎉 Your database is now ready to store rendered video URLs!"