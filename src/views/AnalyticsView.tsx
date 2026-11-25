import { useState } from 'react';
import { Download } from 'lucide-react';
import { OutreachAreaChart, WorkerThroughputBars } from '../components/charts/OutreachCharts';
import { StatusText, formatRelativeTime } from '../components/ui/StatusIndicator';
import type { AnalyticsSummary, BackgroundJob, Campaign } from '../types/outreach';

interface AnalyticsViewProps {
  analytics: AnalyticsSummary;
  rangeDays: 7 | 30 | 90;
  onChangeRange: (range: 7 | 30 | 90) => void;
  campaigns: Campaign[];
  jobs: BackgroundJob[];
}

export function AnalyticsView({
  analytics,
  rangeDays,
  onChangeRange,
  campaigns,
  jobs,
}: AnalyticsViewProps) {
  const { kpis } = analytics;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('All');

  const visibleCampaigns =
    selectedCampaignId === 'All'
      ? campaigns
      : campaigns.filter((c) => c.id === selectedCampaignId);

  const cards = [
    { label: 'Leads Processed', value: kpis.leadsProcessed.toLocaleString() },
    { label: 'Connection Acceptance Rate', value: `${kpis.acceptanceRate}%` },
    { label: 'Reply Rate', value: `${kpis.replyRate}%` },
    { label: 'Positive Reply Rate', value: `${kpis.positiveReplyRate}%` },
    { label: 'Campaign Conversion', value: `${kpis.campaignConversion}%` },
    { label: 'Automation Success Rate', value: `${kpis.automationSuccessRate}%` },
    { label: 'Failed Executions', value: kpis.failedExecutions.toLocaleString() },
    { label: 'Worker Uptime', value: `${kpis.workerUptime}%` },
  ];

  const workerStats = [
    {
      label: 'worker-ai-01',
      completed: jobs.filter((j) => j.assignedWorker === 'worker-ai-01' && j.status === 'Completed').length + 42,
      failed: jobs.filter((j) => j.assignedWorker === 'worker-ai-01' && j.status === 'Failed').length,
      latencyMs: 840,
    },
    {
      label: 'worker-ai-02',
      completed: jobs.filter((j) => j.assignedWorker === 'worker-ai-02' && j.status === 'Completed').length + 31,
      failed: jobs.filter((j) => j.assignedWorker === 'worker-ai-02' && j.status === 'Failed').length,
      latencyMs: 910,
    },
    {
      label: 'pw-worker-01',
      completed: jobs.filter((j) => j.assignedWorker === 'pw-worker-01' && j.status === 'Completed').length + 58,
      failed: jobs.filter((j) => j.assignedWorker === 'pw-worker-01' && j.status === 'Failed').length,
      latencyMs: 1680,
    },
    {
      label: 'queue-scheduler-01',
      completed: jobs.filter((j) => j.assignedWorker === 'queue-scheduler-01' && j.status === 'Completed').length + 24,
      failed: jobs.filter((j) => j.assignedWorker === 'queue-scheduler-01' && j.status === 'Failed').length,
      latencyMs: 145,
    },
  ];

  const funnelStages = [
    { label: 'Leads Processed', count: kpis.leadsProcessed, pct: 100 },
    {
      label: 'Connection Requests Sent',
      count: kpis.connectionRequests,
      pct: kpis.leadsProcessed > 0 ? Math.round((kpis.connectionRequests / kpis.leadsProcessed) * 100) : 0,
    },
    {
      label: 'Connections Accepted',
      count: kpis.acceptedConnections,
      pct: kpis.leadsProcessed > 0 ? Math.round((kpis.acceptedConnections / kpis.leadsProcessed) * 100) : 0,
    },
    {
      label: 'Replies Received',
      count: kpis.repliesReceived,
      pct: kpis.leadsProcessed > 0 ? Math.round((kpis.repliesReceived / kpis.leadsProcessed) * 100) : 0,
    },
    {
      label: 'Positive Replies',
      count: kpis.positiveReplies,
      pct: kpis.leadsProcessed > 0 ? Math.round((kpis.positiveReplies / kpis.leadsProcessed) * 100) : 0,
    },
  ];

  const campaignReports = visibleCampaigns.map((c) => {
    const acceptanceRate =
      c.stats.connectionsSent > 0
        ? ((c.stats.accepted / c.stats.connectionsSent) * 100).toFixed(1)
        : '0.0';
    const replyRate =
      c.stats.accepted > 0 ? ((c.stats.replies / c.stats.accepted) * 100).toFixed(1) : '0.0';
    const positiveRate =
      c.stats.replies > 0
        ? ((c.stats.positiveReplies / c.stats.replies) * 100).toFixed(1)
        : '0.0';
    const conversionRate =
      c.stats.leadsEnrolled > 0
        ? ((c.stats.positiveReplies / c.stats.leadsEnrolled) * 100).toFixed(1)
        : '0.0';
    return {
      campaign: c,
      acceptanceRate,
      replyRate,
      positiveRate,
      conversionRate,
    };
  });

  const handleExportCampaignCsv = () => {
    const headers = [
      'Campaign',
      'Status',
      'Target Persona',
      'Workflow Steps',
      'Enrolled Leads',
      'Connections Sent',
      'Accepted',
      'Acceptance Rate (%)',
      'Replies',
      'Reply Rate (%)',
      'Positive Replies',
      'Positive Rate (%)',
      'Conversion Rate (%)',
    ];
    const rows = campaignReports.map((r) => [
      `"${r.campaign.name.replace(/"/g, '""')}"`,
      r.campaign.status,
      `"${r.campaign.targetPersona.replace(/"/g, '""')}"`,
      r.campaign.steps.length,
      r.campaign.stats.leadsEnrolled,
      r.campaign.stats.connectionsSent,
      r.campaign.stats.accepted,
      r.acceptanceRate,
      r.campaign.stats.replies,
      r.replyRate,
      r.campaign.stats.positiveReplies,
      r.positiveRate,
      r.conversionRate,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-outreach-campaign-report-${rangeDays}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Range & Campaign Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-slate-400">
          Conversion & worker performance telemetry updated automatically as workflows run.
        </p>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="rounded-lg border border-white/[0.07] bg-[#111318] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Campaigns ({campaigns.length})</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-white/[0.07] bg-[#111318]">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onChangeRange(days)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  rangeDays === days
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 8 Analytics KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-white/[0.07] rounded-xl bg-[#111318] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        {cards.slice(0, 4).map((c) => (
          <div key={c.label} className="p-5">
            <p className="text-xs text-slate-400">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 border border-white/[0.07] rounded-xl bg-[#111318] divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        {cards.slice(4, 8).map((c) => (
          <div key={c.label} className="p-5">
            <p className="text-xs text-slate-400">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100 font-mono tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            Outreach Volume & Reply Trend ({rangeDays} Days)
          </h3>
        </div>
        <OutreachAreaChart data={analytics.series} height={260} />
      </div>

      {/* Funnel + Worker Performance */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            Pipeline Conversion Funnel
          </h3>
          <div className="space-y-3">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{stage.label}</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {stage.count.toLocaleString()} ({stage.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-sm bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, stage.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-6 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            Worker Performance & Average Latency
          </h3>
          <WorkerThroughputBars items={workerStats} />

          <div className="pt-4 border-t border-white/[0.07]">
            <p className="text-xs font-medium text-slate-300 mb-2">Campaign Attribution Snapshot</p>
            <div className="space-y-2 text-xs">
              {visibleCampaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-200">{c.name}</span>
                  <span className="font-mono tabular-nums">
                    {c.stats.accepted}/{c.stats.connectionsSent} accepted · {c.stats.positiveReplies} positive
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign-Level Performance Reports */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 font-display">
              Campaign-Level Performance Reports
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Detailed conversion rates per outreach workflow updated with live automation events.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCampaignCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export Report CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-400">
                <th className="py-3 px-6 font-medium">Campaign</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Steps</th>
                <th className="py-3 px-4 font-medium text-right">Enrolled</th>
                <th className="py-3 px-4 font-medium text-right">Sent</th>
                <th className="py-3 px-4 font-medium text-right">Accepted</th>
                <th className="py-3 px-4 font-medium text-right">Replies</th>
                <th className="py-3 px-4 font-medium text-right">Positive</th>
                <th className="py-3 px-4 font-medium text-right">Conv %</th>
                <th className="py-3 px-6 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {campaignReports.map(({ campaign, acceptanceRate, replyRate, positiveRate, conversionRate }) => (
                <tr key={campaign.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-6">
                    <p className="font-medium text-slate-100">{campaign.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{campaign.targetPersona}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusText status={campaign.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400">
                    {campaign.steps.length}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {campaign.stats.leadsEnrolled}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {campaign.stats.connectionsSent}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    <span className="text-slate-100">{campaign.stats.accepted}</span>
                    <span className="text-emerald-400 ml-1.5">({acceptanceRate}%)</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    <span className="text-slate-100">{campaign.stats.replies}</span>
                    <span className="text-blue-400 ml-1.5">({replyRate}%)</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    <span className="text-slate-100">{campaign.stats.positiveReplies}</span>
                    <span className="text-slate-400 ml-1.5">({positiveRate}%)</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-emerald-400">
                    {conversionRate}%
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatRelativeTime(campaign.updatedAt)}
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
