import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import { ToastProvider } from './components/ui/ToastProvider';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DemoAutomationRunner } from './components/demo/DemoAutomationRunner';
import { DashboardView } from './views/DashboardView';
import { LeadsView } from './views/LeadsView';
import { AiResearchView } from './views/AiResearchView';
import { CampaignsView } from './views/CampaignsView';
import { BrowserEngineView } from './views/BrowserEngineView';
import { SessionsView } from './views/SessionsView';
import { JobQueueView } from './views/JobQueueView';
import { AiAgentView } from './views/AiAgentView';
import { AnalyticsView } from './views/AnalyticsView';
import { ExecutionHistoryView } from './views/ExecutionHistoryView';
import { SystemHealthView } from './views/SystemHealthView';
import { ActivityLogsView } from './views/ActivityLogsView';
import { SettingsView } from './views/SettingsView';
import type { BootstrapResponse, NavSection } from './types/outreach';

function WorkspaceApp() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoRunnerOpen, setDemoRunnerOpen] = useState(false);
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (range: 7 | 30 | 90 = rangeDays) => {
    try {
      const res = await api.bootstrap(range);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    loadWorkspace(rangeDays);
  }, [loadWorkspace, rangeDays]);

  const handleChangeRange = async (nextRange: 7 | 30 | 90) => {
    setRangeDays(nextRange);
    try {
      const analytics = await api.getAnalytics(nextRange);
      setData((prev) => (prev ? { ...prev, analytics } : prev));
    } catch {
      await loadWorkspace(nextRange);
    }
  };

  const handleOpenAiResearch = (leadId: string) => {
    setFocusedLeadId(leadId);
    setActiveSection('ai-research');
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#090B10] flex">
        <div className="hidden lg:block w-64 border-r border-white/[0.08] bg-[#0C0F16] p-5 space-y-4">
          <div className="h-6 w-36 rounded bg-white/[0.06] animate-pulse" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#090B10] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-white/10 bg-[#0F131C] p-6 text-center space-y-4">
          <h1 className="text-base font-semibold text-slate-100 font-display">
            Unable to connect to AI Outreach Studio backend
          </h1>
          <p className="text-xs text-slate-400">{error || 'Unexpected workspace state.'}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadWorkspace(rangeDays);
            }}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const pendingApprovalsCount = data.agentDecisions.filter((d) => d.status === 'Pending').length;
  const runningJobsCount = data.jobs.filter(
    (j) => j.status === 'Running' || j.status === 'Queued'
  ).length;

  return (
    <div className="min-h-screen bg-[#090B10] text-slate-100 flex">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        pendingApprovalsCount={pendingApprovalsCount}
        runningJobsCount={runningJobsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeSection={activeSection}
          aiMode={data.environment.aiMode}
          fallbackActive={
            data.systemHealth.aiTelemetry.providerPreference === 'gemini' &&
            data.systemHealth.aiTelemetry.lastStatus === 'Mock Mode'
          }
          onSelectSection={setActiveSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onRunDemoAutomation={() => setDemoRunnerOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              analytics={data.analytics}
              campaigns={data.campaigns}
              sessions={data.sessions}
              jobs={data.jobs}
              activityLogs={data.activityLogs}
              systemHealth={data.systemHealth}
              aiMode={data.environment.aiMode}
              onRunDemo={() => setDemoRunnerOpen(true)}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'leads' && (
            <LeadsView
              leads={data.leads}
              campaigns={data.campaigns}
              onRefresh={() => loadWorkspace(rangeDays)}
              onOpenAiResearch={handleOpenAiResearch}
            />
          )}

          {activeSection === 'ai-research' && (
            <AiResearchView
              leads={data.leads}
              initialLeadId={focusedLeadId}
              aiMode={data.environment.aiMode}
              onRefresh={() => loadWorkspace(rangeDays)}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'campaigns' && (
            <CampaignsView
              campaigns={data.campaigns}
              automationRuns={data.automationRuns}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}

          {activeSection === 'browser-engine' && (
            <BrowserEngineView
              executions={data.executions}
              sessions={data.sessions}
              leads={data.leads}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}

          {activeSection === 'sessions' && (
            <SessionsView
              sessions={data.sessions}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}

          {activeSection === 'job-queue' && (
            <JobQueueView
              jobs={data.jobs}
              leads={data.leads}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}

          {activeSection === 'ai-agent' && (
            <AiAgentView
              decisions={data.agentDecisions}
              leads={data.leads}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}

          {activeSection === 'analytics' && (
            <AnalyticsView
              analytics={data.analytics}
              rangeDays={rangeDays}
              onChangeRange={handleChangeRange}
              campaigns={data.campaigns}
              jobs={data.jobs}
            />
          )}

          {activeSection === 'execution-history' && (
            <ExecutionHistoryView
              automationRuns={data.automationRuns}
              jobs={data.jobs}
              executions={data.executions}
              onRefresh={() => loadWorkspace(rangeDays)}
              onOpenManualDemo={() => setDemoRunnerOpen(true)}
            />
          )}

          {activeSection === 'system-health' && (
            <SystemHealthView
              systemHealth={data.systemHealth}
              automationRuns={data.automationRuns}
              leads={data.leads}
              onRefresh={() => loadWorkspace(rangeDays)}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'activity-logs' && (
            <ActivityLogsView logs={data.activityLogs} />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              integrations={data.integrations}
              postgresDdl={data.postgresDdl}
              onRefresh={() => loadWorkspace(rangeDays)}
            />
          )}
        </main>
      </div>

      <DemoAutomationRunner
        open={demoRunnerOpen}
        onClose={() => setDemoRunnerOpen(false)}
        leads={data.leads}
        onRefreshWorkspace={() => loadWorkspace(rangeDays)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WorkspaceApp />
    </ToastProvider>
  );
}
