import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[test-db] executing tests...');
    
    // 1. Try to insert a test row
    const testKey = 'test_key_' + Date.now();
    const insertRes = await supabase
      .from('app_data')
      .insert({ key: testKey, data: { test: true } })
      .select();

    // 2. Try to query keys
    const selectRes = await supabase
      .from('app_data')
      .select('key');

    // 3. Clean up test row if inserted
    if (insertRes.data && insertRes.data.length > 0) {
      await supabase
        .from('app_data')
        .delete()
        .eq('key', testKey);
    }

    return NextResponse.json({
      success: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'not set',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'not set',
        WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN ? 'set' : 'not set',
        WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'set' : 'not set',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'set' : 'not set',
      },
      insertResult: {
        data: insertRes.data,
        error: insertRes.error
      },
      selectResult: {
        data: selectRes.data,
        error: selectRes.error
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || error
    }, { status: 500 });
  }
}


