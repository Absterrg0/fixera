'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Mail, Download, RefreshCw, TrendingUp, Users, Calendar, AlertTriangle, Shield, RotateCcw, Clock, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || ''

type Preset = 'month' | 'quarter' | 'year' | 'last30' | 'custom'

interface Summary {
  signUps: number
  totalBookings: number
  completedBookings: number
  grossRevenue: number
  platformRevenue: number
  disputeRate: number
  warrantyClaimRate: number
  refundRate: number
  avgTimeToFirstQuoteHours: number | null
  quotedBookingsCount: number
}

interface RegionRow {
  city: string
  signUps: number
  views: number
  totalBookings: number
  completedBookings: number
  bookedValue: number
  platformRevenue: number
  quotationConversionRate: number
  disputeRate: number
  warrantyClaimRate: number
  refundRate: number
}

interface ServiceRow {
  service: string
  views: number
  totalRfqs: number
  quotedCount: number
  bookingsCount: number
  viewsToBookingRate: number
  quotationConversionRate: number
  avgTtfqHours: number | null
}

interface ResponseRow {
  professionalId: string
  name?: string
  email?: string
  city?: string
  avgHours: number
  minHours: number
  maxHours: number
  quotesSent: number
}

const toISODateInput = (d: Date) => d.toISOString().slice(0, 10)

const computePreset = (preset: Preset): { from: string; to: string } => {
  const now = new Date()
  const to = toISODateInput(now)
  if (preset === 'last30') {
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    return { from: toISODateInput(from), to }
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getUTCMonth() / 3)
    const from = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
    return { from: toISODateInput(from), to }
  }
  if (preset === 'year') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    return { from: toISODateInput(from), to }
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { from: toISODateInput(from), to }
}

const ScalarCard = ({ icon: Icon, label, value, suffix, loading }: { icon: LucideIcon; label: string; value: string | number | null; suffix?: string; loading: boolean }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-full bg-blue-50 p-2 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <div className="text-xl font-semibold text-gray-900">
            {value == null ? 'n/a' : value}
            {suffix && value != null ? <span className="text-sm text-gray-500 ml-1">{suffix}</span> : null}
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

export default function AdminKpiDashboard() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const initial = useMemo(() => computePreset('month'), [])
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState<string>(initial.from)
  const [to, setTo] = useState<string>(initial.to)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [regions, setRegions] = useState<RegionRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingReport, setSendingReport] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/auth/signin')
      return
    }
    if (user.role !== 'admin') {
      router.push('/')
    }
  }, [authLoading, user, router])

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') {
      const r = computePreset(p)
      setFrom(r.from)
      setTo(r.to)
    }
  }

  const range = useMemo(() => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, [from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, regRes, svcRes, respRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/kpi/summary?${range}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-region?${range}`),
        authFetch(`${BACKEND}/api/admin/kpi/by-service?${range}`),
        authFetch(`${BACKEND}/api/admin/kpi/professional-response?${range}`),
      ])
      if (!sumRes.ok || !regRes.ok || !svcRes.ok || !respRes.ok) {
        toast.error('Failed to load KPI data')
        return
      }
      const [sumJson, regJson, svcJson, respJson] = await Promise.all([sumRes.json(), regRes.json(), svcRes.json(), respRes.json()])
      setSummary(sumJson.data || null)
      setRegions(regJson.data?.rows || [])
      setServices(svcJson.data?.rows || [])
      setResponses(respJson.data?.rows || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load KPI data')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    load()
  }, [user, load])

  const downloadCsv = (section: 'region' | 'service' | 'response') => {
    const url = `${BACKEND}/api/admin/kpi/export?section=${section}&${range}`
    window.open(url, '_blank')
  }

  const emailPdf = async () => {
    setSendingReport(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/kpi/email-report?${range}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.status === 202 || res.ok) {
        toast.success(json?.data?.message || 'Report is being prepared and will be emailed to you.')
      } else {
        toast.error(json?.error?.message || 'Failed to queue report')
      }
    } catch {
      toast.error('Failed to queue report')
    } finally {
      setSendingReport(false)
    }
  }

  if (authLoading) return null
  if (!user || user.role !== 'admin') return null

  const regionBarData = regions.slice(0, 10).map((r) => ({ name: r.city, bookedValue: r.bookedValue, platformRevenue: r.platformRevenue }))
  const serviceBarData = services.slice(0, 10).map((s) => ({ name: s.service, views: s.views, bookings: s.bookingsCount }))

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monthly KPI Dashboard</h1>
            <p className="text-sm text-gray-500">Platform health by city, service, and response times.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={emailPdf} disabled={sendingReport}>
              <Mail className="h-4 w-4 mr-2" />
              {sendingReport ? 'Queuing…' : 'Email me the full PDF report'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Date range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-2 flex-wrap">
                {(['month', 'quarter', 'year', 'last30'] as Preset[]).map((p) => (
                  <Button
                    key={p}
                    variant={preset === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyPreset(p)}
                  >
                    {p === 'month' ? 'This month' : p === 'quarter' ? 'This quarter' : p === 'year' ? 'This year' : 'Last 30 days'}
                  </Button>
                ))}
                <Button variant={preset === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('custom')}>Custom</Button>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <Label htmlFor="kpi-from" className="text-xs">From</Label>
                  <Input
                    id="kpi-from"
                    type="date"
                    value={from}
                    onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }}
                    className="w-40"
                  />
                </div>
                <div>
                  <Label htmlFor="kpi-to" className="text-xs">To</Label>
                  <Input
                    id="kpi-to"
                    type="date"
                    value={to}
                    onChange={(e) => { setPreset('custom'); setTo(e.target.value) }}
                    className="w-40"
                  />
                </div>
                <Button onClick={load} disabled={loading}>Apply</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ScalarCard icon={Users} label="Sign-ups" value={summary?.signUps ?? null} loading={loading} />
          <ScalarCard icon={Calendar} label="Bookings" value={summary?.totalBookings ?? null} loading={loading} />
          <ScalarCard icon={TrendingUp} label="Gross revenue" value={summary?.grossRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={TrendingUp} label="Platform revenue" value={summary?.platformRevenue?.toFixed(2) ?? null} suffix="EUR" loading={loading} />
          <ScalarCard icon={Clock} label="Avg time to first quote" value={summary?.avgTimeToFirstQuoteHours ?? null} suffix="h" loading={loading} />
          <ScalarCard icon={AlertTriangle} label="Dispute rate" value={summary?.disputeRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={Shield} label="Warranty claim rate" value={summary?.warrantyClaimRate ?? null} suffix="%" loading={loading} />
          <ScalarCard icon={RotateCcw} label="Refund rate" value={summary?.refundRate ?? null} suffix="%" loading={loading} />
        </div>

        <Tabs defaultValue="region" className="w-full">
          <TabsList>
            <TabsTrigger value="region">By Region (City)</TabsTrigger>
            <TabsTrigger value="service">By Service</TabsTrigger>
            <TabsTrigger value="response">Professional Response Times</TabsTrigger>
          </TabsList>

          <TabsContent value="region">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Top 10 cities by booked value</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('region')}>
                  <Download className="h-4 w-4 mr-2" />Download CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="bookedValue" fill="#3b82f6" name="Booked value (EUR)" />
                      <Bar dataKey="platformRevenue" fill="#10b981" name="Platform revenue (EUR)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">City</th>
                        <th className="px-3 py-2 text-right">Sign-ups</th>
                        <th className="px-3 py-2 text-right">Views</th>
                        <th className="px-3 py-2 text-right">Bookings</th>
                        <th className="px-3 py-2 text-right">Booked €</th>
                        <th className="px-3 py-2 text-right">Platform €</th>
                        <th className="px-3 py-2 text-right">Convert %</th>
                        <th className="px-3 py-2 text-right">Dispute %</th>
                        <th className="px-3 py-2 text-right">Warranty %</th>
                        <th className="px-3 py-2 text-right">Refund %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {regions.length === 0 && !loading && (
                        <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                      )}
                      {regions.map((r) => (
                        <tr key={r.city}>
                          <td className="px-3 py-2 capitalize">{r.city}</td>
                          <td className="px-3 py-2 text-right">{r.signUps}</td>
                          <td className="px-3 py-2 text-right">{r.views}</td>
                          <td className="px-3 py-2 text-right">{r.totalBookings}</td>
                          <td className="px-3 py-2 text-right">{r.bookedValue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{r.platformRevenue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{r.quotationConversionRate}</td>
                          <td className="px-3 py-2 text-right">{r.disputeRate}</td>
                          <td className="px-3 py-2 text-right">{r.warrantyClaimRate}</td>
                          <td className="px-3 py-2 text-right">{r.refundRate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Top 10 services — views vs. bookings</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('service')}>
                  <Download className="h-4 w-4 mr-2" />Download CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serviceBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="views" fill="#6366f1" name="Views" />
                      <Bar dataKey="bookings" fill="#f59e0b" name="Bookings" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Service</th>
                        <th className="px-3 py-2 text-right">Views</th>
                        <th className="px-3 py-2 text-right">RFQs</th>
                        <th className="px-3 py-2 text-right">Quotes</th>
                        <th className="px-3 py-2 text-right">Bookings</th>
                        <th className="px-3 py-2 text-right">Views→Booking %</th>
                        <th className="px-3 py-2 text-right">Quote conv. %</th>
                        <th className="px-3 py-2 text-right">Avg TTFQ (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {services.length === 0 && !loading && (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                      )}
                      {services.map((s) => (
                        <tr key={s.service}>
                          <td className="px-3 py-2 capitalize">{s.service}</td>
                          <td className="px-3 py-2 text-right">{s.views}</td>
                          <td className="px-3 py-2 text-right">{s.totalRfqs}</td>
                          <td className="px-3 py-2 text-right">{s.quotedCount}</td>
                          <td className="px-3 py-2 text-right">{s.bookingsCount}</td>
                          <td className="px-3 py-2 text-right">{s.viewsToBookingRate}</td>
                          <td className="px-3 py-2 text-right">{s.quotationConversionRate}</td>
                          <td className="px-3 py-2 text-right">{s.avgTtfqHours ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="response">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Fastest professional responders (avg hours to first quote)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('response')}>
                  <Download className="h-4 w-4 mr-2" />Download CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responses.slice(0, 10).map((r) => ({ name: r.name || r.email || '—', avgHours: r.avgHours }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avgHours" fill="#0ea5e9" name="Avg hours">
                        {responses.slice(0, 10).map((_, idx) => (
                          <Cell key={idx} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Professional</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">City</th>
                        <th className="px-3 py-2 text-right">Quotes sent</th>
                        <th className="px-3 py-2 text-right">Avg hours</th>
                        <th className="px-3 py-2 text-right">Min hours</th>
                        <th className="px-3 py-2 text-right">Max hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {responses.length === 0 && !loading && (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No data in this range</td></tr>
                      )}
                      {responses.map((r) => (
                        <tr key={r.professionalId || r.email}>
                          <td className="px-3 py-2">{r.name || '—'}</td>
                          <td className="px-3 py-2">{r.email || '—'}</td>
                          <td className="px-3 py-2">{r.city || '—'}</td>
                          <td className="px-3 py-2 text-right">{r.quotesSent}</td>
                          <td className="px-3 py-2 text-right">{r.avgHours}</td>
                          <td className="px-3 py-2 text-right">{r.minHours}</td>
                          <td className="px-3 py-2 text-right">{r.maxHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
