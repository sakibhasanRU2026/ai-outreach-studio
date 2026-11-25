import { Play, ArrowRight, Sparkles, Activity, Cpu, ShieldCheck } from 'lucide-react';
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

  const primaryKpis = [
    {
      label: 'Replies Received',
      value: kpis.repliesReceived.toLocaleString(),
      badge: `${kpis.positiveReplyRate}% positive`,
      badgeTone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      sub: 'North-star conversion signal',
      highlight: true,
    },
    {
      label: 'Accepted Connections',
      value: kpis.acceptedConnections.toLocaleString(),
      badge: `${kpis.acceptanceRate}% rate`,
      badgeTone: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      sub: `${kpis.connectionRequests.toLocaleString()} sent (${analytics.rangeDays}d)`,
      highlight: false,
    },
    {
      label: 'Total Leads',
      value: kpis.totalLeads.toLocaleString(),
      badge: `${kpis.activeCampaigns} active`,
      badgeTone: 'text-[#9CA3AF] bg-white/[0.04] border-white/[0.08]',
      sub: `${campaigns.length} campaigns configured`,
      highlight: false,
    },
    {
      label: 'Automation Success',
      value: `${kpis.automationSuccessRate}%`,
      badge: `${kpis.failedExecutions} failed`,
      badgeTone:
        kpis.failedExecutions > 0
          ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
          : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      sub: `${kpis.completedJobs} completed · ${kpis.runningJobs} running`,
      highlight: false,
    },
  ];

  const secondaryStrip = [
    { label: 'Connection Requests', value: kpis.connectionRequests.toLocaleString(), meta: `${analytics.rangeDays}d window` },
    { label: 'Messages Generated', value: kpis.messagesGenerated.toLocaleString(), meta: aiMode === 'gemini' ? 'Gemini AI' : 'Mock AI' },
    { label: 'Active Campaigns', value: kpis.activeCampaigns.toLocaleString(), meta: `${campaigns.length} total` },
    { label: 'Queue Throughput', value: `${kpis.completedJobs}/${kpis.completedJobs + kpis.runningJobs}`, meta: `${kpis.runningJobs} in flight` },
  ];

  const activeSessionsCount = sessions.filter((s) => s.status === 'Active').length;
  const rateLimitedCount = sessions.filter((s) => s.status === 'Rate Limited').length;
  const failedJobsCount = jobs.filter((j) => j.status === 'Failed').length;

  return (
    <div className="space-y-6">
      {/* Precision Orchestration Command Banner */}
      <section className="hero-obsidian-sheen rounded-xl border border-white/[0.08] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-blue-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>11-Step Autonomous Pipeline · Safe Sandbox</span>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-[#F4F5F7] font-display tracking-[-0.02em]">
            Run live AI prospect research, copy generation &amp; browser dispatch
          </h2>
          <p className="text-[13px] text-[#9CA3AF] leading-relaxed">
            Selects a target prospect, synthesizes account pain points, drafts personalized outreach, dispatches a background queue worker, and streams live execution telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('campaigns')}
            className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.16] px-4 text-xs font-medium text-[#E5E7EB] transition-all whitespace-nowrap cursor-pointer"
          >
            Inspect Workflows
          </button>
          <button
            type="button"
            onClick={onRunDemo}
            className="inline-flex items-center gap-2 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 text-xs font-semibold text-white transition-all whitespace-nowrap cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Run Demo Automation</span>
          </button>
        </div>
      </section>

      {/* Primary KPI Grid (North-Star + Core Metrics) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {primaryKpis.map((m) => (
          <div
            key={m.label}
            className={`rounded-xl border p-5 transition-colors ${
              m.highlight
                ? 'bg-[#14171F] border-blue-500/25 shadow-[inset_0_1px_0_rgba(59,130,246,0.16)]'
                : 'bg-[#111318] border-white/[0.07] hover:border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[#9CA3AF]">{m.label}</p>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium tabular-nums ${m.badgeTone}`}
              >
                {m.badge}
              </span>
            </div>
            <p
              data-metric
              className="mt-3 text-3xl font-semibold text-[#F4F5F7] font-mono tabular-nums tracking-[-0.03em]"
            >
              {m.value}
            </p>
            <p className="mt-1.5 text-[11px] text-[#6B7280]">{m.sub}</p>
          </div>
        ))}
      </section>

      {/* Secondary Operational Telemetry Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-white/[0.07] bg-[#111318] divide-y md:divide-y-0 md:divide-x divide-white/[0.07] overflow-hidden">
        {secondaryStrip.map((item) => (
          <div key={item.label} className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[#6B7280] truncate">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-[#F4F5F7]">
                {item.value}
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#6B7280] shrink-0">{item.meta}</span>
          </div>
        ))}
      </section>

      {/* Main Chart + Live Operations Pulse */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 surface-panel p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-[#F4F5F7] font-display">
                Outreach Performance
              </h3>
              <p className="text-xs text-[#6B7280] mt-0.5">
                {analytics.rangeDays}-day velocity across connections sent, acceptances, and replies
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Full Analytics</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <OutreachAreaChart data={analytics.series} height={248} />
        </div>

        <div className="xl:col-span-4 surface-panel p-5 flex flex-col justify-between space-y-5">
          {/* Worker Nodes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.07em] text-[#9CA3AF]">
                <Cpu className="h-3.5 w-3.5 text-blue-400" />
                <span>Worker Nodes</span>
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
              <div className="py-2 flex items-center justify-between">
                <span className="font-mono text-[#E5E7EB]">worker-ai-01</span>
                <StatusText status="Active" />
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="font-mono text-[#E5E7EB]">pw-worker-01</span>
                <StatusText status="Active" />
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="font-mono text-[#E5E7EB]">queue-scheduler-01</span>
                <StatusText status={failedJobsCount > 0 ? 'Warning' : 'Active'} />
              </div>
            </div>
          </div>

          {/* Browser Sessions with Quota Utilization Bars */}
          <div className="pt-4 border-t border-white/[0.07]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.07em] text-[#9CA3AF]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Browser Sessions</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('sessions')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Manage ({sessions.length})
              </button>
            </div>
            <div className="space-y-3 text-xs">
              {sessions.slice(0, 3).map((s) => {
                const utilPct = Math.min(
                  100,
                  Math.round((s.dailyActionCount / Math.max(1, s.dailyActionLimit)) * 100)
                );
                return (
                  <div key={s.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#E5E7EB] font-medium truncate">{s.accountLabel}</span>
                      <StatusText status={s.status} />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            utilPct >= 90 ? 'bg-amber-400' : 'bg-blue-500'
                          }`}
                          style={{ width: `${utilPct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-[#6B7280] tabular-nums shrink-0">
                        {s.dailyActionCount}/{s.dailyActionLimit}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] font-mono text-[#6B7280] pt-0.5">
                {activeSessionsCount} active · {rateLimitedCount} rate limited
              </p>
            </div>
          </div>

          {/* AI Provider Telemetry */}
          <div className="pt-4 border-t border-white/[0.07]">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.07em] text-[#9CA3AF]">
                <Activity className="h-3.5 w-3.5 text-indigo-400" />
                <span>AI Telemetry</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('system-health')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Inspect
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#9CA3AF]">Active Provider</span>
                <span className="font-mono text-[#F4F5F7]">
                  {systemHealth.effectiveAiMode === 'gemini' ? 'Gemini AI' : 'Mock AI'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#9CA3AF]">Status</span>
                <StatusText status={systemHealth.aiTelemetry.lastStatus} />
              </div>
              <p className="text-[11px] text-[#6B7280] font-mono tabular-nums pt-0.5">
                {systemHealth.aiTelemetry.totalRequests} reqs · {systemHealth.aiTelemetry.retryCountTotal} retries · {systemHealth.aiTelemetry.fallbackCount} fallbacks
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Split: Campaign Performance & Live Activity Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 surface-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#F4F5F7] font-display">
                Campaign Performance
              </h3>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                Active sequences and reply conversion
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Open Builder
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.015] text-[11px] font-mono uppercase tracking-[0.06em] text-[#6B7280]">
                  <th className="py-3 px-6 font-medium">Campaign</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Enrolled</th>
                  <th className="py-3 px-4 font-medium text-right">Accepted</th>
                  <th className="py-3 px-6 font-medium text-right">Replies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {campaigns.map((cmp) => (
                  <tr
                    key={cmp.id}
                    className="hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <p className="font-medium text-[#F4F5F7]">{cmp.name}</p>
                      <p className="text-[11px] text-[#6B7280] mt-0.5">{cmp.targetPersona}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={cmp.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#D1D5DB]">
                      {cmp.stats.leadsEnrolled}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#D1D5DB]">
                      {cmp.stats.accepted}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums font-medium text-emerald-400">
                      {cmp.stats.replies}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 surface-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#F4F5F7] font-display">
                Recent Activity Feed
              </h3>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                Real-time orchestration audit stream
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('activity-logs')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {activityLogs.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="px-6 py-3.5 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F4F5F7] truncate">{log.title}</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5 line-clamp-1">{log.detail}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <span className="block text-[11px] font-mono text-[#6B7280] tabular-nums">
                    {formatRelativeTime(log.timestamp)}
                  </span>
                  <span className="inline-block px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono text-[10px] text-[#9CA3AF]">
                    {log.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
