import React, { useMemo, useState } from 'react';
import { Plus, Play, Pause, RotateCw, XCircle, Terminal } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import {
  StatusText,
  formatIsoTimeOnly,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type { BackgroundJob, JobType, Lead } from '../types/outreach';

interface JobQueueViewProps {
  jobs: BackgroundJob[];
  leads: Lead[];
  onRefresh: () => Promise<void>;
}

const JOB_TYPES: JobType[] = [
  'Lead Research',
  'Message Generation',
  'Browser Execution',
  'Follow-up Scheduling',
  'Reply Analysis',
  'Campaign Processing',
];

export function JobQueueView({ jobs, leads, onRefresh }: JobQueueViewProps) {
  const { pushToast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [selectedLogsJob, setSelectedLogsJob] = useState<BackgroundJob | null>(null);
  const [newJobLeadId, setNewJobLeadId] = useState<string>(leads[0]?.id || '');
  const [newJobType, setNewJobType] = useState<JobType>('Lead Research');

  const filteredJobs = useMemo(
    () => jobs.filter((j) => typeFilter === 'All' || j.type === typeFilter),
    [jobs, typeFilter]
  );

  const handleTransition = async (
    job: BackgroundJob,
    action: 'start' | 'pause' | 'retry' | 'cancel'
  ) => {
    try {
      await api.transitionJob(job.id, action);
      await onRefresh();
      pushToast(`Job ${job.id} updated`, `Action "${action}" executed.`, 'success');
    } catch (err) {
      pushToast('Queue action failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleQueueJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.queueJob({ leadId: newJobLeadId, type: newJobType });
      await onRefresh();
      setQueueModalOpen(false);
      pushToast('Job queued', `${res.job.id} added to Redis worker queue.`, 'success');
    } catch (err) {
      pushToast('Queue error', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', ...JOB_TYPES].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                typeFilter === t
                  ? 'bg-white/[0.1] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setQueueModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3.5 py-2 text-xs font-medium text-white cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          Queue Job
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-slate-400">
                <th className="py-3 px-6 font-medium">Job ID</th>
                <th className="py-3 px-4 font-medium">Lead & Campaign</th>
                <th className="py-3 px-4 font-medium">Job Type</th>
                <th className="py-3 px-4 font-medium">Assigned Worker</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Retries</th>
                <th className="py-3 px-4 font-medium">Started / Completed</th>
                <th className="py-3 px-6 font-medium text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-6 font-mono text-slate-200">{job.id}</td>
                  <td className="py-3.5 px-4">
                    <p className="font-medium text-slate-100">{job.leadName}</p>
                    <p className="text-[11px] text-slate-500">
                      {job.leadCompany}
                      {job.campaignName ? ` · ${job.campaignName}` : ''}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">{job.type}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{job.assignedWorker}</td>
                  <td className="py-3.5 px-4">
                    <StatusText status={job.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400">
                    {job.retryCount}/{job.maxRetries}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                    <p className="text-slate-300 text-[11px]">
                      {formatPreciseTimestamp(job.completedAt || job.updatedAt)}
                      {job.durationMs ? ` (${job.durationMs}ms)` : ''}
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      started {formatIsoTimeOnly(job.startedAt || job.createdAt)} ·{' '}
                      {formatRelativeTime(job.createdAt)}
                    </p>
                  </td>
                  <td className="py-3.5 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {(job.status === 'Queued' || job.status === 'Paused') && (
                        <button
                          type="button"
                          onClick={() => handleTransition(job, 'start')}
                          className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          title="Start job"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {job.status === 'Queued' && (
                        <button
                          type="button"
                          onClick={() => handleTransition(job, 'pause')}
                          className="p-1.5 rounded text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                          title="Pause job"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {job.status === 'Failed' && (
                        <button
                          type="button"
                          onClick={() => handleTransition(job, 'retry')}
                          className="p-1.5 rounded text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                          title="Retry failed job"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(job.status === 'Queued' || job.status === 'Paused') && (
                        <button
                          type="button"
                          onClick={() => handleTransition(job, 'cancel')}
                          className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Cancel job"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedLogsJob(job)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] cursor-pointer"
                        title="View execution logs"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Queue Job Modal */}
      <Modal
        open={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        title="Enqueue Background Job"
        subtitle="Dispatch an asynchronous worker task into the Redis queue"
      >
        <form onSubmit={handleQueueJob} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Prospect</label>
            <select
              value={newJobLeadId}
              onChange={(e) => setNewJobLeadId(e.target.value)}
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
            <label className="block text-slate-400 mb-1">Job Type</label>
            <select
              value={newJobType}
              onChange={(e) => setNewJobType(e.target.value as JobType)}
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            >
              {JOB_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setQueueModalOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 font-medium text-white cursor-pointer"
            >
              Enqueue Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Execution Logs Modal */}
      <Modal
        open={Boolean(selectedLogsJob)}
        onClose={() => setSelectedLogsJob(null)}
        title={`Execution Logs · ${selectedLogsJob?.id ?? ''}`}
        subtitle={
          selectedLogsJob
            ? `${selectedLogsJob.type} · Worker ${selectedLogsJob.assignedWorker}`
            : ''
        }
      >
        {selectedLogsJob && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.07]">
              <div>
                <span className="text-slate-200 font-medium">
                  {selectedLogsJob.leadName} ({selectedLogsJob.leadCompany})
                  {selectedLogsJob.campaignName ? ` · ${selectedLogsJob.campaignName}` : ''}
                </span>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                  Started: {formatPreciseTimestamp(selectedLogsJob.startedAt || selectedLogsJob.createdAt)} ·
                  Completed:{' '}
                  {selectedLogsJob.completedAt
                    ? formatPreciseTimestamp(selectedLogsJob.completedAt)
                    : 'Pending'}
                  {selectedLogsJob.durationMs ? ` · ${selectedLogsJob.durationMs}ms` : ''}
                </p>
              </div>
              <StatusText status={selectedLogsJob.status} />
            </div>
            <div className="rounded-md border border-white/[0.07] bg-[#0D0F14] p-4 font-mono text-[11px] space-y-2 max-h-72 overflow-y-auto text-slate-300">
              {selectedLogsJob.logs.map((line, i) => (
                <p key={i} className="leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
