import type {
  AIProviderPreference,
  AITelemetryState,
  AgentDecision,
  AnalyticsSummary,
  AutomationRunRecord,
  BackgroundJob,
  BootstrapResponse,
  BrowserExecution,
  BrowserSession,
  Campaign,
  IntegrationSetting,
  JobType,
  Lead,
  LiveAiStatus,
  MessageLength,
  MessageTone,
  MessageTypeOption,
  ModuleTestResult,
  PersonalizationLevel,
  SystemHealthSnapshot,
} from '../types/outreach';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  bootstrap: (range: 7 | 30 | 90 = 30) =>
    request<BootstrapResponse>(`/api/bootstrap?range=${range}`),

  getAnalytics: (range: 7 | 30 | 90) =>
    request<AnalyticsSummary>(`/api/analytics?range=${range}`),

  createLead: (payload: Partial<Lead>) =>
    request<{ lead: Lead }>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLead: (id: string, payload: Partial<Lead>) =>
    request<{ lead: Lead }>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLead: (id: string) =>
    request<{ ok: boolean }>(`/api/leads/${id}`, { method: 'DELETE' }),

  importLeadsCsv: (csvText: string) =>
    request<{ importedCount: number; leads: Lead[] }>('/api/leads/import', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    }),

  bulkLeadAction: (
    leadIds: string[],
    action: 'delete' | 'assignCampaign' | 'queueResearch',
    campaignId?: string
  ) =>
    request<{ ok: boolean; leads: Lead[] }>('/api/leads/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ leadIds, action, campaignId }),
    }),

  getAiStatus: () => request<LiveAiStatus>('/api/ai/status'),

  researchLead: (leadId: string) =>
    request<{
      lead: Lead;
      research: {
        mode: 'gemini' | 'mock';
        aiStatus: 'Completed' | 'Retrying' | 'Mock Mode' | 'Failed';
        retryAttempts: number;
        fallbackActivated: boolean;
        fallbackReason?: string;
      };
    }>('/api/ai/research', {
      method: 'POST',
      body: JSON.stringify({ leadId }),
    }),

  personalizeLead: (
    leadId: string,
    tone: MessageTone,
    customFocus?: string,
    extras?: {
      messageType?: MessageTypeOption;
      campaignObjective?: string;
      targetAudience?: string;
      offer?: string;
      messageLength?: MessageLength;
      personalizationLevel?: PersonalizationLevel;
    }
  ) =>
    request<{
      lead: Lead;
      result: {
        connectionMessage: string;
        firstOutreachMessage: string;
        followUpMessage: string;
        salesIntroMessage: string;
        reengagementMessage: string;
        primaryMessage: string;
        messageType: MessageTypeOption;
        relevanceReason: string;
        mode: 'gemini' | 'mock';
        aiStatus: 'Completed' | 'Retrying' | 'Mock Mode' | 'Failed';
        retryAttempts: number;
        fallbackActivated: boolean;
        fallbackReason?: string;
      };
    }>('/api/ai/personalize', {
      method: 'POST',
      body: JSON.stringify({ leadId, tone, customFocus, ...(extras || {}) }),
    }),

  createCampaign: (payload: Partial<Campaign>) =>
    request<{ campaign: Campaign }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCampaign: (id: string, payload: Partial<Campaign>) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  toggleCampaign: (id: string) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${id}/toggle`, {
      method: 'POST',
    }),

  deleteCampaign: (id: string) =>
    request<{ ok: boolean }>(`/api/campaigns/${id}`, {
      method: 'DELETE',
    }),

  createSession: (payload: Partial<BrowserSession>) =>
    request<{ session: BrowserSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSession: (
    id: string,
    payload: {
      action?: 'reauth' | 'resetLimit' | 'toggleIdle' | 'pause' | 'terminate';
      status?: string;
      dailyActionLimit?: number;
      assignedWorker?: string;
    }
  ) =>
    request<{ session: BrowserSession }>(`/api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  queueJob: (payload: { leadId: string; type: JobType; campaignId?: string }) =>
    request<{ job: BackgroundJob }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  transitionJob: (id: string, action: 'start' | 'pause' | 'retry' | 'cancel') =>
    request<{ job: BackgroundJob }>(`/api/jobs/${id}/${action}`, {
      method: 'POST',
    }),

  executeBrowserAction: (payload: {
    leadId: string;
    sessionId?: string;
    workerId?: string;
    actionType?: BrowserExecution['actionType'];
    messageText?: string;
  }) =>
    request<{ execution: BrowserExecution; lead: Lead; session: BrowserSession }>(
      '/api/browser/execute',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  retryBrowserExecution: (id: string) =>
    request<{ execution: BrowserExecution; lead: Lead; session: BrowserSession }>(
      `/api/browser/executions/${id}/retry`,
      {
        method: 'POST',
      }
    ),

  evaluateAgent: (leadId: string, replyText?: string) =>
    request<{ decision: AgentDecision }>('/api/agent/evaluate', {
      method: 'POST',
      body: JSON.stringify({ leadId, replyText }),
    }),

  resolveAgentDecision: (id: string, resolution: 'Approved' | 'Rejected') =>
    request<{ decision: AgentDecision; lead?: Lead }>(`/api/agent/decisions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),

  updateIntegration: (id: string, config: Record<string, string | number | boolean>) =>
    request<{ integration: IntegrationSetting }>(`/api/integrations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ config }),
    }),

  testIntegration: (id: string) =>
    request<{ ok: boolean; integration: IntegrationSetting }>(`/api/integrations/${id}/test`, {
      method: 'POST',
    }),

  runDemoStep: (payload: {
    stepNumber: number;
    leadId?: string;
    jobId?: string;
    followUpJobId?: string;
    sessionId?: string;
    executionId?: string;
    executionRunId?: string;
    workerId?: string;
  }) =>
    request<Record<string, unknown>>('/api/demo/step', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  completeDemoRun: (payload: Partial<AutomationRunRecord>) =>
    request<{ run: AutomationRunRecord; automationRuns: AutomationRunRecord[] }>(
      '/api/demo/complete-run',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getSystemHealth: () => request<SystemHealthSnapshot>('/api/system-health'),

  setAiProvider: (provider: AIProviderPreference) =>
    request<{ aiTelemetry: AITelemetryState; systemHealth: SystemHealthSnapshot }>(
      '/api/ai/provider',
      {
        method: 'POST',
        body: JSON.stringify({ provider }),
      }
    ),

  updateAiRetryConfig: (maxRetries: number, baseRetryDelayMs: number) =>
    request<{ aiTelemetry: AITelemetryState; systemHealth: SystemHealthSnapshot }>(
      '/api/ai/retry-config',
      {
        method: 'POST',
        body: JSON.stringify({ maxRetries, baseRetryDelayMs }),
      }
    ),

  probeSystemHealth: () =>
    request<{
      probe: {
        ok: boolean;
        provider: 'gemini' | 'mock';
        latencyMs: number;
        status: string;
        message: string;
        checkedAt: string;
      };
      systemHealth: SystemHealthSnapshot;
    }>('/api/system/probe', {
      method: 'POST',
    }),

  runModuleTests: (moduleId = 'all') =>
    request<{
      results: ModuleTestResult[];
      passedCount: number;
      failedCount: number;
      systemHealth: SystemHealthSnapshot;
    }>('/api/system/run-module-tests', {
      method: 'POST',
      body: JSON.stringify({ moduleId }),
    }),

  runAutomatedE2ETest: (leadId?: string) =>
    request<{
      run: AutomationRunRecord;
      systemHealth: SystemHealthSnapshot;
      analytics: AnalyticsSummary;
    }>('/api/system/run-e2e-test', {
      method: 'POST',
      body: JSON.stringify({ leadId }),
    }),

  resetDemoData: () =>
    request<{ ok: boolean }>('/api/demo/reset', {
      method: 'POST',
    }),
};
