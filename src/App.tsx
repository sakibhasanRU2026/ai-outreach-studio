import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Play, ArrowRight } from 'lucide-react';
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

const COMMAND_ITEMS: { id: NavSection; label: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard Overview', group: 'Workspace' },
  { id: 'leads', label: 'Lead Management', group: 'Workspace' },
  { id: 'ai-research', label: 'AI Research & Personalization', group: 'Workspace' },
  { id: 'campaigns', label: 'Campaign Builder', group: 'Workspace' },
  { id: 'browser-engine', label: 'Browser Automation Engine', group: 'Execution Engine' },
  { id: 'sessions', label: 'Session Management', group: 'Execution Engine' },
  { id: 'job-queue', label: 'Background Job Queue', group: 'Execution Engine' },
  { id: 'ai-agent', label: 'AI Agent Control Center', group: 'Execution Engine' },
  { id: 'analytics', label: 'Analytics & Reports', group: 'Observability' },
  { id: 'execution-history', label: 'Execution History', group: 'Observability' },
  { id: 'system-health', label: 'System Health & Observability', group: 'Observability' },
  { id: 'activity-logs', label: 'Activity Logs', group: 'Observability' },
  { id: 'settings', label: 'Settings & Integrations', group: 'Observability' },
];

function WorkspaceApp() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoRunnerOpen, setDemoRunnerOpen] = useState(false);
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  const loadWorkspace = useCallback(
    async (range: 7 | 30 | 90 = rangeDays) => {
      try {
        const res = await api.bootstrap(range);
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace data.');
      } finally {
        setLoading(false);
      }
    },
    [rangeDays]
  );

  useEffect(() => {
    loadWorkspace(rangeDays);
  }, [loadWorkspace, rangeDays]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        setCommandQuery('');
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredCommands = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return COMMAND_ITEMS;
    return COMMAND_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
    );
  }, [commandQuery]);

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
      <div className="min-h-screen bg-[#090A0D] flex">
        <div className="hidden lg:block w-[252px] border-r border-white/[0.07] bg-[#0D0F14] p-4 space-y-5">
          <div className="h-8 w-36 rounded-lg bg-white/[0.05] animate-pulse" />
          <div className="space-y-2 pt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6 max-w-[1440px] mx-auto">
          <div className="h-24 rounded-xl bg-[#111318] border border-white/[0.06] animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl bg-[#111318] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
          <div className="h-72 rounded-xl bg-[#111318] border border-white/[0.06] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#090A0D] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-white/[0.08] bg-[#111318] p-6 text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-sm font-semibold text-[#F4F5F7]">
              Unable to connect to Outreach Studio backend
            </h1>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              {error || 'Unexpected workspace state.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadWorkspace(rangeDays);
            }}
            className="inline-flex items-center justify-center h-9 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 text-xs font-medium text-white transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] cursor-pointer"
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
    <div className="min-h-screen bg-[#090A0D] text-[#F4F5F7] flex selection:bg-blue-500/30 selection:text-white">
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
          onOpenCommandPalette={() => {
            setCommandOpen(true);
            setCommandQuery('');
          }}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto">
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

      {/* Command Palette (Cmd+K) */}
      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Quick navigation"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setCommandOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-[#111318] border border-white/[0.12] shadow-2xl shadow-black/80 overflow-hidden">
            <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.08]">
              <Search className="h-4 w-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Jump to view or run action..."
                className="flex-1 bg-transparent text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none"
              />
              <kbd className="font-mono text-[10px] text-[#6B7280] bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  setDemoRunnerOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run Demo Automation
                </span>
                <span className="font-mono text-[10px] text-blue-400/70">ACTION</span>
              </button>

              {filteredCommands.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setCommandOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-[#D1D5DB] hover:bg-white/[0.06] hover:text-[#F4F5F7] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-[#6B7280]" />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono text-[10px] text-[#6B7280]">{item.group}</span>
                </button>
              ))}

              {filteredCommands.length === 0 && (
                <p className="py-6 text-center text-xs text-[#6B7280]">
                  No matching views found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
