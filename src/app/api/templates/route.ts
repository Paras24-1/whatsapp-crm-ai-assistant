import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const wabaId      = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID

    if (!accessToken || !wabaId) {
      return NextResponse.json({ error: 'Missing WhatsApp credentials' }, { status: 500 })
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates?status=APPROVED&limit=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }
    )

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 500 })
    }

    // Format templates for frontend
    const templates = data.data.map((t: any) => ({
      id:       t.id,
      name:     t.name,
      language: t.language,
      status:   t.status,
      category: t.category,
      body:     t.components?.find((c: any) => c.type === 'BODY')?.text || '',
      header:   t.components?.find((c: any) => c.type === 'HEADER')?.text || '',
      footer:   t.components?.find((c: any) => c.type === 'FOOTER')?.text || '',
      variables: (t.components?.find((c: any) => c.type === 'BODY')?.text || '')
        .match(/{{\d+}}/g) || [],
    }))

    return NextResponse.json(templates)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
