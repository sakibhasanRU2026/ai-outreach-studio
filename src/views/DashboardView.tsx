import { Play, ArrowRight } from 'lucide-react';
import { OutreachAreaChart } from '../components/charts/OutreachCharts';
import { StatusText, formatRelativeTime } from '../components/ui/StatusIndicator';
import type {
  ActivityLog,
  AnalyticsSummary,
  BackgroundJob,
  BrowserSession,
  Campaign,
  NavSection,
  SystemHealthSnapshot,
} from '../types/outreach';

interface DashboardViewProps {
  analytics: AnalyticsSummary;
  campaigns: Campaign[];
  sessions: BrowserSession[];
  jobs: BackgroundJob[];
  activityLogs: ActivityLog[];
  systemHealth: SystemHealthSnapshot;
  aiMode: 'gemini' | 'mock';
  onRunDemo: () => void;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({
  analytics,
  campaigns,
  sessions,
  jobs,
  activityLogs,
  systemHealth,
  aiMode,
  onRunDemo,
  onNavigate,
}: DashboardViewProps) {
  const { kpis } = analytics;

  const metricCells = [
    { label: 'Total Leads', value: kpis.totalLeads.toLocaleString(), sub: 'Pipeline CRM' },
    { label: 'Connection Requests', value: kpis.connectionRequests.toLocaleString(), sub: `${analytics.rangeDays}d window` },
    { label: 'Accepted Connections', value: kpis.acceptedConnections.toLocaleString(), sub: `${kpis.acceptanceRate}% acceptance` },
    { label: 'Messages Generated', value: kpis.messagesGenerated.toLocaleString(), sub: aiMode === 'gemini' ? 'Gemini 4' : 'Mock AI' },
    { label: 'Replies Received', value: kpis.repliesReceived.toLocaleString(), sub: `${kpis.positiveReplyRate}% positive` },
    { label: 'Active Campaigns', value: kpis.activeCampaigns.toLocaleString(), sub: `${campaigns.length} configured` },
    { label: 'Running Jobs', value: kpis.runningJobs.toLocaleString(), sub: `${kpis.completedJobs} completed` },
    { label: 'Automation Success Rate', value: `${kpis.automationSuccessRate}%`, sub: `${kpis.failedExecutions} failed runs` },
  ];

  const activeSessionsCount = sessions.filter((s) => s.status === 'Active').length;
  const rateLimitedCount = sessions.filter((s) => s.status === 'Rate Limited').length;
  const failedJobsCount = jobs.filter((j) => j.status === 'Failed').length;

  return (
    <div className="space-y-6">
      {/* Primary Interactive Demo Hero Strip */}
      <section className="rounded-xl border border-white/[0.08] bg-[#11151E] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-400">
            End-to-End Orchestration · Safe Sandbox Environment
          </p>
          <h2 className="text-xl font-semibold text-slate-100 font-display tracking-tight">
            Execute the full 11-step AI outreach pipeline in one click
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Watch AI Outreach Studio select a prospect, synthesize challenges, craft personalized copy, dispatch a Redis queue job, run a simulated browser session, and update live conversion analytics.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('campaigns')}
            className="rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            Inspect Workflows
          </button>
          <button
            type="button"
            onClick={onRunDemo}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer shadow-lg shadow-blue-950/50"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Run Demo Automation</span>
          </button>
        </div>
      </section>

      {/* 8 KPI Strip (Single-Elevation 1px Hairline Grid) */}
      <section className="grid grid-cols-2 md:grid-cols-4 border border-white/[0.08] rounded-xl bg-[#0F131C] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        {metricCells.slice(0, 4).map((m) => (
          <div key={m.label} className="p-5">
            <p className="text-xs text-slate-400">{m.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums tracking-tight">
              {m.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{m.sub}</p>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 border border-white/[0.08] rounded-xl bg-[#0F131C] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        {metricCells.slice(4, 8).map((m) => (
          <div key={m.label} className="p-5">
            <p className="text-xs text-slate-400">{m.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums tracking-tight">
              {m.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{m.sub}</p>
          </div>
        ))}
      </section>

      {/* Main Chart + Worker Health / Session Status */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 rounded-xl border border-white/[0.08] bg-[#0F131C] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 font-display">
                Outreach Performance
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                30-day simulated connections sent, acceptances, and replies
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Full Analytics</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <OutreachAreaChart data={analytics.series} height={240} />
        </div>

        <div className="xl:col-span-4 rounded-xl border border-white/[0.08] bg-[#0F131C] p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-100 font-display">
                Worker Health
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('job-queue')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Queue
              </button>
            </div>
            <div className="divide-y divide-white/[0.06] text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="font-mono text-slate-200">worker-ai-01</span>
                <StatusText status="Active" />
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="font-mono text-slate-200">pw-worker-01</span>
                <StatusText status="Active" />
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="font-mono text-slate-200">queue-scheduler-01</span>
                <StatusText status={failedJobsCount > 0 ? 'Warning' : 'Active'} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-100 font-display">
                Browser Sessions
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('sessions')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Manage ({sessions.length})
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              {sessions.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-slate-200 truncate">{s.accountLabel}</p>
                    <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {s.id} · {s.dailyActionCount}/{s.dailyActionLimit} actions
                    </p>
                  </div>
                  <StatusText status={s.status} />
                </div>
              ))}
              <p className="text-[11px] text-slate-500 pt-1">
                {activeSessionsCount} active · {rateLimitedCount} rate limited
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-semibold text-slate-100 font-display">
                AI Provider & System Health
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('system-health')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Inspect
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active Provider</span>
                <span className="font-mono text-slate-200">
                  {systemHealth.effectiveAiMode === 'gemini' ? 'Gemini AI' : 'Mock AI'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Provider Status</span>
                <StatusText status={systemHealth.aiTelemetry.lastStatus} />
              </div>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums pt-0.5">
                {systemHealth.aiTelemetry.totalRequests} reqs · {systemHealth.aiTelemetry.retryCountTotal} retries · {systemHealth.aiTelemetry.fallbackCount} fallbacks
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Split: Campaign Performance & Recent Activity Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 rounded-xl border border-white/[0.08] bg-[#0F131C] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 font-display">
              Campaign Performance
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Open Builder
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-400">
                  <th className="py-3 px-6 font-medium">Campaign</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Enrolled</th>
                  <th className="py-3 px-4 font-medium text-right">Accepted</th>
                  <th className="py-3 px-6 font-medium text-right">Replies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {campaigns.map((cmp) => (
                  <tr key={cmp.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-6">
                      <p className="font-medium text-slate-100">{cmp.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{cmp.targetPersona}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={cmp.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {cmp.stats.leadsEnrolled}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {cmp.stats.accepted}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums text-emerald-400">
                      {cmp.stats.replies}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 rounded-xl border border-white/[0.08] bg-[#0F131C] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 font-display">
              Recent Activity Feed
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('activity-logs')}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {activityLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{log.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{log.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[11px] font-mono text-slate-500 tabular-nums">
                    {formatRelativeTime(log.timestamp)}
                  </span>
                  <span className="text-[11px] text-slate-400">{log.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
