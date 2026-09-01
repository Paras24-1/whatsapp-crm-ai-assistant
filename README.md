# WhatsApp Chat Dashboard

A production-ready, real-time WhatsApp conversation monitoring dashboard for hotel AI agents.
Built with **Next.js 14**, **Supabase**, **TailwindCSS**, deployed on **Vercel**, integrated with **n8n** and **WhatsApp Cloud API**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [Database Setup (Supabase)](#database-setup-supabase)
4. [Local Development](#local-development)
5. [Deploy to Vercel](#deploy-to-vercel)
6. [n8n Webhook Configuration](#n8n-webhook-configuration)
7. [WhatsApp Cloud API Setup](#whatsapp-cloud-api-setup)
8. [API Reference](#api-reference)
9. [Real-time Subscriptions](#real-time-subscriptions)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
WhatsApp User
      │  (sends message)
      ▼
WhatsApp Cloud API (Meta)
      │  (webhook delivery)
      ▼
n8n Workflow
      │  (formats payload, POSTs to dashboard)
      ▼
Dashboard Webhook  POST /api/webhook
      │  (saves to Supabase)
      ▼
Supabase Postgres ──► Supabase Realtime ──► Dashboard UI (live update)

Operator Types Reply
      │
      ▼
Dashboard UI  POST /api/reply
      │  (saves to DB + calls n8n)
      ▼
n8n Reply Workflow
      │
      ▼
WhatsApp Cloud API  (sends message to user)
```

### Message Flow — Incoming

1. Customer sends WhatsApp message
2. Meta delivers it to n8n via webhook
3. n8n processes it (AI or pass-through) and POSTs to `POST /api/webhook`
4. Dashboard saves to `messages` table
5. Supabase Realtime fires → all connected browsers update instantly

### Message Flow — Outgoing (Manual Reply)

1. Operator types message in dashboard
2. Dashboard calls `POST /api/reply`
3. Dashboard saves message as `direction: outgoing`
4. Dashboard POSTs to n8n reply webhook
5. n8n calls WhatsApp Cloud API `POST /messages`
6. Message delivered to customer

---

## Folder Structure

```
whatsapp-dashboard/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   └── page.tsx              # Main 3-panel dashboard UI
│   │   ├── api/
│   │   │   ├── webhook/route.ts      # Receives messages from n8n
│   │   │   ├── reply/route.ts        # Sends manual operator replies
│   │   │   ├── conversations/route.ts# Lists conversations with filters
│   │   │   ├── messages/route.ts     # Fetches messages for a conversation
│   │   │   ├── leads/route.ts        # GET/PATCH lead metadata
│   │   │   └── takeover/route.ts     # Toggle AI/human mode
│   │   ├── layout.tsx                # Root layout with ThemeProvider
│   │   └── globals.css               # Tailwind base + custom scrollbar
│   ├── components/
│   │   └── chat/
│   │       ├── ConversationList.tsx  # Left sidebar — inbox list
│   │       ├── ChatWindow.tsx        # Center — chat bubbles + reply input
│   │       └── LeadPanel.tsx         # Right sidebar — lead metadata form
│   ├── hooks/
│   │   └── index.ts                  # useConversations, useMessages, useSendMessage, useToggleAI
│   ├── lib/
│   │   └── supabase.ts               # Supabase client (anon) + admin (service role)
│   └── types/
│       └── index.ts                  # TypeScript interfaces
├── supabase/
│   ├── schema.sql                    # Full DB schema + triggers + RLS
│   └── helpers.sql                   # Extra SQL functions
├── .env.example                      # Environment variable template
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── postcss.config.js
└── package.json
```

---

## Database Setup (Supabase)

### Step 1 — Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Choose a name (e.g. `whatsapp-dashboard`) and a strong database password
4. Select the region closest to your users (e.g. `ap-south-1` for India)
5. Wait ~2 minutes for provisioning

### Step 2 — Run the schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Paste the contents of `supabase/schema.sql`
4. Click **Run** (or press Ctrl+Enter)
5. You should see: `Success. No rows returned`

Then run `supabase/helpers.sql` the same way.

### Step 3 — Enable Realtime

1. Go to **Database** → **Replication** in the left sidebar
2. Under **Supabase Realtime**, enable the following tables:
   - `conversations`
   - `messages`
   - `leads`
3. Click **Save**

> **Note:** The schema.sql already includes `ALTER PUBLICATION supabase_realtime ADD TABLE ...` statements. If those ran successfully, you can skip this step.

### Step 4 — Get your API keys

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ The `service_role` key has full database access. **Never expose it on the client side.** It is only used in API routes.

### Database Schema Reference

```sql
TABLE conversations
  id            UUID        PK
  phone_number  TEXT        UNIQUE NOT NULL
  name          TEXT        NOT NULL
  last_message  TEXT
  unread_count  INTEGER     DEFAULT 0
  ai_mode       BOOLEAN     DEFAULT TRUE   -- TRUE = AI handles, FALSE = human handles
  stage         TEXT        DEFAULT 'new'  -- new | interested | booking | confirmed | cancelled | completed
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ

TABLE messages
  id              UUID    PK
  conversation_id UUID    FK → conversations.id
  phone_number    TEXT
  message         TEXT
  direction       TEXT    CHECK IN ('incoming', 'outgoing')
  timestamp       TIMESTAMPTZ
  created_at      TIMESTAMPTZ

TABLE leads
  id              UUID    PK
  conversation_id UUID    FK → conversations.id (UNIQUE)
  phone_number    TEXT
  name            TEXT
  stage           TEXT
  checkin_date    DATE
  checkout_date   DATE
  room_type       TEXT
  num_guests      INTEGER
  budget          TEXT
  notes           TEXT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
```

---

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- A Supabase project (see above)

### Setup

```bash
# 1. Clone or copy this project
git clone https://github.com/yourusername/whatsapp-dashboard.git
cd whatsapp-dashboard

# 2. Install dependencies
npm install

# 3. Create your local environment file
cp .env.example .env.local

# 4. Edit .env.local with your actual values
nano .env.local   # or open in your editor

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the dashboard.

### Testing the webhook locally

Use [ngrok](https://ngrok.com) to expose your local server to n8n:

```bash
# Install ngrok (once)
npm install -g ngrok

# In a new terminal, expose port 3000
ngrok http 3000
```

You'll get a URL like `https://abc123.ngrok.io`. Use this as your webhook base URL in n8n during development.

### Test webhook with curl

```bash
# Test incoming message
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "phone_number": "+919876543210",
    "name": "Rahul Sharma",
    "message": "Hi, I want to book a room for 2 nights",
    "direction": "incoming",
    "timestamp": "2026-03-15T10:00:00Z"
  }'

# Expected response:
# {"success":true,"conversation_id":"...","message_id":"..."}
```

---

## Deploy to Vercel

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/whatsapp-dashboard.git
git push -u origin main
```

### Step 2 — Import to Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. Click **Import** next to your GitHub repository
3. Vercel auto-detects Next.js — click **Deploy** (don't change any settings)

### Step 3 — Set Environment Variables

1. After deployment, go to your project in Vercel
2. Click **Settings** → **Environment Variables**
3. Add each variable from `.env.example`:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `N8N_WEBHOOK_SECRET` | A random 32+ char secret string |
| `N8N_REPLY_WEBHOOK_URL` | Your n8n reply webhook URL |

4. After adding all variables, go to **Deployments** → click the latest → **Redeploy**

### Step 4 — Get your webhook URL

Your webhook URL is: `https://your-project.vercel.app/api/webhook`

Use this in n8n (see next section).

---

## n8n Webhook Configuration

### Workflow 1: Incoming Message → Dashboard

This n8n workflow receives WhatsApp messages from Meta and forwards them to your dashboard.

```
[WhatsApp Trigger] → [Set node] → [HTTP Request to Dashboard]
```

#### WhatsApp Trigger node

- **Authentication:** Header Auth
- **Credential:** Your Meta webhook verify token
- WhatsApp events will be delivered here by Meta

#### Set node (format the payload)

```json
{
  "phone_number": "={{ '+' + $json.entry[0].changes[0].value.messages[0].from }}",
  "name": "={{ $json.entry[0].changes[0].value.contacts[0].profile.name }}",
  "message": "={{ $json.entry[0].changes[0].value.messages[0].text.body }}",
  "direction": "incoming",
  "timestamp": "={{ $json.entry[0].changes[0].value.messages[0].timestamp }}"
}
```

#### HTTP Request node (forward to dashboard)

- **Method:** POST
- **URL:** `https://your-project.vercel.app/api/webhook`
- **Headers:**
  - `Content-Type: application/json`
  - `x-webhook-secret: your-secret-here`
- **Body:** JSON from previous Set node

---

### Workflow 2: Dashboard Reply → WhatsApp

This workflow receives a reply typed in the dashboard and sends it via WhatsApp Cloud API.

```
[Webhook Trigger] → [HTTP Request to WhatsApp API]
```

#### Webhook Trigger node

- **HTTP Method:** POST
- **Path:** `whatsapp-reply`
- **Authentication:** Header Auth, key: `x-webhook-secret`

This gives you the URL: `https://your-n8n.com/webhook/whatsapp-reply`
→ Set this as `N8N_REPLY_WEBHOOK_URL` in your Vercel env vars.

#### HTTP Request node (send via WhatsApp Cloud API)

- **Method:** POST
- **URL:** `https://graph.facebook.com/v19.0/YOUR_PHONE_NUMBER_ID/messages`
- **Headers:**
  - `Authorization: Bearer YOUR_WHATSAPP_ACCESS_TOKEN`
  - `Content-Type: application/json`
- **Body (JSON):**

```json
{
  "messaging_product": "whatsapp",
  "to": "={{ $json.phone_number }}",
  "type": "text",
  "text": {
    "body": "={{ $json.message }}"
  }
}
```

---

### Workflow 3: AI Mode Check (Optional)

Before your AI agent responds, check if AI mode is still ON for that conversation:

```
[WhatsApp Trigger] → [HTTP Request: Check AI Mode] → [IF ai_mode = true] → [AI Agent] → [Send Reply]
                                                     → [IF ai_mode = false] → [Forward to Dashboard only]
```

#### HTTP Request: Check AI Mode

- **Method:** GET
- **URL:** `https://your-project.vercel.app/api/conversations?search={{ $json.phone_number }}`
- Then check: `{{ $json[0].ai_mode }}` — if false, skip the AI agent

---

## WhatsApp Cloud API Setup

### Prerequisites

1. A **Meta Business Account**
2. A **Meta Developer App** with WhatsApp product added
3. A verified **phone number** (cannot be used in regular WhatsApp app)

### Step-by-step

1. Go to [https://developers.facebook.com](https://developers.facebook.com)
2. Create a new app → Business → Add WhatsApp product
3. Under WhatsApp → Getting Started:
   - Note your **Phone Number ID**
   - Note your **WhatsApp Business Account ID**
   - Generate a **Permanent Access Token** (use System User in Meta Business Settings)
4. Under WhatsApp → Configuration:
   - Set **Webhook URL** to your n8n webhook URL
   - Set **Verify Token** to any string you choose
   - Subscribe to `messages` events

### Permanent Access Token (important!)

Temporary tokens expire. For production:

1. Go to **Meta Business Settings** → **Users** → **System Users**
2. Create a system user with "Admin" role
3. Click **Generate New Token** → Select your app → Enable `whatsapp_business_messaging` and `whatsapp_business_management`
4. Copy the token — this is your `WHATSAPP_ACCESS_TOKEN` for n8n

---

## API Reference

### POST /api/webhook

Receives messages from n8n. Protected by `x-webhook-secret` header.

**Request:**
```json
{
  "phone_number": "+919876543210",
  "name": "Rahul Sharma",
  "message": "Hi, what is the room price?",
  "direction": "incoming",
  "timestamp": "2026-03-15T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "conversation_id": "uuid",
  "message_id": "uuid"
}
```

---

### POST /api/reply

Sends a manual reply from the operator.

**Request:**
```json
{
  "conversation_id": "uuid",
  "phone_number": "+919876543210",
  "message": "The deluxe room is ₹4500 per night."
}
```

---

### GET /api/conversations

List all conversations with optional filters.

**Query params:**
- `search` — filter by name or phone number
- `stage` — filter by stage (new, interested, booking, confirmed, cancelled, completed)
- `unread=true` — show only unread conversations

---

### GET /api/messages?conversation_id=uuid

Fetch all messages for a conversation. Also resets unread count to 0.

---

### PATCH /api/takeover

Toggle AI/human mode for a conversation.

**Request:**
```json
{
  "conversation_id": "uuid",
  "ai_mode": false
}
```

---

### GET /api/leads?conversation_id=uuid

Fetch lead metadata for a conversation.

### PATCH /api/leads

Update lead metadata.

**Request:**
```json
{
  "conversation_id": "uuid",
  "name": "Rahul Sharma",
  "stage": "booking",
  "checkin_date": "2026-04-10",
  "checkout_date": "2026-04-12",
  "room_type": "Deluxe",
  "num_guests": 2,
  "budget": "₹5000/night",
  "notes": "Prefers high floor. Vegetarian."
}
```

---

## Real-time Subscriptions

The dashboard uses **Supabase Realtime** via `postgres_changes`. Two channels are opened per active session:

### Channel 1: `conversations-changes`

```typescript
supabase
  .channel('conversations-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, handler)
  .subscribe()
```

Fires on any INSERT/UPDATE/DELETE in `conversations`. Re-fetches the full conversation list on every event to keep filters/sorting correct.

### Channel 2: `messages-{conversationId}`

```typescript
supabase
  .channel(`messages-${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, handler)
  .subscribe()
```

Fires only for new messages in the currently open conversation. Uses row-level filtering to avoid receiving messages from other conversations.

The channel is cleaned up with `supabase.removeChannel(channel)` when the conversation changes or the component unmounts.

---

## Troubleshooting

### Messages not appearing in real-time

1. Check that Realtime is enabled for the `messages` and `conversations` tables in Supabase → Database → Replication
2. Verify your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
3. Open browser DevTools → Network → WS — you should see a WebSocket connection to `wss://your-project.supabase.co/realtime/v1/websocket`

### Webhook returning 401 Unauthorized

The `x-webhook-secret` header sent by n8n must exactly match the `N8N_WEBHOOK_SECRET` environment variable in Vercel. Secrets are case-sensitive.

### n8n not receiving replies from dashboard

1. Confirm `N8N_REPLY_WEBHOOK_URL` is set correctly in Vercel env vars
2. Make sure your n8n instance is publicly accessible (not just localhost)
3. Check n8n execution logs for errors

### WhatsApp messages not sending

1. Verify the access token is a **permanent system user token**, not a temporary one
2. Check that the phone number is formatted correctly: `+919876543210` (with country code, no spaces)
3. WhatsApp Cloud API only allows messaging users who have **opted in** or sent you a message first (within 24h window for free-form messages)

### Vercel deployment failing

- Check the Vercel build logs for TypeScript errors
- Make sure all environment variables are set before redeploying
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set (it's server-only, so won't be in the build output — that's correct)

---

## Security Checklist

- [ ] `N8N_WEBHOOK_SECRET` is a random 32+ character string
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only used in API routes, never in client components
- [ ] `.env.local` is in `.gitignore` and never committed
- [ ] WhatsApp access token is a system user token (not a temporary one)
- [ ] Supabase RLS is enabled on all tables
- [ ] n8n instance is behind authentication

---

## AI Chat Assistant

The CRM includes an embedded AI Chat Assistant capable of answering natural-language questions and performing actions directly on your leads, meetings, follow-ups, and pipeline.

### 1. Configuration & Environment Variables

Add the following environment variables to your `.env.local` or hosting provider:

```env
# Required for AI Chat Assistant
OPENAI_API_KEY=sk-...

# Optional Configurations (defaults to OpenAI gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1  # or OpenRouter / Groq / Azure / Ollama
```

### 2. How the Tool-Calling Flow Works

```
User Prompt (e.g. "How many leads today?")
       │
       ▼
Frontend Assistant Widget (src/components/assistant/AssistantChatWidget.tsx)
       │  (POST /api/assistant/chat with Bearer Token)
       ▼
Backend API Endpoint (src/app/api/assistant/chat/route.ts)
       │  1. Authenticates user & enforces employee/admin scoping
       │  2. Resolves relative dates ("today", "yesterday", "last week") server-side
       │  3. Invokes OpenAI with structured function/tool definitions
       ▼
OpenAI Tool Calling Loop
       │  - Model decides to call `get_leads`, `get_meetings`, `create_followup`, `update_lead`, or `get_pipeline_summary`
       ▼
Database Query Execution (src/lib/assistant/tools.ts)
       │  - Executes real queries against Supabase PostgreSQL
       │  - Logs tool invocation details into `assistant_tool_logs` for audit
       ▼
LLM Natural-Language Synthesis
       │  - Formats answer numbers-first in English / Hindi / Hinglish
       ▼
Assistant Widget Display
```

### 3. Database Migration for AI Assistant

To enable persistent audit logs and chat history, run the SQL script in your Supabase SQL Editor:

```bash
supabase/ai_assistant_migration.sql
```

### 4. Available Tools

- **`get_leads(start_date, end_date, source?, stage?, assigned_to?)`**: Lead reporting and count breakdown by stage/source.
- **`get_meetings(start_date, end_date, assigned_to?)`**: Scheduled meetings, events, and calls lookup from calendar.
- **`create_followup(lead_id, due_date, channel, note?)`**: Creates follow-up task and calendar reminder tied to the lead.
- **`update_lead(lead_id, field, value)`**: Real-time update of lead stage, notes, or contact information.
- **`get_pipeline_summary(start_date, end_date, assigned_to?)`**: Pipeline totals, active deals, conversion rates, and stage distribution.

---

## License

MIT
