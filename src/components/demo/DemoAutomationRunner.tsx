import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Globe,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  XCircle,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { StatusText, formatPreciseTimestamp } from '../ui/StatusIndicator';
import { api } from '../../lib/api';
import type {
  AIExecutionStatus,
  AutomationRunStepTrace,
  Lead,
  LiveAiStatus,
} from '../../types/outreach';
import { useToast } from '../ui/ToastProvider';

type StepStatus = 'Pending' | 'Running' | 'Retrying' | 'Paused' | 'Completed' | 'Mock Mode' | 'Failed';

interface DemoStepItem {
  number: number;
  title: string;
  subtitle: string;
  status: StepStatus;
  detail?: string;
  durationMs?: number;
  timestamp?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

interface RunSummaryMeta {
  executionRunId: string;
  durationMs: number;
  successfulSteps: number;
  mockModeSteps: number;
  failedSteps: number;
  totalSteps: number;
  verified: boolean;
  verificationNote: string;
  primaryJobId?: string;
  followUpJobId?: string;
  jobIds: string[];
  executionId?: string;
  workerId?: string;
  sessionId?: string;
  campaignId?: string;
  campaignName?: string;
  leadName: string;
  leadCompany: string;
  aiProviderUsed: 'gemini' | 'mock';
  fallbackActivated: boolean;
  retryCount: number;
  startedAt: string;
  completedAt: string;
}

const INITIAL_STEPS: DemoStepItem[] = [
  { number: 1, title: 'Select sample lead', subtitle: 'Pick qualified prospect from pipeline', status: 'Pending' },
  { number: 2, title: 'Research lead with AI', subtitle: 'Extract company overview & challenges', status: 'Pending' },
  { number: 3, title: 'Generate personalized message', subtitle: 'Craft connection & follow-up copy', status: 'Pending' },
  { number: 4, title: 'Enqueue background job', subtitle: 'Dispatch task to Redis job queue', status: 'Pending' },
  { number: 5, title: 'Assign browser worker', subtitle: 'Bind pw-worker-01 to healthy session', status: 'Pending' },
  { number: 6, title: 'Open mock browser environment', subtitle: 'Launch sandboxed prospect viewer', status: 'Pending' },
  { number: 7, title: 'Execute profile inspection & outreach', subtitle: 'Simulate connection request action', status: 'Pending' },
  { number: 8, title: 'Record execution result', subtitle: 'Persist telemetry & execution logs', status: 'Pending' },
  { number: 9, title: 'Schedule follow-up', subtitle: 'Queue 48h cooldown follow-up task', status: 'Pending' },
  { number: 10, title: 'Update campaign analytics', subtitle: 'Increment funnel & acceptance metrics', status: 'Pending' },
  { number: 11, title: 'Record actions in activity logs', subtitle: 'Finalize audit trail across workspace', status: 'Pending' },
];

function createUniqueExecutionId(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.floor(100 + Math.random() * 899);
  return `RUN-${ts}${rand}`;
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

interface DemoAutomationRunnerProps {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  onRefreshWorkspace: () => Promise<void>;
}

export function DemoAutomationRunner({
  open,
  onClose,
  leads,
  onRefreshWorkspace,
}: DemoAutomationRunnerProps) {
  const { pushToast } = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [steps, setSteps] = useState<DemoStepItem[]>(INITIAL_STEPS);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failedStepNumber, setFailedStepNumber] = useState<number | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIExecutionStatus | 'Pending'>('Pending');
  const [aiMonitor, setAiMonitor] = useState<LiveAiStatus | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [copiedReport, setCopiedReport] = useState(false);
  const [runSummaryMeta, setRunSummaryMeta] = useState<RunSummaryMeta | null>(null);

  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const runtimeRef = useRef<{
    executionRunId: string;
    currentLeadId: string | undefined;
    resolvedLeadName: string;
    resolvedLeadCompany: string;
    campaignId?: string;
    campaignName?: string;
    currentJobId?: string;
    followUpJobId?: string;
    currentSessionId?: string;
    workerId: string;
    executionId?: string;
    jobIds: string[];
    traceSteps: AutomationRunStepTrace[];
    totalRetryCount: number;
    anyFallbackActivated: boolean;
    aiProviderUsed: 'gemini' | 'mock';
    fallbackToastShown: boolean;
    runStartedMs: number;
    runStartedAt: string;
  } | null>(null);

  const refreshAiMonitor = useCallback(async () => {
    try {
      const live = await api.getAiStatus();
      setAiMonitor(live);
      return live;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (open && !selectedLeadId && leads.length > 0) {
      const preferred = leads.find((l) => l.status === 'New') || leads[0];
      setSelectedLeadId(preferred.id);
    }
    if (open) {
      void refreshAiMonitor();
    }
  }, [open, leads, selectedLeadId, refreshAiMonitor]);

  const clearRunnerState = (notifyPreserveHistory = false) => {
    pausedRef.current = false;
    cancelledRef.current = false;
    runtimeRef.current = null;
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'Pending' })));
    setExpandedSteps({});
    setRunning(false);
    setPaused(false);
    setFinished(false);
    setFailedStepNumber(null);
    setActiveLead(null);
    setPreviewUrl(null);
    setErrorMsg(null);
    setAiStatus('Pending');
    setRetryNote(null);
    setFallbackNotice(null);
    setRunSummaryMeta(null);
    setCopiedReport(false);
    setShowDetails(true);
    if (notifyPreserveHistory) {
      pushToast(
        'Runner state reset',
        'Previous execution state cleared; historical execution records remain preserved.',
        'info'
      );
    }
  };

  const toggleStepExpanded = (stepNumber: number) => {
    setExpandedSteps((prev) => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
  };

  const allExpanded = steps.every((s) => Boolean(expandedSteps[s.number]));
  const handleToggleExpandAll = () => {
    const nextVal = !allExpanded;
    const nextMap: Record<number, boolean> = {};
    for (const s of steps) nextMap[s.number] = nextVal;
    setExpandedSteps(nextMap);
  };

  const buildPartialOrFinalSummary = (
    ctx: NonNullable<typeof runtimeRef.current>,
    currentSteps: DemoStepItem[],
    completedAt: string
  ): RunSummaryMeta => {
    const successfulSteps = currentSteps.filter((s) => s.status === 'Completed').length;
    const mockModeSteps = currentSteps.filter((s) => s.status === 'Mock Mode').length;
    const failedSteps = currentSteps.filter((s) => s.status === 'Failed').length;

    const allElevenPresent =
      currentSteps.length === 11 &&
      ctx.traceSteps.length === 11 &&
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every((num) =>
        ctx.traceSteps.some(
          (t) =>
            t.stepNumber === num &&
            t.assertionPassed &&
            (t.status === 'Completed' || t.status === 'Mock Mode')
        )
      );

    const hasCorrelatedIds = Boolean(
      ctx.currentLeadId && ctx.currentJobId && ctx.followUpJobId && ctx.executionId && ctx.workerId
    );

    const verified =
      allElevenPresent && failedSteps === 0 && hasCorrelatedIds;

    const verificationNote = verified
      ? `All 11 steps verified with correlated IDs (${ctx.executionRunId}).`
      : failedSteps > 0
      ? `Verification failed: ${failedSteps} step(s) reported errors.`
      : !allElevenPresent
      ? `Incomplete execution: ${successfulSteps + mockModeSteps}/11 steps completed.`
      : 'Missing correlated execution artifact IDs.';

    return {
      executionRunId: ctx.executionRunId,
      durationMs: Math.max(50, Date.now() - ctx.runStartedMs),
      successfulSteps,
      mockModeSteps,
      failedSteps,
      totalSteps: 11,
      verified,
      verificationNote,
      primaryJobId: ctx.currentJobId,
      followUpJobId: ctx.followUpJobId,
      jobIds: [...ctx.jobIds],
      executionId: ctx.executionId,
      workerId: ctx.workerId,
      sessionId: ctx.currentSessionId,
      campaignId: ctx.campaignId,
      campaignName: ctx.campaignName,
      leadName: ctx.resolvedLeadName,
      leadCompany: ctx.resolvedLeadCompany,
      aiProviderUsed: ctx.aiProviderUsed,
      fallbackActivated: ctx.anyFallbackActivated,
      retryCount: ctx.totalRetryCount,
      startedAt: ctx.runStartedAt,
      completedAt,
    };
  };

  const runFromStep = async (startStep: number, isFreshStart: boolean) => {
    if (isFreshStart) {
      clearRunnerState(false);
      const leadId = selectedLeadId || leads[0]?.id;
      const target = leads.find((l) => l.id === leadId);
      const ms = Date.now();
      runtimeRef.current = {
        executionRunId: createUniqueExecutionId(),
        currentLeadId: leadId,
        resolvedLeadName: target?.name || 'Prospect',
        resolvedLeadCompany: target?.company || 'Company',
        workerId: 'pw-worker-01',
        jobIds: [],
        traceSteps: [],
        totalRetryCount: 0,
        anyFallbackActivated: false,
        aiProviderUsed: 'mock',
        fallbackToastShown: false,
        runStartedMs: ms,
        runStartedAt: new Date(ms).toISOString(),
      };
    }

    const ctx = runtimeRef.current;
    if (!ctx) return;

    pausedRef.current = false;
    cancelledRef.current = false;
    setPaused(false);
    setRunning(true);
    setFailedStepNumber(null);
    setErrorMsg(null);
    setFinished(false);

    let localStepsSnapshot: DemoStepItem[] = INITIAL_STEPS.map((s) => ({ ...s }));
    setSteps((prev) => {
      localStepsSnapshot = isFreshStart ? INITIAL_STEPS.map((s) => ({ ...s })) : [...prev];
      return localStepsSnapshot;
    });

    for (let stepNum = startStep; stepNum <= 11; stepNum++) {
      if (cancelledRef.current) {
        setRunning(false);
        setRunSummaryMeta(
          buildPartialOrFinalSummary(ctx, localStepsSnapshot, new Date().toISOString())
        );
        return;
      }

      while (pausedRef.current) {
        if (cancelledRef.current) {
          setRunning(false);
          setRunSummaryMeta(
            buildPartialOrFinalSummary(ctx, localStepsSnapshot, new Date().toISOString())
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      const stepStartMs = Date.now();
      const stepInputPayload = {
        executionRunId: ctx.executionRunId,
        stepNumber: stepNum,
        leadId: ctx.currentLeadId,
        jobId: ctx.currentJobId,
        followUpJobId: ctx.followUpJobId,
        sessionId: ctx.currentSessionId,
        executionId: ctx.executionId,
        workerId: ctx.workerId,
      };

      localStepsSnapshot = localStepsSnapshot.map((s) =>
        s.number === stepNum ? { ...s, status: 'Running', input: stepInputPayload } : s
      );
      setSteps(localStepsSnapshot);

      await new Promise((r) => setTimeout(r, 260));

      if (cancelledRef.current) {
        setRunning(false);
        return;
      }

      let pollTimer: number | undefined;
      if (stepNum === 2 || stepNum === 3) {
        pollTimer = window.setInterval(async () => {
          const live = await refreshAiMonitor();
          if (live && live.status === 'Retrying') {
            setAiStatus('Retrying');
            const note = `Retrying Gemini (${live.attempt}/${live.maxRetries})${live.lastError ? ` · ${live.lastError}` : ''}`;
            setRetryNote(note);
            localStepsSnapshot = localStepsSnapshot.map((s) =>
              s.number === stepNum
                ? { ...s, status: 'Retrying', detail: note, error: live.lastError }
                : s
            );
            setSteps(localStepsSnapshot);
          }
        }, 350);
      }

      try {
        const res = await api.runDemoStep(stepInputPayload);

        if (pollTimer !== undefined) window.clearInterval(pollTimer);
        if (stepNum === 2 || stepNum === 3) {
          void refreshAiMonitor();
        }

        if (res.lead && typeof res.lead === 'object') {
          const updatedLead = res.lead as Lead;
          ctx.currentLeadId = updatedLead.id;
          ctx.resolvedLeadName = updatedLead.name;
          ctx.resolvedLeadCompany = updatedLead.company;
          setActiveLead(updatedLead);
        }
        if (res.campaign && typeof res.campaign === 'object') {
          const c = res.campaign as { id?: string; name?: string };
          if (c.id) ctx.campaignId = c.id;
          if (c.name) ctx.campaignName = c.name;
        }
        if (res.job && typeof res.job === 'object') {
          ctx.currentJobId = (res.job as { id: string }).id;
          if (!ctx.jobIds.includes(ctx.currentJobId)) ctx.jobIds.push(ctx.currentJobId);
        }
        if (res.followUpJob && typeof res.followUpJob === 'object') {
          const fId = (res.followUpJob as { id: string }).id;
          ctx.followUpJobId = fId;
          if (!ctx.jobIds.includes(fId)) ctx.jobIds.push(fId);
        }
        if (res.execution && typeof res.execution === 'object') {
          const exec = res.execution as { id: string; workerId?: string };
          ctx.executionId = exec.id;
          if (exec.workerId) ctx.workerId = exec.workerId;
        }
        if (typeof res.workerId === 'string') {
          ctx.workerId = res.workerId;
        }
        if (res.session && typeof res.session === 'object') {
          ctx.currentSessionId = (res.session as { id: string }).id;
        }
        if (typeof res.browserPreviewUrl === 'string') {
          setPreviewUrl(res.browserPreviewUrl);
        }

        const stepAiStatus = res.aiStatus as AIExecutionStatus | undefined;
        const fallbackActivated = Boolean(res.fallbackActivated);
        const stepRetries = Number(res.retryAttempts) || 0;
        const fallbackReason =
          typeof res.fallbackReason === 'string' ? res.fallbackReason : undefined;

        ctx.totalRetryCount += stepRetries;
        if (fallbackActivated) ctx.anyFallbackActivated = true;

        if (stepNum === 2 || stepNum === 3) {
          if (stepAiStatus === 'Mock Mode' || fallbackActivated) {
            ctx.aiProviderUsed = 'mock';
            setAiStatus('Mock Mode');
            setRetryNote(null);
            if (fallbackActivated) {
              const reasonText =
                fallbackReason ||
                'Gemini API temporarily unavailable — automatically switched to local Mock AI.';
              setFallbackNotice(reasonText);
              if (!ctx.fallbackToastShown) {
                ctx.fallbackToastShown = true;
                pushToast('AI Fallback Mode Activated', reasonText, 'warning');
              }
            } else if (!fallbackNotice) {
              setFallbackNotice(
                'Running in local Mock AI mode (clearly labeled simulation; no live Gemini quota consumed).'
              );
            }
          } else if (stepAiStatus === 'Completed') {
            ctx.aiProviderUsed = 'gemini';
            setAiStatus('Completed');
            setRetryNote(null);
          }
        }

        const summary = typeof res.summary === 'string' ? res.summary : 'Completed';
        const finalStepStatus: StepStatus =
          (stepNum === 2 || stepNum === 3) && stepAiStatus === 'Mock Mode'
            ? 'Mock Mode'
            : 'Completed';

        const durationMs = Math.max(10, Date.now() - stepStartMs);
        const timestamp =
          typeof res.executedAt === 'string' ? res.executedAt : new Date().toISOString();
        const actualInput =
          res.stepInput && typeof res.stepInput === 'object'
            ? (res.stepInput as Record<string, unknown>)
            : stepInputPayload;
        const actualOutput =
          res.stepOutput && typeof res.stepOutput === 'object'
            ? (res.stepOutput as Record<string, unknown>)
            : { summary };
        const stepError =
          typeof res.errorInfo === 'string' ? res.errorInfo : undefined;

        const stepMeta = INITIAL_STEPS.find((s) => s.number === stepNum);
        const traceEntry: AutomationRunStepTrace = {
          stepNumber: stepNum,
          title: stepMeta?.title || `Step ${stepNum}`,
          status: finalStepStatus === 'Mock Mode' ? 'Mock Mode' : 'Completed',
          durationMs,
          summary,
          assertionPassed: true,
          timestamp,
          input: actualInput,
          output: actualOutput,
          error: stepError,
        };

        ctx.traceSteps = [
          ...ctx.traceSteps.filter((t) => t.stepNumber !== stepNum),
          traceEntry,
        ].sort((a, b) => a.stepNumber - b.stepNumber);

        localStepsSnapshot = localStepsSnapshot.map((s) =>
          s.number === stepNum
            ? {
                ...s,
                status: finalStepStatus,
                detail: summary,
                durationMs,
                timestamp,
                input: actualInput,
                output: actualOutput,
                error: stepError,
              }
            : s
        );
        setSteps(localStepsSnapshot);
      } catch (err) {
        if (pollTimer !== undefined) window.clearInterval(pollTimer);
        void refreshAiMonitor();
        const msg = err instanceof Error ? err.message : 'Step execution failed';
        const durationMs = Math.max(10, Date.now() - stepStartMs);
        const timestamp = new Date().toISOString();
        if (stepNum === 2 || stepNum === 3) setAiStatus('Failed');

        const stepMeta = INITIAL_STEPS.find((s) => s.number === stepNum);
        const failTrace: AutomationRunStepTrace = {
          stepNumber: stepNum,
          title: stepMeta?.title || `Step ${stepNum}`,
          status: 'Failed',
          durationMs,
          summary: msg,
          assertionPassed: false,
          timestamp,
          input: stepInputPayload,
          output: undefined,
          error: msg,
        };
        ctx.traceSteps = [
          ...ctx.traceSteps.filter((t) => t.stepNumber !== stepNum),
          failTrace,
        ].sort((a, b) => a.stepNumber - b.stepNumber);

        localStepsSnapshot = localStepsSnapshot.map((s) =>
          s.number === stepNum
            ? {
                ...s,
                status: 'Failed',
                detail: msg,
                durationMs,
                timestamp,
                input: stepInputPayload,
                output: undefined,
                error: msg,
              }
            : s
        );
        setSteps(localStepsSnapshot);
        setExpandedSteps((prev) => ({ ...prev, [stepNum]: true }));
        setErrorMsg(msg);
        setFailedStepNumber(stepNum);
        setRunning(false);
        setRunSummaryMeta(buildPartialOrFinalSummary(ctx, localStepsSnapshot, timestamp));
        pushToast('Demo automation paused on error', msg, 'error');
        return;
      }
    }

    const completedAt = new Date().toISOString();
    const summaryMeta = buildPartialOrFinalSummary(ctx, localStepsSnapshot, completedAt);
    setRunSummaryMeta(summaryMeta);

    try {
      const saved = await api.completeDemoRun({
        id: ctx.executionRunId,
        triggerType: 'Manual Demo',
        leadId: ctx.currentLeadId,
        leadName: ctx.resolvedLeadName,
        leadCompany: ctx.resolvedLeadCompany,
        campaignId: ctx.campaignId,
        campaignName: ctx.campaignName,
        aiProviderUsed: ctx.aiProviderUsed,
        fallbackActivated: ctx.anyFallbackActivated,
        retryCount: ctx.totalRetryCount,
        status: summaryMeta.verified ? 'Completed' : 'Failed',
        startedAt: ctx.runStartedAt,
        completedAt,
        durationMs: summaryMeta.durationMs,
        jobIds: ctx.jobIds,
        followUpJobId: ctx.followUpJobId,
        workerId: ctx.workerId,
        sessionId: ctx.currentSessionId,
        executionId: ctx.executionId,
        verifiedAllSteps: summaryMeta.verified,
        steps: ctx.traceSteps,
      });
      if (saved?.run?.id && saved.run.id !== summaryMeta.executionRunId) {
        setRunSummaryMeta((prev) => (prev ? { ...prev, executionRunId: saved.run.id } : prev));
      }
    } catch {
      // Non-fatal if history save fails
    }

    await refreshAiMonitor();
    await onRefreshWorkspace();
    setRunning(false);
    setPaused(false);
    setFinished(true);
    pushToast(
      summaryMeta.verified ? 'Workflow Execution Verified' : 'Workflow finished with warnings',
      summaryMeta.verified
        ? `Execution ${ctx.executionRunId} passed all 11 stages and saved to Execution History.`
        : summaryMeta.verificationNote,
      summaryMeta.verified ? 'success' : 'warning'
    );
  };

  const handleTogglePause = () => {
    if (!running) return;
    const nextPaused = !paused;
    pausedRef.current = nextPaused;
    setPaused(nextPaused);
    pushToast(
      nextPaused ? 'Workflow paused' : 'Workflow resumed',
      nextPaused ? 'Execution paused cleanly between steps.' : 'Continuing remaining steps.',
      'info'
    );
  };

  const handleCancelRun = () => {
    cancelledRef.current = true;
    pausedRef.current = false;
    setRunning(false);
    setPaused(false);
    setErrorMsg('Execution cancelled by operator.');
    if (runtimeRef.current) {
      setRunSummaryMeta(
        buildPartialOrFinalSummary(runtimeRef.current, steps, new Date().toISOString())
      );
    }
    pushToast('Workflow cancelled', 'Demo automation stopped cleanly.', 'warning');
  };

  const handleCopyExecutionReport = async () => {
    const ctx = runtimeRef.current;
    const summary = runSummaryMeta;
    const runId = summary?.executionRunId || ctx?.executionRunId || 'UNASSIGNED';
    const lines: string[] = [
      '=== AI OUTREACH STUDIO — WORKFLOW EXECUTION REPORT ===',
      `Execution ID       : ${runId}`,
      `Verification       : ${summary?.verified ? 'Workflow Execution Verified (11/11)' : summary?.verificationNote || 'Pending / Incomplete'}`,
      `Prospect           : ${summary?.leadName || activeLead?.name || 'N/A'} (${summary?.leadCompany || activeLead?.company || 'N/A'})`,
      `Campaign           : ${summary?.campaignName || 'N/A'} (${summary?.campaignId || 'N/A'})`,
      `Started At         : ${summary?.startedAt || ctx?.runStartedAt || 'N/A'}`,
      `Completed At       : ${summary?.completedAt || new Date().toISOString()}`,
      `Total Duration     : ${summary?.durationMs ?? 0}ms`,
      `Step Counts        : Successful=${summary?.successfulSteps ?? 0} | Mock Mode=${summary?.mockModeSteps ?? 0} | Failed=${summary?.failedSteps ?? 0} / 11`,
      '',
      '--- Correlated Execution Artifacts ---',
      `Primary Job ID     : ${summary?.primaryJobId || ctx?.currentJobId || 'N/A'}`,
      `Follow-up Job ID   : ${summary?.followUpJobId || ctx?.followUpJobId || 'N/A'}`,
      `Browser Exec ID    : ${summary?.executionId || ctx?.executionId || 'N/A'}`,
      `Assigned Worker    : ${summary?.workerId || ctx?.workerId || 'N/A'}`,
      `Browser Session ID : ${summary?.sessionId || ctx?.currentSessionId || 'N/A'}`,
      '',
      '--- Gemini API & AI Monitoring ---',
      `AI Provider Used   : ${summary?.aiProviderUsed === 'gemini' ? 'Google Gemini (Live)' : 'Mock AI (Simulated)'}`,
      `Fallback Activated : ${summary?.fallbackActivated ? 'Yes' : 'No'}`,
      `Availability       : ${aiMonitor?.providerAvailability || 'Unknown'}`,
      `Rate-Limit Status  : ${aiMonitor?.rateLimitStatus || 'Nominal'} (${aiMonitor?.rpmWindowCount ?? 0}/${aiMonitor?.rpmLimit ?? 15} RPM)`,
      `Retry Count (Run)  : ${summary?.retryCount ?? 0} (Cumulative: ${aiMonitor?.retryCountTotal ?? 0})`,
      `Quota/Overload Hits: 429=${aiMonitor?.rateLimitHits ?? 0} | 503=${aiMonitor?.overloadHits ?? 0}`,
      `Last AI Error      : ${aiMonitor?.lastError || 'None'}`,
      '',
      '--- 11-Step Execution Trace ---',
      ...steps.map((s) => {
        const parts = [
          `[${String(s.number).padStart(2, '0')}] ${s.title} :: ${s.status} (${s.durationMs ?? 0}ms @ ${s.timestamp || 'pending'})`,
          `     Summary: ${s.detail || s.subtitle}`,
          `     Input  : ${s.input ? JSON.stringify(s.input) : 'N/A'}`,
          `     Output : ${s.output ? JSON.stringify(s.output) : 'N/A'}`,
          `     Error  : ${s.error || 'None'}`,
        ];
        return parts.join('\n');
      }),
    ];

    const ok = await copyTextSafe(lines.join('\n'));
    if (ok) {
      setCopiedReport(true);
      window.setTimeout(() => setCopiedReport(false), 2400);
      pushToast('Execution report copied', `Copied technical report for ${runId} to clipboard.`, 'success');
    } else {
      pushToast('Clipboard unavailable', 'Unable to copy automatically in this browser context.', 'warning');
    }
  };

  const completedCount = steps.filter(
    (s) => s.status === 'Completed' || s.status === 'Mock Mode'
  ).length;

  const hasExecutionActivity = completedCount > 0 || failedStepNumber !== null || Boolean(errorMsg);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!running) onClose();
      }}
      title="Run Complete Automation"
      subtitle="End-to-end 11-step orchestration across AI Research, Redis Queue, Mock Browser, and Analytics"
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Top Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Target Sample Prospect
            </label>
            <select
              value={selectedLeadId}
              disabled={running}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full sm:max-w-sm rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.jobTitle} at {l.company} ({l.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="text-right hidden sm:block mr-1">
              <span className="text-[11px] text-slate-500 block">AI Research</span>
              <StatusText status={aiStatus} />
            </div>

            {running && (
              <>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  {paused ? (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelRun}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 text-xs font-medium text-rose-300 cursor-pointer whitespace-nowrap"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Cancel
                </button>
              </>
            )}

            {failedStepNumber !== null && !running && (
              <button
                type="button"
                onClick={() => runFromStep(failedStepNumber, false)}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-300 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Step {failedStepNumber}
              </button>
            )}

            {hasExecutionActivity && !running && (
              <button
                type="button"
                onClick={handleCopyExecutionReport}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedReport ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied Report
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Execution Report
                  </>
                )}
              </button>
            )}

            {(finished || errorMsg || hasExecutionActivity) && !running && (
              <button
                type="button"
                onClick={() => clearRunnerState(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}

            <button
              type="button"
              disabled={running || leads.length === 0}
              onClick={() => runFromStep(1, true)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {paused ? `Paused (${completedCount}/11)` : `Executing (${completedCount}/11)`}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {finished ? 'Run Again' : 'Start 11-Step Workflow'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Gemini API Monitoring Strip */}
        <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Activity className="h-3.5 w-3.5 text-blue-400" />
              <span>Gemini API Monitoring</span>
              {aiMonitor?.providerPreference === 'mock' && (
                <span className="font-mono text-amber-300">· Mock AI Selected</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1 font-mono tabular-nums">
              <div>
                <span className="text-slate-500 mr-1.5">Provider:</span>
                <span
                  className={
                    aiMonitor?.providerAvailability === 'Available'
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }
                >
                  {aiMonitor?.providerAvailability || 'Checking'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1.5">Rate Limit:</span>
                <span
                  className={
                    aiMonitor?.rateLimitStatus === 'Rate Limited'
                      ? 'text-rose-400'
                      : aiMonitor?.rateLimitStatus === 'Approaching Limit'
                      ? 'text-amber-300'
                      : 'text-slate-200'
                  }
                >
                  {aiMonitor?.rateLimitStatus || 'Nominal'} ({aiMonitor?.rpmWindowCount ?? 0}/
                  {aiMonitor?.rpmLimit ?? 15} RPM)
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1.5">Retries:</span>
                <span className="text-slate-200">
                  {runSummaryMeta?.retryCount ?? runtimeRef.current?.totalRetryCount ?? 0} run ·{' '}
                  {aiMonitor?.retryCountTotal ?? 0} total
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1.5">Quota/503:</span>
                <span
                  className={
                    (aiMonitor?.rateLimitHits ?? 0) + (aiMonitor?.overloadHits ?? 0) > 0
                      ? 'text-amber-300'
                      : 'text-slate-200'
                  }
                >
                  429:{aiMonitor?.rateLimitHits ?? 0} · 503:{aiMonitor?.overloadHits ?? 0}
                </span>
              </div>
            </div>
          </div>
          {aiMonitor?.lastError && (
            <p className="mt-1.5 pt-1.5 border-t border-white/[0.06] font-mono text-[10px] text-amber-200/80 truncate">
              Last provider notice: {aiMonitor.lastError}
            </p>
          )}
        </div>

        {(retryNote || fallbackNotice) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-start gap-2.5 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium text-amber-200">
                {retryNote ? 'AI Research: Retrying Gemini API' : 'AI Research: Mock Mode Active'}
              </p>
              <p className="text-amber-200/80 text-[11px] leading-relaxed">
                {retryNote || fallbackNotice}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Expandable 11-Step Workflow List */}
          <div className="lg:col-span-7 border border-white/[0.07] rounded-lg bg-[#0D0F14] overflow-hidden">
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-400">
                11-Step Workflow Trace ({completedCount}/11)
              </span>
              <button
                type="button"
                onClick={handleToggleExpandAll}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {steps.map((step) => {
                const isExpanded = Boolean(expandedSteps[step.number]);
                return (
                  <div key={step.number} className="text-sm">
                    <button
                      type="button"
                      onClick={() => toggleStepExpanded(step.number)}
                      className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <div className="mt-0.5 shrink-0">
                        {step.status === 'Pending' && <Circle className="h-4 w-4 text-slate-600" />}
                        {step.status === 'Running' && (
                          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                        )}
                        {step.status === 'Retrying' && (
                          <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />
                        )}
                        {step.status === 'Completed' && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        )}
                        {step.status === 'Mock Mode' && (
                          <CheckCircle2 className="h-4 w-4 text-amber-400" />
                        )}
                        {step.status === 'Failed' && <XCircle className="h-4 w-4 text-rose-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-medium ${
                              step.status === 'Pending' ? 'text-slate-400' : 'text-slate-100'
                            }`}
                          >
                            {String(step.number).padStart(2, '0')}. {step.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {typeof step.durationMs === 'number' && (
                              <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                                {step.durationMs}ms
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-mono ${
                                step.status === 'Completed'
                                  ? 'text-emerald-400'
                                  : step.status === 'Mock Mode' || step.status === 'Retrying'
                                  ? 'text-amber-400'
                                  : step.status === 'Running'
                                  ? 'text-blue-400'
                                  : step.status === 'Failed'
                                  ? 'text-rose-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {step.status}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {step.detail || step.subtitle}
                        </p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 pl-11 bg-[#090A0D] border-t border-white/[0.04] space-y-2 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-slate-400 tabular-nums">
                          <span>
                            Duration:{' '}
                            <strong className="text-slate-200 font-normal">
                              {typeof step.durationMs === 'number' ? `${step.durationMs}ms` : 'Not executed yet'}
                            </strong>
                          </span>
                          <span>
                            Timestamp:{' '}
                            <strong className="text-slate-200 font-normal">
                              {step.timestamp ? formatPreciseTimestamp(step.timestamp) : 'Pending'}
                            </strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="rounded border border-white/[0.06] bg-[#111318] p-2">
                            <p className="text-[10px] font-medium text-slate-500 mb-1">Input</p>
                            <pre className="font-mono text-[10px] text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                              {step.input
                                ? JSON.stringify(step.input, null, 2)
                                : `Awaiting execution of step ${step.number}`}
                            </pre>
                          </div>
                          <div className="rounded border border-white/[0.06] bg-[#111318] p-2">
                            <p className="text-[10px] font-medium text-slate-500 mb-1">Output</p>
                            <pre className="font-mono text-[10px] text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                              {step.output
                                ? JSON.stringify(step.output, null, 2)
                                : step.status === 'Pending'
                                ? 'No output yet'
                                : 'No output recorded'}
                            </pre>
                          </div>
                        </div>

                        <div
                          className={`rounded border px-2.5 py-1.5 font-mono text-[10px] ${
                            step.error
                              ? step.status === 'Failed'
                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-white/[0.06] bg-[#111318] text-slate-500'
                          }`}
                        >
                          Error Info: {step.error || 'None'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Sandbox Viewport & Verified Execution Summary */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-blue-400" />
                  Sandbox Browser Viewport
                </span>
                <span className="font-mono text-[11px] text-slate-500">1280x800</span>
              </div>

              <div className="rounded border border-white/[0.07] bg-[#14171F] px-2.5 py-1.5 font-mono text-[11px] text-slate-400 truncate">
                {previewUrl || 'sandbox://idle — awaiting Step 6'}
              </div>

              {activeLead ? (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{activeLead.name}</p>
                    <p className="text-xs text-slate-400">
                      {activeLead.jobTitle} · {activeLead.company}
                    </p>
                  </div>
                  {activeLead.painPoints && activeLead.painPoints.length > 0 && (
                    <div className="rounded-md border border-white/[0.06] bg-[#111318] p-3 space-y-1">
                      <p className="text-[11px] font-medium text-slate-400">
                        Research Pain Points ({activeLead.painPoints.length})
                      </p>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {activeLead.painPoints[0]}
                      </p>
                    </div>
                  )}
                  {activeLead.generatedConnectionMessage && (
                    <div className="rounded-md border border-white/[0.06] bg-[#181B22] p-3">
                      <p className="text-[11px] font-medium text-slate-400 mb-1">
                        Staged Personalized Outreach
                      </p>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {activeLead.generatedConnectionMessage}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Start the workflow to inspect prospect profile data and staged outreach copy live.
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {runSummaryMeta && (
              <div
                className={`rounded-lg border p-3.5 space-y-2.5 ${
                  runSummaryMeta.verified
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-amber-500/30 bg-amber-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-medium ${
                      runSummaryMeta.verified ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {runSummaryMeta.verified
                      ? 'Workflow Execution Verified'
                      : 'Workflow Execution Incomplete'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className={`text-[11px] underline cursor-pointer ${
                      runSummaryMeta.verified ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {showDetails ? 'Hide Details' : 'View Execution Details'}
                  </button>
                </div>

                <p
                  className={`text-[11px] leading-relaxed ${
                    runSummaryMeta.verified ? 'text-emerald-200/80' : 'text-amber-200/80'
                  }`}
                >
                  {runSummaryMeta.verificationNote}
                </p>

                {/* Complete Workflow Execution Summary Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] tabular-nums">
                  <div className="rounded border border-white/[0.07] bg-[#0D0F14]/70 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">Total Duration</span>
                    <span className="text-slate-100">{runSummaryMeta.durationMs}ms</span>
                  </div>
                  <div className="rounded border border-white/[0.07] bg-[#0D0F14]/70 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">Successful Steps</span>
                    <span className="text-emerald-400">{runSummaryMeta.successfulSteps}/11</span>
                  </div>
                  <div className="rounded border border-white/[0.07] bg-[#0D0F14]/70 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">Mock-Mode Steps</span>
                    <span className="text-amber-300">{runSummaryMeta.mockModeSteps}/11</span>
                  </div>
                  <div className="rounded border border-white/[0.07] bg-[#0D0F14]/70 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">Failed Steps</span>
                    <span
                      className={
                        runSummaryMeta.failedSteps > 0 ? 'text-rose-400' : 'text-slate-200'
                      }
                    >
                      {runSummaryMeta.failedSteps}/11
                    </span>
                  </div>
                </div>

                {showDetails && (
                  <div
                    className={`pt-2 border-t font-mono text-[11px] space-y-1 tabular-nums ${
                      runSummaryMeta.verified
                        ? 'border-emerald-500/20 text-emerald-100/90'
                        : 'border-amber-500/20 text-amber-100/90'
                    }`}
                  >
                    <p>Execution ID: {runSummaryMeta.executionRunId}</p>
                    <p>
                      AI Provider:{' '}
                      {runSummaryMeta.aiProviderUsed === 'gemini'
                        ? 'Google Gemini (Live)'
                        : 'Mock AI (Simulated)'}
                    </p>
                    <p>Primary Job: {runSummaryMeta.primaryJobId || 'Pending'}</p>
                    <p>Follow-up Job: {runSummaryMeta.followUpJobId || 'Pending'}</p>
                    <p>Browser Exec: {runSummaryMeta.executionId || 'Pending'}</p>
                    <p>
                      Worker / Session: {runSummaryMeta.workerId || 'pw-worker-01'} ·{' '}
                      {runSummaryMeta.sessionId || 'Pending'}
                    </p>
                    {runSummaryMeta.campaignName && (
                      <p>Campaign: {runSummaryMeta.campaignName}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
