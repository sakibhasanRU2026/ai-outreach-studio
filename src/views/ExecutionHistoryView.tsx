import { useMemo, useState } from 'react';
import { CheckCircle2, Globe, Layers, Play, Terminal, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import {
  StatusText,
  formatIsoTimeOnly,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AutomationRunRecord,
  BackgroundJob,
  BrowserExecution,
} from '../types/outreach';

interface ExecutionHistoryViewProps {
  automationRuns: AutomationRunRecord[];
  jobs: BackgroundJob[];
  executions: BrowserExecution[];
  onRefresh: () => Promise<void>;
  onOpenManualDemo: () => void;
}

export function ExecutionHistoryView({
  automationRuns,
  jobs,
  executions,
  onRefresh,
  onOpenManualDemo,
}: ExecutionHistoryViewProps) {
  const { pushToast } = useToast();
  const [filterType, setFilterType] = useState<'All' | 'Manual Demo' | 'Automated E2E Test'>('All');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(automationRuns[0]?.id || null);
  const [runningE2E, setRunningE2E] = useState(false);

  const filteredRuns = useMemo(
    () =>
      automationRuns.filter((r) => filterType === 'All' || r.triggerType === filterType),
    [automationRuns, filterType]
  );

  const selectedRun =
    filteredRuns.find((r) => r.id === selectedRunId) || filteredRuns[0] || null;

  const linkedJobs = useMemo(
    () => (selectedRun ? jobs.filter((j) => selectedRun.jobIds.includes(j.id)) : []),
    [selectedRun, jobs]
  );

  const linkedExecution = useMemo(
    () =>
      selectedRun?.executionId
        ? executions.find((ex) => ex.id === selectedRun.executionId) || null
        : null,
    [selectedRun, executions]
  );

  const totalRuns = automationRuns.length;
  const passedRuns = automationRuns.filter((r) => r.status !== 'Failed').length;
  const totalRetries = automationRuns.reduce((sum, r) => sum + r.retryCount, 0);
  const fallbackRecoveries = automationRuns.filter((r) => r.fallbackActivated).length;

  const handleQuickE2E = async () => {
    setRunningE2E(true);
    try {
      const res = await api.runAutomatedE2ETest();
      setSelectedRunId(res.run.id);
      await onRefresh();
      pushToast(
        'E2E automation run recorded',
        `${res.run.id} passed all 11 workflow steps in ${res.run.durationMs}ms.`,
        'success'
      );
    } catch (err) {
      pushToast('E2E run failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRunningE2E(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-white/[0.07] rounded-xl bg-[#111318] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        <div className="p-5">
          <p className="text-xs text-slate-400">Recorded Automation Runs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {totalRuns}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400">Workflow Pass Rate</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
            {totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 100}%
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400">AI Retries Handled</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {totalRetries}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400">Fallback Recoveries</p>
          <p className="mt-2 text-2xl font-semibold text-amber-300 font-mono tabular-nums">
            {fallbackRecoveries}
          </p>
        </div>
      </div>

      {/* Filter & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', 'Automated E2E Test', 'Manual Demo'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterType(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filterType === tab
                  ? 'bg-white/[0.1] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenManualDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Interactive Demo Runner
          </button>
          <button
            type="button"
            disabled={runningE2E}
            onClick={handleQuickE2E}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-3.5 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {runningE2E ? 'Running E2E Test...' : 'Run 11-Step E2E Test'}
          </button>
        </div>
      </div>

      {/* Runs Table */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-slate-400">
                <th className="py-3 px-6 font-medium">Run ID</th>
                <th className="py-3 px-4 font-medium">Trigger</th>
                <th className="py-3 px-4 font-medium">Prospect & Campaign</th>
                <th className="py-3 px-4 font-medium">AI Engine</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Retries</th>
                <th className="py-3 px-4 font-medium text-right">Duration</th>
                <th className="py-3 px-6 font-medium text-right">Started At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No automation execution runs recorded for this filter yet.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedRun?.id === run.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-6 font-mono text-slate-200 whitespace-nowrap">
                      {run.id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                      {run.triggerType}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-100">
                        {run.leadName} <span className="text-slate-500 font-normal">· {run.leadCompany}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{run.campaignName}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] whitespace-nowrap">
                      <span className={run.aiProviderUsed === 'gemini' ? 'text-blue-300' : 'text-amber-300'}>
                        {run.aiProviderUsed === 'gemini' ? 'Gemini 4' : 'Mock AI'}
                      </span>
                      {run.fallbackActivated && (
                        <span className="text-slate-500 ml-1.5">· fallback</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={run.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400">
                      {run.retryCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {run.durationMs}ms
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatPreciseTimestamp(run.startedAt)} ·{' '}
                      <span className="text-slate-500">{formatRelativeTime(run.startedAt)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Run Inspector: 11-Step Trace + Linked Browser Worker Logs & Jobs */}
      {selectedRun && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-display">
                  11-Step Execution Trace · {selectedRun.id}
                </h3>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                  {formatPreciseTimestamp(selectedRun.startedAt)} → {formatIsoTimeOnly(selectedRun.completedAt)} ({selectedRun.durationMs}ms)
                </p>
              </div>
              <StatusText status={selectedRun.status} />
            </div>

            <div className="divide-y divide-white/[0.06]">
              {selectedRun.steps.map((step) => (
                <div key={step.stepNumber} className="px-6 py-3 flex items-start justify-between gap-4 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {step.assertionPassed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">
                        {String(step.stepNumber).padStart(2, '0')}. {step.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{step.summary}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-[11px] tabular-nums space-y-0.5">
                    <div>
                      <StatusText status={step.status} showIcon={false} />
                    </div>
                    <p className="text-slate-500">
                      {step.durationMs}ms · {formatIsoTimeOnly(step.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-5 space-y-6">
            {/* Linked Browser Worker Logs */}
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2 font-display">
                  <Globe className="h-3.5 w-3.5 text-blue-400" />
                  Browser Worker Telemetry
                </h4>
                {linkedExecution && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {linkedExecution.id} · {linkedExecution.workerId}
                  </span>
                )}
              </div>

              {linkedExecution ? (
                <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-3.5 space-y-2 max-h-64 overflow-y-auto">
                  {linkedExecution.logs.map((log, idx) => (
                    <div key={idx} className="text-[11px] flex items-start gap-2 leading-relaxed">
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums pt-0.5">
                        {formatIsoTimeOnly(log.timestamp)}
                      </span>
                      <div className="min-w-0">
                        <span className="font-mono text-emerald-400 mr-1.5">[{log.step}]</span>
                        <span className="text-slate-300">{log.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {selectedRun.executionId
                    ? `Execution ${selectedRun.executionId} logs were rotated after workspace reset.`
                    : 'No browser execution ID linked to this run.'}
                </p>
              )}
            </div>

            {/* Linked Background Jobs */}
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2 font-display">
                  <Layers className="h-3.5 w-3.5 text-emerald-400" />
                  Dispatched Background Jobs ({linkedJobs.length})
                </h4>
                <Terminal className="h-3.5 w-3.5 text-slate-500" />
              </div>

              {linkedJobs.length > 0 ? (
                <div className="space-y-3">
                  {linkedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-3 space-y-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-slate-200">
                          {job.id} · {job.type}
                        </span>
                        <StatusText status={job.status} />
                      </div>
                      <p className="font-mono text-[10px] text-slate-500 tabular-nums">
                        Worker: {job.assignedWorker} · Created {formatIsoTimeOnly(job.createdAt)} · Updated{' '}
                        {formatIsoTimeOnly(job.updatedAt)}
                      </p>
                      <div className="pt-1 space-y-1 text-slate-400 font-mono text-[10px]">
                        {job.logs.slice(-2).map((line, i) => (
                          <p key={i} className="truncate">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {selectedRun.jobIds.length > 0
                    ? `Referenced jobs (${selectedRun.jobIds.join(', ')}) are no longer in active queue.`
                    : 'No background job IDs attached.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
