import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabaseAdmin } from '@/lib/supabase'
import {
  CRM_TOOLS,
  UserContext,
  executeGetLeads,
  executeGetMeetings,
  executeCreateFollowup,
  executeUpdateLead,
  executeGetPipelineSummary,
  logToolExecution,
} from '@/lib/assistant/tools'
import { checkRateLimit } from '@/lib/assistant/rateLimiter'

// Get configured AI Client & Model (Supports OpenAI, Groq, Gemini, OpenRouter, and Ollama)
function getAIClientAndModel(): { client: OpenAI; model: string; providerName: string } {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY || ''
  const customBaseURL = process.env.OPENAI_BASE_URL
  const customModel = process.env.OPENAI_MODEL

  // 1. Groq Cloud (100% Free, ultra-fast with function calling)
  if (groqKey || openaiKey.startsWith('gsk_')) {
    const key = groqKey || openaiKey
    return {
      client: new OpenAI({ apiKey: key, baseURL: 'https://api.groq.com/openai/v1' }),
      model: customModel || 'openai/gpt-oss-120b',
      providerName: 'Groq (Free)',
    }
  }

  // 2. Google Gemini (100% Free via Google AI Studio)
  if (geminiKey || openaiKey.startsWith('AIzaSy')) {
    const key = geminiKey || openaiKey
    return {
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: customModel || 'gemini-1.5-flash',
      providerName: 'Google Gemini (Free)',
    }
  }

  // 3. OpenRouter (Free tier models)
  if (openRouterKey || openaiKey.startsWith('sk-or-')) {
    const key = openRouterKey || openaiKey
    return {
      client: new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' }),
      model: customModel || 'meta-llama/llama-3.3-70b-instruct:free',
      providerName: 'OpenRouter (Free)',
    }
  }

  // 4. Standard OpenAI or custom endpoint
  return {
    client: new OpenAI({
      apiKey: openaiKey,
      baseURL: customBaseURL || undefined,
    }),
    model: customModel || 'gpt-4o-mini',
    providerName: 'OpenAI',
  }
}

// Authenticate and get user context from Bearer token (with dev fallback)
async function authenticateUser(req: NextRequest): Promise<UserContext> {
  const defaultUser: UserContext = {
    id: 'demo-admin-id',
    email: 'admin@voxai.com',
    name: 'Admin',
    role: 'admin',
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')

  if (!token) return defaultUser

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return defaultUser

    // Fetch user profile from database for role
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('name, email, role')
      .eq('id', user.id)
      .maybeSingle()

    return {
      id: user.id,
      email: user.email || profile?.email || defaultUser.email,
      name: profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || defaultUser.name,
      role: (profile?.role as 'admin' | 'employee') || 'admin',
    }
  } catch (err) {
    console.error('[Assistant Auth Error]:', err)
    return defaultUser
  }
}

// GET /api/assistant/chat -> Fetch recent user chat history
export async function GET(req: NextRequest) {
  const user = await authenticateUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
  }

  try {
    const { data: messages, error } = await supabaseAdmin
      .from('assistant_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      // If table does not exist yet, return empty array gracefully
      return NextResponse.json([])
    }

    return NextResponse.json(messages || [])
  } catch (err: any) {
    return NextResponse.json([])
  }
}

// DELETE /api/assistant/chat -> Clear user chat history
export async function DELETE(req: NextRequest) {
  const user = await authenticateUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
  }

  try {
    await supabaseAdmin
      .from('assistant_messages')
      .delete()
      .eq('user_id', user.id)

    return NextResponse.json({ success: true, message: 'Chat history cleared' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/assistant/chat -> Send message & execute tools
export async function POST(req: NextRequest) {
  const startTime = Date.now()
  const user = await authenticateUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Please authenticate to use the CRM assistant.' },
      { status: 401 }
    )
  }

  // Check rate limit
  const rateLimit = checkRateLimit(user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Please wait ${rateLimit.resetInSeconds} seconds before sending another message.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetInSeconds),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  try {
    const body = await req.json()
    const { message, history = [] } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }

    const { client: openai, model: modelName, providerName } = getAIClientAndModel()

    const hasKey =
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENROUTER_API_KEY
    if (!hasKey) {
      return NextResponse.json(
        {
          error:
            'AI API Key is not configured on the server. Please set GROQ_API_KEY (Free), GEMINI_API_KEY (Free), or OPENAI_API_KEY in your .env.local file.',
        },
        { status: 500 }
      )
    }

    // Current Server Time
    const now = new Date()
    const formattedServerDate = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const formattedServerTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    const systemPrompt = `You are CRM Assistant, an AI operations assistant embedded inside the CRM. You help the user by answering questions about their leads, meetings, and follow-ups, and by taking actions on their behalf — always through the tools provided, never by guessing.
Rules:
- Never fabricate numbers, names, dates, or meeting details. If a tool call fails or returns nothing, say so plainly.
- Always resolve relative dates before calling a tool.
- If a request is fully specified, perform the action and confirm afterward — don't ask permission. Only ask a clarifying question when something genuinely ambiguous (e.g. duplicate lead names, missing date) blocks the action.
- Keep answers short and numbers-first. Lead with the direct answer, then a one-line breakdown if useful.
- If no tool covers what's asked, say so and suggest what you can do instead.
- Never expose tool names, raw JSON, or internal errors to the user — translate into plain language.
- Match the user's language/register (support Hindi/Hinglish if they write in it).

Environment Context:
- Current Server Date: ${formattedServerDate} (${now.toISOString().split('T')[0]})
- Current Server Time: ${formattedServerTime}
- User: ${user.name} (${user.email}), Role: ${user.role}, ID: ${user.id}
${user.role === 'employee' ? '- Scoping Note: As an employee, you only access and modify leads assigned to this user.' : '- Scoping Note: As an admin, you have team-wide access across all employees.'}`

    // Construct conversation payload
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Append previous valid messages (limit to last 10 messages for context)
    const recentHistory = Array.isArray(history) ? history.slice(-10) : []
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({
          role: h.role,
          content: typeof h.content === 'string' ? h.content : JSON.stringify(h.content),
        })
      }
    }

    // Append new user message
    messages.push({ role: 'user', content: message.trim() })

    // Save user message to database asynchronously
    try {
      await supabaseAdmin.from('assistant_messages').insert({
        user_id: user.id,
        role: 'user',
        content: message.trim(),
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      // non-blocking
    }

    const toolsExecutedNames: string[] = []
    let finalAssistantReply = ''
    let iterations = 0
    const maxIterations = 5 // Prevent infinite tool call loops

    while (iterations < maxIterations) {
      iterations++

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: CRM_TOOLS,
        tool_choice: 'auto',
        temperature: 0.1,
      })

      const choice = completion.choices[0]
      const msg = choice.message

      // If the model wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg)

        for (const toolCall of msg.tool_calls) {
          if (toolCall.type !== 'function') continue

          const toolName = toolCall.function.name
          toolsExecutedNames.push(toolName)
          let args: any = {}
          try {
            args = JSON.parse(toolCall.function.arguments || '{}')
          } catch (e) {
            args = {}
          }

          const toolStart = Date.now()
          let toolResult: any = null
          let toolStatus: 'success' | 'error' = 'success'
          let toolErrorMessage: string | undefined

          try {
            switch (toolName) {
              case 'get_leads':
                toolResult = await executeGetLeads(args, user)
                break
              case 'get_meetings':
                toolResult = await executeGetMeetings(args, user)
                break
              case 'create_followup':
                toolResult = await executeCreateFollowup(args, user)
                break
              case 'update_lead':
                toolResult = await executeUpdateLead(args, user)
                break
              case 'get_pipeline_summary':
                toolResult = await executeGetPipelineSummary(args, user)
                break
              default:
                toolResult = { error: `Tool "${toolName}" is not supported.` }
                toolStatus = 'error'
                toolErrorMessage = `Unsupported tool ${toolName}`
            }
          } catch (err: any) {
            toolStatus = 'error'
            toolErrorMessage = err.message || 'Tool execution failed'
            toolResult = { error: toolErrorMessage }
          } finally {
            const toolDuration = Date.now() - toolStart
            // Log tool execution for audit
            logToolExecution({
              userId: user.id,
              userEmail: user.email,
              userRole: user.role,
              toolName,
              params: args,
              status: toolStatus,
              errorMessage: toolErrorMessage,
              executionMs: toolDuration,
            })
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          })
        }
      } else {
        // Model provided final text response
        finalAssistantReply = msg.content || 'I completed the requested action.'
        break
      }
    }

    if (!finalAssistantReply) {
      finalAssistantReply = 'I have processed your request.'
    }

    // Save assistant reply to database asynchronously
    try {
      await supabaseAdmin.from('assistant_messages').insert({
        user_id: user.id,
        role: 'assistant',
        content: finalAssistantReply,
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      // non-blocking
    }

    return NextResponse.json({
      reply: finalAssistantReply,
      tools_used: toolsExecutedNames,
      duration_ms: Date.now() - startTime,
    })
  } catch (err: any) {
    console.error('[Assistant Chat Error]:', err)

    let clientMessage = 'An unexpected error occurred while processing your request. Please try again.'
    if (err?.status === 429 && (err?.message?.includes('credits') || err?.message?.includes('quota') || err?.message?.includes('billing'))) {
      clientMessage =
        '⚠️ OpenAI Quota Exceeded: You have no credits remaining on your OpenAI account. Please add billing balance at https://platform.openai.com/settings/organization/billing or use an API key with active credits.'
    } else if (err?.status === 401 || err?.message?.includes('API key') || err?.message?.includes('Incorrect API key')) {
      clientMessage =
        '⚠️ OpenAI Authentication Error: Invalid API key. Please check your OPENAI_API_KEY in .env.local.'
    } else if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
      clientMessage = 'The request timed out while contacting the CRM database. Please try again.'
    } else if (err?.message) {
      clientMessage = `⚠️ Error: ${err.message}`
    }

    return NextResponse.json({ error: clientMessage, details: err.message }, { status: 500 })
  }
}
