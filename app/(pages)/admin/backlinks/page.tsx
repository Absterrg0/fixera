'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Link2, Settings, BarChart3, List, Loader2, Save, CheckCircle,
  XCircle, AlertTriangle, Clock, RefreshCw, Ban, ThumbsUp, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/utils';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface BacklinkConfig {
  isEnabled: boolean;
  customerRewardPoints: number;
  professionalRewardPoints: number;
  allowedTargetDomains: string[];
  crawlTimeoutMs: number;
  requireFollowLink: boolean;
  resubmitCooldownHours: number;
}

interface BacklinkAnalytics {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
  revoked: number;
  thisMonth: number;
  totalPointsIssued: number;
  totalUnclawedPoints: number;
  topSubmitters: Array<{ _id: string; name: string; email: string; role: string; verifiedCount: number; totalPoints: number }>;
}

type SubmissionStatus = 'pending_verification' | 'verifying' | 'verified' | 'rejected' | 'revoked';

interface Submission {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | null;
  submittedUrl: string;
  domain: string;
  status: SubmissionStatus;
  rewardPoints?: number;
  rejectionReason?: string;
  unclawedPoints?: number;
  ipAddress?: string;
  createdAt: string;
  revokedAt?: string;
  revokedBy?: { name: string; email: string } | null;
  reviewedBy?: { name: string; email: string } | null;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const POLL_INTERVAL_MS = 8_000;

function authHeaders() {
  const token = getAuthToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function isInFlight(status: SubmissionStatus): boolean {
  return status === 'pending_verification' || status === 'verifying';
}

const STATUS_FILTERS = ['', 'pending_verification', 'verifying', 'verified', 'rejected', 'revoked'] as const;
const STATUS_LABELS: Record<string, string> = {
  '': 'All', pending_verification: 'Queued', verifying: 'Verifying', verified: 'Verified', rejected: 'Rejected', revoked: 'Revoked',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_verification: 'bg-amber-100 text-amber-800',
    verifying: 'bg-amber-100 text-amber-800',
    verified: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    revoked: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ------------------------------------------------------------------
// Main page
// ------------------------------------------------------------------

export default function AdminBacklinksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<'config' | 'analytics' | 'list'>('config');
  const [config, setConfig] = useState<BacklinkConfig | null>(null);
  const [analytics, setAnalytics] = useState<BacklinkAnalytics | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [listRefreshError, setListRefreshError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const pageRef = useRef(page);
  const statusFilterRef = useRef(statusFilter);
  pageRef.current = page;
  statusFilterRef.current = statusFilter;

  // Domain tag editing
  const [domainInput, setDomainInput] = useState('');

  // Reason modal state
  const [reasonModal, setReasonModal] = useState<{ id: string; action: 'reject' | 'revoke' } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const fetchConfig = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/config`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('config fetch failed');
      const d = await res.json();
      if (d.success) { setConfig(d.data); return true; }
      toast.error(d.msg ?? 'Failed to load config');
      return false;
    } catch {
      toast.error('Failed to load backlink config');
      return false;
    }
  }, []);

  const fetchAnalytics = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
    try {
      if (opts?.silent) setListRefreshError(false);
      const res = await fetch(`${BACKEND}/api/admin/backlinks/analytics`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('analytics fetch failed');
      const d = await res.json();
      if (d.success) { setAnalytics(d.data); return true; }
      if (!opts?.silent) toast.error(d.msg ?? 'Failed to load analytics');
      else setListRefreshError(true);
      return false;
    } catch {
      if (!opts?.silent) toast.error('Failed to load analytics');
      else setListRefreshError(true);
      return false;
    }
  }, []);

  const fetchSubmissions = useCallback(async (p = 1, status = '', opts?: { silent?: boolean }): Promise<boolean> => {
    try {
      if (opts?.silent) setListRefreshError(false);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (status) params.set('status', status);
      const res = await fetch(`${BACKEND}/api/admin/backlinks/list?${params}`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('list fetch failed');
      const d = await res.json();
      if (d.success) {
        setSubmissions(d.data.submissions);
        setTotal(d.data.pagination.total);
        return true;
      }
      if (!opts?.silent) toast.error(d.msg ?? 'Failed to load submissions');
      else setListRefreshError(true);
      return false;
    } catch {
      if (!opts?.silent) toast.error('Failed to load submissions');
      else setListRefreshError(true);
      return false;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [cfgOk] = await Promise.all([fetchConfig(), fetchAnalytics(), fetchSubmissions()]);
    if (!cfgOk) setLoadError(true);
    setLoading(false);
  }, [fetchConfig, fetchAnalytics, fetchSubmissions]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/signin'); return; }
    if (user.role !== 'admin') { router.push('/dashboard'); return; }
    void loadAll();
  }, [authLoading, user, router, loadAll]);

  useEffect(() => {
    if (tab === 'list') void fetchSubmissions(page, statusFilter);
  }, [tab, page, statusFilter, fetchSubmissions]);

  useEffect(() => {
    if (tab !== 'list') return;
    if (!submissions.some((s) => isInFlight(s.status))) return;
    const id = setInterval(() => {
      void fetchSubmissions(pageRef.current, statusFilterRef.current, { silent: true });
      void fetchAnalytics({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tab, submissions, fetchSubmissions, fetchAnalytics]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/config`, {
        method: 'PUT', credentials: 'include', headers: authHeaders(), body: JSON.stringify(config),
      });
      const d = await res.json();
      if (d.success) { toast.success('Configuration saved'); setConfig(d.data); }
      else toast.error(d.msg ?? 'Failed to save');
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const doAction = async (id: string, action: 'approve' | 'reprocess', reason?: string) => {
    if (actionId) return;
    setActionId(id);
    try {
      const body = reason ? JSON.stringify({ reason }) : undefined;
      const res = await fetch(`${BACKEND}/api/admin/backlinks/${id}/${action}`, {
        method: 'POST', credentials: 'include', headers: authHeaders(), body,
      });
      const d = await res.json();
      if (d.success) {
        toast.success(d.msg ?? `${action} successful`);
        fetchSubmissions(page, statusFilter);
        fetchAnalytics();
      } else {
        toast.error(d.msg ?? `${action} failed`);
      }
    } catch { toast.error('Network error'); }
    finally { setActionId(null); }
  };

  const submitReason = async () => {
    if (!reasonModal || !reasonInput.trim()) return;
    setActionId(reasonModal.id);
    setReasonModal(null);
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/${reasonModal.id}/${reasonModal.action}`, {
        method: 'POST', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const d = await res.json();
      if (d.success) { toast.success(d.msg ?? 'Done'); fetchSubmissions(page, statusFilter); fetchAnalytics(); }
      else toast.error(d.msg ?? 'Failed');
    } catch { toast.error('Network error'); }
    finally { setActionId(null); setReasonInput(''); }
  };

  const addDomain = () => {
    if (!config || !domainInput.trim()) return;
    const host = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
    if (!host || config.allowedTargetDomains.includes(host)) return;
    setConfig({ ...config, allowedTargetDomains: [...config.allowedTargetDomains, host] });
    setDomainInput('');
  };

  const removeDomain = (d: string) => {
    if (!config) return;
    setConfig({ ...config, allowedTargetDomains: config.allowedTargetDomains.filter((x) => x !== d) });
  };

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  const LoadErrorCard = ({ label, onRetry }: { label: string; onRetry: () => void }) => (
    <Card>
      <CardContent className="pt-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
        <p className="text-gray-600">{label}</p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />Retry
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Link2 className="h-8 w-8 text-indigo-600" />
            Backlink Rewards Management
          </h1>
          <p className="text-gray-600 mt-1">Configure the backlink program, view analytics, and manage submission queue.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'config' as const, label: 'Configuration', icon: Settings },
            { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
            { id: 'list' as const, label: 'Submissions', icon: List },
          ] as const).map((t) => (
            <Button key={t.id} variant={tab === t.id ? 'default' : 'outline'} onClick={() => setTab(t.id)} className="flex items-center gap-2">
              <t.icon className="h-4 w-4" />{t.label}
            </Button>
          ))}
        </div>

        {/* ── CONFIG TAB ───────────────────────────────────────────── */}
        {tab === 'config' && !config && loadError && (
          <LoadErrorCard label="Failed to load configuration." onRetry={() => void loadAll()} />
        )}
        {tab === 'config' && config && (
          <div className="space-y-6">

            {/* Master toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Program Status</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-gray-500">{config.isEnabled ? 'Active' : 'Inactive'}</span>
                    <Switch checked={config.isEnabled} onCheckedChange={(v) => setConfig({ ...config, isEnabled: v })} />
                  </div>
                </CardTitle>
                <CardDescription>Enable or disable the backlink rewards program globally.</CardDescription>
              </CardHeader>
            </Card>

            {/* Rewards */}
            <Card>
              <CardHeader><CardTitle>Reward Points</CardTitle><CardDescription>Points awarded per verified backlink, by role.</CardDescription></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer reward (pts)</Label>
                  <Input type="number" min={0} value={config.customerRewardPoints}
                    onChange={(e) => setConfig({ ...config, customerRewardPoints: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Professional reward (pts)</Label>
                  <Input type="number" min={0} value={config.professionalRewardPoints}
                    onChange={(e) => setConfig({ ...config, professionalRewardPoints: Number(e.target.value) || 0 })} />
                </div>
              </CardContent>
            </Card>

            {/* Allowed domains */}
            <Card>
              <CardHeader><CardTitle>Allowed Target Domains</CardTitle>
                <CardDescription>Hostnames a submitted page must link TO. FRONTEND_URL is always included at runtime.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="e.g. fixera.com" value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }} />
                  <Button variant="outline" onClick={addDomain}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.allowedTargetDomains.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs text-indigo-800">
                      {d}
                      <button onClick={() => removeDomain(d)} className="ml-1 text-indigo-400 hover:text-indigo-700">&times;</button>
                    </span>
                  ))}
                  {config.allowedTargetDomains.length === 0 && (
                    <p className="text-sm text-gray-400">No domains configured — only FRONTEND_URL will be matched.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Verification settings */}
            <Card>
              <CardHeader><CardTitle>Verification Settings</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Crawl timeout (ms)</Label>
                  <Input type="number" min={5000} max={120000} value={config.crawlTimeoutMs}
                    onChange={(e) => setConfig({ ...config, crawlTimeoutMs: Number(e.target.value) || 30000 })} />
                  <p className="text-xs text-gray-500">5 000 – 120 000 ms</p>
                </div>
                <div className="space-y-2">
                  <Label>Resubmit cooldown (hours)</Label>
                  <Input type="number" min={0} value={config.resubmitCooldownHours}
                    onChange={(e) => setConfig({ ...config, resubmitCooldownHours: Number(e.target.value) || 0 })} />
                  <p className="text-xs text-gray-500">Hours a user must wait after rejection</p>
                </div>
                <div className="space-y-2">
                  <Label>Require follow link</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch checked={config.requireFollowLink}
                      onCheckedChange={(v) => setConfig({ ...config, requireFollowLink: v })} />
                    <span className="text-sm text-gray-500">{config.requireFollowLink ? 'Yes — nofollow links rejected' : 'No — nofollow links accepted'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save Configuration</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ────────────────────────────────────────── */}
        {tab === 'analytics' && !analytics && (
          <LoadErrorCard label="Failed to load analytics." onRetry={() => void fetchAnalytics()} />
        )}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total', value: analytics.total, sub: `${analytics.thisMonth} this month`, icon: List, color: 'text-blue-600' },
                { label: 'Verified', value: analytics.verified, sub: 'Links rewarded', icon: CheckCircle, color: 'text-emerald-600' },
                { label: 'Points Issued', value: analytics.totalPointsIssued, sub: 'Via backlinks', icon: Link2, color: 'text-indigo-600' },
                { label: 'Unclaw\'d Pts', value: analytics.totalUnclawedPoints, sub: 'Could not recover', icon: AlertTriangle, color: 'text-amber-600' },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                      <p className="text-sm text-gray-500">{s.label}</p>
                    </div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Pending', value: analytics.pending, bg: 'bg-amber-50', fg: 'text-amber-900', icon: Clock, ic: 'text-amber-600' },
                  { label: 'Verified', value: analytics.verified, bg: 'bg-emerald-50', fg: 'text-emerald-900', icon: CheckCircle, ic: 'text-emerald-600' },
                  { label: 'Rejected', value: analytics.rejected, bg: 'bg-red-50', fg: 'text-red-900', icon: XCircle, ic: 'text-red-500' },
                  { label: 'Revoked', value: analytics.revoked, bg: 'bg-slate-50', fg: 'text-slate-900', icon: Ban, ic: 'text-slate-500' },
                ].map((s) => (
                  <div key={s.label} className={`text-center p-4 rounded-lg ${s.bg}`}>
                    <s.icon className={`h-5 w-5 mx-auto mb-2 ${s.ic}`} />
                    <p className={`text-2xl font-bold ${s.fg}`}>{s.value}</p>
                    <p className="text-sm text-gray-600">{s.label}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {analytics.topSubmitters.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Top Submitters</CardTitle><CardDescription>Users with the most verified backlinks</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.topSubmitters.map((s, i) => (
                      <div key={s._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-400 w-6">#{i + 1}</span>
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-xs text-gray-500">{s.email}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">{s.role}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">{s.verifiedCount} verified</p>
                          <p className="text-xs text-gray-500">{s.totalPoints} pts total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── SUBMISSIONS TAB ──────────────────────────────────────── */}
        {tab === 'list' && (
          <div className="space-y-4">
            {/* Status filters */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((s) => (
                <Button key={s || 'all'} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
                  onClick={() => { setStatusFilter(s); setPage(1); }}>
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>

            {listRefreshError && submissions.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">Couldn&apos;t refresh the submission queue.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setListRefreshError(false);
                    void fetchSubmissions(page, statusFilter);
                    void fetchAnalytics();
                  }}
                >
                  Retry
                </Button>
              </div>
            )}

            <Card>
              <CardContent className="pt-4">
                {submissions.length === 0 ? (
                  <p className="text-center text-gray-500 py-10">No submissions found</p>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((sub) => (
                      <div key={sub._id} className="border rounded-lg p-4 space-y-3">
                        {/* Row 1: URL + status + user */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={sub.status} />
                              <a href={sub.submittedUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-indigo-600 hover:underline truncate max-w-xs">
                                {sub.domain}<ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </a>
                            </div>
                            <p className="text-xs text-gray-500">
                              {sub.userId?.name ?? 'Unknown'} &middot; {sub.userId?.email} &middot; <span className="capitalize">{sub.userId?.role}</span>
                            </p>
                            {sub.status === 'verifying' && (
                              <p className="text-xs text-amber-600">Crawling page… — actions available when crawl completes</p>
                            )}
                            {sub.rejectionReason && (
                              <p className="text-xs text-red-600">{sub.rejectionReason}</p>
                            )}
                            {sub.unclawedPoints != null && sub.unclawedPoints > 0 && (
                              <p className="text-xs text-amber-600">⚠ {sub.unclawedPoints} pts could not be clawed back</p>
                            )}
                            {sub.rewardPoints != null && sub.status === 'verified' && (
                              <p className="text-xs text-emerald-600">+{sub.rewardPoints} pts awarded</p>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 shrink-0">{new Date(sub.createdAt).toLocaleDateString()}</p>
                        </div>

                        {/* Row 2: Actions */}
                        <div className="flex gap-2 flex-wrap">
                          {(sub.status === 'pending_verification' || sub.status === 'rejected') && (
                            <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              disabled={actionId === sub._id}
                              onClick={() => doAction(sub._id, 'approve')}>
                              {actionId === sub._id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
                              Approve
                            </Button>
                          )}
                          {(sub.status === 'pending_verification' || sub.status === 'rejected') && (
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50"
                              disabled={actionId === sub._id}
                              onClick={() => { setReasonModal({ id: sub._id, action: 'reject' }); setReasonInput(''); }}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          )}
                          {sub.status === 'verified' && (
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50"
                              disabled={actionId === sub._id}
                              onClick={() => { setReasonModal({ id: sub._id, action: 'revoke' }); setReasonInput(''); }}>
                              <Ban className="h-3 w-3 mr-1" />Revoke
                            </Button>
                          )}
                          {(sub.status === 'rejected' || sub.status === 'pending_verification') && (
                            <Button size="sm" variant="ghost" className="text-gray-600"
                              disabled={actionId === sub._id}
                              onClick={() => doAction(sub._id, 'reprocess')}>
                              <RefreshCw className="h-3 w-3 mr-1" />Reprocess
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {total > 20 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                      <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold capitalize">{reasonModal.action} submission</h2>
            <p className="text-sm text-gray-500">Provide a reason — this will be sent to the user via push notification.</p>
            <Input placeholder="Reason…" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitReason(); }} autoFocus />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setReasonModal(null)}>Cancel</Button>
              <Button onClick={submitReason} disabled={!reasonInput.trim()}
                className={reasonModal.action === 'revoke' ? 'bg-red-600 hover:bg-red-700' : ''}>
                Confirm {reasonModal.action}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
