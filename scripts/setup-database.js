#!/usr/bin/env node

// Database setup script
// Run this to ensure all tables are created in Supabase

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndCreateTables() {
  console.log('Checking database tables...\n');

  try {
    // Check if video_sessions table exists
    const { data: tables, error: tableError } = await supabase
      .from('video_sessions')
      .select('id')
      .limit(1);

    if (tableError && tableError.code === '42P01') {
      console.log('❌ video_sessions table does not exist');
      console.log('\n📝 To create the table, run this SQL in your Supabase dashboard:\n');
      console.log('1. Go to https://app.supabase.com/project/[your-project]/sql');
      console.log('2. Copy and paste the contents of: supabase/video-sessions-migration.sql');
      console.log('3. Click "Run"\n');
      return false;
    } else if (tableError) {
      console.log('⚠️ Error checking video_sessions table:', tableError.message);
      console.log('\nPossible issues:');
      console.log('- Check your Supabase credentials in .env.local');
      console.log('- Make sure RLS policies are correctly set up');
      console.log('- Ensure you\'re logged in when saving sessions\n');
      return false;
    } else {
      console.log('✅ video_sessions table exists');
      
      // Try to get table structure info
      const { data: sessionData, error: sessionError } = await supabase
        .from('video_sessions')
        .select('*')
        .limit(0);
      
      if (!sessionError) {
        console.log('✅ video_sessions table is accessible');
        return true;
      } else {
        console.log('⚠️ video_sessions table exists but has access issues:', sessionError.message);
        return false;
      }
    }
  } catch (error) {
    console.error('Error checking database:', error);
    return false;
  }
}

async function testSessionSave() {
  console.log('\nTesting session save functionality...\n');
  
  try {
    // Get current user (if authenticated)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('⚠️ No authenticated user found');
      console.log('Sessions require authentication. Make sure you\'re logged in.\n');
      return;
    }
    
    console.log('✅ Authenticated as:', user.email);
    
    // Try to create a test session
    const testSession = {
      user_id: user.id,
      session_name: 'Test Session',
      original_filename: 'test.mp4',
      video_url: 'https://example.com/test.mp4',
      video_duration: 60,
      segments: [],
      clusters: [],
      cluster_selections: [],
      current_step: 3
    };
    
    const { data, error } = await supabase
      .from('video_sessions')
      .insert(testSession)
      .select()
      .single();
    
    if (error) {
      console.log('❌ Failed to save test session:', error.message);
      console.log('\nDebug info:', error);
    } else {
      console.log('✅ Test session saved successfully!');
      console.log('Session ID:', data.id);
      
      // Clean up test session
      const { error: deleteError } = await supabase
        .from('video_sessions')
        .delete()
        .eq('id', data.id);
      
      if (!deleteError) {
        console.log('✅ Test session cleaned up');
      }
    }
  } catch (error) {
    console.error('Error testing session save:', error);
  }
}

// Run checks
(async () => {
  console.log('🔧 Video Editor Database Setup Check\n');
  console.log('================================\n');
  
  const tablesOk = await checkAndCreateTables();
  
  if (tablesOk) {
    await testSessionSave();
  }
  
  console.log('\n================================');
  console.log('\n✨ Setup check complete!\n');
})();