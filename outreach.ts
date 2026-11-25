export type NavSection =
  | 'dashboard'
  | 'leads'
  | 'ai-research'
  | 'campaigns'
  | 'browser-engine'
  | 'sessions'
  | 'job-queue'
  | 'ai-agent'
  | 'analytics'
  | 'execution-history'
  | 'system-health'
  | 'activity-logs'
  | 'settings';

export type LeadStatus =
  | 'New'
  | 'Researched'
  | 'Queued'
  | 'Connection Sent'
  | 'Connected'
  | 'Replied'
  | 'Interested'
  | 'Archived';

export type MessageTone =
  | 'Consultative'
  | 'Direct & Concise'
  | 'Executive Peer'
  | 'Warm Challenger';

export type MessageTypeOption =
  | 'Connection Request'
  | 'First Outreach'
  | 'Follow-up'
  | 'Sales Introduction'
  | 'Re-engagement';

export type MessageLength = 'Short' | 'Standard' | 'Detailed';
export type PersonalizationLevel = 'Light' | 'Balanced' | 'Deep';

export type AIExecutionStatus = 'Completed' | 'Retrying' | 'Mock Mode' | 'Failed';

export interface OutreachHistoryEntry {
  id: string;
  timestamp: string;
  channel:
    | 'Connection Request'
    | 'Follow-up Message'
    | 'AI Research'
    | 'Personalized Draft'
    | 'Reply Received'
    | 'AI Fallback';
  summary: string;
  status: 'Completed' | 'Pending' | 'Failed' | 'Mock Mode';
  metadata?: {
    mode?: 'gemini' | 'mock';
    fallbackActivated?: boolean;
    retryAttempts?: number;
    preview?: string;
  };
}

export interface Lead {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  industry: string;
  location: string;
  profileUrl: string;
  email: string;
  leadScore: number;
  status: LeadStatus;
  campaignId?: string;
  profileSummary: string;
  companyOverview: string;
  painPoints: string[];
  industryContext?: string;
  outreachOpportunities?: string[];
  conversationStarters?: string[];
  aiInsights: string;
  recommendedNextAction: string;
  researchSource?: 'gemini' | 'mock';
  generatedConnectionMessage?: string;
  generatedFirstOutreachMessage?: string;
  generatedFollowUpMessage?: string;
  generatedSalesIntroMessage?: string;
  generatedReengagementMessage?: string;
  messageRelevanceReason?: string;
  selectedTone?: MessageTone;
  approvalStatus?: 'Pending' | 'Approved' | 'Rejected';
  outreachHistory: OutreachHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStepType =
  | 'Lead Added'
  | 'Lead Research'
  | 'Lead Scoring'
  | 'AI Personalization'
  | 'Generate Personalized Message'
  | 'Human Approval'
  | 'Connection Request Simulation'
  | 'Browser Action'
  | 'Wait'
  | 'Connection Status Check'
  | 'Check Connection Status'
  | 'Follow-up Message'
  | 'Send Follow-up'
  | 'Reply Analysis'
  | 'Analyze Reply'
  | 'AI Next Action'
  | 'AI Agent Decision'
  | 'Campaign Completion';

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  description: string;
  config: {
    delayHours?: number;
    tone?: MessageTone;
    requireApproval?: boolean;
    condition?: string;
    channel?: string;
  };
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  targetPersona: string;
  status: 'Active' | 'Paused' | 'Draft';
  steps: WorkflowStep[];
  stats: {
    leadsEnrolled: number;
    connectionsSent: number;
    accepted: number;
    replies: number;
    positiveReplies: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus =
  | 'Active'
  | 'Idle'
  | 'Expired'
  | 'Needs Re-authentication'
  | 'Rate Limited'
  | 'Error';

export interface BrowserSession {
  id: string;
  accountLabel: string;
  operatorEmail: string;
  status: SessionStatus;
  lastActive: string;
  authStatus: 'Authenticated' | 'Token Expired' | 'Challenge Required';
  proxyStatus: 'Connected' | 'Standby' | 'Degraded';
  proxyRegion: string;
  dailyActionCount: number;
  dailyActionLimit: number;
  rateLimitStatus: 'Nominal' | 'Throttled' | 'Blocked';
  assignedWorker?: string;
  logs?: string[];
}

export type JobType =
  | 'Lead Research'
  | 'Message Generation'
  | 'Browser Execution'
  | 'Follow-up Scheduling'
  | 'Reply Analysis'
  | 'Campaign Processing';

export type JobStatus =
  | 'Queued'
  | 'Running'
  | 'Paused'
  | 'Retrying'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface BackgroundJob {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string;
  campaignId?: string;
  campaignName?: string;
  type: JobType;
  assignedWorker: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  durationMs?: number;
  retryCount: number;
  maxRetries: number;
  logs: string[];
  resultSummary?: string;
}

export interface BrowserActionLog {
  timestamp: string;
  step: string;
  detail: string;
  status: 'ok' | 'warn' | 'error';
}

export interface BrowserExecution {
  id: string;
  jobId?: string;
  leadId: string;
  leadName: string;
  leadCompany: string;
  profileUrl: string;
  sessionId: string;
  workerId: string;
  actionType: 'Connection Request Simulation' | 'Profile Inspection' | 'Follow-up Message Simulation';
  status: 'Running' | 'Completed' | 'Failed';
  durationMs: number;
  startedAt: string;
  completedAt?: string;
  messagePreview?: string;
  logs: BrowserActionLog[];
  environmentNote: string;
}

export type AgentRecommendationType =
  | 'Generate personalized message'
  | 'Recommend follow-up'
  | 'Wait for response'
  | 'Mark lead interested'
  | 'Move lead to human review'
  | 'Stop campaign'
  | 'Request human approval';

export interface AgentDecision {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string;
  campaignId: string;
  campaignName: string;
  campaignStage: string;
  recommendation: AgentRecommendationType;
  confidenceScore: number;
  explanation: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  resolvedAt?: string;
}

export type ActivityCategory =
  | 'Lead'
  | 'AI'
  | 'Campaign'
  | 'Browser'
  | 'Queue'
  | 'Agent'
  | 'System';

export interface ActivityLog {
  id: string;
  timestamp: string;
  category: ActivityCategory;
  title: string;
  detail: string;
  status: 'Success' | 'Warning' | 'Error' | 'Info';
  entityId?: string;
}

export interface AnalyticsDayPoint {
  date: string;
  leadsProcessed: number;
  connectionsSent: number;
  connectionsAccepted: number;
  repliesReceived: number;
  positiveReplies: number;
  failedExecutions: number;
}

export interface AnalyticsSummary {
  rangeDays: 7 | 30 | 90;
  series: AnalyticsDayPoint[];
  kpis: {
    totalLeads: number;
    leadsProcessed: number;
    connectionRequests: number;
    acceptedConnections: number;
    messagesGenerated: number;
    repliesReceived: number;
    positiveReplies: number;
    activeCampaigns: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    failedExecutions: number;
    acceptanceRate: number;
    replyRate: number;
    positiveReplyRate: number;
    campaignConversion: number;
    automationSuccessRate: number;
    workerUptime: number;
  };
}

export interface IntegrationSetting {
  id: 'gemini' | 'openai' | 'postgresql' | 'redis' | 'playwright' | 'crm' | 'webhooks';
  name: string;
  category: 'AI Engine' | 'Infrastructure' | 'Automation' | 'Ecosystem';
  description: string;
  status: 'Connected' | 'Mock Mode' | 'Standby' | 'Configured';
  config: Record<string, string | number | boolean>;
  lastCheckedAt: string;
}

export type AIProviderPreference = 'gemini' | 'mock';

export interface AITelemetryState {
  providerPreference: AIProviderPreference;
  totalRequests: number;
  geminiSuccessCount: number;
  retryCountTotal: number;
  rateLimitHits: number;
  overloadHits: number;
  fallbackCount: number;
  lastStatus: AIExecutionStatus;
  lastError?: string;
  lastCheckedAt: string;
  rpmWindowCount: number;
  rpmLimit: number;
  maxRetries: number;
  baseRetryDelayMs: number;
}

export interface LiveAiStatus {
  status: AIExecutionStatus;
  operation: string;
  attempt: number;
  maxRetries: number;
  lastError?: string;
  updatedAt: string;
  providerPreference?: AIProviderPreference;
  geminiConfigured?: boolean;
  providerAvailability?: string;
  rateLimitStatus?: 'Nominal' | 'Approaching Limit' | 'Rate Limited';
  rpmWindowCount?: number;
  rpmLimit?: number;
  retryCountTotal?: number;
  rateLimitHits?: number;
  overloadHits?: number;
  fallbackCount?: number;
}

export interface SystemServiceStatus {
  id: string;
  name: string;
  classification: 'REAL INTEGRATION' | 'SIMULATED SERVICE' | 'NOT CONFIGURED';
  status: string;
  detail: string;
  endpoint: string;
  latencyLabel: string;
  lastChecked?: string;
  lastError?: string;
}

export interface ModuleTestResult {
  id: string;
  name: string;
  status: 'Passed' | 'Failed';
  durationMs: number;
  detail: string;
  error?: string;
  checkedAt: string;
}

export interface SystemHealthSnapshot {
  demoMode: boolean;
  geminiConfigured: boolean;
  effectiveAiMode: 'gemini' | 'mock';
  aiTelemetry: AITelemetryState;
  liveAiStatus: LiveAiStatus;
  services: SystemServiceStatus[];
  workerSummary: {
    workersReady: number;
    activeSessions: number;
    rateLimitedSessions: number;
    queuedJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalBrowserExecutions: number;
  };
}

export interface AutomationRunStepTrace {
  stepNumber: number;
  title: string;
  status: 'Completed' | 'Mock Mode' | 'Failed';
  durationMs: number;
  summary: string;
  assertionPassed: boolean;
  timestamp: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface AutomationRunRecord {
  id: string;
  triggerType: 'Manual Demo' | 'Automated E2E Test';
  leadId: string;
  leadName: string;
  leadCompany: string;
  campaignId: string;
  campaignName: string;
  aiProviderRequested: AIProviderPreference;
  aiProviderUsed: 'gemini' | 'mock';
  fallbackActivated: boolean;
  retryCount: number;
  status: 'Passed' | 'Completed' | 'Failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  jobIds: string[];
  followUpJobId?: string;
  workerId?: string;
  sessionId?: string;
  executionId?: string;
  verifiedAllSteps?: boolean;
  steps: AutomationRunStepTrace[];
}

export interface BootstrapResponse {
  leads: Lead[];
  campaigns: Campaign[];
  sessions: BrowserSession[];
  jobs: BackgroundJob[];
  executions: BrowserExecution[];
  agentDecisions: AgentDecision[];
  activityLogs: ActivityLog[];
  integrations: IntegrationSetting[];
  automationRuns: AutomationRunRecord[];
  systemHealth: SystemHealthSnapshot;
  analytics: AnalyticsSummary;
  postgresDdl: string;
  environment: {
    geminiConfigured: boolean;
    aiMode: 'gemini' | 'mock';
    browserMode: string;
  };
}
