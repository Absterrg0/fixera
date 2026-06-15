'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO, isValid } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getAuthToken } from "@/lib/utils"
import { Loader2, Lock } from "lucide-react"

type PlanningResource = {
  _id: string
  name?: string
  blockedDays?: string[]
  plannedDays?: string[]
}

type PlanningPayload = {
  bookingId: string
  bookingNumber?: string
  customerName?: string
  status: string
  startDate?: string
  windowFrom?: string
  windowTo?: string
  today?: string
  isInProgress?: boolean
  resources?: PlanningResource[]
}

interface PlanningDialogProps {
  open: boolean
  bookingId: string | null
  onClose: () => void
  onUpdated?: () => void | Promise<void>
}

type CellState = "planned" | "blocked" | "available"

const parseDayKey = (value?: string | null): Date | null => {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

const enumerateDays = (from?: string, to?: string): string[] => {
  const start = parseDayKey(from)
  const end = parseDayKey(to)
  if (!start || !end || end < start) return []
  const days: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  let guard = 0
  while (cursor <= endUtc && guard < 1000) {
    guard++
    const y = cursor.getUTCFullYear()
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0")
    const d = String(cursor.getUTCDate()).padStart(2, "0")
    days.push(`${y}-${m}-${d}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const isWeekend = (dayKey: string): boolean => {
  const d = parseDayKey(dayKey)
  if (!d) return false
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

export default function PlanningDialog({ open, bookingId, onClose, onUpdated }: PlanningDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payload, setPayload] = useState<PlanningPayload | null>(null)
  const [planned, setPlanned] = useState<Record<string, Set<string>>>({})

  const withAuthHeaders = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const hydrate = useCallback((data: PlanningPayload) => {
    setPayload(data)
    const map: Record<string, Set<string>> = {}
    for (const resource of data.resources || []) {
      map[resource._id] = new Set(resource.plannedDays || [])
    }
    setPlanned(map)
  }, [])

  useEffect(() => {
    if (!open || !bookingId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
          method: "PUT",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({ load: true }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok || !body?.success) {
          toast.error(body?.error?.message || "Failed to load planning")
          if (!cancelled) onClose()
          return
        }
        if (!cancelled) hydrate(body.data as PlanningPayload)
      } catch {
        toast.error("Failed to load planning")
        if (!cancelled) onClose()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId, hydrate])

  const days = useMemo(
    () => enumerateDays(payload?.windowFrom, payload?.windowTo),
    [payload?.windowFrom, payload?.windowTo]
  )

  const blockedByResource = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const resource of payload?.resources || []) {
      map[resource._id] = new Set(resource.blockedDays || [])
    }
    return map
  }, [payload?.resources])

  const today = payload?.today
  const isInProgress = !!payload?.isInProgress

  const cellState = useCallback(
    (resourceId: string, dayKey: string): CellState => {
      if (planned[resourceId]?.has(dayKey)) return "planned"
      if (blockedByResource[resourceId]?.has(dayKey)) return "blocked"
      if (isInProgress && today && dayKey < today) return "blocked"
      return "available"
    },
    [planned, blockedByResource, isInProgress, today]
  )

  const isLocked = useCallback(
    (resourceId: string, dayKey: string): boolean => {
      if (blockedByResource[resourceId]?.has(dayKey)) return true
      if (isInProgress && today && dayKey < today) return true
      return false
    },
    [blockedByResource, isInProgress, today]
  )

  const toggleCell = useCallback(
    (resourceId: string, dayKey: string) => {
      if (isLocked(resourceId, dayKey)) return
      setPlanned((prev) => {
        const next = { ...prev }
        const set = new Set(next[resourceId] || [])
        if (set.has(dayKey)) set.delete(dayKey)
        else set.add(dayKey)
        next[resourceId] = set
        return next
      })
    },
    [isLocked]
  )

  const submit = async () => {
    if (!bookingId || !payload) return
    setSaving(true)
    try {
      const resourcePlan = (payload.resources || []).map((resource) => ({
        resourceId: resource._id,
        days: Array.from(planned[resource._id] || []).sort(),
      }))
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
        method: "PUT",
        credentials: "include",
        headers: withAuthHeaders(),
        body: JSON.stringify({ resourcePlan }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success) {
        toast.error(body?.error?.message || "Failed to save planning")
        return
      }
      toast.success("Planning updated.")
      if (body.data) hydrate(body.data as PlanningPayload)
      await onUpdated?.()
      onClose()
    } catch {
      toast.error("Failed to save planning")
    } finally {
      setSaving(false)
    }
  }

  const startLabel = payload?.startDate ? format(parseISO(payload.startDate), "dd MMM yyyy") : "Unscheduled"

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Planning
            {payload?.bookingNumber ? ` — ${payload.bookingNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            {payload?.customerName ? `Customer: ${payload.customerName}. ` : ""}
            Click a day to plan or unplan a resource. Each resource can have non-contiguous days.
          </DialogDescription>
        </DialogHeader>

        {loading || !payload ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                <span>
                  Booking start: <strong>{startLabel}</strong>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                The start date is read-only here. Change it via a reschedule request.
                {isInProgress && " Work in progress: days before today are locked."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-emerald-400 bg-emerald-300" /> Planned
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-sky-400 bg-sky-300" /> Unavailable
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-slate-300 bg-white" /> Available
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[140px] border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium text-slate-700">
                      Resource
                    </th>
                    {days.map((dayKey) => {
                      const d = parseDayKey(dayKey)
                      const weekend = isWeekend(dayKey)
                      return (
                        <th
                          key={dayKey}
                          className={`border-b border-r border-slate-200 px-1 py-1 text-center font-medium ${weekend ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}
                        >
                          <div>{d ? format(d, "EEE")[0] : ""}</div>
                          <div>{d ? format(d, "dd") : ""}</div>
                          <div className="text-[9px] text-slate-400">{d ? format(d, "MMM") : ""}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(payload.resources || []).map((resource) => (
                    <tr key={resource._id}>
                      <td className="sticky left-0 z-10 min-w-[140px] border-b border-r border-slate-200 bg-white px-2 py-1 font-medium text-slate-800">
                        {resource.name || resource._id}
                      </td>
                      {days.map((dayKey) => {
                        const state = cellState(resource._id, dayKey)
                        const locked = isLocked(resource._id, dayKey)
                        const weekend = isWeekend(dayKey)
                        let cls = "bg-white hover:bg-slate-50"
                        if (state === "planned") cls = "bg-emerald-300 hover:bg-emerald-400"
                        else if (state === "blocked") cls = "bg-sky-300"
                        else if (weekend) cls = "bg-slate-50 hover:bg-slate-100"
                        return (
                          <td
                            key={dayKey}
                            className={`h-8 w-9 border-b border-r border-slate-200 p-0 text-center ${cls} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                            onClick={() => toggleCell(resource._id, dayKey)}
                            title={`${resource.name || resource._id} — ${dayKey}${locked ? " (unavailable)" : ""}`}
                          >
                            {state === "blocked" ? <Lock className="mx-auto h-3 w-3 text-sky-700" /> : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save plan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
