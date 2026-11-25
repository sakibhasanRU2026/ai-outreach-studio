import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  StatusText,
  formatIsoTimeOnly,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AIProviderPreference,
  AutomationRunRecord,
  Lead,
  ModuleTestResult,
  NavSection,
  SystemHealthSnapshot,
} from '../types/outreach';

interface SystemHealthViewProps {
  systemHealth: SystemHealthSnapshot;
  automationRuns: AutomationRunRecord[];
  leads: Lead[];
  onRefresh: () => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const MODULE_TEST_SUITES = [
  { id: 'ai-provider', label: 'Test AI Provider' },
  { id: 'lead-management', label: 'Test Lead Management' },
  { id: 'campaign-builder', label: 'Test Campaign Builder' },
  { id: 'job-queue', label: 'Test Queue' },
  { id: 'browser-worker', label: 'Test Browser Worker' },
  { id: 'session-management', label: 'Test Session Management' },
  { id: 'analytics', label: 'Test Analytics' },
  { id: 'activity-logs', label: 'Test Activity Logs' },
];

export function SystemHealthView({
  systemHealth,
  automationRuns,
  leads,
  onRefresh,
  onNavigate,
}: SystemHealthViewProps) {
  const { pushToast } = useToast();
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [probing, setProbing] = useState(false);
  const [runningE2E, setRunningE2E] = useState(false);
  const [runningModuleId, setRunningModuleId] = useState<string | null>(null);
  const [moduleResults, setModuleResults] = useState<ModuleTestResult[]>([]);
  const [savingRetry, setSavingRetry] = useState(false);

  const { aiTelemetry, workerSummary, services } = systemHealth;
  const [maxRetriesInput, setMaxRetriesInput] = useState<number>(aiTelemetry.maxRetries ?? 3);
  const [retryDelayInput, setRetryDelayInput] = useState<number>(
    aiTelemetry.baseRetryDelayMs ?? 450
  );

  const [selectedTestLeadId, setSelectedTestLeadId] = useState<string>(
    leads.find((l) => l.status === 'New')?.id || leads[0]?.id || ''
  );
  const [probeFeedback, setProbeFeedback] = useState<{
    ok: boolean;
    message: string;
    latencyMs: number;
    checkedAt: string;
  } | null>(null);
  const [latestE2ERun, setLatestE2ERun] = useState<AutomationRunRecord | null>(
    automationRuns.find((r) => r.triggerType === 'Automated E2E Test') || automationRuns[0] || null
  );

  const handleSwitchProvider = async (provider: AIProviderPreference) => {
    if (provider === aiTelemetry.providerPreference || switchingProvider) return;
    setSwitchingProvider(true);
    try {
      await api.setAiProvider(provider);
      await onRefresh();
      pushToast(
        'AI provider updated',
        provider === 'mock'
          ? 'Switched to deterministic Mock AI Engine.'
          : 'Switched to Google Gemini API (with automatic retry & Mock fallback).',
        'success'
      );
    } catch (err) {
      pushToast(
        'Failed to switch AI provider',
        err instanceof Error ? err.message : 'Error',
        'error'
      );
    } finally {
      setSwitchingProvider(false);
    }
  };

  const handleSaveRetryConfig = async () => {
    setSavingRetry(true);
    try {
      await api.updateAiRetryConfig(maxRetriesInput, retryDelayInput);
      await onRefresh();
      pushToast(
        'Retry policy updated',
        `Saved ${maxRetriesInput} max retries with ${retryDelayInput}ms backoff.`,
        'success'
      );
    } catch (err) {
      pushToast('Update failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSavingRetry(false);
    }
  };

  const handleProbe = async () => {
    setProbing(true);
    try {
      const res = await api.probeSystemHealth();
      setProbeFeedback({
        ok: res.probe.ok,
        message: res.probe.message,
        latencyMs: res.probe.latencyMs,
        checkedAt: res.probe.checkedAt,
      });
      await onRefresh();
      pushToast(
        res.probe.ok ? 'Health probe completed' : 'Gemini degraded — fallback ready',
        res.probe.message,
        res.probe.ok ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast('Probe failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setProbing(false);
    }
  };

  const handleRunModuleTests = async (moduleId: string) => {
    setRunningModuleId(moduleId);
    try {
      const res = await api.runModuleTests(moduleId);
      setModuleResults((prev) => {
        if (moduleId === 'all') return res.results;
        const nextMap = new Map(prev.map((item) => [item.id, item]));
        res.results.forEach((item) => nextMap.set(item.id, item));
        return Array.from(nextMap.values());
      });
      await onRefresh();
      pushToast(
        res.failedCount === 0
          ? `Module verification passed (${res.passedCount}/${res.results.length})`
          : `Module verification detected ${res.failedCount} failure`,
        res.results[0]?.detail || 'Module assertions completed.',
        res.failedCount === 0 ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast('Test run failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRunningModuleId(null);
    }
  };

  const handleRunE2ETest = async () => {
    setRunningE2E(true);
    try {
      const res = await api.runAutomatedE2ETest(selectedTestLeadId || undefined);
      setLatestE2ERun(res.run);
      await onRefresh();
      pushToast(
        res.run.status === 'Passed'
          ? '11-step E2E verification passed'
          : 'E2E test completed with warnings',
        `Run ${res.run.id} completed in ${res.run.durationMs}ms (${res.run.aiProviderUsed === 'gemini' ? 'Gemini' : 'Mock AI'}).`,
        res.run.status === 'Passed' ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast(
        'E2E verification failed',
        err instanceof Error ? err.message : 'Error',
        'error'
      );
    } finally {
      setRunningE2E(false);
    }
  };

  const geminiConnectionLabel =
    aiTelemetry.providerPreference === 'mock'
      ? 'Mock Mode'
      : !systemHealth.geminiConfigured
      ? 'Disconnected'
      : aiTelemetry.lastStatus === 'Completed'
      ? 'Connected'
      : aiTelemetry.lastStatus === 'Retrying'
      ? 'Retrying'
      : 'Mock Mode';

  const rpmPct = Math.min(
    100,
    Math.round((aiTelemetry.rpmWindowCount / Math.max(1, aiTelemetry.rpmLimit)) * 100)
  );

  const modulePassCount = moduleResults.filter((r) => r.status === 'Passed').length;
  const moduleFailCount = moduleResults.filter((r) => r.status === 'Failed').length;

  return (
    <div className="space-y-6">
      {/* Observability Header Banner */}
      <div className="rounded-xl border border-white/[0.07] bg-[#14171F] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Activity className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-slate-100">
              System Health, Integration Matrix & QA Verification Suite
            </p>
            <p className="text-slate-400">
              Monitor all 8 real & simulated services, tune Gemini retry delays, switch AI providers, and run live QA assertions across every platform module.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="font-mono text-amber-300">DEMO MODE ACTIVE</span>
          <span className="text-slate-600">·</span>
          <button
            type="button"
            onClick={handleProbe}
            disabled={probing}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            {probing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Probe AI Health
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border border-white/[0.07] rounded-xl bg-[#111318] divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] overflow-hidden">
        <div className="p-5 space-y-2">
          <p className="text-xs text-slate-400">Gemini API Connection</p>
          <div className="pt-0.5">
            <StatusText status={geminiConnectionLabel} />
          </div>
          <p className="text-[11px] font-mono text-slate-500 tabular-nums">
            {aiTelemetry.geminiSuccessCount}/{aiTelemetry.totalRequests} live calls ·{' '}
            {systemHealth.geminiConfigured ? 'Server key present' : 'No server key'}
          </p>
        </div>

        <div className="p-5 space-y-2">
          <p className="text-xs text-slate-400">Rate Limit Window (60s RPM)</p>
          <p className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {aiTelemetry.rpmWindowCount} / {aiTelemetry.rpmLimit}
          </p>
          <div className="h-1.5 w-full rounded-sm bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full transition-all ${
                rpmPct >= 80 ? 'bg-amber-400' : 'bg-blue-500'
              }`}
              style={{ width: `${rpmPct}%` }}
            />
          </div>
        </div>

        <div className="p-5 space-y-2">
          <p className="text-xs text-slate-400">Retry & Provider Errors</p>
          <p className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {aiTelemetry.retryCountTotal} retries
          </p>
          <p className="text-[11px] font-mono text-slate-500 tabular-nums">
            {aiTelemetry.overloadHits}x 503 overload · {aiTelemetry.rateLimitHits}x 429 limit
          </p>
        </div>

        <div className="p-5 space-y-2">
          <p className="text-xs text-slate-400">Fallback & Recovery Status</p>
          <p className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
            {aiTelemetry.fallbackCount} fallbacks
          </p>
          <p className="text-[11px] text-slate-500 truncate" title={aiTelemetry.lastError || 'Healthy'}>
            Last check {formatRelativeTime(aiTelemetry.lastCheckedAt)}
          </p>
        </div>
      </div>

      {/* AI Provider Switcher & Retry Config + 11-Step E2E Test Runner */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 font-display flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400" />
                AI Provider Routing & Retry Policy
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Switch between live Google Gemini and Mock AI, and tune retry delays.
              </p>
            </div>
            <StatusText status={aiTelemetry.lastStatus} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={switchingProvider}
              onClick={() => handleSwitchProvider('gemini')}
              className={`text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                aiTelemetry.providerPreference === 'gemini'
                  ? 'border-blue-500/60 bg-blue-500/10'
                  : 'border-white/[0.07] bg-[#0D0F14] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                <span>Google Gemini</span>
                {aiTelemetry.providerPreference === 'gemini' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Live Gemini API with exponential backoff & automatic Mock AI fallback.
              </p>
            </button>

            <button
              type="button"
              disabled={switchingProvider}
              onClick={() => handleSwitchProvider('mock')}
              className={`text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                aiTelemetry.providerPreference === 'mock'
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-white/[0.07] bg-[#0D0F14] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                <span>Mock AI Engine</span>
                {aiTelemetry.providerPreference === 'mock' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Instant deterministic research & copy for offline demonstrations.
              </p>
            </button>
          </div>

          {/* Configurable Retry Delays */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Max Retries</label>
              <input
                type="number"
                min={0}
                max={5}
                value={maxRetriesInput}
                onChange={(e) => setMaxRetriesInput(Number(e.target.value))}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Base Backoff (ms)</label>
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={retryDelayInput}
                onChange={(e) => setRetryDelayInput(Number(e.target.value))}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <button
              type="button"
              disabled={savingRetry}
              onClick={handleSaveRetryConfig}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              Save Policy
            </button>
          </div>

          {aiTelemetry.lastError && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs space-y-1">
              <p className="font-medium text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                Latest Provider Fallback Event
              </p>
              <p className="text-[11px] text-amber-200/80 font-mono">{aiTelemetry.lastError}</p>
            </div>
          )}

          {probeFeedback && (
            <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-3 text-xs space-y-1">
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span>Latest Probe ({probeFeedback.latencyMs}ms)</span>
                <span>{formatIsoTimeOnly(probeFeedback.checkedAt)}</span>
              </div>
              <p className="text-slate-200">{probeFeedback.message}</p>
            </div>
          )}

          <div className="pt-3 border-t border-white/[0.07] grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Worker Pool</span>
              <span className="font-mono tabular-nums text-slate-200">
                {workerSummary.workersReady} workers ready
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Queue / Executions</span>
              <span className="font-mono tabular-nums text-slate-200">
                {workerSummary.completedJobs} jobs · {workerSummary.totalBrowserExecutions} runs
              </span>
            </div>
          </div>
        </div>

        {/* One-Click Automated 11-Step E2E Test Suite */}
        <div className="xl:col-span-7 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 font-display flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                One-Click 11-Step End-to-End Automated Test
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Validates lead ingestion, AI research, personalization, Redis queue, sandbox browser, follow-ups, analytics, and audit logging.
              </p>
            </div>
            <button
              type="button"
              disabled={runningE2E}
              onClick={handleRunE2ETest}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              {runningE2E ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running 11 Assertions...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run Full 11-Step E2E Test
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-slate-400 shrink-0">Test Prospect:</span>
              <select
                value={selectedTestLeadId}
                disabled={runningE2E}
                onChange={(e) => setSelectedTestLeadId(e.target.value)}
                className="rounded-md border border-white/10 bg-[#181B22] px-2.5 py-1.5 text-slate-100 max-w-xs truncate"
              >
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {l.company}
                  </option>
                ))}
              </select>
            </div>
            {latestE2ERun && (
              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 tabular-nums">
                <span>{latestE2ERun.id}</span>
                <span>·</span>
                <StatusText status={latestE2ERun.status} />
                <span>·</span>
                <span>{latestE2ERun.durationMs}ms</span>
              </div>
            )}
          </div>

          {latestE2ERun ? (
            <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] divide-y divide-white/[0.06] max-h-72 overflow-y-auto">
              {latestE2ERun.steps.map((s) => (
                <div
                  key={s.stepNumber}
                  className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {s.assertionPassed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-slate-200 font-medium truncate">
                        {String(s.stepNumber).padStart(2, '0')}. {s.title}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{s.summary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] tabular-nums">
                    <StatusText status={s.status} showIcon={false} />
                    <span className="text-slate-500 w-14 text-right">{s.durationMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-8 text-center">
              Click Run Full 11-Step E2E Test to execute end-to-end assertions across all workspace services.
            </p>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500">
              {latestE2ERun
                ? `Completed ${formatPreciseTimestamp(latestE2ERun.completedAt)} · Provider: ${latestE2ERun.aiProviderUsed === 'gemini' ? 'Gemini AI' : 'Mock AI'}${latestE2ERun.fallbackActivated ? ' (fallback verified)' : ''}`
                : 'No E2E runs recorded yet.'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('execution-history')}
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              View Full History <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Automated QA Verification Matrix (Per-Module + Run Full System Test) */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.07]">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 font-display flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-blue-400" />
              QA & Automated Module Verification Suite
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute real server-side assertions across individual platform subsystems or trigger the complete 8-module system audit.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {moduleResults.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-slate-300">
                <span className="text-emerald-400">{modulePassCount} Passed</span> ·{' '}
                <span className={moduleFailCount > 0 ? 'text-rose-400' : 'text-slate-500'}>
                  {moduleFailCount} Failed
                </span>
              </span>
            )}
            <button
              type="button"
              disabled={runningModuleId !== null}
              onClick={() => handleRunModuleTests('all')}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2 text-xs font-medium text-white cursor-pointer whitespace-nowrap"
            >
              {runningModuleId === 'all' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              <span>Run Full System Test</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {MODULE_TEST_SUITES.map((suite) => (
            <button
              key={suite.id}
              type="button"
              disabled={runningModuleId !== null}
              onClick={() => handleRunModuleTests(suite.id)}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0D0F14] hover:border-blue-500/40 hover:bg-white/[0.04] px-3 py-2 text-xs text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="truncate">{suite.label}</span>
              {runningModuleId === suite.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />
              ) : (
                <Play className="h-3 w-3 text-slate-500 shrink-0" />
              )}
            </button>
          ))}
        </div>

        {moduleResults.length > 0 && (
          <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-lg bg-[#0D0F14]">
            {moduleResults.map((res) => (
              <div
                key={res.id}
                className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusText status={res.status} />
                    <span className="font-medium text-slate-100">{res.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {res.error ? `Error: ${res.error}` : res.detail}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                  {res.durationMs}ms · {formatIsoTimeOnly(res.checkedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete 8-Service Integration Boundary Matrix */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100 font-display">
              Service Health & Integration Boundary Matrix ({services.length} Services)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            REAL · SIMULATED · NOT CONFIGURED
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-400">
                <th className="py-3 px-6 font-medium">Service</th>
                <th className="py-3 px-4 font-medium">Boundary Mode</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Endpoint / Target</th>
                <th className="py-3 px-4 font-medium">Last Error / Note</th>
                <th className="py-3 px-6 font-medium text-right">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {services.map((svc) => (
                <tr key={svc.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-6">
                    <p className="font-medium text-slate-100">{svc.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{svc.detail}</p>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] whitespace-nowrap">
                    <span
                      className={
                        svc.classification === 'REAL INTEGRATION'
                          ? 'text-emerald-400'
                          : svc.classification === 'SIMULATED SERVICE'
                          ? 'text-amber-300'
                          : 'text-slate-400'
                      }
                    >
                      {svc.classification}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusText status={svc.status} />
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                    {svc.endpoint}
                    <span className="block text-slate-500">{svc.latencyLabel}</span>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] text-slate-400 max-w-xs truncate">
                    {svc.lastError || 'Healthy'}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap tabular-nums">
                    {svc.lastChecked ? formatIsoTimeOnly(svc.lastChecked) : '—'}
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
