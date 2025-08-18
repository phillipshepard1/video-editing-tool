import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Video Analysis Tool',
  },
});

export async function GET(request: NextRequest) {
  try {
    console.log('Testing OpenRouter connection...');
    
    // Test with a simple image
    const completion = await openrouter.chat.completions.create({
      model: 'google/gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is in this image? Respond with a brief description.'
            },
            {
              type: 'image_url',
              image_url: {
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
              }
            }
          ]
        }
      ],
      max_tokens: 100,
    });

    return NextResponse.json({
      success: true,
      model: completion.model,
      response: completion.choices[0].message.content,
      usage: completion.usage,
    });

  } catch (error) {
    console.error('OpenRouter test error:', error);
    return NextResponse.json(
      { 
        error: 'OpenRouter test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}