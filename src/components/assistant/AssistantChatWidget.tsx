'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  RefreshCw,
  Trash2,
  Minimize2,
  Maximize2,
  Bot,
  User as UserIcon,
  ChevronDown,
  Calendar,
  Filter,
  BarChart2,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  tools_used?: string[]
  created_at?: string
}

const QUICK_PROMPTS = [
  { label: "Today's leads", prompt: 'How many leads did I get today?' },
  { label: 'My meetings', prompt: 'What meetings do I have scheduled today and tomorrow?' },
  { label: 'Pipeline stats', prompt: 'Give me the current pipeline summary and conversion rate.' },
  { label: 'Follow-up task', prompt: 'Schedule a WhatsApp follow-up with Rahul tomorrow at 11am' },
]

function renderInlineText(text: string) {
  // Replace **bold** with bold spans
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-emerald-950 dark:text-emerald-300">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

function FormattedMessageContent({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="space-y-1.5 leading-relaxed text-sm">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="h-1" />
        }

        // Check if line is a bullet point (* item or - item or • item)
        const bulletMatch = trimmed.match(/^[\*\-•]\s+(.*)$/)
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mt-2 shrink-0" />
              <span className="flex-1">{renderInlineText(bulletMatch[1])}</span>
            </div>
          )
        }

        // Check if line is a numbered item (1. item)
        const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numberMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                {numberMatch[1]}.
              </span>
              <span className="flex-1">{renderInlineText(numberMatch[2])}</span>
            </div>
          )
        }

        return <p key={idx}>{renderInlineText(line)}</p>
      })}
    </div>
  )
}

export default function AssistantChatWidget() {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '👋 Hi! I am your CRM Assistant. Ask me anything about your leads, meetings, follow-ups, or tell me to perform updates.',
      created_at: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Scroll to bottom when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
      inputRef.current?.focus()
    }
  }, [isOpen, messages, loading])

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const headers: Record<string, string> = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch('/api/assistant/chat', { headers })

        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            setMessages(
              data.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                created_at: m.created_at,
              }))
            )
          }
        }
      } catch (err) {
        console.error('Failed to load assistant history:', err)
      }
    }

    loadHistory()
  }, [])

  const handleSend = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim()
    if (!messageText || loading) return

    setInput('')
    const userMsg: ChatMessage = {
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setStatusMessage('Analyzing CRM data...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: messageText,
          history: messages.slice(-8),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'Request completed.',
        tools_used: data.tools_used || [],
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      console.error('Assistant error:', err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${err.message || 'Something went wrong. Please try again.'}`,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
      setStatusMessage(null)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear this conversation?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        await fetch('/api/assistant/chat', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch (e) {
      console.error('Error clearing chat:', e)
    }

    setMessages([
      {
        role: 'assistant',
        content: '👋 Conversation cleared. How can I help you next?',
        created_at: new Date().toISOString(),
      },
    ])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-5 md:right-6 z-40 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-full shadow-xl hover:shadow-emerald-500/25 transition-all duration-300 transform hover:scale-105 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          aria-label="Open AI CRM Assistant"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
          </div>
          <span className="font-semibold text-sm tracking-wide">Ask CRM AI</span>
        </button>
      )}

      {/* Expanded Chat Drawer / Modal */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 flex flex-col bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-2xl rounded-2xl overflow-hidden ${
            expanded
              ? 'inset-4 md:inset-10'
              : 'bottom-20 md:bottom-6 right-3 md:right-6 w-[calc(100vw-24px)] md:w-[440px] h-[580px] max-h-[calc(100vh-100px)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight">CRM AI Assistant</h3>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">
                    {profile?.role === 'admin' ? 'Manager' : 'Live DB'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100">Natural language CRM operations</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHistory}
                title="Clear conversation"
                className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                title={expanded ? 'Minimize view' : 'Expand view'}
                className="hidden md:block p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleSend(qp.prompt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-gray-700 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-400 border border-gray-200 dark:border-gray-700 transition-colors shrink-0 disabled:opacity-50"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Message History Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/50 dark:bg-gray-900/30 text-sm">
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user'
              return (
                <div key={i} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Tool Badges if assistant executed tools */}
                    {!isUser && msg.tools_used && msg.tools_used.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {msg.tools_used.map((t, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className={`p-3 rounded-2xl leading-relaxed ${
                        isUser
                          ? 'bg-emerald-600 text-white rounded-br-none shadow-sm'
                          : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-800 rounded-bl-none shadow-sm'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <FormattedMessageContent content={msg.content} />
                      )}
                    </div>

                    {msg.created_at && (
                      <p
                        className={`text-[10px] text-gray-400 px-1 ${
                          isUser ? 'text-right' : 'text-left'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0 mt-0.5">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Thinking / Loading State */}
            {loading && (
              <div className="flex gap-2.5 justify-start items-center text-gray-500 dark:text-gray-400">
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="bg-white dark:bg-gray-900 px-3.5 py-2.5 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {statusMessage || 'Thinking...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Area */}
          <div className="p-3 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about leads, meetings, or create tasks..."
                disabled={loading}
                className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95 flex items-center justify-center shrink-0"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
            <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-gray-400">
              <span>Scoped to your authenticated CRM account</span>
              <span>Press Enter ↵ to send</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
