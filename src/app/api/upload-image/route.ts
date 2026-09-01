import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get('filename') || `bulk-headers/${Date.now()}.jpg`

    const buffer = await req.arrayBuffer()
    const contentType = req.headers.get('content-type') || 'image/jpeg'

    const { error } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(filename, buffer, {
        contentType,
        upsert: true,
      })

    if (error) throw error

    const { data } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(filename)

    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    console.error('[upload-image]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
