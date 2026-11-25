import { repository } from '../db/store.ts';
import type {
  BrowserActionLog,
  BrowserExecution,
  BrowserSession,
  Lead,
} from '../types.ts';

/**
 * Playwright-compatible driver interface so an authorized real Playwright
 * runner can be plugged in later without changing API or UI contracts.
 * Currently backed strictly by SimulatedPlaywrightDriver (mock LinkedIn sandbox).
 */
export interface IBrowserAutomationDriver {
  executeOutreachSimulation(params: {
    lead: Lead;
    session: BrowserSession;
    actionType: BrowserExecution['actionType'];
    messageText?: string;
    jobId?: string;
    workerId?: string;
  }): BrowserExecution;
}

class SimulatedPlaywrightDriver implements IBrowserAutomationDriver {
  public executeOutreachSimulation(params: {
    lead: Lead;
    session: BrowserSession;
    actionType: BrowserExecution['actionType'];
    messageText?: string;
    jobId?: string;
    workerId?: string;
  }): BrowserExecution {
    const state = repository.load();
    const now = Date.now();
    const ts = (offsetMs: number) => new Date(now + offsetMs).toISOString();
    const workerId = params.workerId || params.session.assignedWorker || 'pw-worker-01';

    const logs: BrowserActionLog[] = [
      {
        timestamp: ts(0),
        step: 'Open Mock Browser',
        detail: `Launched sandboxed Chromium context (1280x800) on ${workerId} with session ${params.session.id}`,
        status: 'ok',
      },
      {
        timestamp: ts(220),
        step: 'Open Prospect Profile',
        detail: `Navigated to mock profile ${params.lead.profileUrl}`,
        status: 'ok',
      },
      {
        timestamp: ts(460),
        step: 'Inspect Profile Data',
        detail: `Verified supplied fields: ${params.lead.name} · ${params.lead.jobTitle} (${params.lead.location})`,
        status: 'ok',
      },
      {
        timestamp: ts(690),
        step: 'Review Company Data',
        detail: `Checked company context for ${params.lead.company} (${params.lead.industry})`,
        status: 'ok',
      },
    ];

    const rateBlocked =
      params.session.status === 'Rate Limited' ||
      params.session.status === 'Expired' ||
      params.session.status === 'Error' ||
      params.session.status === 'Needs Re-authentication' ||
      params.session.dailyActionCount >= params.session.dailyActionLimit;

    if (rateBlocked) {
      logs.push({
        timestamp: ts(850),
        step: 'Session Safety Guard',
        detail: `Aborted safely: Session ${params.session.id} is ${params.session.status} (${params.session.dailyActionCount}/${params.session.dailyActionLimit} daily actions).`,
        status: 'error',
      });

      const failedExec: BrowserExecution = {
        id: `EXEC-${Math.floor(9100 + Math.random() * 800)}`,
        jobId: params.jobId,
        leadId: params.lead.id,
        leadName: params.lead.name,
        leadCompany: params.lead.company,
        profileUrl: params.lead.profileUrl,
        sessionId: params.session.id,
        workerId,
        actionType: params.actionType,
        status: 'Failed',
        durationMs: 850,
        startedAt: ts(0),
        completedAt: ts(850),
        messagePreview: params.messageText,
        logs,
        environmentNote:
          'Simulated LinkedIn-style prospect sandbox (no external network automation)',
      };

      state.executions.unshift(failedExec);
      repository.bumpTodayAnalytics({ failedExecutions: 1 });
      repository.addActivity({
        category: 'Browser',
        title: `Browser simulation halted by safety guard`,
        detail: `${params.session.id} (${params.session.status}) on ${workerId} could not dispatch action for ${params.lead.name}.`,
        status: 'Error',
        entityId: failedExec.id,
      });
      repository.save();
      return failedExec;
    }

    const preview =
      params.messageText ||
      params.lead.generatedConnectionMessage ||
      `Hi ${params.lead.name.split(' ')[0]} — great connecting around ${params.lead.industry} at ${params.lead.company}.`;

    logs.push(
      {
        timestamp: ts(1020),
        step: 'Prepare Outreach Payload',
        detail: `Staged personalized text (${preview.length} chars) into mock composer`,
        status: 'ok',
      },
      {
        timestamp: ts(1420),
        step: 'Simulate Outreach Action',
        detail: `Executed ${params.actionType} inside sandbox environment`,
        status: 'ok',
      },
      {
        timestamp: ts(1720),
        step: 'Record Execution Result',
        detail: `Updated lead timeline and incremented ${params.session.id} daily count`,
        status: 'ok',
      }
    );

    params.session.dailyActionCount += 1;
    params.session.lastActive = ts(1720);
    if (params.session.status === 'Idle') {
      params.session.status = 'Active';
    }
    if (params.session.dailyActionCount >= params.session.dailyActionLimit) {
      params.session.status = 'Rate Limited';
      params.session.rateLimitStatus = 'Throttled';
    }
    params.session.logs = params.session.logs || [];
    params.session.logs.unshift(
      `[${ts(1720)}] ${workerId} executed ${params.actionType} for ${params.lead.name} (${params.session.dailyActionCount}/${params.session.dailyActionLimit}).`
    );

    if (params.actionType === 'Connection Request Simulation') {
      if (params.lead.status === 'New' || params.lead.status === 'Researched' || params.lead.status === 'Queued') {
        params.lead.status = 'Connection Sent';
      }
    }
    params.lead.updatedAt = ts(1720);
    params.lead.outreachHistory.unshift({
      id: `hist-${Date.now()}`,
      timestamp: ts(1720),
      channel:
        params.actionType === 'Follow-up Message Simulation'
          ? 'Follow-up Message'
          : 'Connection Request',
      summary: `${params.actionType} completed via ${params.session.id} (${workerId}, sandbox).`,
      status: 'Completed',
    });

    const execution: BrowserExecution = {
      id: `EXEC-${Math.floor(9100 + Math.random() * 800)}`,
      jobId: params.jobId,
      leadId: params.lead.id,
      leadName: params.lead.name,
      leadCompany: params.lead.company,
      profileUrl: params.lead.profileUrl,
      sessionId: params.session.id,
      workerId,
      actionType: params.actionType,
      status: 'Completed',
      durationMs: 1720,
      startedAt: ts(0),
      completedAt: ts(1720),
      messagePreview: preview,
      logs,
      environmentNote:
        'Simulated LinkedIn-style prospect sandbox (no external network automation)',
    };

    state.executions.unshift(execution);
    repository.bumpTodayAnalytics({
      leadsProcessed: 1,
      connectionsSent: params.actionType === 'Connection Request Simulation' ? 1 : 0,
    });
    repository.addActivity({
      category: 'Browser',
      title: `Simulated ${params.actionType} completed`,
      detail: `${params.lead.name} (${params.lead.company}) processed via ${params.session.id} on ${workerId} in 1,720ms.`,
      status: 'Success',
      entityId: execution.id,
    });
    repository.save();
    return execution;
  }
}

export const browserDriver: IBrowserAutomationDriver = new SimulatedPlaywrightDriver();
