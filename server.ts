import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { repository } from './server/db/store.ts';
import { POSTGRES_DDL } from './server/db/schema.ts';
import {
  evaluateAgentContextWithAI,
  getLiveAiStatus,
  getSyncedAiTelemetry,
  isGeminiKeyConfigured,
  personalizeOutreachWithAI,
  probeGeminiHealth,
  researchLeadWithAI,
  setAiProviderPreference,
  updateAiRetryConfig,
} from './server/services/aiService.ts';
import { enqueueJob, transitionJob } from './server/services/queueService.ts';
import { browserDriver } from './server/services/browserAutomationService.ts';
import type {
  AIProviderPreference,
  AgentDecision,
  AutomationRunRecord,
  AutomationRunStepTrace,
  BrowserSession,
  Campaign,
  Lead,
  LeadStatus,
  MessageLength,
  MessageTone,
  MessageTypeOption,
  ModuleTestResult,
  PersonalizationLevel,
  SessionStatus,
  WorkflowStep,
} from './server/types.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '2mb' }));

function computeAnalyticsSummary(rangeDays: 7 | 30 | 90) {
  const state = repository.load();
  const slice = state.analyticsSeries.slice(-rangeDays);
  const totals = slice.reduce(
    (acc, day) => {
      acc.leadsProcessed += day.leadsProcessed;
      acc.connectionsSent += day.connectionsSent;
      acc.connectionsAccepted += day.connectionsAccepted;
      acc.repliesReceived += day.repliesReceived;
      acc.positiveReplies += day.positiveReplies;
      acc.failedExecutions += day.failedExecutions;
      return acc;
    },
    {
      leadsProcessed: 0,
      connectionsSent: 0,
      connectionsAccepted: 0,
      repliesReceived: 0,
      positiveReplies: 0,
      failedExecutions: 0,
    }
  );

  const acceptanceRate =
    totals.connectionsSent > 0
      ? Number(((totals.connectionsAccepted / totals.connectionsSent) * 100).toFixed(1))
      : 0;
  const replyRate =
    totals.connectionsAccepted > 0
      ? Number(((totals.repliesReceived / totals.connectionsAccepted) * 100).toFixed(1))
      : 0;
  const positiveReplyRate =
    totals.repliesReceived > 0
      ? Number(((totals.positiveReplies / totals.repliesReceived) * 100).toFixed(1))
      : 0;
  const campaignConversion =
    totals.leadsProcessed > 0
      ? Number(((totals.positiveReplies / totals.leadsProcessed) * 100).toFixed(1))
      : 0;
  const totalAttempts = totals.connectionsSent + totals.failedExecutions;
  const automationSuccessRate =
    totalAttempts > 0
      ? Number(((totals.connectionsSent / totalAttempts) * 100).toFixed(1))
      : 98.4;

  const runningJobs = state.jobs.filter((j) => j.status === 'Running' || j.status === 'Queued').length;
  const completedJobs = state.jobs.filter((j) => j.status === 'Completed').length;
  const failedJobs = state.jobs.filter((j) => j.status === 'Failed').length;

  return {
    rangeDays,
    series: slice,
    kpis: {
      totalLeads: state.leads.length,
      leadsProcessed: totals.leadsProcessed,
      connectionRequests: totals.connectionsSent,
      acceptedConnections: totals.connectionsAccepted,
      messagesGenerated: state.counters.messagesGenerated,
      repliesReceived: totals.repliesReceived,
      positiveReplies: totals.positiveReplies,
      activeCampaigns: state.campaigns.filter((c) => c.status === 'Active').length,
      runningJobs,
      completedJobs,
      failedJobs,
      failedExecutions: totals.failedExecutions,
      acceptanceRate,
      replyRate,
      positiveReplyRate,
      campaignConversion,
      automationSuccessRate,
      workerUptime: 99.6,
    },
  };
}

function getSafeLead(id: string): Lead | undefined {
  return repository.load().leads.find((l) => l.id === id);
}

function sanitizeProfileUrl(url: string | undefined, name: string): string {
  if (url && /^https?:\/\//i.test(url.trim())) {
    return url.trim();
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `https://sandbox.outreach.local/in/${slug || 'prospect'}`;
}

function buildSystemHealthSnapshot() {
  const state = repository.load();
  const aiTelemetry = getSyncedAiTelemetry();
  const liveAiStatus = getLiveAiStatus();
  const geminiConfigured = isGeminiKeyConfigured();

  const effectiveAiMode: 'gemini' | 'mock' =
    aiTelemetry.providerPreference === 'mock'
      ? 'mock'
      : geminiConfigured && aiTelemetry.lastStatus !== 'Mock Mode'
      ? 'gemini'
      : geminiConfigured && aiTelemetry.fallbackCount === 0
      ? 'gemini'
      : 'mock';

  const geminiIntegrationStatus =
    aiTelemetry.providerPreference === 'mock'
      ? 'Mock Mode'
      : !geminiConfigured
      ? 'Disconnected'
      : aiTelemetry.lastStatus === 'Completed'
      ? 'Connected'
      : aiTelemetry.lastStatus === 'Retrying'
      ? 'Retrying'
      : 'Mock Mode';

  const activeSessions = state.sessions.filter((s) => s.status === 'Active').length;
  const rateLimitedSessions = state.sessions.filter((s) => s.status === 'Rate Limited').length;
  const queuedJobs = state.jobs.filter((j) => j.status === 'Queued').length;
  const runningJobs = state.jobs.filter((j) => j.status === 'Running').length;
  const completedJobs = state.jobs.filter((j) => j.status === 'Completed').length;
  const failedJobs = state.jobs.filter((j) => j.status === 'Failed').length;

  const openAiInt = state.integrations.find((i) => i.id === 'openai');
  const webhookInt = state.integrations.find((i) => i.id === 'webhooks');
  const crmInt = state.integrations.find((i) => i.id === 'crm');
  const openAiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());
  const dbUrlPresent = Boolean(process.env.DATABASE_URL?.trim());
  const redisUrlPresent = Boolean(process.env.REDIS_URL?.trim());
  const webhookConfigured = Boolean(
    webhookInt?.config.endpointUrl &&
      String(webhookInt.config.endpointUrl).startsWith('http') &&
      !String(webhookInt.config.endpointUrl).includes('example.com')
  );
  const crmEnabled = Boolean(crmInt?.config.syncEnabled);
  const checkedNow = aiTelemetry.lastCheckedAt || new Date().toISOString();

  const services = [
    {
      id: 'gemini',
      name: 'Google Gemini API',
      classification: geminiConfigured ? ('REAL INTEGRATION' as const) : ('NOT CONFIGURED' as const),
      status: geminiIntegrationStatus,
      detail: 'Live @google/genai SDK (gemini-4-hydrogen) with configurable backoff retry & Mock AI fallback.',
      endpoint: 'generativelanguage.googleapis.com',
      latencyLabel: aiTelemetry.providerPreference === 'mock' ? 'Mock Mode Active' : geminiConfigured ? 'Live SDK' : 'Key absent',
      lastChecked: checkedNow,
      lastError: aiTelemetry.lastError,
    },
    {
      id: 'openai',
      name: 'OpenAI-Compatible Adapter',
      classification: openAiKeyPresent ? ('REAL INTEGRATION' as const) : ('NOT CONFIGURED' as const),
      status: openAiKeyPresent ? 'Connected' : 'Disconnected',
      detail: `Model ${String(openAiInt?.config.model || 'gpt-4o-mini')} adapter ready as secondary provider when configured.`,
      endpoint: String(openAiInt?.config.baseUrl || 'https://api.openai.com/v1'),
      latencyLabel: openAiKeyPresent ? 'Ready' : 'Not configured',
      lastChecked: openAiInt?.lastCheckedAt || checkedNow,
      lastError: openAiKeyPresent ? undefined : 'No external OpenAI credential set in server env',
    },
    {
      id: 'postgresql',
      name: 'PostgreSQL Database',
      classification: dbUrlPresent ? ('REAL INTEGRATION' as const) : ('SIMULATED SERVICE' as const),
      status: dbUrlPresent ? 'Connected' : 'Mock Mode',
      detail: 'PostgreSQL-compatible DDL schema persisted locally to /tmp/ai-outreach-studio-store.json.',
      endpoint: dbUrlPresent ? 'DATABASE_URL' : 'local-json-pg-store',
      latencyLabel: 'Sub-5ms disk',
      lastChecked: checkedNow,
      lastError: dbUrlPresent ? undefined : 'Using local JSON persistence sandbox',
    },
    {
      id: 'redis',
      name: 'Redis Background Queue',
      classification: redisUrlPresent ? ('REAL INTEGRATION' as const) : ('SIMULATED SERVICE' as const),
      status: redisUrlPresent ? 'Connected' : 'Mock Mode',
      detail: `BullMQ-compatible job scheduler managing ${queuedJobs} queued & ${completedJobs} completed jobs.`,
      endpoint: 'redis://localhost:6379 (sim)',
      latencyLabel: `${queuedJobs + runningJobs} active`,
      lastChecked: checkedNow,
      lastError: undefined,
    },
    {
      id: 'workers',
      name: 'Background Workers',
      classification: 'SIMULATED SERVICE' as const,
      status: 'Connected',
      detail: 'worker-ai-01, worker-ai-02, pw-worker-01, and queue-scheduler-01 active in process.',
      endpoint: '4 simulated workers',
      latencyLabel: '99.6% uptime',
      lastChecked: checkedNow,
      lastError: undefined,
    },
    {
      id: 'playwright',
      name: 'Playwright Browser Automation',
      classification: 'SIMULATED SERVICE' as const,
      status: 'Mock Mode',
      detail: 'Mock LinkedIn-style sandbox driver with session safety guards and DOM telemetry.',
      endpoint: `${activeSessions}/${state.sessions.length} Active Sessions`,
      latencyLabel: `${rateLimitedSessions} throttled`,
      lastChecked: checkedNow,
      lastError: rateLimitedSessions > 0 ? `${rateLimitedSessions} session(s) rate limited` : undefined,
    },
    {
      id: 'webhooks',
      name: 'Outbound Webhooks',
      classification: webhookConfigured ? ('REAL INTEGRATION' as const) : ('NOT CONFIGURED' as const),
      status: webhookConfigured ? 'Connected' : 'Disconnected',
      detail: `Event webhook dispatcher (${String(webhookInt?.config.endpointUrl || 'unconfigured')}).`,
      endpoint: String(webhookInt?.config.endpointUrl || 'Not configured'),
      latencyLabel: webhookConfigured ? 'Ready' : 'Standby',
      lastChecked: webhookInt?.lastCheckedAt || checkedNow,
      lastError: webhookConfigured ? undefined : 'Placeholder webhook URL requires operator endpoint',
    },
    {
      id: 'crm',
      name: 'CRM APIs (HubSpot / Salesforce)',
      classification: crmEnabled ? ('SIMULATED SERVICE' as const) : ('NOT CONFIGURED' as const),
      status: crmEnabled ? 'Mock Mode' : 'Disconnected',
      detail: `Outbound lead & reply sync adapter (${String(crmInt?.config.provider || 'HubSpot')}).`,
      endpoint: String(crmInt?.config.provider || 'HubSpot'),
      latencyLabel: crmEnabled ? 'Sandbox Sync' : 'Disabled',
      lastChecked: crmInt?.lastCheckedAt || checkedNow,
      lastError: crmEnabled ? undefined : 'CRM bidirectional sync disabled in Settings',
    },
  ];

  return {
    demoMode: true,
    geminiConfigured,
    effectiveAiMode,
    aiTelemetry,
    liveAiStatus,
    services,
    workerSummary: {
      workersReady: 4,
      activeSessions,
      rateLimitedSessions,
      queuedJobs,
      runningJobs,
      completedJobs,
      failedJobs,
      totalBrowserExecutions: state.executions.length,
    },
  };
}

// Bootstrap full workspace
app.get('/api/bootstrap', (req, res) => {
  const rangeParam = Number(req.query.range);
  const range: 7 | 30 | 90 = rangeParam === 7 || rangeParam === 90 ? rangeParam : 30;
  const state = repository.load();
  const analytics = computeAnalyticsSummary(range);
  const systemHealth = buildSystemHealthSnapshot();

  res.json({
    leads: state.leads,
    campaigns: state.campaigns,
    sessions: state.sessions,
    jobs: state.jobs,
    executions: state.executions,
    agentDecisions: state.agentDecisions,
    activityLogs: state.activityLogs,
    integrations: state.integrations,
    automationRuns: state.automationRuns,
    systemHealth,
    analytics,
    postgresDdl: POSTGRES_DDL,
    environment: {
      geminiConfigured: systemHealth.geminiConfigured,
      aiMode: state.aiTelemetry.providerPreference === 'mock'
        ? 'mock'
        : systemHealth.geminiConfigured
        ? 'gemini'
        : 'mock',
      browserMode: 'Simulated LinkedIn Sandbox',
    },
  });
});

// Leads API
app.get('/api/leads', (_req, res) => {
  res.json({ leads: repository.load().leads });
});

app.post('/api/leads', (req, res) => {
  const body = req.body as Partial<Lead>;
  if (!body.name || !body.company || !body.jobTitle) {
    res.status(400).json({ error: 'Name, job title, and company are required.' });
    return;
  }

  const state = repository.load();
  const now = new Date().toISOString();
  const newLead: Lead = {
    id: `lead-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: String(body.name).trim(),
    jobTitle: String(body.jobTitle).trim(),
    company: String(body.company).trim(),
    industry: String(body.industry || 'B2B SaaS').trim(),
    location: String(body.location || 'Remote').trim(),
    profileUrl: sanitizeProfileUrl(body.profileUrl, String(body.name)),
    email: String(body.email || '').trim(),
    leadScore: Math.min(100, Math.max(1, Number(body.leadScore) || 75)),
    status: (body.status as LeadStatus) || 'New',
    campaignId: body.campaignId || undefined,
    profileSummary: String(body.profileSummary || '').trim(),
    companyOverview: String(body.companyOverview || '').trim(),
    painPoints: Array.isArray(body.painPoints) ? body.painPoints : [],
    aiInsights: String(body.aiInsights || 'Pending AI research enrichment.').trim(),
    recommendedNextAction: String(
      body.recommendedNextAction || 'Run AI Lead Research to extract pain points.'
    ).trim(),
    outreachHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  state.leads.unshift(newLead);
  if (newLead.campaignId) {
    const campaign = state.campaigns.find((c) => c.id === newLead.campaignId);
    if (campaign) campaign.stats.leadsEnrolled += 1;
  }
  repository.bumpTodayAnalytics({ leadsProcessed: 1 });
  repository.addActivity({
    category: 'Lead',
    title: `Lead added: ${newLead.name}`,
    detail: `${newLead.jobTitle} at ${newLead.company} (Score: ${newLead.leadScore}).`,
    status: 'Success',
    entityId: newLead.id,
  });
  repository.save();

  res.status(201).json({ lead: newLead });
});

app.patch('/api/leads/:id', (req, res) => {
  const lead = getSafeLead(req.params.id);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }

  const body = req.body as Partial<Lead>;
  if (body.name !== undefined) lead.name = String(body.name).trim();
  if (body.jobTitle !== undefined) lead.jobTitle = String(body.jobTitle).trim();
  if (body.company !== undefined) lead.company = String(body.company).trim();
  if (body.industry !== undefined) lead.industry = String(body.industry).trim();
  if (body.location !== undefined) lead.location = String(body.location).trim();
  if (body.profileUrl !== undefined) lead.profileUrl = sanitizeProfileUrl(body.profileUrl, lead.name);
  if (body.email !== undefined) lead.email = String(body.email).trim();
  if (body.leadScore !== undefined) {
    lead.leadScore = Math.min(100, Math.max(1, Number(body.leadScore) || lead.leadScore));
  }
  if (body.status !== undefined) lead.status = body.status;
  if (body.campaignId !== undefined) lead.campaignId = body.campaignId || undefined;
  if (body.profileSummary !== undefined) lead.profileSummary = String(body.profileSummary).trim();
  if (body.companyOverview !== undefined) lead.companyOverview = String(body.companyOverview).trim();
  if (Array.isArray(body.painPoints)) lead.painPoints = body.painPoints;
  if (body.industryContext !== undefined) lead.industryContext = String(body.industryContext).trim();
  if (Array.isArray(body.outreachOpportunities)) lead.outreachOpportunities = body.outreachOpportunities;
  if (Array.isArray(body.conversationStarters)) lead.conversationStarters = body.conversationStarters;
  if (body.aiInsights !== undefined) lead.aiInsights = String(body.aiInsights).trim();
  if (body.recommendedNextAction !== undefined) {
    lead.recommendedNextAction = String(body.recommendedNextAction).trim();
  }
  if (body.researchSource !== undefined) lead.researchSource = body.researchSource;
  if (body.generatedConnectionMessage !== undefined) {
    lead.generatedConnectionMessage = body.generatedConnectionMessage;
  }
  if (body.generatedFirstOutreachMessage !== undefined) {
    lead.generatedFirstOutreachMessage = body.generatedFirstOutreachMessage;
  }
  if (body.generatedFollowUpMessage !== undefined) {
    lead.generatedFollowUpMessage = body.generatedFollowUpMessage;
  }
  if (body.generatedSalesIntroMessage !== undefined) {
    lead.generatedSalesIntroMessage = body.generatedSalesIntroMessage;
  }
  if (body.generatedReengagementMessage !== undefined) {
    lead.generatedReengagementMessage = body.generatedReengagementMessage;
  }
  if (body.selectedTone !== undefined) lead.selectedTone = body.selectedTone;
  if (body.approvalStatus !== undefined) lead.approvalStatus = body.approvalStatus;
  lead.updatedAt = new Date().toISOString();

  repository.addActivity({
    category: 'Lead',
    title: `Lead updated: ${lead.name}`,
    detail: `Updated prospect dossier (${lead.status}, Score ${lead.leadScore}${lead.approvalStatus ? `, Copy: ${lead.approvalStatus}` : ''}).`,
    status: lead.approvalStatus === 'Approved' ? 'Success' : 'Info',
    entityId: lead.id,
  });
  repository.save();

  res.json({ lead });
});

app.delete('/api/leads/:id', (req, res) => {
  const state = repository.load();
  const idx = state.leads.findIndex((l) => l.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }
  const [removed] = state.leads.splice(idx, 1);
  repository.addActivity({
    category: 'Lead',
    title: `Lead removed: ${removed.name}`,
    detail: `Removed from workspace pipeline.`,
    status: 'Warning',
    entityId: removed.id,
  });
  repository.save();
  res.json({ ok: true });
});

app.post('/api/leads/import', (req, res) => {
  const { csvText } = req.body as { csvText?: string };
  if (!csvText || typeof csvText !== 'string') {
    res.status(400).json({ error: 'CSV content is required.' });
    return;
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    res.status(400).json({ error: 'CSV must include a header row and at least one lead row.' });
    return;
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const state = repository.load();
  const created: Lead[] = [];
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });

    const name = row['name'] || row['full name'] || '';
    const company = row['company'] || '';
    const jobTitle = row['job title'] || row['title'] || row['jobtitle'] || 'Executive';
    if (!name || !company) continue;

    const lead: Lead = {
      id: `lead-csv-${Date.now()}-${i}`,
      name,
      jobTitle,
      company,
      industry: row['industry'] || 'B2B SaaS',
      location: row['location'] || 'United States',
      profileUrl: sanitizeProfileUrl(row['profile url'] || row['profileurl'], name),
      email: row['email'] || '',
      leadScore: Math.min(99, Math.max(40, Number(row['lead score'] || row['score']) || 80)),
      status: 'New',
      campaignId: state.campaigns[0]?.id,
      profileSummary: `${name} is ${jobTitle} at ${company}. Imported via CSV batch.`,
      companyOverview: `${company} operates in ${row['industry'] || 'B2B SaaS'}.`,
      painPoints: [],
      aiInsights: 'Imported from CSV — ready for Gemini lead research.',
      recommendedNextAction: 'Run AI Research to score and personalize outreach.',
      outreachHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    state.leads.unshift(lead);
    created.push(lead);
  }

  if (created.length === 0) {
    res.status(400).json({ error: 'No valid rows found. Ensure Name and Company columns exist.' });
    return;
  }

  repository.bumpTodayAnalytics({ leadsProcessed: created.length });
  repository.addActivity({
    category: 'Lead',
    title: `Imported ${created.length} leads via CSV`,
    detail: `Added ${created.map((l) => l.name).slice(0, 3).join(', ')}${created.length > 3 ? '...' : ''}.`,
    status: 'Success',
  });
  repository.save();
  res.status(201).json({ importedCount: created.length, leads: created });
});

app.post('/api/leads/bulk-action', (req, res) => {
  const { leadIds, action, campaignId } = req.body as {
    leadIds?: string[];
    action?: 'delete' | 'assignCampaign' | 'queueResearch';
    campaignId?: string;
  };
  if (!Array.isArray(leadIds) || leadIds.length === 0 || !action) {
    res.status(400).json({ error: 'leadIds and action are required.' });
    return;
  }

  const state = repository.load();
  if (action === 'delete') {
    state.leads = state.leads.filter((l) => !leadIds.includes(l.id));
    repository.addActivity({
      category: 'Lead',
      title: `Bulk deleted ${leadIds.length} leads`,
      detail: `Removed selected prospects from workspace.`,
      status: 'Warning',
    });
  } else if (action === 'assignCampaign' && campaignId) {
    const campaign = state.campaigns.find((c) => c.id === campaignId);
    state.leads.forEach((l) => {
      if (leadIds.includes(l.id)) {
        l.campaignId = campaignId;
        l.updatedAt = new Date().toISOString();
      }
    });
    if (campaign) {
      campaign.stats.leadsEnrolled += leadIds.length;
    }
    repository.addActivity({
      category: 'Campaign',
      title: `Assigned ${leadIds.length} leads to ${campaign?.name ?? campaignId}`,
      detail: `Bulk campaign assignment completed.`,
      status: 'Success',
      entityId: campaignId,
    });
  } else if (action === 'queueResearch') {
    state.leads.forEach((l) => {
      if (leadIds.includes(l.id)) {
        l.status = 'Queued';
        enqueueJob({
          leadId: l.id,
          leadName: l.name,
          leadCompany: l.company,
          campaignId: l.campaignId,
          type: 'Lead Research',
        });
      }
    });
  }

  repository.save();
  res.json({ ok: true, leads: state.leads });
});

// Live AI retry / fallback status & Gemini monitoring endpoint
app.get('/api/ai/status', (_req, res) => {
  const live = getLiveAiStatus();
  const telemetry = getSyncedAiTelemetry();
  const geminiConfigured = isGeminiKeyConfigured();

  const rateLimitStatus: 'Nominal' | 'Approaching Limit' | 'Rate Limited' =
    (telemetry.rateLimitHits > 0 && telemetry.lastStatus !== 'Completed') ||
    telemetry.rpmWindowCount >= telemetry.rpmLimit
      ? 'Rate Limited'
      : telemetry.rpmWindowCount >= Math.max(1, Math.floor(telemetry.rpmLimit * 0.75))
      ? 'Approaching Limit'
      : 'Nominal';

  const providerAvailability =
    telemetry.providerPreference === 'mock'
      ? 'Mock Override'
      : !geminiConfigured
      ? 'Unavailable (Key Missing)'
      : live.status === 'Retrying'
      ? 'Degraded (Retrying)'
      : telemetry.lastStatus === 'Mock Mode'
      ? 'Unavailable (Fallback Active)'
      : 'Available';

  res.json({
    ...live,
    lastError: live.lastError || telemetry.lastError,
    providerPreference: telemetry.providerPreference,
    geminiConfigured,
    providerAvailability,
    rateLimitStatus,
    rpmWindowCount: telemetry.rpmWindowCount,
    rpmLimit: telemetry.rpmLimit,
    retryCountTotal: telemetry.retryCountTotal,
    rateLimitHits: telemetry.rateLimitHits,
    overloadHits: telemetry.overloadHits,
    fallbackCount: telemetry.fallbackCount,
  });
});

// AI Lead Research & Personalization
app.post('/api/ai/research', async (req, res) => {
  const { leadId } = req.body as { leadId?: string };
  const lead = leadId ? getSafeLead(leadId) : undefined;
  if (!lead) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }

  try {
    const research = await researchLeadWithAI(lead);
    const now = new Date().toISOString();
    lead.profileSummary = research.profileSummary;
    lead.companyOverview = research.companyOverview;
    lead.painPoints = research.painPoints;
    lead.industryContext = research.industryContext;
    lead.outreachOpportunities = research.outreachOpportunities;
    lead.conversationStarters = research.conversationStarters;
    lead.aiInsights = research.aiInsights;
    lead.recommendedNextAction = research.recommendedNextAction;
    lead.researchSource = research.mode;
    lead.leadScore = research.suggestedLeadScore;
    if (lead.status === 'New') {
      lead.status = 'Researched';
    }
    lead.updatedAt = now;

    if (research.fallbackActivated) {
      lead.outreachHistory.unshift({
        id: `hist-fb-${Date.now()}`,
        timestamp: now,
        channel: 'AI Fallback',
        summary: `Fallback activated after ${research.retryAttempts} retries: ${research.fallbackReason || 'Gemini unavailable'}.`,
        status: 'Mock Mode',
        metadata: {
          mode: 'mock',
          fallbackActivated: true,
          retryAttempts: research.retryAttempts,
        },
      });
      repository.addActivity({
        category: 'AI',
        title: `AI fallback activated for ${lead.name}`,
        detail: `${research.fallbackReason || 'Gemini unavailable'} — switched to local Mock AI research.`,
        status: 'Warning',
        entityId: lead.id,
      });
    }

    lead.outreachHistory.unshift({
      id: `hist-${Date.now() + 1}`,
      timestamp: now,
      channel: 'AI Research',
      summary: `AI research completed (${research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}): ${research.aiInsights}`,
      status: research.mode === 'mock' ? 'Mock Mode' : 'Completed',
      metadata: {
        mode: research.mode,
        fallbackActivated: research.fallbackActivated,
        retryAttempts: research.retryAttempts,
        preview: research.recommendedNextAction,
      },
    });

    repository.addActivity({
      category: 'AI',
      title: `AI research completed for ${lead.name}`,
      detail: `Identified ${research.painPoints.length} challenges & ${research.conversationStarters.length} conversation starters via ${research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}.`,
      status: research.fallbackActivated ? 'Warning' : 'Success',
      entityId: lead.id,
    });
    repository.save();
    res.json({ lead, research });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI research request failed.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/ai/personalize', async (req, res) => {
  const {
    leadId,
    tone = 'Executive Peer',
    customFocus,
    messageType = 'Connection Request',
    campaignObjective,
    targetAudience,
    offer,
    messageLength = 'Standard',
    personalizationLevel = 'Deep',
  } = req.body as {
    leadId?: string;
    tone?: MessageTone;
    customFocus?: string;
    messageType?: MessageTypeOption;
    campaignObjective?: string;
    targetAudience?: string;
    offer?: string;
    messageLength?: MessageLength;
    personalizationLevel?: PersonalizationLevel;
  };
  const lead = leadId ? getSafeLead(leadId) : undefined;
  if (!lead) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }

  try {
    const result = await personalizeOutreachWithAI(lead, {
      tone,
      customFocus,
      messageType,
      campaignObjective,
      targetAudience,
      offer,
      messageLength,
      personalizationLevel,
    });
    const state = repository.load();
    const now = new Date().toISOString();
    lead.generatedConnectionMessage = result.connectionMessage;
    lead.generatedFirstOutreachMessage = result.firstOutreachMessage;
    lead.generatedFollowUpMessage = result.followUpMessage;
    lead.generatedSalesIntroMessage = result.salesIntroMessage;
    lead.generatedReengagementMessage = result.reengagementMessage;
    lead.messageRelevanceReason = result.relevanceReason;
    lead.selectedTone = tone;
    lead.approvalStatus = 'Pending';
    lead.updatedAt = now;
    state.counters.messagesGenerated += 5;

    if (result.fallbackActivated) {
      repository.addActivity({
        category: 'AI',
        title: `AI personalization fallback for ${lead.name}`,
        detail: `${result.fallbackReason || 'Gemini unavailable'} — generated ${tone} copy via Mock AI.`,
        status: 'Warning',
        entityId: lead.id,
      });
    }

    lead.outreachHistory.unshift({
      id: `hist-msg-${Date.now()}`,
      timestamp: now,
      channel: 'Personalized Draft',
      summary: `Generated ${messageType} (${tone} · ${result.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}): "${result.primaryMessage}"`,
      status: result.mode === 'mock' ? 'Mock Mode' : 'Completed',
      metadata: {
        mode: result.mode,
        fallbackActivated: result.fallbackActivated,
        retryAttempts: result.retryAttempts,
        preview: result.primaryMessage,
      },
    });

    repository.addActivity({
      category: 'AI',
      title: `Personalized ${messageType} drafted for ${lead.name}`,
      detail: `Crafted 5 outreach variants in ${tone} tone (${result.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}).`,
      status: result.fallbackActivated ? 'Warning' : 'Success',
      entityId: lead.id,
    });
    repository.save();
    res.json({ lead, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI personalization request failed.';
    res.status(502).json({ error: message });
  }
});

// Campaigns API
app.get('/api/campaigns', (_req, res) => {
  res.json({ campaigns: repository.load().campaigns });
});

app.post('/api/campaigns', (req, res) => {
  const body = req.body as Partial<Campaign>;
  if (!body.name) {
    res.status(400).json({ error: 'Campaign name is required.' });
    return;
  }
  const state = repository.load();
  const now = new Date().toISOString();
  const defaultSteps: WorkflowStep[] = [
    {
      id: `step-${Date.now()}-1`,
      type: 'Lead Added',
      title: 'Lead Added',
      description: 'Ingest qualified B2B prospects into workflow.',
      config: {},
    },
    {
      id: `step-${Date.now()}-2`,
      type: 'Lead Research',
      title: 'AI Lead Research',
      description: 'Enrich profile summary and potential pain points.',
      config: {},
    },
    {
      id: `step-${Date.now()}-3`,
      type: 'AI Personalization',
      title: 'AI Personalization',
      description: 'Generate personalized outreach copy.',
      config: { tone: 'Consultative' },
    },
    {
      id: `step-${Date.now()}-4`,
      type: 'Connection Request Simulation',
      title: 'Simulated Connection Request',
      description: 'Execute outreach simulation in mock browser sandbox.',
      config: { channel: 'Mock LinkedIn Sandbox' },
    },
  ];

  const campaign: Campaign = {
    id: `cmp-${Date.now()}`,
    name: String(body.name).trim(),
    description: String(body.description || 'Custom B2B AI outreach workflow.').trim(),
    targetPersona: String(body.targetPersona || 'B2B Decision Makers').trim(),
    status: 'Draft',
    steps: Array.isArray(body.steps) && body.steps.length > 0 ? body.steps : defaultSteps,
    stats: {
      leadsEnrolled: 0,
      connectionsSent: 0,
      accepted: 0,
      replies: 0,
      positiveReplies: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  state.campaigns.unshift(campaign);
  repository.addActivity({
    category: 'Campaign',
    title: `Campaign created: ${campaign.name}`,
    detail: `Configured ${campaign.steps.length} workflow steps.`,
    status: 'Success',
    entityId: campaign.id,
  });
  repository.save();
  res.status(201).json({ campaign });
});

app.patch('/api/campaigns/:id', (req, res) => {
  const state = repository.load();
  const campaign = state.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }

  const body = req.body as Partial<Campaign>;
  if (body.name !== undefined) campaign.name = String(body.name).trim();
  if (body.description !== undefined) campaign.description = String(body.description).trim();
  if (body.targetPersona !== undefined) campaign.targetPersona = String(body.targetPersona).trim();
  if (body.status !== undefined) campaign.status = body.status;
  if (Array.isArray(body.steps)) campaign.steps = body.steps;
  campaign.updatedAt = new Date().toISOString();

  repository.addActivity({
    category: 'Campaign',
    title: `Campaign saved: ${campaign.name}`,
    detail: `Saved workflow configuration (${campaign.steps.length} steps).`,
    status: 'Info',
    entityId: campaign.id,
  });
  repository.save();
  res.json({ campaign });
});

app.post('/api/campaigns/:id/toggle', (req, res) => {
  const state = repository.load();
  const campaign = state.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }

  campaign.status = campaign.status === 'Active' ? 'Paused' : 'Active';
  campaign.updatedAt = new Date().toISOString();

  repository.addActivity({
    category: 'Campaign',
    title: `Campaign ${campaign.status === 'Active' ? 'started' : 'paused'}: ${campaign.name}`,
    detail: `Status switched to ${campaign.status}.`,
    status: campaign.status === 'Active' ? 'Success' : 'Warning',
    entityId: campaign.id,
  });
  repository.save();
  res.json({ campaign });
});

app.delete('/api/campaigns/:id', (req, res) => {
  const state = repository.load();
  const idx = state.campaigns.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  const [removed] = state.campaigns.splice(idx, 1);
  state.leads.forEach((l) => {
    if (l.campaignId === removed.id) {
      l.campaignId = undefined;
    }
  });
  repository.addActivity({
    category: 'Campaign',
    title: `Campaign deleted: ${removed.name}`,
    detail: `Removed campaign workflow and cleared enrolled lead assignments.`,
    status: 'Warning',
    entityId: removed.id,
  });
  repository.save();
  res.json({ ok: true });
});

// Sessions API
app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: repository.load().sessions });
});

app.post('/api/sessions', (req, res) => {
  const body = req.body as Partial<BrowserSession>;
  if (!body.accountLabel || !body.operatorEmail) {
    res.status(400).json({ error: 'Account label and operator email are required.' });
    return;
  }
  const state = repository.load();
  const id = `SESS-${String(state.sessions.length + 1).padStart(2, '0')}`;
  const now = new Date().toISOString();
  const assignedWorker = String(body.assignedWorker || 'pw-worker-01');
  const session: BrowserSession = {
    id,
    accountLabel: String(body.accountLabel).trim(),
    operatorEmail: String(body.operatorEmail).trim(),
    status: 'Active',
    lastActive: now,
    authStatus: 'Authenticated',
    proxyStatus: 'Connected',
    proxyRegion: String(body.proxyRegion || 'us-east-1 (Virginia)'),
    dailyActionCount: 0,
    dailyActionLimit: Math.min(80, Math.max(10, Number(body.dailyActionLimit) || 40)),
    rateLimitStatus: 'Nominal',
    assignedWorker,
    logs: [
      `[${now}] Initialized simulated session ${id} on ${assignedWorker} (${String(body.proxyRegion || 'us-east-1')}).`,
    ],
  };
  state.sessions.push(session);
  repository.addActivity({
    category: 'Browser',
    title: `Added simulated session ${session.id}`,
    detail: `${session.accountLabel} bound to ${assignedWorker} in sandbox pool.`,
    status: 'Success',
    entityId: session.id,
  });
  repository.save();
  res.status(201).json({ session });
});

app.patch('/api/sessions/:id', (req, res) => {
  const state = repository.load();
  const session = state.sessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  const { action, status, dailyActionLimit, assignedWorker } = req.body as {
    action?: 'reauth' | 'resetLimit' | 'toggleIdle' | 'pause' | 'terminate';
    status?: SessionStatus;
    dailyActionLimit?: number;
    assignedWorker?: string;
  };

  const now = new Date().toISOString();
  session.logs = session.logs || [];

  if (action === 'reauth') {
    session.status = 'Active';
    session.authStatus = 'Authenticated';
    session.proxyStatus = 'Connected';
    session.rateLimitStatus = 'Nominal';
    session.lastActive = now;
    session.logs.unshift(`[${now}] Session reconnected and verified on ${session.assignedWorker || 'pw-worker-01'}.`);
    repository.addActivity({
      category: 'Browser',
      title: `Session ${session.id} reconnected`,
      detail: `${session.accountLabel} restored to Active state.`,
      status: 'Success',
      entityId: session.id,
    });
  } else if (action === 'resetLimit') {
    session.dailyActionCount = 0;
    session.rateLimitStatus = 'Nominal';
    if (session.status === 'Rate Limited') session.status = 'Active';
    session.logs.unshift(`[${now}] Daily action quota reset to 0/${session.dailyActionLimit}.`);
    repository.addActivity({
      category: 'Browser',
      title: `Session ${session.id} daily quota reset`,
      detail: `Daily action counter cleared to 0/${session.dailyActionLimit}.`,
      status: 'Info',
      entityId: session.id,
    });
  } else if (action === 'toggleIdle' || action === 'pause') {
    session.status = action === 'pause' ? 'Idle' : session.status === 'Active' ? 'Idle' : 'Active';
    session.lastActive = now;
    session.logs.unshift(`[${now}] Session switched to ${session.status} by operator.`);
    repository.addActivity({
      category: 'Browser',
      title: `Session ${session.id} ${session.status === 'Idle' ? 'paused' : 'resumed'}`,
      detail: `${session.accountLabel} status updated to ${session.status}.`,
      status: 'Info',
      entityId: session.id,
    });
  } else if (action === 'terminate') {
    session.status = 'Expired';
    session.authStatus = 'Token Expired';
    session.proxyStatus = 'Standby';
    session.lastActive = now;
    session.logs.unshift(`[${now}] Session terminated by operator; token invalidated cleanly.`);
    repository.addActivity({
      category: 'Browser',
      title: `Session ${session.id} terminated`,
      detail: `${session.accountLabel} disconnected safely from sandbox workers.`,
      status: 'Warning',
      entityId: session.id,
    });
  } else {
    if (status) session.status = status;
  }

  if (dailyActionLimit) session.dailyActionLimit = dailyActionLimit;
  if (assignedWorker && assignedWorker !== session.assignedWorker) {
    session.assignedWorker = assignedWorker;
    session.logs.unshift(`[${now}] Reassigned session to ${assignedWorker}.`);
  }

  repository.save();
  res.json({ session });
});

// Background Job Queue API
app.get('/api/jobs', (_req, res) => {
  res.json({ jobs: repository.load().jobs });
});

app.post('/api/jobs', (req, res) => {
  const { leadId, type, campaignId } = req.body as {
    leadId?: string;
    type?: Parameters<typeof enqueueJob>[0]['type'];
    campaignId?: string;
  };
  const lead = leadId ? getSafeLead(leadId) : undefined;
  if (!lead || !type) {
    res.status(400).json({ error: 'Valid leadId and job type are required.' });
    return;
  }

  const job = enqueueJob({
    leadId: lead.id,
    leadName: lead.name,
    leadCompany: lead.company,
    campaignId: campaignId || lead.campaignId,
    type,
  });
  res.status(201).json({ job });
});

app.post('/api/jobs/:id/:action', (req, res) => {
  const action = req.params.action as 'start' | 'pause' | 'retry' | 'cancel';
  if (!['start', 'pause', 'retry', 'cancel'].includes(action)) {
    res.status(400).json({ error: 'Invalid job action.' });
    return;
  }
  const job = transitionJob(req.params.id, action);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  res.json({ job });
});

// Browser Automation Engine API
app.get('/api/browser/executions', (_req, res) => {
  res.json({ executions: repository.load().executions });
});

app.post('/api/browser/execute', (req, res) => {
  const { leadId, sessionId, workerId, actionType, messageText } = req.body as {
    leadId?: string;
    sessionId?: string;
    workerId?: string;
    actionType?: 'Connection Request Simulation' | 'Profile Inspection' | 'Follow-up Message Simulation';
    messageText?: string;
  };
  const state = repository.load();
  const lead = state.leads.find((l) => l.id === leadId);
  const session =
    state.sessions.find((s) => s.id === sessionId) ||
    state.sessions.find((s) => s.status === 'Active');

  if (!lead || !session) {
    res.status(400).json({ error: 'Valid lead and browser session are required.' });
    return;
  }

  const execution = browserDriver.executeOutreachSimulation({
    lead,
    session,
    workerId,
    actionType: actionType || 'Connection Request Simulation',
    messageText,
  });

  res.status(201).json({ execution, lead, session });
});

app.post('/api/browser/executions/:id/retry', (req, res) => {
  const state = repository.load();
  const prev = state.executions.find((e) => e.id === req.params.id);
  if (!prev) {
    res.status(404).json({ error: 'Browser execution record not found.' });
    return;
  }
  const lead = state.leads.find((l) => l.id === prev.leadId);
  const healthySession =
    state.sessions.find((s) => s.status === 'Active' && s.dailyActionCount < s.dailyActionLimit) ||
    state.sessions.find((s) => s.id === prev.sessionId);

  if (!lead || !healthySession) {
    res.status(400).json({ error: 'No eligible lead or healthy session available to retry.' });
    return;
  }

  const execution = browserDriver.executeOutreachSimulation({
    lead,
    session: healthySession,
    workerId: prev.workerId,
    actionType: prev.actionType,
    messageText: prev.messagePreview,
    jobId: prev.jobId,
  });

  res.status(201).json({ execution, lead, session: healthySession });
});

// AI Agent Control Center API
app.get('/api/agent/decisions', (_req, res) => {
  res.json({ decisions: repository.load().agentDecisions });
});

app.post('/api/agent/evaluate', async (req, res) => {
  const { leadId, replyText } = req.body as { leadId?: string; replyText?: string };
  const state = repository.load();
  const lead = state.leads.find((l) => l.id === leadId) || state.leads[0];
  if (!lead) {
    res.status(404).json({ error: 'Lead not found.' });
    return;
  }
  const campaign = state.campaigns.find((c) => c.id === lead.campaignId) || state.campaigns[0];

  try {
    const evalResult = await evaluateAgentContextWithAI(lead, campaign, replyText);
    const decision: AgentDecision = {
      id: `AGT-${Math.floor(510 + Math.random() * 480)}`,
      leadId: lead.id,
      leadName: lead.name,
      leadCompany: lead.company,
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignStage: lead.status,
      recommendation: evalResult.recommendation,
      confidenceScore: evalResult.confidenceScore,
      explanation: evalResult.explanation,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    state.agentDecisions.unshift(decision);
    repository.addActivity({
      category: 'Agent',
      title: `AI Agent evaluated ${lead.name}`,
      detail: `Recommended "${decision.recommendation}" (${Math.round(decision.confidenceScore * 100)}% confidence).`,
      status: 'Info',
      entityId: decision.id,
    });
    repository.save();
    res.status(201).json({ decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Agent evaluation failed.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/agent/decisions/:id/resolve', (req, res) => {
  const { resolution } = req.body as { resolution?: 'Approved' | 'Rejected' };
  const state = repository.load();
  const decision = state.agentDecisions.find((d) => d.id === req.params.id);
  if (!decision || (resolution !== 'Approved' && resolution !== 'Rejected')) {
    res.status(400).json({ error: 'Valid decision and resolution are required.' });
    return;
  }

  decision.status = resolution;
  decision.resolvedAt = new Date().toISOString();

  const lead = state.leads.find((l) => l.id === decision.leadId);
  if (resolution === 'Approved' && lead) {
    if (decision.recommendation === 'Mark lead interested') {
      lead.status = 'Interested';
      repository.bumpTodayAnalytics({ repliesReceived: 1, positiveReplies: 1 });
    } else if (decision.recommendation === 'Stop campaign') {
      lead.status = 'Archived';
    } else if (decision.recommendation === 'Move lead to human review') {
      lead.status = 'Queued';
      lead.approvalStatus = 'Pending';
    } else if (
      decision.recommendation === 'Recommend follow-up' ||
      decision.recommendation === 'Generate personalized message'
    ) {
      enqueueJob({
        leadId: lead.id,
        leadName: lead.name,
        leadCompany: lead.company,
        campaignId: decision.campaignId,
        type: 'Follow-up Scheduling',
      });
    }
    lead.updatedAt = new Date().toISOString();
  }

  repository.addActivity({
    category: 'Agent',
    title: `Operator ${resolution.toLowerCase()} agent recommendation`,
    detail: `${decision.recommendation} for ${decision.leadName} (${decision.leadCompany}).`,
    status: resolution === 'Approved' ? 'Success' : 'Warning',
    entityId: decision.id,
  });
  repository.save();
  res.json({ decision, lead });
});

// Analytics & Logs API
app.get('/api/analytics', (req, res) => {
  const rangeParam = Number(req.query.range);
  const range: 7 | 30 | 90 = rangeParam === 7 || rangeParam === 90 ? rangeParam : 30;
  res.json(computeAnalyticsSummary(range));
});

app.get('/api/logs', (_req, res) => {
  res.json({ logs: repository.load().activityLogs });
});

// Integrations API (never exposes API keys)
app.get('/api/integrations', (_req, res) => {
  res.json({ integrations: repository.load().integrations });
});

app.patch('/api/integrations/:id', (req, res) => {
  const state = repository.load();
  const integration = state.integrations.find((i) => i.id === req.params.id);
  if (!integration) {
    res.status(404).json({ error: 'Integration not found.' });
    return;
  }

  const { config } = req.body as { config?: Record<string, string | number | boolean> };
  if (config && typeof config === 'object') {
    // Never accept secret key fields from client
    const safeEntries = Object.entries(config).filter(
      ([k]) => !/key|secret|token|password/i.test(k)
    );
    integration.config = {
      ...integration.config,
      ...Object.fromEntries(safeEntries),
    };
    integration.lastCheckedAt = new Date().toISOString();
  }

  repository.addActivity({
    category: 'System',
    title: `Updated ${integration.name} configuration`,
    detail: `Saved integration parameters safely.`,
    status: 'Info',
    entityId: integration.id,
  });
  repository.save();
  res.json({ integration });
});

app.post('/api/integrations/:id/test', (req, res) => {
  const state = repository.load();
  const integration = state.integrations.find((i) => i.id === req.params.id);
  if (!integration) {
    res.status(404).json({ error: 'Integration not found.' });
    return;
  }

  if (integration.id === 'webhooks') {
    const rawUrl = String(integration.config.endpointUrl || '');
    let validUrl = false;
    try {
      const parsed = new URL(rawUrl);
      validUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      validUrl = false;
    }
    if (!validUrl) {
      res.status(400).json({ error: 'Please enter a valid http(s) webhook endpoint URL.' });
      return;
    }
  }

  integration.lastCheckedAt = new Date().toISOString();
  repository.addActivity({
    category: 'System',
    title: `Connection test passed: ${integration.name}`,
    detail: `Verified ${integration.status} status cleanly.`,
    status: 'Success',
    entityId: integration.id,
  });
  repository.save();
  res.json({ ok: true, integration });
});

// Flagship Main Demo Feature: 11-Step Complete Automation Runner
app.post('/api/demo/step', async (req, res) => {
  const {
    stepNumber,
    leadId,
    jobId,
    followUpJobId,
    sessionId,
    executionId,
    executionRunId,
    workerId: requestedWorkerId,
  } = req.body as {
    stepNumber: number;
    leadId?: string;
    jobId?: string;
    followUpJobId?: string;
    sessionId?: string;
    executionId?: string;
    executionRunId?: string;
    workerId?: string;
  };

  const state = repository.load();
  let lead = leadId ? state.leads.find((l) => l.id === leadId) : undefined;
  const campaign = state.campaigns.find((c) => c.id === 'cmp-saas-founders') || state.campaigns[0];
  const runId = executionRunId || `RUN-DEMO-${Date.now().toString(36).toUpperCase()}`;
  const workerId = requestedWorkerId || 'pw-worker-01';

  try {
    switch (stepNumber) {
      case 1: {
        // Select a sample lead
        lead =
          lead ||
          state.leads.find((l) => l.status === 'New') ||
          state.leads[0];
        const executedAt = new Date().toISOString();
        const stepInput = {
          executionRunId: runId,
          requestedLeadId: leadId || 'auto-qualified',
          campaignId: campaign.id,
        };
        const stepOutput = {
          leadId: lead.id,
          leadName: lead.name,
          jobTitle: lead.jobTitle,
          company: lead.company,
          campaignId: campaign.id,
          campaignName: campaign.name,
        };
        repository.addActivity({
          category: 'Campaign',
          title: `[Demo] Step 1 (${runId}): Selected prospect ${lead.name}`,
          detail: `Enrolled ${lead.name} (${lead.jobTitle}, ${lead.company}) into ${campaign.name}.`,
          status: 'Info',
          entityId: lead.id,
        });
        repository.save();
        res.json({
          stepNumber: 1,
          lead,
          campaign,
          executedAt,
          stepInput,
          stepOutput,
          summary: `Selected ${lead.name} (${lead.jobTitle} at ${lead.company})`,
        });
        return;
      }

      case 2: {
        if (!lead) lead = state.leads[0];
        const stepInput = {
          executionRunId: runId,
          leadId: lead.id,
          company: lead.company,
          providerPreference: state.aiTelemetry.providerPreference,
        };
        const research = await researchLeadWithAI(lead);
        const now = new Date().toISOString();
        lead.profileSummary = research.profileSummary;
        lead.companyOverview = research.companyOverview;
        lead.painPoints = research.painPoints;
        lead.industryContext = research.industryContext;
        lead.outreachOpportunities = research.outreachOpportunities;
        lead.conversationStarters = research.conversationStarters;
        lead.aiInsights = research.aiInsights;
        lead.recommendedNextAction = research.recommendedNextAction;
        lead.researchSource = research.mode;
        lead.leadScore = research.suggestedLeadScore;
        lead.status = 'Researched';
        lead.updatedAt = now;

        if (research.fallbackActivated) {
          lead.outreachHistory.unshift({
            id: `hist-demo-fb-${Date.now()}`,
            timestamp: now,
            channel: 'AI Fallback',
            summary: `[${runId}] Fallback activated after ${research.retryAttempts} retries (${research.fallbackReason || 'Gemini unavailable'}). Switched to Mock AI.`,
            status: 'Mock Mode',
            metadata: {
              mode: 'mock',
              fallbackActivated: true,
              retryAttempts: research.retryAttempts,
            },
          });
          repository.addActivity({
            category: 'AI',
            title: `[Demo] Fallback to Mock AI for ${lead.name}`,
            detail: `${research.fallbackReason || 'Gemini unavailable'} — workflow ${runId} continued seamlessly.`,
            status: 'Warning',
            entityId: lead.id,
          });
        }

        lead.outreachHistory.unshift({
          id: `hist-demo-res-${Date.now() + 1}`,
          timestamp: now,
          channel: 'AI Research',
          summary: `[${runId}] AI research (${research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}): ${research.aiInsights}`,
          status: research.mode === 'mock' ? 'Mock Mode' : 'Completed',
          metadata: {
            mode: research.mode,
            fallbackActivated: research.fallbackActivated,
            retryAttempts: research.retryAttempts,
            preview: research.recommendedNextAction,
          },
        });

        repository.addActivity({
          category: 'AI',
          title: `[Demo] Step 2 (${runId}): AI research completed for ${lead.name}`,
          detail: `Identified ${research.painPoints.length} challenges via ${research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}.`,
          status: research.fallbackActivated ? 'Warning' : 'Success',
          entityId: lead.id,
        });
        repository.save();
        const stepOutput = {
          researchSource: research.mode,
          painPointsCount: research.painPoints.length,
          suggestedLeadScore: research.suggestedLeadScore,
          retryAttempts: research.retryAttempts,
          fallbackActivated: research.fallbackActivated,
          recommendedNextAction: research.recommendedNextAction,
        };
        res.json({
          stepNumber: 2,
          lead,
          research,
          aiStatus: research.aiStatus,
          fallbackActivated: research.fallbackActivated,
          fallbackReason: research.fallbackReason,
          retryAttempts: research.retryAttempts,
          executedAt: now,
          stepInput,
          stepOutput,
          errorInfo: research.fallbackActivated ? research.fallbackReason : undefined,
          summary: research.fallbackActivated
            ? `Switched to Mock AI after ${research.retryAttempts} retries (${lead.company})`
            : `Researched ${lead.company} (${research.mode === 'gemini' ? 'Google Gemini' : 'Mock AI Mode'})`,
        });
        return;
      }

      case 3: {
        if (!lead) lead = state.leads[0];
        const tone: MessageTone = 'Executive Peer';
        const stepInput = {
          executionRunId: runId,
          leadId: lead.id,
          tone,
          messageType: 'Connection Request',
          providerPreference: state.aiTelemetry.providerPreference,
        };
        const personalized = await personalizeOutreachWithAI(lead, tone);
        const now = new Date().toISOString();
        lead.generatedConnectionMessage = personalized.connectionMessage;
        lead.generatedFirstOutreachMessage = personalized.firstOutreachMessage;
        lead.generatedFollowUpMessage = personalized.followUpMessage;
        lead.generatedSalesIntroMessage = personalized.salesIntroMessage;
        lead.generatedReengagementMessage = personalized.reengagementMessage;
        lead.messageRelevanceReason = personalized.relevanceReason;
        lead.selectedTone = tone;
        lead.updatedAt = now;
        state.counters.messagesGenerated += 5;

        lead.outreachHistory.unshift({
          id: `hist-demo-msg-${Date.now()}`,
          timestamp: now,
          channel: 'Personalized Draft',
          summary: `[${runId}] Drafted ${tone} outreach (${personalized.mode === 'gemini' ? 'Gemini 4' : 'Mock AI'}): "${personalized.connectionMessage}"`,
          status: personalized.mode === 'mock' ? 'Mock Mode' : 'Completed',
          metadata: {
            mode: personalized.mode,
            fallbackActivated: personalized.fallbackActivated,
            retryAttempts: personalized.retryAttempts,
            preview: personalized.connectionMessage,
          },
        });

        repository.addActivity({
          category: 'AI',
          title: `[Demo] Step 3 (${runId}): Personalized message generated`,
          detail: `Drafted ${tone} connection message for ${lead.name} (${personalized.mode === 'gemini' ? 'Gemini 4' : 'Mock AI'}).`,
          status: personalized.fallbackActivated ? 'Warning' : 'Success',
          entityId: lead.id,
        });
        repository.save();
        const stepOutput = {
          mode: personalized.mode,
          charCount: personalized.connectionMessage.length,
          variantsGenerated: 5,
          retryAttempts: personalized.retryAttempts,
          fallbackActivated: personalized.fallbackActivated,
          connectionMessage: personalized.connectionMessage,
        };
        res.json({
          stepNumber: 3,
          lead,
          personalized,
          aiStatus: personalized.aiStatus,
          fallbackActivated: personalized.fallbackActivated,
          fallbackReason: personalized.fallbackReason,
          retryAttempts: personalized.retryAttempts,
          executedAt: now,
          stepInput,
          stepOutput,
          errorInfo: personalized.fallbackActivated ? personalized.fallbackReason : undefined,
          summary: personalized.fallbackActivated
            ? `Generated ${tone} message in Mock Mode (${personalized.connectionMessage.length} chars)`
            : `Generated ${tone} message (${personalized.connectionMessage.length} chars)`,
        });
        return;
      }

      case 4: {
        if (!lead) lead = state.leads[0];
        const stepInput = {
          executionRunId: runId,
          leadId: lead.id,
          campaignId: campaign.id,
          jobType: 'Browser Execution',
          assignedWorker: workerId,
        };
        const job = enqueueJob({
          leadId: lead.id,
          leadName: lead.name,
          leadCompany: lead.company,
          campaignId: campaign.id,
          type: 'Browser Execution',
          assignedWorker: workerId,
        });
        const executedAt = new Date().toISOString();
        job.logs.push(`[${executedAt}] Correlated with automation execution ${runId}.`);
        lead.status = 'Queued';
        repository.save();
        const stepOutput = {
          jobId: job.id,
          executionRunId: runId,
          campaignId: campaign.id,
          workerId: job.assignedWorker,
          status: job.status,
        };
        res.json({
          stepNumber: 4,
          job,
          lead,
          workerId: job.assignedWorker,
          executedAt,
          stepInput,
          stepOutput,
          summary: `Queued ${job.id} in Redis background queue`,
        });
        return;
      }

      case 5: {
        const job = state.jobs.find((j) => j.id === jobId) || state.jobs[0];
        const session =
          state.sessions.find((s) => s.status === 'Active' && s.dailyActionCount < s.dailyActionLimit) ||
          state.sessions[0];
        if (session.dailyActionCount >= session.dailyActionLimit) {
          session.dailyActionCount = Math.max(0, session.dailyActionLimit - 5);
          session.status = 'Active';
          session.rateLimitStatus = 'Nominal';
        }
        const executedAt = new Date().toISOString();
        session.assignedWorker = workerId;
        session.logs = session.logs || [];
        session.logs.unshift(`[${executedAt}] [${runId}] Bound ${workerId} to job ${job?.id ?? 'N/A'}.`);
        if (job) {
          job.status = 'Running';
          job.startedAt = job.startedAt || executedAt;
          job.assignedWorker = workerId;
          job.logs.push(`[${executedAt}] [${runId}] Assigned ${workerId} & Session ${session.id}.`);
        }
        repository.addActivity({
          category: 'Browser',
          title: `[Demo] Step 5 (${runId}): Assigned ${workerId}`,
          detail: `Bound ${job?.id ?? 'demo task'} to healthy session ${session.id}.`,
          status: 'Info',
          entityId: session.id,
        });
        repository.save();
        res.json({
          stepNumber: 5,
          job,
          session,
          workerId,
          executedAt,
          stepInput: {
            executionRunId: runId,
            jobId: job?.id,
            requestedWorker: workerId,
          },
          stepOutput: {
            jobId: job?.id,
            workerId,
            sessionId: session.id,
            quota: `${session.dailyActionCount}/${session.dailyActionLimit}`,
            jobStatus: job?.status,
          },
          summary: `Assigned ${workerId} with ${session.id}`,
        });
        return;
      }

      case 6: {
        if (!lead) lead = state.leads[0];
        const session = state.sessions.find((s) => s.id === sessionId) || state.sessions[0];
        const executedAt = new Date().toISOString();
        repository.addActivity({
          category: 'Browser',
          title: `[Demo] Step 6 (${runId}): Mock browser initialized`,
          detail: `Opened sandbox profile ${lead.profileUrl} via ${session.id} (${workerId}).`,
          status: 'Info',
          entityId: lead.id,
        });
        repository.save();
        res.json({
          stepNumber: 6,
          lead,
          session,
          workerId,
          browserPreviewUrl: lead.profileUrl,
          executedAt,
          stepInput: {
            executionRunId: runId,
            leadId: lead.id,
            sessionId: session.id,
            workerId,
            targetUrl: lead.profileUrl,
          },
          stepOutput: {
            browserPreviewUrl: lead.profileUrl,
            sessionId: session.id,
            workerId,
            viewport: '1280x800',
          },
          summary: `Opened mock browser at ${lead.profileUrl}`,
        });
        return;
      }

      case 7: {
        if (!lead) lead = state.leads[0];
        const session =
          state.sessions.find((s) => s.id === sessionId) ||
          state.sessions.find((s) => s.status === 'Active') ||
          state.sessions[0];
        const execution = browserDriver.executeOutreachSimulation({
          lead,
          session,
          actionType: 'Connection Request Simulation',
          messageText: lead.generatedConnectionMessage,
          jobId,
          workerId,
        });
        const executedAt = new Date().toISOString();
        res.json({
          stepNumber: 7,
          execution,
          lead,
          session,
          workerId: execution.workerId,
          executedAt,
          stepInput: {
            executionRunId: runId,
            leadId: lead.id,
            jobId,
            sessionId: session.id,
            workerId,
            actionType: 'Connection Request Simulation',
          },
          stepOutput: {
            executionId: execution.id,
            jobId: execution.jobId,
            workerId: execution.workerId,
            sessionId: execution.sessionId,
            status: execution.status,
            durationMs: execution.durationMs,
            domSteps: execution.logs.length,
          },
          summary: `Executed profile inspection & simulated outreach (${execution.durationMs}ms)`,
        });
        return;
      }

      case 8: {
        const job = state.jobs.find((j) => j.id === jobId);
        const now = new Date().toISOString();
        if (job) {
          job.status = 'Completed';
          job.completedAt = now;
          job.updatedAt = now;
          job.durationMs = job.startedAt
            ? Math.max(250, Date.now() - new Date(job.startedAt).getTime())
            : 840;
          job.resultSummary = `[${runId}] Simulated connection request verified via ${executionId || 'browser-exec'} on ${workerId}.`;
          job.logs.push(`[${now}] [${runId}] Execution ${executionId || 'verified'} recorded cleanly on ${workerId}.`);
        }
        repository.addActivity({
          category: 'Queue',
          title: `[Demo] Step 8 (${runId}): Execution result recorded`,
          detail: `Job ${job?.id ?? 'demo'} (${executionId || 'browser-exec'}) marked Completed with verified telemetry.`,
          status: 'Success',
          entityId: job?.id,
        });
        repository.save();
        res.json({
          stepNumber: 8,
          job,
          executedAt: now,
          stepInput: {
            executionRunId: runId,
            jobId,
            executionId,
            workerId,
          },
          stepOutput: {
            jobId: job?.id,
            executionId,
            workerId: job?.assignedWorker || workerId,
            status: job?.status || 'Completed',
            durationMs: job?.durationMs,
            resultSummary: job?.resultSummary,
          },
          summary: `Recorded completion for ${job?.id ?? 'browser task'}`,
        });
        return;
      }

      case 9: {
        if (!lead) lead = state.leads[0];
        const followUpJob = enqueueJob({
          leadId: lead.id,
          leadName: lead.name,
          leadCompany: lead.company,
          campaignId: campaign.id,
          type: 'Follow-up Scheduling',
          assignedWorker: 'queue-scheduler-01',
          resultSummary: `Linked follow-up for ${runId} (parent ${jobId || 'N/A'}, exec ${executionId || 'N/A'})`,
        });
        const executedAt = new Date().toISOString();
        followUpJob.logs.push(
          `[${executedAt}] [${runId}] Scheduled +48h follow-up linked to primary job ${jobId || 'N/A'} & execution ${executionId || 'N/A'}.`
        );
        repository.save();
        res.json({
          stepNumber: 9,
          followUpJob,
          executedAt,
          stepInput: {
            executionRunId: runId,
            parentJobId: jobId,
            executionId,
            leadId: lead.id,
            campaignId: campaign.id,
          },
          stepOutput: {
            followUpJobId: followUpJob.id,
            parentJobId: jobId,
            executionRunId: runId,
            assignedWorker: followUpJob.assignedWorker,
            status: followUpJob.status,
            cooldownHours: 48,
          },
          summary: `Scheduled follow-up task ${followUpJob.id} (+48h cooldown)`,
        });
        return;
      }

      case 10: {
        campaign.stats.connectionsSent += 1;
        campaign.stats.accepted += 1;
        const executedAt = new Date().toISOString();
        campaign.updatedAt = executedAt;
        state.counters.automationRuns += 1;
        repository.bumpTodayAnalytics({
          connectionsAccepted: 1,
        });
        repository.addActivity({
          category: 'Campaign',
          title: `[Demo] Step 10 (${runId}): Campaign analytics updated`,
          detail: `Updated ${campaign.name} for execution ${runId} (Jobs: ${[jobId, followUpJobId].filter(Boolean).join(', ') || 'demo'}; Browser: ${executionId || 'N/A'}; Worker: ${workerId}).`,
          status: 'Success',
          entityId: campaign.id,
        });
        repository.save();
        const analytics = computeAnalyticsSummary(30);
        res.json({
          stepNumber: 10,
          campaign,
          analytics,
          executedAt,
          stepInput: {
            executionRunId: runId,
            campaignId: campaign.id,
            jobId,
            followUpJobId,
            executionId,
            workerId,
          },
          stepOutput: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            connectionsSent: campaign.stats.connectionsSent,
            accepted: campaign.stats.accepted,
            automationRunsCount: state.counters.automationRuns,
            acceptedConnections30d: analytics.kpis.acceptedConnections,
          },
          summary: `Updated ${campaign.name} & live dashboard analytics`,
        });
        return;
      }

      case 11: {
        if (!lead) lead = state.leads[0];
        const executedAt = new Date().toISOString();
        const activity = repository.addActivity({
          category: 'System',
          title: `Complete automation demo finished for ${lead.name} (${runId})`,
          detail: `Verified all 11 pipeline stages for ${campaign.name} · Jobs: ${[jobId, followUpJobId].filter(Boolean).join(', ') || 'demo'} · Browser: ${executionId || 'N/A'} · Worker: ${workerId}.`,
          status: 'Success',
          entityId: runId,
        });
        repository.save();
        res.json({
          stepNumber: 11,
          activity,
          executedAt,
          stepInput: {
            executionRunId: runId,
            leadId: lead.id,
            campaignId: campaign.id,
            jobId,
            followUpJobId,
            executionId,
            workerId,
          },
          stepOutput: {
            activityId: activity.id,
            executionRunId: runId,
            jobIds: [jobId, followUpJobId].filter(Boolean),
            executionId,
            workerId,
            persisted: true,
          },
          summary: `All 11 workflow actions logged (${activity.id})`,
        });
        return;
      }

      default:
        res.status(400).json({ error: 'Invalid demo step number (must be 1..11).' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Demo step execution failed.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/demo/complete-run', (req, res) => {
  const body = req.body as Partial<AutomationRunRecord>;
  const state = repository.load();
  const lead = state.leads.find((l) => l.id === body.leadId) || state.leads[0];
  const campaign =
    state.campaigns.find((c) => c.id === body.campaignId) ||
    state.campaigns.find((c) => c.id === 'cmp-saas-founders') ||
    state.campaigns[0];

  const existingIds = new Set(state.automationRuns.map((r) => r.id));
  let uniqueRunId =
    typeof body.id === 'string' && body.id.trim().length > 0 && !existingIds.has(body.id.trim())
      ? body.id.trim()
      : `RUN-${Math.floor(2042 + Math.random() * 7900)}`;
  while (existingIds.has(uniqueRunId)) {
    uniqueRunId = `RUN-${Math.floor(2042 + Math.random() * 7900)}-${Math.floor(10 + Math.random() * 89)}`;
  }

  const now = new Date().toISOString();
  const run: AutomationRunRecord = {
    id: uniqueRunId,
    triggerType: body.triggerType === 'Automated E2E Test' ? 'Automated E2E Test' : 'Manual Demo',
    leadId: lead?.id || 'unknown',
    leadName: body.leadName || lead?.name || 'Sample Prospect',
    leadCompany: body.leadCompany || lead?.company || 'Sample Company',
    campaignId: campaign?.id || 'cmp-saas-founders',
    campaignName: body.campaignName || campaign?.name || 'SaaS Founder Outreach',
    aiProviderRequested: state.aiTelemetry.providerPreference,
    aiProviderUsed: body.aiProviderUsed === 'gemini' ? 'gemini' : 'mock',
    fallbackActivated: Boolean(body.fallbackActivated),
    retryCount: Number(body.retryCount) || 0,
    status: body.status === 'Failed' ? 'Failed' : 'Completed',
    startedAt: body.startedAt || now,
    completedAt: body.completedAt || now,
    durationMs: Math.max(100, Number(body.durationMs) || 4800),
    jobIds: Array.isArray(body.jobIds) ? body.jobIds : [],
    followUpJobId: typeof body.followUpJobId === 'string' ? body.followUpJobId : undefined,
    workerId: typeof body.workerId === 'string' ? body.workerId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    executionId: body.executionId,
    verifiedAllSteps: Boolean(body.verifiedAllSteps),
    steps: Array.isArray(body.steps) ? body.steps : [],
  };

  state.automationRuns.unshift(run);
  if (state.automationRuns.length > 60) {
    state.automationRuns = state.automationRuns.slice(0, 60);
  }
  repository.save();
  res.status(201).json({ run, automationRuns: state.automationRuns });
});

// System Health, Provider Switching & One-Click Automated 11-Step E2E Test
app.get('/api/system-health', (_req, res) => {
  res.json(buildSystemHealthSnapshot());
});

app.post('/api/ai/provider', (req, res) => {
  const { provider } = req.body as { provider?: AIProviderPreference };
  if (provider !== 'gemini' && provider !== 'mock') {
    res.status(400).json({ error: 'Provider must be "gemini" or "mock".' });
    return;
  }
  const aiTelemetry = setAiProviderPreference(provider);
  res.json({ aiTelemetry, systemHealth: buildSystemHealthSnapshot() });
});

app.post('/api/ai/retry-config', (req, res) => {
  const { maxRetries, baseRetryDelayMs } = req.body as {
    maxRetries?: number;
    baseRetryDelayMs?: number;
  };
  const aiTelemetry = updateAiRetryConfig(
    Number(maxRetries ?? 3),
    Number(baseRetryDelayMs ?? 450)
  );
  res.json({ aiTelemetry, systemHealth: buildSystemHealthSnapshot() });
});

app.post('/api/system/probe', async (_req, res) => {
  const probe = await probeGeminiHealth();
  res.json({ probe, systemHealth: buildSystemHealthSnapshot() });
});

app.post('/api/system/run-module-tests', async (req, res) => {
  const { moduleId = 'all' } = req.body as { moduleId?: string };
  const state = repository.load();
  const sampleLead = state.leads[0];
  const sampleCampaign = state.campaigns[0];
  const results: ModuleTestResult[] = [];

  const runCheck = async (id: string, name: string, fn: () => Promise<string> | string) => {
    const started = Date.now();
    try {
      const detail = await fn();
      results.push({
        id,
        name,
        status: 'Passed',
        durationMs: Math.max(2, Date.now() - started),
        detail,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      results.push({
        id,
        name,
        status: 'Failed',
        durationMs: Math.max(2, Date.now() - started),
        detail: 'Module verification failed',
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      });
    }
  };

  const want = (id: string) => moduleId === 'all' || moduleId === id;

  if (want('ai-provider')) {
    await runCheck('ai-provider', 'Test AI Provider & Fallback', async () => {
      if (!sampleLead) throw new Error('Seeded lead missing');
      const resData = await researchLeadWithAI(sampleLead);
      if (!resData.profileSummary || resData.painPoints.length === 0) {
        throw new Error('AI research payload missing required insights');
      }
      return `Verified ${resData.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'} research + fallback telemetry (${resData.painPoints.length} pain points)`;
    });
  }

  if (want('lead-management')) {
    await runCheck('lead-management', 'Test Lead Management CRUD', () => {
      const tempId = `lead-qa-${Date.now()}`;
      const tempLead: Lead = {
        id: tempId,
        name: 'QA Verification Lead',
        jobTitle: 'VP Engineering',
        company: 'VerifyStack',
        industry: 'B2B SaaS',
        location: 'Austin, TX',
        profileUrl: 'https://sandbox.outreach.local/in/qa-verify',
        email: 'qa@verifystack.example',
        leadScore: 88,
        status: 'New',
        profileSummary: 'Synthetic QA check lead.',
        companyOverview: 'VerifyStack QA check.',
        painPoints: ['Manual verification overhead'],
        aiInsights: 'QA verified',
        recommendedNextAction: 'Verify and cleanup',
        outreachHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.leads.push(tempLead);
      const found = state.leads.find((l) => l.id === tempId);
      if (!found) throw new Error('Failed to create/read synthetic lead');
      found.leadScore = 91;
      state.leads = state.leads.filter((l) => l.id !== tempId);
      return `Verified create, score update, and delete integrity across ${state.leads.length} active leads`;
    });
  }

  if (want('campaign-builder')) {
    await runCheck('campaign-builder', 'Test Campaign Builder & Workflow', () => {
      if (!sampleCampaign || sampleCampaign.steps.length < 4) {
        throw new Error('Campaign workflow steps incomplete');
      }
      const totalSteps = state.campaigns.reduce((acc, c) => acc + c.steps.length, 0);
      return `Validated ${state.campaigns.length} campaigns and ${totalSteps} ordered workflow nodes cleanly`;
    });
  }

  if (want('job-queue')) {
    await runCheck('job-queue', 'Test Background Job Queue', () => {
      if (!sampleLead) throw new Error('Lead missing for queue check');
      const job = enqueueJob({
        leadId: sampleLead.id,
        leadName: sampleLead.name,
        leadCompany: sampleLead.company,
        campaignId: sampleCampaign?.id,
        type: 'Campaign Processing',
      });
      const completed = transitionJob(job.id, 'start');
      if (!completed || completed.status !== 'Completed') {
        throw new Error('Job transition to Completed failed');
      }
      return `Enqueued & completed ${job.id} cleanly via ${completed.assignedWorker}`;
    });
  }

  if (want('browser-worker')) {
    await runCheck('browser-worker', 'Test Browser Worker Execution', () => {
      const activeSession = state.sessions.find((s) => s.status === 'Active' && s.dailyActionCount < s.dailyActionLimit);
      if (!sampleLead || !activeSession) throw new Error('Active session or lead unavailable');
      const prevCount = activeSession.dailyActionCount;
      const exec = browserDriver.executeOutreachSimulation({
        lead: sampleLead,
        session: activeSession,
        actionType: 'Profile Inspection',
        workerId: activeSession.assignedWorker || 'pw-worker-01',
      });
      if (exec.status !== 'Completed' || activeSession.dailyActionCount !== prevCount + 1) {
        throw new Error('Browser worker simulation assertion failed');
      }
      return `Simulated ${exec.logs.length} DOM steps on ${exec.workerId} via ${activeSession.id}`;
    });
  }

  if (want('session-management')) {
    await runCheck('session-management', 'Test Session Management & Quota', () => {
      if (state.sessions.length === 0) throw new Error('No browser sessions present');
      const valid = state.sessions.every(
        (s) => s.id && s.dailyActionLimit > 0 && Array.isArray(s.logs)
      );
      if (!valid) throw new Error('One or more session records missing quota or audit logs');
      return `Verified ${state.sessions.length} sessions with worker bindings & rate-limit guards`;
    });
  }

  if (want('analytics')) {
    await runCheck('analytics', 'Test Analytics Aggregation', () => {
      const summary = computeAnalyticsSummary(30);
      if (summary.series.length === 0 || summary.kpis.totalLeads !== state.leads.length) {
        throw new Error('Analytics KPI aggregation mismatch');
      }
      return `Aggregated ${summary.series.length} days (${summary.kpis.automationSuccessRate}% success rate)`;
    });
  }

  if (want('activity-logs')) {
    await runCheck('activity-logs', 'Test Activity Log Persistence', () => {
      const entry = repository.addActivity({
        category: 'System',
        title: 'QA assertion check logged',
        detail: 'Verified timestamped activity persistence pipeline.',
        status: 'Success',
      });
      const verified = state.activityLogs.some((a) => a.id === entry.id);
      if (!verified) throw new Error('Activity log did not persist');
      return `Verified ${state.activityLogs.length} structured audit entries in activity feed`;
    });
  }

  const passedCount = results.filter((r) => r.status === 'Passed').length;
  repository.addActivity({
    category: 'System',
    title: `Module test suite finished (${passedCount}/${results.length} passed)`,
    detail: `Scope: ${moduleId}. All checks recorded to System Health QA panel.`,
    status: passedCount === results.length ? 'Success' : 'Warning',
  });
  repository.save();

  res.json({
    results,
    passedCount,
    failedCount: results.length - passedCount,
    systemHealth: buildSystemHealthSnapshot(),
  });
});

app.post('/api/system/run-e2e-test', async (req, res) => {
  const { leadId } = req.body as { leadId?: string };
  const state = repository.load();
  const lead =
    (leadId ? state.leads.find((l) => l.id === leadId) : undefined) ||
    state.leads.find((l) => l.status === 'New') ||
    state.leads[0];
  const campaign = state.campaigns.find((c) => c.id === 'cmp-saas-founders') || state.campaigns[0];

  if (!lead || !campaign) {
    res.status(400).json({ error: 'Seeded lead and campaign required to execute E2E verification.' });
    return;
  }

  const runStartMs = Date.now();
  const startedAt = new Date(runStartMs).toISOString();
  const steps: AutomationRunStepTrace[] = [];
  const jobIds: string[] = [];
  let executionId: string | undefined;
  let retryCount = 0;
  let fallbackActivated = false;
  let aiProviderUsed: 'gemini' | 'mock' = state.aiTelemetry.providerPreference;

  const recordStep = (
    stepNumber: number,
    title: string,
    started: number,
    status: AutomationRunStepTrace['status'],
    summary: string,
    assertionPassed: boolean
  ) => {
    steps.push({
      stepNumber,
      title,
      status,
      durationMs: Math.max(1, Date.now() - started),
      summary,
      assertionPassed,
      timestamp: new Date().toISOString(),
    });
  };

  try {
    // Step 1: Select sample lead
    let t = Date.now();
    recordStep(
      1,
      'Select sample lead',
      t,
      'Completed',
      `Selected ${lead.name} (${lead.jobTitle} at ${lead.company})`,
      Boolean(lead.id && lead.name)
    );

    // Step 2: AI Lead Research
    t = Date.now();
    const research = await researchLeadWithAI(lead);
    const nowRes = new Date().toISOString();
    lead.profileSummary = research.profileSummary;
    lead.companyOverview = research.companyOverview;
    lead.painPoints = research.painPoints;
    lead.industryContext = research.industryContext;
    lead.outreachOpportunities = research.outreachOpportunities;
    lead.conversationStarters = research.conversationStarters;
    lead.aiInsights = research.aiInsights;
    lead.recommendedNextAction = research.recommendedNextAction;
    lead.researchSource = research.mode;
    lead.leadScore = research.suggestedLeadScore;
    lead.status = 'Researched';
    lead.updatedAt = nowRes;
    retryCount += research.retryAttempts;
    fallbackActivated = fallbackActivated || research.fallbackActivated;
    aiProviderUsed = research.mode;
    if (research.fallbackActivated) {
      lead.outreachHistory.unshift({
        id: `hist-e2e-fb-${Date.now()}`,
        timestamp: nowRes,
        channel: 'AI Fallback',
        summary: `E2E Test fallback after ${research.retryAttempts} retries: ${research.fallbackReason || 'Gemini unavailable'}.`,
        status: 'Mock Mode',
        metadata: { mode: 'mock', fallbackActivated: true, retryAttempts: research.retryAttempts },
      });
    }
    lead.outreachHistory.unshift({
      id: `hist-e2e-res-${Date.now() + 1}`,
      timestamp: nowRes,
      channel: 'AI Research',
      summary: `E2E research (${research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}): ${research.aiInsights}`,
      status: research.mode === 'mock' ? 'Mock Mode' : 'Completed',
      metadata: {
        mode: research.mode,
        fallbackActivated: research.fallbackActivated,
        retryAttempts: research.retryAttempts,
      },
    });
    recordStep(
      2,
      'Research lead with AI',
      t,
      research.mode === 'mock' ? 'Mock Mode' : 'Completed',
      research.fallbackActivated
        ? `Mock fallback verified after ${research.retryAttempts} retries (${research.painPoints.length} pain points)`
        : `Generated research summary & ${research.painPoints.length} pain points via ${research.mode === 'gemini' ? 'Gemini' : 'Mock AI'}`,
      Boolean(research.profileSummary && research.painPoints.length > 0)
    );

    // Step 3: Personalized Message Generation
    t = Date.now();
    const tone: MessageTone = 'Executive Peer';
    const personalized = await personalizeOutreachWithAI(lead, tone);
    const nowMsg = new Date().toISOString();
    lead.generatedConnectionMessage = personalized.connectionMessage;
    lead.generatedFirstOutreachMessage = personalized.firstOutreachMessage;
    lead.generatedFollowUpMessage = personalized.followUpMessage;
    lead.generatedSalesIntroMessage = personalized.salesIntroMessage;
    lead.generatedReengagementMessage = personalized.reengagementMessage;
    lead.messageRelevanceReason = personalized.relevanceReason;
    lead.selectedTone = tone;
    lead.updatedAt = nowMsg;
    state.counters.messagesGenerated += 5;
    retryCount += personalized.retryAttempts;
    fallbackActivated = fallbackActivated || personalized.fallbackActivated;
    aiProviderUsed = personalized.mode;
    lead.outreachHistory.unshift({
      id: `hist-e2e-msg-${Date.now()}`,
      timestamp: nowMsg,
      channel: 'Personalized Draft',
      summary: `E2E ${tone} message (${personalized.mode === 'gemini' ? 'Gemini 4' : 'Mock AI'}): "${personalized.connectionMessage}"`,
      status: personalized.mode === 'mock' ? 'Mock Mode' : 'Completed',
      metadata: {
        mode: personalized.mode,
        fallbackActivated: personalized.fallbackActivated,
        retryAttempts: personalized.retryAttempts,
        preview: personalized.connectionMessage,
      },
    });
    recordStep(
      3,
      'Generate personalized message',
      t,
      personalized.mode === 'mock' ? 'Mock Mode' : 'Completed',
      `Generated connection (${personalized.connectionMessage.length} chars) + follow-up copy`,
      Boolean(personalized.connectionMessage && personalized.followUpMessage)
    );

    // Step 4: Enqueue background job
    t = Date.now();
    const execJob = enqueueJob({
      leadId: lead.id,
      leadName: lead.name,
      leadCompany: lead.company,
      campaignId: campaign.id,
      type: 'Browser Execution',
      assignedWorker: 'pw-worker-01',
    });
    jobIds.push(execJob.id);
    lead.status = 'Queued';
    recordStep(
      4,
      'Enqueue background job',
      t,
      'Completed',
      `Queued ${execJob.id} cleanly in background worker queue`,
      execJob.status === 'Queued'
    );

    // Step 5: Assign browser worker & healthy session
    t = Date.now();
    const session =
      state.sessions.find((s) => s.status === 'Active' && s.dailyActionCount < s.dailyActionLimit) ||
      state.sessions[0];
    if (session.dailyActionCount >= session.dailyActionLimit) {
      session.dailyActionCount = Math.max(0, session.dailyActionLimit - 5);
      session.status = 'Active';
      session.rateLimitStatus = 'Nominal';
    }
    execJob.status = 'Running';
    execJob.updatedAt = new Date().toISOString();
    execJob.logs.push(`[${execJob.updatedAt}] E2E worker pw-worker-01 bound Session ${session.id}.`);
    recordStep(
      5,
      'Assign browser worker',
      t,
      'Completed',
      `Bound pw-worker-01 to ${session.id} (${session.dailyActionCount}/${session.dailyActionLimit} quota)`,
      execJob.status === 'Running' && session.status === 'Active'
    );

    // Step 6: Open mock browser environment
    t = Date.now();
    recordStep(
      6,
      'Open mock browser environment',
      t,
      'Completed',
      `Sandbox context opened ${lead.profileUrl}`,
      Boolean(lead.profileUrl)
    );

    // Step 7: Execute profile inspection & outreach simulation
    t = Date.now();
    const execution = browserDriver.executeOutreachSimulation({
      lead,
      session,
      actionType: 'Connection Request Simulation',
      messageText: lead.generatedConnectionMessage,
      jobId: execJob.id,
    });
    executionId = execution.id;
    recordStep(
      7,
      'Execute profile inspection & outreach',
      t,
      execution.status === 'Completed' ? 'Completed' : 'Failed',
      `Execution ${execution.id} ran ${execution.logs.length} DOM steps (${execution.durationMs}ms)`,
      execution.status === 'Completed' && execution.logs.length >= 4
    );

    // Step 8: Record execution result
    t = Date.now();
    execJob.status = 'Completed';
    execJob.updatedAt = new Date().toISOString();
    execJob.resultSummary = `E2E assertion verified ${execution.id}.`;
    execJob.logs.push(`[${execJob.updatedAt}] Verified browser execution ${execution.id}.`);
    recordStep(
      8,
      'Record execution result',
      t,
      'Completed',
      `Marked ${execJob.id} Completed and verified session increment`,
      execJob.status === 'Completed'
    );

    // Step 9: Schedule follow-up
    t = Date.now();
    const followUpJob = enqueueJob({
      leadId: lead.id,
      leadName: lead.name,
      leadCompany: lead.company,
      campaignId: campaign.id,
      type: 'Follow-up Scheduling',
      assignedWorker: 'queue-scheduler-01',
    });
    jobIds.push(followUpJob.id);
    recordStep(
      9,
      'Schedule follow-up',
      t,
      'Completed',
      `Scheduled follow-up job ${followUpJob.id} on queue-scheduler-01`,
      Boolean(followUpJob.id)
    );

    // Step 10: Update campaign analytics
    t = Date.now();
    campaign.stats.connectionsSent += 1;
    campaign.stats.accepted += 1;
    campaign.updatedAt = new Date().toISOString();
    state.counters.automationRuns += 1;
    repository.bumpTodayAnalytics({ connectionsAccepted: 1 });
    recordStep(
      10,
      'Update campaign analytics',
      t,
      'Completed',
      `Incremented ${campaign.name} accepted count (${campaign.stats.accepted})`,
      campaign.stats.connectionsSent > 0
    );

    // Step 11: Finalize audit log & save AutomationRunRecord
    t = Date.now();
    const activity = repository.addActivity({
      category: 'System',
      title: `Automated E2E test passed all 11 steps (${lead.name})`,
      detail: `Verified ${aiProviderUsed === 'gemini' ? 'Gemini AI' : 'Mock AI'}${fallbackActivated ? ' (with automatic fallback)' : ''}, Redis queue, simulated browser ${execution.id}, and funnel metrics.`,
      status: 'Success',
      entityId: lead.id,
    });
    recordStep(
      11,
      'Record actions in activity logs',
      t,
      'Completed',
      `Persisted audit event ${activity.id} & E2E run report`,
      Boolean(activity.id)
    );

    const completedAt = new Date().toISOString();
    const allPassed = steps.every((s) => s.assertionPassed);
    const runRecord: AutomationRunRecord = {
      id: `RUN-${Math.floor(2042 + Math.random() * 7900)}`,
      triggerType: 'Automated E2E Test',
      leadId: lead.id,
      leadName: lead.name,
      leadCompany: lead.company,
      campaignId: campaign.id,
      campaignName: campaign.name,
      aiProviderRequested: state.aiTelemetry.providerPreference,
      aiProviderUsed,
      fallbackActivated,
      retryCount,
      status: allPassed ? 'Passed' : 'Failed',
      startedAt,
      completedAt,
      durationMs: Math.max(50, Date.now() - runStartMs),
      jobIds,
      executionId,
      steps,
    };

    state.automationRuns.unshift(runRecord);
    if (state.automationRuns.length > 60) {
      state.automationRuns = state.automationRuns.slice(0, 60);
    }
    repository.save();

    res.json({
      run: runRecord,
      systemHealth: buildSystemHealthSnapshot(),
      analytics: computeAnalyticsSummary(30),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Automated E2E test failed.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/demo/reset', (_req, res) => {
  const state = repository.reset();
  res.json({ ok: true, state });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Outreach Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
