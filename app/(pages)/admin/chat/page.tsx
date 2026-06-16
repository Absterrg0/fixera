'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { useChatPolling } from "@/hooks/useChatPolling"
import { setAdminActiveConversationId, markAdminConversationSeen } from "@/hooks/useAdminUnreadCount"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Send, Lock, MessageSquare } from "lucide-react"
import { toast } from "sonner"

interface AdminConversation {
  _id: string
  type: string
  status: string
  supportTargetUserId?: { _id: string; name?: string; email?: string }
  supportAdminId?: { _id: string; name?: string; email?: string }
}

interface AdminConversationListItem {
  _id: string
  supportTargetUserId?: { _id: string; name?: string; email?: string }
  lastMessagePreview?: string
  lastMessageAt?: string | null
  awaitingReply?: boolean
}

interface AdminMessage {
  _id: string
  text: string
  senderRole: string
  senderId?: { _id: string; name?: string; email?: string } | string
  createdAt: string
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

function AdminChatInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryConversationId = searchParams?.get("conversationId") || ""

  const [selectedId, setSelectedId] = useState<string>(queryConversationId)
  const conversationId = selectedId

  const [conversations, setConversations] = useState<AdminConversationListItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [conversation, setConversation] = useState<AdminConversation | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const selectedIdRef = useRef<string>(selectedId)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    setSelectedId(queryConversationId)
  }, [queryConversationId])

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations`)
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.msg || "Failed to load conversations")
      }
      setConversations(Array.isArray(json.data?.items) ? json.data.items : [])
    } catch {
      if (!silent) toast.error("Failed to load conversations")
    } finally {
      if (!silent) setListLoading(false)
    }
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!conversationId) {
      setIsLoading(false)
      return
    }
    if (!silent) {
      setIsLoading(true)
      setLoadError(null)
    }
    try {
      const [convRes, msgRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}`),
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/messages?limit=100`),
      ])
      const convJson = await convRes.json()
      const msgJson = await msgRes.json()
      if (conversationId !== selectedIdRef.current) return
      if (convJson?.success) setConversation(convJson.data)
      if (msgJson?.success) {
        const items = Array.isArray(msgJson.data?.items) ? msgJson.data.items : []
        setMessages(items)
        markAdminConversationSeen(conversationId)
      }
      setLoadError(null)
    } catch {
      if (!silent) {
        toast.error("Failed to load conversation")
        setLoadError("Failed to load conversation. Please try again.")
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    if (user?.role === 'admin' && conversationId) {
      setAdminActiveConversationId(conversationId)
    }
  }, [user, conversationId])

  useEffect(() => {
    if (user?.role === 'admin') loadConversations()
  }, [user, loadConversations])

  useEffect(() => {
    if (user?.role === 'admin') load()
  }, [user, load])

  const pollMessages = useCallback(() => load(true), [load])
  const pollConversations = useCallback(() => loadConversations(true), [loadConversations])

  useChatPolling(pollMessages, 6000, user?.role === 'admin' && !!conversationId, [conversationId])
  useChatPolling(pollConversations, 15000, user?.role === 'admin', [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const selectConversation = (id: string) => {
    if (id === selectedId) return
    setSelectedId(id)
    setConversation(null)
    setMessages([])
    router.replace(`/admin/chat?conversationId=${id}`)
  }

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || !conversationId) return
    setSending(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || "Failed to send")
        return
      }
      setText("")
      await load()
      await loadConversations(true)
    } catch {
      toast.error("Failed to send")
    } finally {
      setSending(false)
    }
  }

  const closeChat = async () => {
    if (!conversationId) return
    if (!window.confirm("Close this support chat? The user will no longer be able to reply.")) return
    setClosing(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/close`, { method: "POST" })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || "Failed to close chat")
        return
      }
      toast.success("Support chat closed")
      await load()
      await loadConversations(true)
    } catch {
      toast.error("Failed to close chat")
    } finally {
      setClosing(false)
    }
  }

  if (loading || !user || user.role !== 'admin') return null

  const target = conversation?.supportTargetUserId
  const isClosed = conversation?.status === "archived"

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto pt-20">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Support chat
          </h1>
          <Button variant="outline" size="sm" onClick={() => { load(); loadConversations() }} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
          <Card className="h-[70vh] overflow-hidden">
            <CardContent className="p-0 h-full overflow-y-auto">
              <div className="border-b px-4 py-3 text-sm font-semibold text-gray-700">Inbox</div>
              {listLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : conversations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No support conversations.</p>
              ) : (
                <ul className="divide-y">
                  {conversations.map((c) => {
                    const u = c.supportTargetUserId
                    const active = c._id === conversationId
                    return (
                      <li key={c._id}>
                        <button
                          type="button"
                          onClick={() => selectConversation(c._id)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${active ? 'bg-indigo-50' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {u?.name || u?.email || "User"}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {c.lastMessageAt && (
                                <span className="text-[10px] text-gray-400">
                                  {new Date(c.lastMessageAt).toLocaleDateString()}
                                </span>
                              )}
                              {c.awaitingReply && (
                                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" aria-label="Awaiting reply" />
                              )}
                            </div>
                          </div>
                          <p className={`mt-0.5 text-xs truncate ${c.awaitingReply ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                            {c.lastMessagePreview || "No messages yet."}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {target && (
              <p className="text-sm text-gray-500">
                With {target.name || target.email || "user"} {target.email ? `(${target.email})` : ""}
              </p>
            )}

            {loadError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </div>
            )}

            {!conversationId ? (
              <Card><CardContent className="py-12 text-center text-gray-500">No conversation selected.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-end border-b p-2">
                    {!isClosed && conversation && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={closeChat}
                        disabled={closing}
                        aria-label="Close support chat"
                      >
                        {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                        Close chat
                      </Button>
                    )}
                  </div>
                  <div className="h-[55vh] overflow-y-auto p-4 space-y-3">
                    {isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-gray-400 py-8">No messages yet.</p>
                    ) : (
                      messages.map((m) => {
                        const mine = m.senderRole === 'admin'
                        return (
                          <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              <p className={`mt-1 text-[10px] ${mine ? 'text-indigo-100' : 'text-gray-400'}`}>
                                {m.senderRole} · {new Date(m.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={endRef} />
                  </div>
                  <div className="border-t p-3">
                    {isClosed ? (
                      <p className="text-center text-sm text-gray-400 flex items-center justify-center gap-1">
                        <Lock className="h-4 w-4" /> This support chat is closed.
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                          placeholder="Type a message…"
                          disabled={sending}
                        />
                        <Button onClick={send} disabled={sending || !text.trim()}>
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatInner />
    </Suspense>
  )
}
