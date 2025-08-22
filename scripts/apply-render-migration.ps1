# PowerShell script to apply the render video URL migration to Supabase

Write-Host "🔄 Applying render video URL migration to Supabase..." -ForegroundColor Cyan

# Check for Supabase CLI
$supabaseExists = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseExists) {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Get DATABASE_URL from environment or .env.local
$databaseUrl = $env:DATABASE_URL

if (-not $databaseUrl) {
    Write-Host "⚠️  DATABASE_URL not set. Trying to read from .env.local" -ForegroundColor Yellow
    
    $envFile = ".env.local"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile
        foreach ($line in $envContent) {
            if ($line -match "^DATABASE_URL=(.+)$") {
                $databaseUrl = $matches[1]
                break
            }
        }
    }
}

if (-not $databaseUrl) {
    Write-Host "❌ DATABASE_URL not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "You can manually run the migration by:" -ForegroundColor Yellow
    Write-Host "1. Going to your Supabase dashboard"
    Write-Host "2. Opening the SQL editor"
    Write-Host "3. Pasting the contents of supabase/add-rendered-video-url.sql"
    Write-Host "4. Running the query"
    exit 1
}

# Apply migration
Write-Host "🚀 Applying migration to database..." -ForegroundColor Green

try {
    # Use psql if available
    $psqlExists = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlExists) {
        psql $databaseUrl -f "supabase\add-rendered-video-url.sql"
    } else {
        # Alternative: Use Supabase CLI
        supabase db push --file "supabase\add-rendered-video-url.sql"
    }
    
    Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The following columns have been added to video_sessions table:" -ForegroundColor Cyan
    Write-Host "  - rendered_video_url (TEXT)"
    Write-Host "  - rendered_at (TIMESTAMPTZ)"
    Write-Host "  - render_service (TEXT)"
    Write-Host "  - render_settings (JSONB)"
} catch {
    Write-Host "❌ Migration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Your database is now ready to store rendered video URLs!" -ForegroundColor Green