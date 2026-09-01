import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/campaigns — list all campaigns
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/campaigns — create new campaign and start sending
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      template_name,
      template_body,
      contacts,
      scheduled_at,
    } = body

    if (!name || !template_name || !contacts?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: name, template_name, contacts' },
        { status: 400 }
      )
    }

    // 1. Create campaign
    const { data: campaign, error: campError } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name,
        template_name,
        template_body,
        total: contacts.length,
        status: scheduled_at ? 'draft' : 'sending',
        scheduled_at: scheduled_at || null,
        started_at: scheduled_at ? null : new Date().toISOString(),
      })
      .select()
      .single()

    if (campError) throw campError

    // 2. Insert all contacts
    const contactRows = contacts.map((c: {
      phone: string
      name?: string
      variables?: Record<string, string>
    }) => ({
      campaign_id: campaign.id,
      phone: c.phone,
      name: c.name || '',
      variables: c.variables || {},
      status: 'pending',
    }))

    const { error: contactError } = await supabaseAdmin
      .from('campaign_contacts')
      .insert(contactRows)

    if (contactError) throw contactError

    // 3. If not scheduled, trigger n8n to start sending
    if (!scheduled_at) {
      const n8nUrl = process.env.N8N_BULK_WEBHOOK_URL
      if (n8nUrl) {
        await fetch(n8nUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    campaign_id:      campaign.id,
    template_name,
    header_image_url: body.header_image_url || '',
    language_code:    'en',
    contacts,
  }),
}).catch(console.error)
      }
    }

    return NextResponse.json({ success: true, campaign_id: campaign.id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
