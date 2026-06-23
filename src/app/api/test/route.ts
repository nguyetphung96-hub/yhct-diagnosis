import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  try {
    const res = await fetch(`${url}/rest/v1/knowledge_base?select=count&limit=1`, {
      headers: {
        'apikey': key!,
        'Authorization': `Bearer ${key}`,
      }
    });
    const text = await res.text();
    return NextResponse.json({ 
      url_set: !!url, 
      key_set: !!key,
      status: res.status,
      body: text.slice(0, 200)
    });
  } catch (err: any) {
    return NextResponse.json({ 
      url_set: !!url, 
      key_set: !!key,
      error: err.message,
      cause: err.cause?.message
    });
  }
}
