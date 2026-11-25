import React, { useState } from 'react';
import { Plus, RefreshCw, RotateCcw, Pause, Play, Terminal, Power } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import {
  StatusText,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type { BrowserSession } from '../types/outreach';

interface SessionsViewProps {
  sessions: BrowserSession[];
  onRefresh: () => Promise<void>;
}

const WORKERS = ['pw-worker-01', 'pw-worker-02', 'pw-worker-03'];

export function SessionsView({ sessions, onRefresh }: SessionsViewProps) {
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [inspectSession, setInspectSession] = useState<BrowserSession | null>(null);
  const [form, setForm] = useState({
    accountLabel: '',
    operatorEmail: '',
    proxyRegion: 'us-east-1 (Virginia)',
    dailyActionLimit: 40,
    assignedWorker: 'pw-worker-01',
  });

  const handleAction = async (
    session: BrowserSession,
    action: 'reauth' | 'resetLimit' | 'toggleIdle' | 'pause' | 'terminate'
  ) => {
    try {
      await api.updateSession(session.id, { action });
      await onRefresh();
      pushToast('Session updated', `${session.id} updated cleanly.`, 'success');
    } catch (err) {
      pushToast('Update failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSession(form);
      await onRefresh();
      setModalOpen(false);
      setForm({
        accountLabel: '',
        operatorEmail: '',
        proxyRegion: 'us-east-1 (Virginia)',
        dailyActionLimit: 40,
        assignedWorker: 'pw-worker-01',
      });
      pushToast('Simulated session added', 'New sandbox session initialized.', 'success');
    } catch (err) {
      pushToast('Create failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-slate-400">
          Simulated operator sessions with safe daily action quotas, worker assignments, and audit logs.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3.5 py-2 text-xs font-medium text-white cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Simulated Session
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-slate-400">
                <th className="py-3 px-6 font-medium">Session / Worker</th>
                <th className="py-3 px-4 font-medium">Account Label</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Auth / Proxy</th>
                <th className="py-3 px-4 font-medium">Daily Action Count</th>
                <th className="py-3 px-4 font-medium">Rate Limit</th>
                <th className="py-3 px-4 font-medium">Last Active</th>
                <th className="py-3 px-6 font-medium text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {sessions.map((s) => {
                const pct = Math.min(
                  100,
                  Math.round((s.dailyActionCount / Math.max(1, s.dailyActionLimit)) * 100)
                );
                return (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-6">
                      <p className="font-mono text-slate-200">{s.id}</p>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {s.assignedWorker || 'pw-worker-01'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-100">{s.accountLabel}</p>
                      <p className="text-[11px] text-slate-500">{s.operatorEmail}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={s.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-300">{s.authStatus}</p>
                      <p className="text-[11px] text-slate-500">
                        {s.proxyStatus} · {s.proxyRegion}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 min-w-[140px]">
                      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-300 mb-1">
                        <span>
                          {s.dailyActionCount}/{s.dailyActionLimit}
                        </span>
                        <span className="text-slate-500">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-sm bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full ${
                            pct >= 100
                              ? 'bg-rose-500'
                              : pct >= 75
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={s.rateLimitStatus} />
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatRelativeTime(s.lastActive)}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {(s.status === 'Expired' ||
                          s.status === 'Needs Re-authentication' ||
                          s.status === 'Error') && (
                          <button
                            type="button"
                            onClick={() => handleAction(s, 'reauth')}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reconnect
                          </button>
                        )}
                        {s.dailyActionCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleAction(s, 'resetLimit')}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.06] cursor-pointer"
                            title="Reset daily quota"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </button>
                        )}
                        {(s.status === 'Active' || s.status === 'Idle') && (
                          <button
                            type="button"
                            onClick={() => handleAction(s, 'toggleIdle')}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] cursor-pointer"
                          >
                            {s.status === 'Active' ? (
                              <>
                                <Pause className="h-3 w-3" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                Activate
                              </>
                            )}
                          </button>
                        )}
                        {s.status !== 'Expired' && (
                          <button
                            type="button"
                            onClick={() => handleAction(s, 'terminate')}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            title="Terminate session"
                          >
                            <Power className="h-3 w-3" />
                            Terminate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectSession(s)}
                          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] cursor-pointer"
                          title="View Session Logs"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Session Details & Logs Modal */}
      <Modal
        open={Boolean(inspectSession)}
        onClose={() => setInspectSession(null)}
        title={`Session Logs · ${inspectSession?.id ?? ''}`}
        subtitle={
          inspectSession
            ? `${inspectSession.accountLabel} · ${inspectSession.assignedWorker || 'pw-worker-01'}`
            : ''
        }
      >
        {inspectSession && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-white/[0.07]">
              <div>
                <span className="text-slate-500 block">Status</span>
                <StatusText status={inspectSession.status} />
              </div>
              <div>
                <span className="text-slate-500 block">Auth State</span>
                <span className="text-slate-200">{inspectSession.authStatus}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Proxy Region</span>
                <span className="text-slate-200">{inspectSession.proxyRegion}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Last Active</span>
                <span className="font-mono text-slate-300 tabular-nums">
                  {formatPreciseTimestamp(inspectSession.lastActive)}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-white/[0.07] bg-[#0D0F14] p-4 font-mono text-[11px] space-y-2 max-h-64 overflow-y-auto text-slate-300">
              {(inspectSession.logs && inspectSession.logs.length > 0
                ? inspectSession.logs
                : ['No log lines recorded yet for this session.']
              ).map((line, i) => (
                <p key={i} className="leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Simulated Browser Session"
        subtitle="Configure a sandboxed operator profile with safe daily action limits"
      >
        <form onSubmit={handleAddSession} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Account Label *</label>
            <input
              required
              value={form.accountLabel}
              onChange={(e) => setForm({ ...form, accountLabel: e.target.value })}
              placeholder="e.g. Elena · Enterprise Growth"
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Operator Email *</label>
            <input
              required
              type="email"
              value={form.operatorEmail}
              onChange={(e) => setForm({ ...form, operatorEmail: e.target.value })}
              placeholder="operator@company.io"
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Proxy Region</label>
              <input
                value={form.proxyRegion}
                onChange={(e) => setForm({ ...form, proxyRegion: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Assigned Worker</label>
              <select
                value={form.assignedWorker}
                onChange={(e) => setForm({ ...form, assignedWorker: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 font-mono"
              >
                {WORKERS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Daily Action Cap</label>
              <input
                type="number"
                min={10}
                max={80}
                value={form.dailyActionLimit}
                onChange={(e) => setForm({ ...form, dailyActionLimit: Number(e.target.value) })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 font-medium text-white cursor-pointer"
            >
              Create Session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
