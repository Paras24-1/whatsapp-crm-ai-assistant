import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { campaign_id, phone, status, error: errMsg, wamid } = body

    // If wamid is provided (coming from Meta webhook), look up by wamid
    if (wamid && !campaign_id) {
      const { data: contact } = await supabaseAdmin
        .from('campaign_contacts')
        .select('campaign_id, phone')
        .eq('wamid', wamid)
        .single()

      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

      await supabaseAdmin
        .from('campaign_contacts')
        .update({ status, error: errMsg || null })
        .eq('wamid', wamid)

      await recalcCampaign(contact.campaign_id)
      return NextResponse.json({ success: true })
    }

    // Otherwise coming from bulk sender — save wamid + set status
    if (!campaign_id || !phone) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    await supabaseAdmin
      .from('campaign_contacts')
      .update({
        status: status || 'sent',
        wamid: wamid || null,
        error: errMsg || null,
        sent_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign_id)
      .eq('phone', phone)

    await recalcCampaign(campaign_id)
    return NextResponse.json({ success: true })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function recalcCampaign(campaign_id: string) {
  const { data: counts } = await supabaseAdmin
    .from('campaign_contacts')
    .select('status')
    .eq('campaign_id', campaign_id)

  if (!counts) return

  const sent      = counts.filter((c) => c.status === 'sent').length
  const delivered = counts.filter((c) => c.status === 'delivered').length
  const failed    = counts.filter((c) => c.status === 'failed').length
  const pending   = counts.filter((c) => c.status === 'pending').length

  await supabaseAdmin
    .from('campaigns')
    .update({
      sent,
      delivered,
      failed,
      status: pending === 0 ? 'completed' : 'sending',
      completed_at: pending === 0 ? new Date().toISOString() : null,
    })
    .eq('id', campaign_id)
}
