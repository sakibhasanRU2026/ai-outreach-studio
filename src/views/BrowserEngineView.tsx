import { useState } from 'react';
import { Globe, Play, Loader2, Shield, Terminal, RotateCw } from 'lucide-react';
import { api } from '../lib/api';
import {
  StatusText,
  formatIsoTimeOnly,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type { BrowserExecution, BrowserSession, Lead } from '../types/outreach';

interface BrowserEngineViewProps {
  executions: BrowserExecution[];
  sessions: BrowserSession[];
  leads: Lead[];
  onRefresh: () => Promise<void>;
}

const WORKERS = ['pw-worker-01', 'pw-worker-02', 'pw-worker-03'];

export function BrowserEngineView({
  executions,
  sessions,
  leads,
  onRefresh,
}: BrowserEngineViewProps) {
  const { pushToast } = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.find((s) => s.status === 'Active')?.id || sessions[0]?.id || ''
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('pw-worker-01');
  const [actionType, setActionType] = useState<BrowserExecution['actionType']>(
    'Connection Request Simulation'
  );
  const [running, setRunning] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeExecId, setActiveExecId] = useState<string | null>(executions[0]?.id || null);

  const activeExecution =
    executions.find((e) => e.id === activeExecId) || executions[0] || null;
  const previewLead = leads.find((l) => l.id === (activeExecution?.leadId || selectedLeadId)) || leads[0];

  const handleRunSimulation = async () => {
    if (!selectedLeadId || !selectedSessionId) return;
    setRunning(true);
    try {
      const res = await api.executeBrowserAction({
        leadId: selectedLeadId,
        sessionId: selectedSessionId,
        workerId: selectedWorkerId,
        actionType,
      });
      setActiveExecId(res.execution.id);
      await onRefresh();
      pushToast(
        res.execution.status === 'Completed'
          ? 'Browser simulation completed'
          : 'Safety guard halted action',
        `${res.execution.actionType} for ${res.execution.leadName} (${res.execution.status}).`,
        res.execution.status === 'Completed' ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast('Execution failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleRetryExecution = async (exec: BrowserExecution) => {
    setRetryingId(exec.id);
    try {
      const res = await api.retryBrowserExecution(exec.id);
      setActiveExecId(res.execution.id);
      await onRefresh();
      pushToast(
        res.execution.status === 'Completed' ? 'Execution recovered' : 'Retry halted',
        `Dispatched ${res.execution.id} via ${res.session.id} (${res.execution.status}).`,
        res.execution.status === 'Completed' ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast('Retry failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sandbox Notice & Worker Bar */}
      <div className="rounded-xl border border-white/[0.07] bg-[#14171F] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-0.5">
            <p className="font-medium text-slate-100">
              Playwright-Compatible Simulated Browser Sandbox
            </p>
            <p className="text-slate-400">
              All inspections and outreach actions execute strictly inside a mock LinkedIn-style prospect environment with safe rate-limit guards. No external accounts are automated.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-300 shrink-0 tabular-nums">
          <span>pw-worker-01: Ready</span>
          <span className="text-slate-600">·</span>
          <span>pw-worker-02: Ready</span>
        </div>
      </div>

      {/* Simulation Dispatcher + Live Mock Browser Viewport */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-100 font-display pb-3 border-b border-white/[0.07]">
            Dispatch Simulated Browser Task
          </h3>

          <div>
            <label className="block text-slate-400 mb-1.5">Prospect Profile</label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.company}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5">Browser Session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.accountLabel} ({s.status} — {s.dailyActionCount}/{s.dailyActionLimit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1.5">Browser Worker</label>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
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
              <label className="block text-slate-400 mb-1.5">Simulated Action</label>
              <select
                value={actionType}
                onChange={(e) =>
                  setActionType(e.target.value as BrowserExecution['actionType'])
                }
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              >
                <option value="Connection Request Simulation">Connection Request</option>
                <option value="Profile Inspection">Profile Inspection</option>
                <option value="Follow-up Message Simulation">Follow-up Message</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={running}
            onClick={handleRunSimulation}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2.5 font-medium text-white transition-colors cursor-pointer"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{running ? 'Simulating Browser Steps...' : 'Execute Simulated Action'}</span>
          </button>
        </div>

        {/* Mock Browser Viewport + Step Action Logs */}
        <div className="xl:col-span-7 rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/[0.07] bg-[#181B22] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="font-mono text-[11px] text-slate-300 truncate">
                {activeExecution?.profileUrl || previewLead?.profileUrl || 'https://sandbox.outreach.local'}
              </span>
            </div>
            {activeExecution && <StatusText status={activeExecution.status} />}
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 text-xs">
            {/* Mock Profile Card */}
            <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-4 space-y-3">
              <p className="text-[11px] text-slate-500 font-mono">SANDBOX DOM INSPECTOR</p>
              {previewLead ? (
                <>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">{previewLead.name}</h4>
                    <p className="text-slate-400 mt-0.5">
                      {previewLead.jobTitle} at {previewLead.company}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {previewLead.industry} · {previewLead.location}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-white/[0.06] space-y-1">
                    <span className="text-slate-500 block">Staged Message Payload</span>
                    <p className="text-slate-300 leading-relaxed">
                      {activeExecution?.messagePreview ||
                        previewLead.generatedConnectionMessage ||
                        'Default contextual outreach note staged for simulation.'}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-slate-500">No prospect selected.</p>
              )}
            </div>

            {/* Action Logs */}
            <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Terminal className="h-3.5 w-3.5 text-slate-400" />
                  BROWSER WORKER LOGS
                </span>
                {activeExecution && (
                  <span className="font-mono tabular-nums">{activeExecution.durationMs}ms</span>
                )}
              </div>
              {activeExecution && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500 pb-2 border-b border-white/[0.06] tabular-nums">
                  <span>Start: {formatPreciseTimestamp(activeExecution.startedAt)}</span>
                  {activeExecution.completedAt && (
                    <span>End: {formatIsoTimeOnly(activeExecution.completedAt)}</span>
                  )}
                  {activeExecution.jobId && <span>Job: {activeExecution.jobId}</span>}
                </div>
              )}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {activeExecution ? (
                  activeExecution.logs.map((l, i) => (
                    <div key={i} className="text-[11px] leading-relaxed flex items-start gap-2">
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums pt-0.5">
                        {formatIsoTimeOnly(l.timestamp)}
                      </span>
                      <div className="min-w-0">
                        <span
                          className={`font-mono mr-2 ${
                            l.status === 'error'
                              ? 'text-rose-400'
                              : l.status === 'warn'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          [{l.step}]
                        </span>
                        <span className="text-slate-300">{l.detail}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">Run a simulation to view Playwright-style logs.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Execution History Table */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.07]">
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            Execution History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-400">
                <th className="py-3 px-6 font-medium">Execution ID</th>
                <th className="py-3 px-4 font-medium">Prospect</th>
                <th className="py-3 px-4 font-medium">Action Type</th>
                <th className="py-3 px-4 font-medium">Session / Worker</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Duration</th>
                <th className="py-3 px-4 font-medium text-right">Execution Timestamp</th>
                <th className="py-3 px-6 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {executions.map((ex) => (
                <tr
                  key={ex.id}
                  onClick={() => setActiveExecId(ex.id)}
                  className={`cursor-pointer transition-colors ${
                    activeExecution?.id === ex.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <td className="py-3 px-6 font-mono text-slate-300">{ex.id}</td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-100">{ex.leadName}</span>
                    <span className="text-slate-500 ml-1.5">· {ex.leadCompany}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{ex.actionType}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {ex.sessionId} · {ex.workerId}
                  </td>
                  <td className="py-3 px-4">
                    <StatusText status={ex.status} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {ex.durationMs}ms
                  </td>
                  <td
                    className="py-3 px-4 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap"
                    title={ex.startedAt}
                  >
                    {formatPreciseTimestamp(ex.startedAt)} ·{' '}
                    <span className="text-slate-500">{formatRelativeTime(ex.startedAt)}</span>
                  </td>
                  <td
                    className="py-3 px-6 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ex.status === 'Failed' ? (
                      <button
                        type="button"
                        disabled={retryingId === ex.id}
                        onClick={() => handleRetryExecution(ex)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-500/10 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className="h-3 w-3" />
                        Retry
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">Verified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
