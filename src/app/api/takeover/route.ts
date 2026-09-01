import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// PATCH /api/takeover
// Body: { conversation_id, ai_mode: boolean }
export async function PATCH(req: NextRequest) {
  try {
    const { conversation_id, ai_mode } = await req.json()

    if (!conversation_id || typeof ai_mode !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing conversation_id or ai_mode' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('conversations')
      .update({ ai_mode })
      .eq('id', conversation_id)

    if (error) throw error
    return NextResponse.json({ success: true, ai_mode })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error }, { status: 500 })
  }
}
