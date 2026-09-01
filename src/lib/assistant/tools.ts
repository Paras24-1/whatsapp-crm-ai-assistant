import { supabaseAdmin } from '@/lib/supabase'

export interface UserContext {
  id: string
  email: string
  name: string
  role: 'admin' | 'employee'
}

export interface ToolLogEntry {
  userId?: string
  userEmail?: string
  userRole?: string
  toolName: string
  params: Record<string, any>
  status: 'success' | 'error'
  errorMessage?: string
  executionMs: number
}

// Log tool execution for audit / debug
export async function logToolExecution(entry: ToolLogEntry) {
  try {
    await supabaseAdmin.from('assistant_tool_logs').insert({
      user_id: entry.userId || null,
      user_email: entry.userEmail || null,
      user_role: entry.userRole || null,
      tool_name: entry.toolName,
      params: entry.params,
      status: entry.status,
      error_message: entry.errorMessage || null,
      execution_ms: entry.executionMs,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    // Non-blocking if table doesn't exist yet
    console.warn('[Tool Audit Log Warning]:', err)
  }
}

// ============================================================
// Server-Side Date Resolution Helper
// ============================================================
export function resolveDateRange(
  startDateStr?: string,
  endDateStr?: string
): { startDate: Date; endDate: Date; startIso: string; endIso: string } {
  const now = new Date()

  // Default: start of today to end of today if nothing given
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const normalizeToken = (val?: string) => (val || '').toLowerCase().trim()

  const startToken = normalizeToken(startDateStr)
  const endToken = normalizeToken(endDateStr)

  if (startToken === 'today' || startToken === 'current_day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (startToken === 'yesterday') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
  } else if (startToken === 'tomorrow') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999)
  } else if (startToken === 'this_week' || startToken === 'this week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday as start
    start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999)
  } else if (startToken === 'last_week' || startToken === 'last week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7
    start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999)
  } else if (startToken === 'this_month' || startToken === 'this month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  } else if (startToken === 'last_month' || startToken === 'last month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  } else if (startToken === 'all_time' || startToken === 'all') {
    start = new Date(2020, 0, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear() + 2, 11, 31, 23, 59, 59, 999)
  } else {
    // Try parsing ISO or standard date strings
    if (startDateStr) {
      const parsedStart = new Date(startDateStr)
      if (!isNaN(parsedStart.getTime())) {
        start = parsedStart
        // If no time component in date string (length <= 10 e.g. "2026-09-02"), set to beginning of day
        if (startDateStr.length <= 10) {
          start.setHours(0, 0, 0, 0)
        }
      }
    }

    if (endDateStr && endToken !== 'today' && endToken !== 'now') {
      const parsedEnd = new Date(endDateStr)
      if (!isNaN(parsedEnd.getTime())) {
        end = parsedEnd
        if (endDateStr.length <= 10) {
          end.setHours(23, 59, 59, 999)
        }
      }
    } else if (!endDateStr && startDateStr && startDateStr.length <= 10) {
      // If only a single date like "2026-09-02" is provided without end_date, treat as full single day
      end = new Date(start)
      end.setHours(23, 59, 59, 999)
    }
  }

  return {
    startDate: start,
    endDate: end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

// Find a lead by ID, phone number, or name match
export async function findLeadMatch(leadIdentifier: string) {
  const trimmed = leadIdentifier.trim()
  const cleanPhone = trimmed.replace(/\D/g, '')

  // 1. Try by lead ID
  if (trimmed.length > 20) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', trimmed)
      .maybeSingle()
    if (lead) return lead
  }

  // 2. Try by phone number
  if (cleanPhone.length >= 7) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .or(`phone_number.eq.${cleanPhone},phone_number.eq.+${cleanPhone},phone_number.ilike.%${cleanPhone.slice(-10)}%`)
      .limit(1)
      .maybeSingle()
    if (lead) return lead

    // Check conversations
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .or(`phone_number.eq.${cleanPhone},phone_number.eq.+${cleanPhone},phone_number.ilike.%${cleanPhone.slice(-10)}%`)
      .limit(1)
      .maybeSingle()
    if (conv) {
      return {
        id: conv.id,
        conversation_id: conv.id,
        name: conv.name,
        phone_number: conv.phone_number,
        stage: conv.stage,
        assigned_to: conv.assigned_to,
      }
    }
  }

  // 3. Try by Name match (case-insensitive)
  const { data: leadByName } = await supabaseAdmin
    .from('leads')
    .select('*')
    .ilike('name', `%${trimmed}%`)
    .limit(1)
    .maybeSingle()
  if (leadByName) return leadByName

  const { data: convByName } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .ilike('name', `%${trimmed}%`)
    .limit(1)
    .maybeSingle()
  if (convByName) {
    return {
      id: convByName.id,
      conversation_id: convByName.id,
      name: convByName.name,
      phone_number: convByName.phone_number,
      stage: convByName.stage,
      assigned_to: convByName.assigned_to,
    }
  }

  return null
}

// ============================================================
// TOOL 1: get_leads
// ============================================================
export async function executeGetLeads(
  args: {
    start_date?: string
    end_date?: string
    source?: string
    stage?: string
    assigned_to?: string
    search?: string
    limit?: number
  },
  user: UserContext
) {
  const { startIso, endIso, startDate, endDate } = resolveDateRange(args.start_date, args.end_date)

  // Scope enforcement: employees only see their assigned leads
  const effectiveAssignee = user.role === 'admin' ? args.assigned_to : user.id

  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })

  if (effectiveAssignee) {
    query = query.eq('assigned_to', effectiveAssignee)
  }

  if (args.source) {
    query = query.ilike('source', `%${args.source}%`)
  }

  if (args.stage) {
    query = query.ilike('stage', `%${args.stage}%`)
  }

  if (args.search) {
    query = query.or(`name.ilike.%${args.search}%,phone_number.ilike.%${args.search}%`)
  }

  const { data: leads, error } = await query.limit(args.limit || 50)
  if (error) throw error

  const leadsList = leads || []

  // Count breakdown by stage
  const stageBreakdown: Record<string, number> = {}
  for (const l of leadsList) {
    const st = (l.stage || 'new').toLowerCase()
    stageBreakdown[st] = (stageBreakdown[st] || 0) + 1
  }

  return {
    total_count: leadsList.length,
    date_range: {
      from: startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      to: endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    filter_applied: {
      source: args.source || 'all',
      stage: args.stage || 'all',
      assigned_to: effectiveAssignee ? (effectiveAssignee === user.id ? 'You' : effectiveAssignee) : 'All team',
    },
    stage_breakdown: stageBreakdown,
    leads: leadsList.slice(0, 15).map((l) => ({
      id: l.id,
      name: l.name || 'Unnamed Lead',
      phone_number: l.phone_number,
      stage: l.stage || 'new',
      source: l.source || 'Direct',
      score: l.lead_score || 0,
      quality: l.lead_quality || 'unrated',
      created_at: new Date(l.created_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      followup_date: l.followup_date || null,
      notes: l.notes || null,
    })),
  }
}

// ============================================================
// TOOL 2: get_meetings
// ============================================================
export async function executeGetMeetings(
  args: {
    start_date?: string
    end_date?: string
    assigned_to?: string
    search?: string
  },
  user: UserContext
) {
  const { startIso, endIso, startDate, endDate } = resolveDateRange(args.start_date, args.end_date)
  const effectiveAssignee = user.role === 'admin' ? args.assigned_to : user.id

  let query = supabaseAdmin
    .from('schedules')
    .select('*')
    .gte('scheduled_at', startIso)
    .lte('scheduled_at', endIso)
    .order('scheduled_at', { ascending: true })

  if (effectiveAssignee) {
    query = query.or(`assigned_to.eq.${effectiveAssignee},assigned_to.is.null`)
  }

  if (args.search) {
    query = query.ilike('title', `%${args.search}%`)
  }

  const { data: schedules, error } = await query

  if (error) {
    // If schedules table doesn't have assigned_to yet, retry without assigned_to filter
    const fallback = await supabaseAdmin
      .from('schedules')
      .select('*')
      .gte('scheduled_at', startIso)
      .lte('scheduled_at', endIso)
      .order('scheduled_at', { ascending: true })
    if (fallback.error) throw fallback.error
    return formatMeetingsResult(fallback.data || [], startDate, endDate)
  }

  return formatMeetingsResult(schedules || [], startDate, endDate)
}

function formatMeetingsResult(schedules: any[], startDate: Date, endDate: Date) {
  const now = new Date()
  const meetings = schedules.map((s) => {
    const sDate = new Date(s.scheduled_at)
    let status = 'upcoming'
    if (sDate.getTime() < now.getTime()) {
      status = 'overdue / past'
    } else if (
      sDate.getDate() === now.getDate() &&
      sDate.getMonth() === now.getMonth() &&
      sDate.getFullYear() === now.getFullYear()
    ) {
      status = 'today'
    }

    return {
      id: s.id,
      title: s.title,
      type: s.type || 'meeting',
      scheduled_at: sDate.toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      status,
      location: s.location || 'Online / Phone',
      description: s.description || s.notes || null,
    }
  })

  return {
    total_meetings: meetings.length,
    date_range: {
      from: startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      to: endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    meetings,
  }
}

// ============================================================
// TOOL 3: create_followup
// ============================================================
export async function executeCreateFollowup(
  args: {
    lead_id: string // Can be UUID, name, or phone number
    due_date: string
    channel?: string // 'whatsapp' | 'call' | 'voice_ai' | 'manual'
    note?: string
  },
  user: UserContext
) {
  if (!args.lead_id) {
    throw new Error('Please specify which lead or customer to create a follow-up for.')
  }
  if (!args.due_date) {
    throw new Error('Please specify a due date or time for the follow-up.')
  }

  // Resolve relative due_date if needed
  let parsedDueDate: Date
  const lowerDue = args.due_date.toLowerCase().trim()
  const now = new Date()

  if (lowerDue === 'today') {
    parsedDueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0, 0)
  } else if (lowerDue === 'tomorrow') {
    parsedDueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0, 0, 0)
  } else if (lowerDue.includes('next week')) {
    parsedDueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 11, 0, 0, 0)
  } else {
    parsedDueDate = new Date(args.due_date)
    if (isNaN(parsedDueDate.getTime())) {
      parsedDueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0, 0, 0)
    }
  }

  const dueIso = parsedDueDate.toISOString()
  const channel = (args.channel || 'whatsapp').toLowerCase()
  const channelTag =
    channel === 'voice_ai' ? '[Voice AI]' : channel === 'call' ? '[Manual Call]' : '[WhatsApp]'

  // Match target lead
  const targetLead = await findLeadMatch(args.lead_id)
  const leadName = targetLead?.name || args.lead_id
  const leadPhone = targetLead?.phone_number || 'Unknown'
  const fullNote = `${channelTag} ${args.note || 'Scheduled follow-up'}`.trim()

  // 1. If lead exists, update it. If not, create a new lead record so it appears on all CRM pages
  if (targetLead?.id) {
    const { error: leadUpdateErr } = await supabaseAdmin
      .from('leads')
      .update({
        followup_date: dueIso,
        followup_notes: fullNote,
        followup_notified: false,
        stage: 'followup',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetLead.id)

    if (leadUpdateErr) {
      console.error('[create_followup lead update error]:', leadUpdateErr)
      throw new Error(`Database error updating lead: ${leadUpdateErr.message}`)
    }

    if (targetLead.conversation_id) {
      await supabaseAdmin
        .from('conversations')
        .update({
          stage: 'followup',
          notes: fullNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetLead.conversation_id)
    }
  } else {
    // Lead does not exist yet -> Create new lead and conversation records
    const newPhone = leadPhone !== 'Unknown' ? leadPhone : `+9198${Math.floor(10000000 + Math.random() * 90000000)}`
    
    // Create conversation first
    const { data: newConv } = await supabaseAdmin
      .from('conversations')
      .insert({
        name: leadName,
        phone_number: newPhone,
        stage: 'followup',
        notes: fullNote,
        last_message: `Follow-up scheduled for ${dueIso}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle()

    // Create lead record
    const { error: leadInsertErr } = await supabaseAdmin
      .from('leads')
      .insert({
        conversation_id: newConv?.id || null,
        name: leadName,
        phone_number: newPhone,
        stage: 'followup',
        followup_date: dueIso,
        followup_notes: fullNote,
        followup_notified: false,
        source: 'CRM AI Assistant',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (leadInsertErr) {
      console.error('[create_followup lead insert error]:', leadInsertErr)
      throw new Error(`Database error saving lead: ${leadInsertErr.message}`)
    }
  }

  // 2. Insert into schedules table (shows on /reminder and /calendar)
  const scheduleTitle = `Follow-up: ${leadName} (${channel.toUpperCase()})`
  const { error: schedErr } = await supabaseAdmin.from('schedules').insert({
    title: scheduleTitle,
    type: 'reminder',
    scheduled_at: dueIso,
    notes: fullNote,
    assigned_to: user.id,
    created_at: new Date().toISOString(),
  })

  if (schedErr) {
    console.error('[create_followup schedules insert error]:', schedErr)
    throw new Error(`Database error saving schedule reminder: ${schedErr.message}`)
  }

  // 3. Insert into tasks table (shows on /task)
  const taskDateStr = `${parsedDueDate.getFullYear()}-${String(parsedDueDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDueDate.getDate()).padStart(2, '0')}`
  const { error: taskErr } = await supabaseAdmin.from('tasks').insert({
    title: `Follow up with ${leadName} via ${channel.toUpperCase()}`,
    due_date: taskDateStr,
    status: 'pending',
    assigned_to: user.id,
    channel: channel,
    notes: args.note || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (taskErr) {
    console.error('[create_followup task insert error]:', taskErr)
    throw new Error(`Database error saving task: ${taskErr.message}`)
  }

  return {
    success: true,
    message: `Follow-up successfully scheduled for ${leadName}`,
    followup_details: {
      lead_name: leadName,
      phone_number: leadPhone,
      due_at: parsedDueDate.toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      channel: channel,
      assigned_to: user.name || user.email,
      note: args.note || 'None',
    },
  }
}

// ============================================================
// TOOL 4: update_lead
// ============================================================
export async function executeUpdateLead(
  args: {
    lead_id: string
    field: string
    value: any
  },
  user: UserContext
) {
  if (!args.lead_id || !args.field) {
    throw new Error('lead_id and field are required to update a lead.')
  }

  const targetLead = await findLeadMatch(args.lead_id)
  if (!targetLead) {
    throw new Error(`Lead "${args.lead_id}" not found. Please provide the exact name or phone number.`)
  }

  // Permission check: if employee, ensure assigned to them
  if (user.role === 'employee' && targetLead.assigned_to && targetLead.assigned_to !== user.id) {
    throw new Error('You do not have permission to update leads assigned to another team member.')
  }

  const fieldKey = args.field.toLowerCase().trim()
  let normalizedValue = args.value

  // Normalize common stage aliases
  if (fieldKey === 'stage' || fieldKey === 'status') {
    const s = String(args.value).toLowerCase().trim()
    if (['won', 'win', 'confirm', 'closed_won', 'booked'].includes(s)) {
      normalizedValue = 'confirmed'
    } else if (['lost', 'closed_lost', 'cancelled', 'canceled'].includes(s)) {
      normalizedValue = 'cancelled'
    } else if (['negotiating', 'negotiation', 'in_process', 'processing'].includes(s)) {
      normalizedValue = 'interested'
    }
  }

  const updates: Record<string, any> = {
    [fieldKey]: normalizedValue,
    updated_at: new Date().toISOString(),
  }

  const { data: updatedLead, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', targetLead.id)
    .select()
    .single()

  if (error) throw error

  // Sync to conversation if relevant
  if (targetLead.conversation_id) {
    const convUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (fieldKey === 'stage') convUpdates.stage = normalizedValue
    if (fieldKey === 'name') convUpdates.name = normalizedValue
    if (fieldKey === 'notes') convUpdates.notes = normalizedValue

    await supabaseAdmin.from('conversations').update(convUpdates).eq('id', targetLead.conversation_id)
  }

  return {
    success: true,
    message: `Updated ${targetLead.name || 'Lead'}'s ${fieldKey} to "${normalizedValue}"`,
    lead: {
      id: updatedLead.id,
      name: updatedLead.name,
      phone_number: updatedLead.phone_number,
      stage: updatedLead.stage,
      notes: updatedLead.notes,
      updated_at: updatedLead.updated_at,
    },
  }
}

// ============================================================
// TOOL 5: get_pipeline_summary
// ============================================================
export async function executeGetPipelineSummary(
  args: {
    start_date?: string
    end_date?: string
    assigned_to?: string
  },
  user: UserContext
) {
  const { startIso, endIso, startDate, endDate } = resolveDateRange(args.start_date, args.end_date)
  const effectiveAssignee = user.role === 'admin' ? args.assigned_to : user.id

  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (effectiveAssignee) {
    query = query.eq('assigned_to', effectiveAssignee)
  }

  const { data: leads, error } = await query
  if (error) throw error

  const leadsList = leads || []
  const totalLeads = leadsList.length

  const stageCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}
  let wonCount = 0
  let lostCount = 0
  let totalScore = 0
  let scoredLeadsCount = 0

  const wonStages = new Set(['confirmed', 'confirm', 'completed', 'won', 'booking', 'deal_done'])
  const lostStages = new Set(['cancelled', 'canceled', 'lost', 'not_interested', 'low_budget'])

  for (const lead of leadsList) {
    const stage = (lead.stage || 'new').toLowerCase().trim()
    stageCounts[stage] = (stageCounts[stage] || 0) + 1

    const src = lead.source || 'Direct'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1

    if (wonStages.has(stage)) wonCount++
    if (lostStages.has(stage)) lostCount++

    if (typeof lead.lead_score === 'number' && lead.lead_score > 0) {
      totalScore += lead.lead_score
      scoredLeadsCount++
    }
  }

  const conversionRate = totalLeads > 0 ? Number(((wonCount / totalLeads) * 100).toFixed(2)) : 0
  const avgLeadScore = scoredLeadsCount > 0 ? Number((totalScore / scoredLeadsCount).toFixed(1)) : null

  return {
    period: {
      from: startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      to: endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    scope: effectiveAssignee ? (effectiveAssignee === user.id ? 'My Pipeline' : `User: ${effectiveAssignee}`) : 'Entire Team',
    metrics: {
      total_leads: totalLeads,
      won_deals: wonCount,
      lost_deals: lostCount,
      active_pipeline: totalLeads - (wonCount + lostCount),
      conversion_rate_percent: conversionRate,
      avg_lead_score: avgLeadScore,
    },
    stage_breakdown: stageCounts,
    source_breakdown: sourceCounts,
  }
}

// ============================================================
// OpenAI Tool Definitions (JSON Schema)
// ============================================================
export const CRM_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_leads',
      description:
        'Retrieve leads from the database for a specific date range, source, stage, or search term. Resolves relative dates like today, yesterday, this_week, last_week, this_month.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description:
              'Start date in YYYY-MM-DD format or relative keywords: today, yesterday, this_week, last_week, this_month, last_month, all_time.',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format or relative keyword.',
          },
          source: {
            type: 'string',
            description: 'Filter leads by marketing or acquisition source (e.g. WhatsApp Direct, Google, Website).',
          },
          stage: {
            type: 'string',
            description: 'Filter leads by stage (e.g. new, interested, booking, confirmed, followup, cancelled).',
          },
          assigned_to: {
            type: 'string',
            description: 'Filter by assigned employee user ID (only available for managers/admins).',
          },
          search: {
            type: 'string',
            description: 'Search lead by name or phone number keyword.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_meetings',
      description:
        'Lookup meetings, calls, and calendar events from the CRM schedule for a specific date range or search keyword.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description:
              'Start date in YYYY-MM-DD format or relative keywords: today, tomorrow, this_week, next_week, this_month.',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format or relative keywords.',
          },
          assigned_to: {
            type: 'string',
            description: 'Filter meetings by assigned user ID.',
          },
          search: {
            type: 'string',
            description: 'Search meetings by attendee name or meeting title keyword.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_followup',
      description:
        'Create a real follow-up task and schedule record tied to a lead/customer. Updates the lead and assigns the task.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: {
            type: 'string',
            description: 'The Lead ID, lead name (e.g. "Rahul", "Priya"), or phone number.',
          },
          due_date: {
            type: 'string',
            description:
              'Due date/time in ISO format, YYYY-MM-DD HH:mm, or keywords like "tomorrow", "today", "next week".',
          },
          channel: {
            type: 'string',
            enum: ['whatsapp', 'call', 'voice_ai', 'manual'],
            description: 'The communication channel for the follow-up (whatsapp, call, voice_ai, manual).',
          },
          note: {
            type: 'string',
            description: 'Optional note or purpose for the follow-up (e.g. "Discuss deluxe pricing quote").',
          },
        },
        required: ['lead_id', 'due_date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_lead',
      description:
        'Update an existing lead record (e.g. mark as won/confirmed, update stage, add a note, change lead score or quality).',
      parameters: {
        type: 'object',
        properties: {
          lead_id: {
            type: 'string',
            description: 'The Lead ID, customer name, or phone number to find the lead.',
          },
          field: {
            type: 'string',
            description: 'Field to update: "stage", "notes", "name", "lead_score", "lead_quality", "source".',
          },
          value: {
            type: 'string',
            description: 'The new value to assign (e.g. "confirmed", "won", "interested", or note text).',
          },
        },
        required: ['lead_id', 'field', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pipeline_summary',
      description:
        'Calculate overall CRM pipeline performance: total leads, stage breakdown, conversion rate, and won/lost metrics.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description:
              'Start date for metrics (e.g. "this_month", "last_month", "this_week", "today", "all_time", or YYYY-MM-DD).',
          },
          end_date: {
            type: 'string',
            description: 'End date for metrics.',
          },
          assigned_to: {
            type: 'string',
            description: 'Optional user ID to filter metrics for a specific employee.',
          },
        },
      },
    },
  },
]
