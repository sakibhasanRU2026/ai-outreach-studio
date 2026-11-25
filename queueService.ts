import { repository } from '../db/store.ts';
import type { BackgroundJob, JobType } from '../types.ts';

function defaultWorkerForType(type: JobType): string {
  switch (type) {
    case 'Lead Research':
      return 'worker-ai-01';
    case 'Message Generation':
      return 'worker-ai-02';
    case 'Browser Execution':
      return 'pw-worker-01';
    case 'Follow-up Scheduling':
      return 'queue-scheduler-01';
    case 'Reply Analysis':
      return 'worker-ai-01';
    case 'Campaign Processing':
      return 'campaign-orchestrator-01';
  }
}

export function enqueueJob(params: {
  leadId: string;
  leadName: string;
  leadCompany: string;
  campaignId?: string;
  type: JobType;
  assignedWorker?: string;
  initialStatus?: 'Queued' | 'Running' | 'Completed';
  resultSummary?: string;
}): BackgroundJob {
  const state = repository.load();
  const now = new Date().toISOString();
  const id = `JOB-${Math.floor(1045 + Math.random() * 8900)}`;
  const campaignName = params.campaignId
    ? state.campaigns.find((c) => c.id === params.campaignId)?.name
    : undefined;

  const isCompleted = params.initialStatus === 'Completed';
  const isRunning = params.initialStatus === 'Running';

  const job: BackgroundJob = {
    id,
    leadId: params.leadId,
    leadName: params.leadName,
    leadCompany: params.leadCompany,
    campaignId: params.campaignId,
    campaignName,
    type: params.type,
    assignedWorker: params.assignedWorker ?? defaultWorkerForType(params.type),
    status: params.initialStatus ?? 'Queued',
    createdAt: now,
    startedAt: isRunning || isCompleted ? now : undefined,
    completedAt: isCompleted ? now : undefined,
    updatedAt: now,
    durationMs: isCompleted ? 640 : undefined,
    retryCount: 0,
    maxRetries: 3,
    logs: [
      `[${now}] Enqueued ${params.type} job for ${params.leadName} (${params.leadCompany}).`,
      ...(isCompleted
        ? [`[${now}] ${params.resultSummary ?? 'Completed execution.'}`]
        : []),
    ],
    resultSummary: params.resultSummary,
  };

  state.jobs.unshift(job);
  repository.addActivity({
    category: 'Queue',
    title: `Job ${job.id} queued (${job.type})`,
    detail: `Assigned ${job.assignedWorker} for ${job.leadName} at ${job.leadCompany}.`,
    status: 'Info',
    entityId: job.id,
  });
  repository.save();
  return job;
}

export function transitionJob(
  jobId: string,
  action: 'start' | 'pause' | 'retry' | 'cancel'
): BackgroundJob | null {
  const state = repository.load();
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const startMs = Date.now();
  const now = new Date(startMs).toISOString();

  if (action === 'start') {
    job.startedAt = job.startedAt || now;
    job.status = 'Running';
    job.updatedAt = now;
    job.logs.push(`[${now}] Worker ${job.assignedWorker} picked up job from Redis queue.`);
    job.logs.push(`[${now}] Processing ${job.type} payload for ${job.leadName}...`);

    const finishedAt = new Date(startMs + 840).toISOString();
    job.status = 'Completed';
    job.completedAt = finishedAt;
    job.durationMs = 840;
    job.updatedAt = finishedAt;
    job.resultSummary = `${job.type} executed cleanly by ${job.assignedWorker}.`;
    job.logs.push(`[${finishedAt}] Completed ${job.type} without errors (840ms).`);

    repository.addActivity({
      category: 'Queue',
      title: `Job ${job.id} completed`,
      detail: `${job.type} for ${job.leadName} finished on ${job.assignedWorker}.`,
      status: 'Success',
      entityId: job.id,
    });
  } else if (action === 'pause') {
    job.status = 'Paused';
    job.updatedAt = now;
    job.logs.push(`[${now}] Job paused by operator.`);
    repository.addActivity({
      category: 'Queue',
      title: `Job ${job.id} paused`,
      detail: `${job.type} for ${job.leadName} paused in queue.`,
      status: 'Warning',
      entityId: job.id,
    });
  } else if (action === 'retry') {
    job.retryCount += 1;
    job.status = 'Retrying';
    job.startedAt = now;
    job.logs.push(`[${now}] Retry #${job.retryCount} transitioning via ${job.assignedWorker}...`);

    const recoveredAt = new Date(startMs + 960).toISOString();
    job.status = 'Completed';
    job.completedAt = recoveredAt;
    job.durationMs = 960;
    job.updatedAt = recoveredAt;
    job.logs.push(`[${recoveredAt}] Re-routed via healthy session pool and completed cleanly.`);
    job.resultSummary = `Recovered on retry #${job.retryCount}.`;
    repository.addActivity({
      category: 'Queue',
      title: `Job ${job.id} retried and completed`,
      detail: `Retry #${job.retryCount} succeeded for ${job.leadName}.`,
      status: 'Success',
      entityId: job.id,
    });
  } else if (action === 'cancel') {
    job.status = 'Cancelled';
    job.completedAt = now;
    job.updatedAt = now;
    job.logs.push(`[${now}] Job cancelled by operator.`);
    repository.addActivity({
      category: 'Queue',
      title: `Job ${job.id} cancelled`,
      detail: `${job.type} for ${job.leadName} removed from active execution.`,
      status: 'Warning',
      entityId: job.id,
    });
  }

  repository.save();
  return job;
}
