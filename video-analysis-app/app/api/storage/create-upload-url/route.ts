import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { fileName, bucketName = 'videos' } = await request.json();
    
    if (!fileName) {
      return NextResponse.json(
        { error: 'File name is required' },
        { status: 400 }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Ensure bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);
    
    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5368709120, // 5GB
        allowedMimeTypes: ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm']
      });
    }

    // Create a signed upload URL that bypasses size limits
    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUploadUrl(fileName);

    if (error) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json(
        { error: 'Failed to create upload URL', details: error.message },
        { status: 500 }
      );
    }

    // Get the public URL for later use
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      publicUrl,
      path: data.path,
      bucketName
    });

  } catch (error) {
    console.error('Error in create-upload-url:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}