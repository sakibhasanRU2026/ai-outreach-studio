import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { repository } from '../db/store.ts';
import type {
  AIExecutionStatus,
  AIProviderPreference,
  AITelemetryState,
  AgentRecommendationType,
  Campaign,
  Lead,
  MessageLength,
  MessageTone,
  MessageTypeOption,
  PersonalizationLevel,
} from '../types.ts';

export interface LeadResearchResult {
  profileSummary: string;
  companyOverview: string;
  painPoints: string[];
  industryContext: string;
  outreachOpportunities: string[];
  conversationStarters: string[];
  aiInsights: string;
  recommendedNextAction: string;
  suggestedLeadScore: number;
  mode: 'gemini' | 'mock';
  aiStatus: AIExecutionStatus;
  retryAttempts: number;
  fallbackActivated: boolean;
  fallbackReason?: string;
}

export interface PersonalizeOptions {
  tone: MessageTone;
  customFocus?: string;
  messageType?: MessageTypeOption;
  campaignObjective?: string;
  targetAudience?: string;
  offer?: string;
  messageLength?: MessageLength;
  personalizationLevel?: PersonalizationLevel;
}

export interface PersonalizeMessageResult {
  connectionMessage: string;
  firstOutreachMessage: string;
  followUpMessage: string;
  salesIntroMessage: string;
  reengagementMessage: string;
  primaryMessage: string;
  messageType: MessageTypeOption;
  relevanceReason: string;
  tone: MessageTone;
  mode: 'gemini' | 'mock';
  aiStatus: AIExecutionStatus;
  retryAttempts: number;
  fallbackActivated: boolean;
  fallbackReason?: string;
}

export interface AgentEvaluationResult {
  recommendation: AgentRecommendationType;
  confidenceScore: number;
  explanation: string;
  mode: 'gemini' | 'mock';
  retryAttempts: number;
  fallbackActivated: boolean;
  fallbackReason?: string;
}

export interface LiveAiStatus {
  status: AIExecutionStatus;
  operation: string;
  attempt: number;
  maxRetries: number;
  lastError?: string;
  updatedAt: string;
}

let currentLiveStatus: LiveAiStatus = {
  status: 'Completed',
  operation: 'Idle',
  attempt: 0,
  maxRetries: 3,
  updatedAt: new Date().toISOString(),
};

const rpmRequestTimestamps: number[] = [];

function recordRpmHit(): number {
  const now = Date.now();
  rpmRequestTimestamps.push(now);
  pruneRpmWindow(now);
  return rpmRequestTimestamps.length;
}

function pruneRpmWindow(now = Date.now()): number {
  const cutoff = now - 60_000;
  while (rpmRequestTimestamps.length > 0 && rpmRequestTimestamps[0] < cutoff) {
    rpmRequestTimestamps.shift();
  }
  return rpmRequestTimestamps.length;
}

export function getSyncedAiTelemetry(): AITelemetryState {
  const state = repository.load();
  state.aiTelemetry.rpmWindowCount = pruneRpmWindow();
  return { ...state.aiTelemetry };
}

export function getLiveAiStatus(): LiveAiStatus {
  return { ...currentLiveStatus };
}

function setLiveAiStatus(patch: Partial<LiveAiStatus>): void {
  currentLiveStatus = {
    ...currentLiveStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiKeyConfigured(): boolean {
  return getGeminiClient() !== null;
}

export function updateAiRetryConfig(maxRetries: number, baseRetryDelayMs: number): AITelemetryState {
  const state = repository.load();
  state.aiTelemetry.maxRetries = Math.min(5, Math.max(0, Math.round(maxRetries)));
  state.aiTelemetry.baseRetryDelayMs = Math.min(5000, Math.max(100, Math.round(baseRetryDelayMs)));
  state.aiTelemetry.lastCheckedAt = new Date().toISOString();

  setLiveAiStatus({
    maxRetries: state.aiTelemetry.maxRetries,
    operation: `Updated retry policy (${state.aiTelemetry.maxRetries} retries · ${state.aiTelemetry.baseRetryDelayMs}ms base backoff)`,
  });

  repository.addActivity({
    category: 'System',
    title: 'AI retry & backoff policy updated',
    detail: `Configured maxRetries=${state.aiTelemetry.maxRetries}, baseRetryDelayMs=${state.aiTelemetry.baseRetryDelayMs}ms.`,
    status: 'Info',
  });
  repository.save();
  return { ...state.aiTelemetry };
}

export function setAiProviderPreference(preference: AIProviderPreference): AITelemetryState {
  const state = repository.load();
  const keyConfigured = isGeminiKeyConfigured();
  const now = new Date().toISOString();

  state.aiTelemetry.providerPreference = preference;
  state.aiTelemetry.lastCheckedAt = now;
  state.aiTelemetry.rpmWindowCount = pruneRpmWindow();
  state.aiTelemetry.lastStatus =
    preference === 'mock' ? 'Mock Mode' : keyConfigured ? 'Completed' : 'Mock Mode';

  const geminiInt = state.integrations.find((item) => item.id === 'gemini');
  if (geminiInt) {
    geminiInt.status =
      preference === 'mock' ? 'Mock Mode' : keyConfigured ? 'Connected' : 'Mock Mode';
    geminiInt.lastCheckedAt = now;
  }

  setLiveAiStatus({
    status: state.aiTelemetry.lastStatus,
    operation: `Switched AI provider to ${preference === 'gemini' ? 'Google Gemini' : 'Local Mock AI'}`,
    attempt: 0,
    maxRetries: state.aiTelemetry.maxRetries ?? 3,
    lastError: undefined,
  });

  repository.addActivity({
    category: 'System',
    title: `AI provider switched to ${preference === 'gemini' ? 'Google Gemini' : 'Mock AI'}`,
    detail:
      preference === 'mock'
        ? 'All lead research, copy personalization, and agent decisions will execute deterministically via Mock AI.'
        : keyConfigured
        ? `Requests routed to Google Gemini API with ${state.aiTelemetry.maxRetries}x automatic retry & Mock AI fallback protection.`
        : 'Google Gemini selected, but server API key is not configured; automatic Mock AI fallback remains active.',
    status: 'Info',
  });
  repository.save();
  return { ...state.aiTelemetry };
}

export async function probeGeminiHealth(): Promise<{
  ok: boolean;
  provider: 'gemini' | 'mock';
  latencyMs: number;
  status: AIExecutionStatus;
  message: string;
  checkedAt: string;
}> {
  const started = Date.now();
  const state = repository.load();
  const ai = getGeminiClient();
  const now = new Date().toISOString();

  if (state.aiTelemetry.providerPreference === 'mock') {
    state.aiTelemetry.lastCheckedAt = now;
    state.aiTelemetry.lastStatus = 'Mock Mode';
    state.aiTelemetry.rpmWindowCount = pruneRpmWindow();
    repository.save();
    return {
      ok: true,
      provider: 'mock',
      latencyMs: Date.now() - started + 2,
      status: 'Mock Mode',
      message: 'Mock AI engine active by operator preference — zero external latency.',
      checkedAt: now,
    };
  }

  if (!ai) {
    state.aiTelemetry.lastCheckedAt = now;
    state.aiTelemetry.lastStatus = 'Mock Mode';
    state.aiTelemetry.lastError = 'Server GEMINI_API_KEY not configured';
    state.aiTelemetry.rpmWindowCount = pruneRpmWindow();
    repository.save();
    return {
      ok: true,
      provider: 'mock',
      latencyMs: Date.now() - started + 2,
      status: 'Mock Mode',
      message: 'Gemini key absent in environment; automatic local Mock AI engine is ready.',
      checkedAt: now,
    };
  }

  state.aiTelemetry.totalRequests += 1;
  state.aiTelemetry.rpmWindowCount = recordRpmHit();
  try {
    await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: 'Respond with OK.',
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const latencyMs = Date.now() - started;
    state.aiTelemetry.geminiSuccessCount += 1;
    state.aiTelemetry.lastStatus = 'Completed';
    state.aiTelemetry.lastError = undefined;
    state.aiTelemetry.lastCheckedAt = new Date().toISOString();
    repository.addActivity({
      category: 'System',
      title: 'Gemini health check passed',
      detail: `Verified live Google Gemini API response in ${latencyMs}ms.`,
      status: 'Success',
    });
    repository.save();
    return {
      ok: true,
      provider: 'gemini',
      latencyMs,
      status: 'Completed',
      message: `Live Gemini API reachable (${latencyMs}ms).`,
      checkedAt: state.aiTelemetry.lastCheckedAt,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const info = extractErrorInfo(err);
    if (info.isOverload) state.aiTelemetry.overloadHits += 1;
    if (info.isRateLimit) state.aiTelemetry.rateLimitHits += 1;
    state.aiTelemetry.lastStatus = 'Mock Mode';
    state.aiTelemetry.lastError = info.message;
    state.aiTelemetry.lastCheckedAt = new Date().toISOString();
    repository.addActivity({
      category: 'System',
      title: 'Gemini health probe degraded',
      detail: `${info.message} — fallback Mock AI stays ready.`,
      status: 'Warning',
    });
    repository.save();
    return {
      ok: false,
      provider: 'mock',
      latencyMs,
      status: 'Mock Mode',
      message: `${info.message} (Mock AI fallback ready)`,
      checkedAt: state.aiTelemetry.lastCheckedAt,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorInfo(err: unknown): {
  message: string;
  isTransient: boolean;
  isRateLimit: boolean;
  isOverload: boolean;
} {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
      ? JSON.stringify(err)
      : String(err);

  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  const isRateLimit = status === 429 || /\b429\b/.test(rawMessage) || /RESOURCE_EXHAUSTED/i.test(rawMessage);
  const isOverload =
    status === 503 || /\b503\b/.test(rawMessage) || /UNAVAILABLE|OVERLOADED/i.test(rawMessage);

  const isTransient =
    isOverload ||
    isRateLimit ||
    status === 502 ||
    status === 504 ||
    status === 500 ||
    /\b(503|429|502|504)\b/.test(rawMessage) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|OVERLOADED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|timeout|socket/i.test(
      rawMessage
    );

  let cleanMessage = rawMessage;
  if (isOverload) {
    cleanMessage = '503 UNAVAILABLE: Gemini model temporarily overloaded';
  } else if (isRateLimit) {
    cleanMessage = '429 RESOURCE_EXHAUSTED: Gemini rate limit reached';
  } else if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(rawMessage)) {
    cleanMessage = 'Temporary network error reaching Gemini API';
  }

  return { message: cleanMessage, isTransient, isRateLimit, isOverload };
}

async function executeWithRetryAndFallback<T>(params: {
  operation: string;
  geminiCall: () => Promise<T>;
  mockFallback: (meta: {
    retryAttempts: number;
    fallbackActivated: boolean;
    fallbackReason?: string;
  }) => T;
  maxRetries?: number;
  baseDelayMs?: number;
}): Promise<T> {
  const state = repository.load();
  const maxRetries = params.maxRetries ?? state.aiTelemetry.maxRetries ?? 3;
  const baseDelayMs = params.baseDelayMs ?? state.aiTelemetry.baseRetryDelayMs ?? 450;
  const ai = getGeminiClient();

  state.aiTelemetry.totalRequests += 1;
  state.aiTelemetry.rpmWindowCount = recordRpmHit();
  state.aiTelemetry.lastCheckedAt = new Date().toISOString();

  if (state.aiTelemetry.providerPreference === 'mock') {
    state.aiTelemetry.lastStatus = 'Mock Mode';
    state.aiTelemetry.lastError = undefined;
    repository.save();
    setLiveAiStatus({
      status: 'Mock Mode',
      operation: params.operation,
      attempt: 0,
      maxRetries,
      lastError: undefined,
    });
    return params.mockFallback({
      retryAttempts: 0,
      fallbackActivated: false,
      fallbackReason: 'Mock AI provider selected by operator.',
    });
  }

  if (!ai) {
    state.aiTelemetry.lastStatus = 'Mock Mode';
    state.aiTelemetry.lastError = 'Gemini API key not configured in server environment';
    repository.save();
    setLiveAiStatus({
      status: 'Mock Mode',
      operation: params.operation,
      attempt: 0,
      maxRetries,
      lastError: undefined,
    });
    return params.mockFallback({
      retryAttempts: 0,
      fallbackActivated: false,
      fallbackReason: 'Gemini API key not configured in server environment; running local Mock AI.',
    });
  }

  let lastErrorMsg = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        setLiveAiStatus({
          status: 'Retrying',
          operation: params.operation,
          attempt,
          maxRetries,
          lastError: lastErrorMsg,
        });
        await sleep(delayMs);
      }

      const result = await params.geminiCall();
      state.aiTelemetry.geminiSuccessCount += 1;
      state.aiTelemetry.lastStatus = 'Completed';
      state.aiTelemetry.lastError = undefined;
      state.aiTelemetry.lastCheckedAt = new Date().toISOString();
      repository.save();
      setLiveAiStatus({
        status: 'Completed',
        operation: params.operation,
        attempt,
        maxRetries,
        lastError: undefined,
      });
      return result;
    } catch (err) {
      const info = extractErrorInfo(err);
      lastErrorMsg = info.message;
      if (info.isRateLimit) state.aiTelemetry.rateLimitHits += 1;
      if (info.isOverload) state.aiTelemetry.overloadHits += 1;

      if (info.isTransient && attempt < maxRetries) {
        state.aiTelemetry.retryCountTotal += 1;
        state.aiTelemetry.lastStatus = 'Retrying';
        state.aiTelemetry.lastError = info.message;
        repository.save();
        setLiveAiStatus({
          status: 'Retrying',
          operation: params.operation,
          attempt: attempt + 1,
          maxRetries,
          lastError: info.message,
        });
        continue;
      }

      const reason =
        attempt > 0
          ? `${info.message} after ${attempt} ${attempt === 1 ? 'retry' : 'retries'}`
          : info.message;

      state.aiTelemetry.fallbackCount += 1;
      state.aiTelemetry.lastStatus = 'Mock Mode';
      state.aiTelemetry.lastError = reason;
      state.aiTelemetry.lastCheckedAt = new Date().toISOString();
      repository.save();

      setLiveAiStatus({
        status: 'Mock Mode',
        operation: params.operation,
        attempt,
        maxRetries,
        lastError: reason,
      });

      return params.mockFallback({
        retryAttempts: attempt,
        fallbackActivated: true,
        fallbackReason: reason,
      });
    }
  }

  state.aiTelemetry.fallbackCount += 1;
  state.aiTelemetry.lastStatus = 'Mock Mode';
  state.aiTelemetry.lastError = lastErrorMsg || 'Gemini provider temporarily unavailable';
  repository.save();

  setLiveAiStatus({
    status: 'Mock Mode',
    operation: params.operation,
    attempt: maxRetries,
    maxRetries,
    lastError: lastErrorMsg,
  });

  return params.mockFallback({
    retryAttempts: maxRetries,
    fallbackActivated: true,
    fallbackReason: lastErrorMsg || 'Gemini provider temporarily unavailable',
  });
}

function buildMockLeadResearch(
  lead: Lead,
  meta: { retryAttempts: number; fallbackActivated: boolean; fallbackReason?: string }
): LeadResearchResult {
  const industryLower = lead.industry.toLowerCase();
  const isFounder = /founder|ceo|owner|partner|managing/i.test(lead.jobTitle);
  const isRevOps = /revops|revenue|sales|growth|marketing|gtm/i.test(lead.jobTitle);

  const roleFocus = isFounder
    ? 'scaling repeatable outbound pipeline without adding heavy SDR headcount'
    : isRevOps
    ? 'improving outbound conversion rates, sequence observability, and rep governance'
    : 'modernizing buyer outreach and prioritizing high-intent accounts';

  const painPoints = isFounder
    ? [
        `Transitioning ${lead.company} from founder-led outreach to a scalable, high-signal outbound system`,
        `Preventing generic automated messaging from hurting ${lead.company}'s executive reputation in ${lead.industry}`,
        `Eliminating hours of manual prospect research before high-value enterprise conversations`,
        `Keeping safe pacing and human approval gates across every outbound touchpoint`,
      ]
    : [
        `Low reply rates when ${lead.industry} outreach lacks account-specific research context`,
        `Fragmented handoff between AI research notes, outbound sequencing, and CRM updates at ${lead.company}`,
        `Enforcing safe daily rate limits and session health across outbound operator accounts`,
      ];

  const profileSummary =
    lead.profileSummary && lead.profileSummary.length > 40
      ? `${lead.profileSummary} Currently focused on ${roleFocus} in ${lead.location}.`
      : `${lead.name} is ${lead.jobTitle} at ${lead.company}, spearheading ${industryLower} strategy from ${lead.location} with emphasis on ${roleFocus}.`;

  const companyOverview =
    lead.companyOverview && lead.companyOverview.length > 40
      ? lead.companyOverview
      : `${lead.company} is an active ${lead.industry} organization based in ${lead.location} competing for high-intent B2B buyers where personalized, research-backed outreach drives pipeline velocity.`;

  const industryContext = `${lead.industry} buyers increasingly filter out high-volume generic sequences; teams standing out pair live account research with controlled daily pacing and human-in-the-loop quality checks.`;

  const outreachOpportunities = [
    `Reference ${lead.company}'s ${lead.industry} buyer motion and manual prospect research bottlenecks.`,
    `Offer a lightweight pilot workflow showing 11-step research-to-follow-up observability with human review gates.`,
    `Anchor ROI around protecting ${lead.jobTitle} capacity while raising positive reply conversion.`,
  ];

  const conversationStarters = [
    `How is ${lead.company} currently splitting prospect research between reps and automation?`,
    `In ${lead.industry}, we see top ${lead.jobTitle}s requiring human approval before AI drafts queue for send—how are you governing quality today?`,
    `Curious whether reply-to-meeting dropoff at ${lead.company} is mostly targeting precision or follow-up timing?`,
  ];

  const aiInsights = `Strong ICP alignment (${lead.industry} · ${lead.jobTitle}): ${lead.name} is positioned to value structured AI prospect briefs paired with human-in-the-loop approval and sandboxed execution telemetry.`;

  const recommendedNextAction = isFounder
    ? `Draft an Executive Peer connection request highlighting ${lead.company}'s ${lead.industry} growth priorities and queue a sandbox simulation.`
    : `Send a Consultative connection note addressing ${lead.industry} research-to-reply bottlenecks and schedule a 48h follow-up check.`;

  return {
    profileSummary,
    companyOverview,
    painPoints: painPoints.slice(0, 3),
    industryContext,
    outreachOpportunities,
    conversationStarters,
    aiInsights,
    recommendedNextAction,
    suggestedLeadScore: Math.min(98, Math.max(lead.leadScore, 87)),
    mode: 'mock',
    aiStatus: 'Mock Mode',
    retryAttempts: meta.retryAttempts,
    fallbackActivated: meta.fallbackActivated,
    fallbackReason: meta.fallbackReason,
  };
}

function selectPrimaryByType(
  result: Pick<
    PersonalizeMessageResult,
    'connectionMessage' | 'firstOutreachMessage' | 'followUpMessage' | 'salesIntroMessage' | 'reengagementMessage'
  >,
  messageType: MessageTypeOption
): string {
  switch (messageType) {
    case 'First Outreach':
      return result.firstOutreachMessage;
    case 'Follow-up':
      return result.followUpMessage;
    case 'Sales Introduction':
      return result.salesIntroMessage;
    case 'Re-engagement':
      return result.reengagementMessage;
    case 'Connection Request':
    default:
      return result.connectionMessage;
  }
}

function buildMockPersonalization(
  lead: Lead,
  options: PersonalizeOptions,
  meta: { retryAttempts: number; fallbackActivated: boolean; fallbackReason?: string }
): PersonalizeMessageResult {
  const {
    tone,
    customFocus,
    messageType = 'Connection Request',
    campaignObjective,
    targetAudience,
    offer,
    messageLength = 'Standard',
    personalizationLevel = 'Deep',
  } = options;
  const safeTone: MessageTone =
    tone === 'Consultative' ||
    tone === 'Direct & Concise' ||
    tone === 'Executive Peer' ||
    tone === 'Warm Challenger'
      ? tone
      : 'Executive Peer';
  const firstName = lead.name.split(' ')[0] || lead.name;
  const focusClause = customFocus ? ` Especially around ${customFocus}.` : '';
  const offerClause = offer ? ` Worth sharing our ${offer}?` : '';
  const objClause = campaignObjective ? ` Aligned with ${campaignObjective.toLowerCase()}.` : '';
  const detailSuffix =
    messageLength === 'Detailed'
      ? ` Teams similar to ${lead.company} typically see higher acceptance when every note pairs specific ${lead.industry} pain points with zero-fluff context.${offerClause}`
      : messageLength === 'Short'
      ? ''
      : offerClause;

  const toneOpeners: Record<MessageTone, string> = {
    Consultative: `Hi ${firstName} — noticed your work leading ${lead.jobTitle} priorities at ${lead.company}. Teams in ${lead.industry} often hit friction balancing deep account research with outbound speed. Would be glad to connect.`,
    'Direct & Concise': `Hi ${firstName}, following ${lead.company}’s momentum in ${lead.industry}. Built an AI research + outreach workflow helping ${lead.jobTitle}s lift reply rates without manual prep. Open to connecting?`,
    'Executive Peer': `Hi ${firstName} — always great connecting with leaders shaping ${lead.industry}. Admire what you’re building at ${lead.company} in ${lead.location} and would enjoy staying in touch.`,
    'Warm Challenger': `Hi ${firstName} — quick question for a ${lead.jobTitle} at ${lead.company}: how much team capacity still goes to manual account prep before first touch? Would love to connect and compare notes.`,
  };

  const firstOutreachMap: Record<MessageTone, string> = {
    Consultative: `Hi ${firstName} — appreciated your work with ${lead.company} in ${lead.industry}. As you focus on ${lead.painPoints[0] || 'outbound efficiency'}, we built a supervised AI research-to-outreach workflow for ${targetAudience || lead.jobTitle + 's'}.${focusClause}${detailSuffix}`,
    'Direct & Concise': `${firstName} — quick note on ${lead.company}'s outbound motion: we cut manual account research down to seconds with Gemini briefs and strict human approval gates.${focusClause}${detailSuffix}`,
    'Executive Peer': `Hi ${firstName}, as ${lead.company} scales across ${lead.location}, leaders in ${lead.industry} are pairing AI research with human-verified outreach to protect brand quality.${focusClause}${detailSuffix}`,
    'Warm Challenger': `Quick observation for ${lead.company}, ${firstName}: most ${lead.industry} teams automate volume first and relevance second. Reversing that order lifts replies significantly.${focusClause}${detailSuffix}`,
  };

  const followUps: Record<MessageTone, string> = {
    Consultative: `Thanks for connecting, ${firstName}! Based on ${lead.company}’s focus in ${lead.industry}, happy to share a concise breakdown of how teams automate prospect briefs while keeping human approval on every send.${focusClause}${detailSuffix}`,
    'Direct & Concise': `Appreciate the connect, ${firstName}. If reducing manual outreach prep at ${lead.company} is on your Q1 roadmap, I can send over a 2-minute workflow overview.${focusClause}${detailSuffix}`,
    'Executive Peer': `Thanks for connecting, ${firstName}. As ${lead.company} scales in ${lead.location}, curious how your team balances AI personalization speed with brand-safe human review?${focusClause}${detailSuffix}`,
    'Warm Challenger': `Glad we connected, ${firstName}. Most ${lead.industry} teams tell us 70% of outbound underperforms because messages lack live account context. Worth sharing how we solve that cleanly?${focusClause}${detailSuffix}`,
  };

  const salesIntroMessage = `Hi ${firstName} — introducing AI Outreach Studio for ${lead.company}. We combine automated ${lead.industry} prospect research, tone-calibrated personalization, and safe worker pacing.${objClause}${offerClause || ' Open to a 12-minute architecture walkthrough next week?'}`;
  const reengagementMessage = `Hi ${firstName} — circling back briefly as ${lead.company} moves into its next ${lead.industry} planning cycle. If automating prospect briefs with full human approval is back on the radar, happy to share updated benchmarks.${focusClause}`;

  const connectionMessage =
    messageLength === 'Short'
      ? `Hi ${firstName} — following ${lead.company}'s work in ${lead.industry}. Would be great to connect.`
      : toneOpeners[safeTone].slice(0, 300);

  const primaryPain =
    lead.painPoints[0] || `${lead.industry} outbound personalization and research efficiency`;

  const draftSet = {
    connectionMessage,
    firstOutreachMessage: firstOutreachMap[safeTone],
    followUpMessage: followUps[safeTone],
    salesIntroMessage,
    reengagementMessage,
  };

  return {
    ...draftSet,
    primaryMessage: selectPrimaryByType(draftSet, messageType),
    messageType,
    relevanceReason: `Tailored (${personalizationLevel} personalization · ${messageLength} length · ${safeTone} tone) for ${lead.name} (${lead.jobTitle} at ${lead.company}), targeting ${primaryPain}${customFocus ? ` with focus on "${customFocus}"` : ''}.`,
    tone: safeTone,
    mode: 'mock',
    aiStatus: 'Mock Mode',
    retryAttempts: meta.retryAttempts,
    fallbackActivated: meta.fallbackActivated,
    fallbackReason: meta.fallbackReason,
  };
}

export async function researchLeadWithAI(lead: Lead): Promise<LeadResearchResult> {
  return executeWithRetryAndFallback<LeadResearchResult>({
    operation: `Lead Research · ${lead.name}`,
    geminiCall: async () => {
      const ai = getGeminiClient()!;
      const prompt = `Analyze this B2B prospect strictly using the supplied information. Do not invent external facts not grounded in the input; frame hypotheses clearly as potential business challenges.

Prospect Name: ${lead.name}
Job Title: ${lead.jobTitle}
Company: ${lead.company}
Industry: ${lead.industry}
Location: ${lead.location}
Existing Notes: ${lead.profileSummary || 'None supplied'}

Return concise, commercial B2B sales intelligence including industryContext, outreachOpportunities (3 bullets), conversationStarters (3 natural opener questions), painPoints (3 bullets), aiInsights, and recommendedNextAction.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are an expert B2B outbound revenue researcher. Be crisp, factual, and grounded in the supplied prospect fields. Never fabricate unseen company financials.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              profileSummary: { type: Type.STRING },
              companyOverview: { type: Type.STRING },
              painPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              industryContext: { type: Type.STRING },
              outreachOpportunities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              conversationStarters: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiInsights: { type: Type.STRING },
              recommendedNextAction: { type: Type.STRING },
              suggestedLeadScore: { type: Type.INTEGER },
            },
            required: [
              'profileSummary',
              'companyOverview',
              'painPoints',
              'industryContext',
              'outreachOpportunities',
              'conversationStarters',
              'aiInsights',
              'recommendedNextAction',
              'suggestedLeadScore',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Omit<
        LeadResearchResult,
        'mode' | 'aiStatus' | 'retryAttempts' | 'fallbackActivated'
      >;
      return {
        profileSummary: parsed.profileSummary,
        companyOverview: parsed.companyOverview,
        painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints.slice(0, 4) : [],
        industryContext: parsed.industryContext || `${lead.industry} market dynamics around high-signal outbound.`,
        outreachOpportunities: Array.isArray(parsed.outreachOpportunities)
          ? parsed.outreachOpportunities.slice(0, 4)
          : [],
        conversationStarters: Array.isArray(parsed.conversationStarters)
          ? parsed.conversationStarters.slice(0, 4)
          : [],
        aiInsights: parsed.aiInsights,
        recommendedNextAction: parsed.recommendedNextAction,
        suggestedLeadScore: Math.min(
          99,
          Math.max(50, Number(parsed.suggestedLeadScore) || lead.leadScore)
        ),
        mode: 'gemini' as const,
        aiStatus: 'Completed' as const,
        retryAttempts: currentLiveStatus.attempt,
        fallbackActivated: false,
      };
    },
    mockFallback: (meta) => buildMockLeadResearch(lead, meta),
  });
}

export async function personalizeOutreachWithAI(
  lead: Lead,
  toneOrOptions: MessageTone | PersonalizeOptions,
  customFocusArg?: string
): Promise<PersonalizeMessageResult> {
  const options: PersonalizeOptions =
    typeof toneOrOptions === 'string'
      ? { tone: toneOrOptions, customFocus: customFocusArg }
      : toneOrOptions;

  const {
    tone,
    customFocus,
    messageType = 'Connection Request',
    campaignObjective = 'Book discovery conversation',
    targetAudience = lead.jobTitle,
    offer = '12-minute workflow architecture walkthrough',
    messageLength = 'Standard',
    personalizationLevel = 'Deep',
  } = options;

  return executeWithRetryAndFallback<PersonalizeMessageResult>({
    operation: `Message Personalization · ${lead.name} (${messageType})`,
    geminiCall: async () => {
      const ai = getGeminiClient()!;
      const prompt = `Generate personalized B2B outreach drafts and a 1-sentence relevance explanation.

Prospect: ${lead.name}, ${lead.jobTitle} at ${lead.company} (${lead.industry}, ${lead.location})
Summary: ${lead.profileSummary}
Pain Points: ${lead.painPoints.join('; ')}
Tone: ${tone}
Primary Message Type Requested: ${messageType}
Campaign Objective: ${campaignObjective}
Target Audience: ${targetAudience}
Offer / CTA: ${offer}
Preferred Length: ${messageLength}
Personalization Depth: ${personalizationLevel}
${customFocus ? `Additional Operator Focus: ${customFocus}` : ''}

Produce 5 tailored message variants:
- connectionMessage: strictly under 280 chars
- firstOutreachMessage: direct first message
- followUpMessage: warm post-connection follow-up
- salesIntroMessage: consultative value intro referencing the offer
- reengagementMessage: polite check-in for stalled prospects
Plus relevanceReason explaining why this messaging matches ${lead.name}. Avoid buzzwords or exclamation overload.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a senior B2B copywriter. Produce human-sounding, high-signal outreach messages calibrated to tone, length, and personalization level.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              connectionMessage: { type: Type.STRING },
              firstOutreachMessage: { type: Type.STRING },
              followUpMessage: { type: Type.STRING },
              salesIntroMessage: { type: Type.STRING },
              reengagementMessage: { type: Type.STRING },
              relevanceReason: { type: Type.STRING },
            },
            required: [
              'connectionMessage',
              'firstOutreachMessage',
              'followUpMessage',
              'salesIntroMessage',
              'reengagementMessage',
              'relevanceReason',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        connectionMessage: string;
        firstOutreachMessage: string;
        followUpMessage: string;
        salesIntroMessage: string;
        reengagementMessage: string;
        relevanceReason: string;
      };

      const draftSet = {
        connectionMessage: String(parsed.connectionMessage || '').slice(0, 300),
        firstOutreachMessage: String(parsed.firstOutreachMessage || ''),
        followUpMessage: String(parsed.followUpMessage || ''),
        salesIntroMessage: String(parsed.salesIntroMessage || ''),
        reengagementMessage: String(parsed.reengagementMessage || ''),
      };

      return {
        ...draftSet,
        primaryMessage: selectPrimaryByType(draftSet, messageType),
        messageType,
        relevanceReason: String(parsed.relevanceReason || ''),
        tone,
        mode: 'gemini' as const,
        aiStatus: 'Completed' as const,
        retryAttempts: currentLiveStatus.attempt,
        fallbackActivated: false,
      };
    },
    mockFallback: (meta) => buildMockPersonalization(lead, options, meta),
  });
}

export async function evaluateAgentContextWithAI(
  lead: Lead,
  campaign: Campaign | undefined,
  replyText?: string
): Promise<AgentEvaluationResult> {
  const allowedRecommendations: AgentRecommendationType[] = [
    'Generate personalized message',
    'Recommend follow-up',
    'Wait for response',
    'Mark lead interested',
    'Move lead to human review',
    'Stop campaign',
    'Request human approval',
  ];

  return executeWithRetryAndFallback<AgentEvaluationResult>({
    operation: `Agent Context Evaluation · ${lead.name}`,
    geminiCall: async () => {
      const ai = getGeminiClient()!;
      const prompt = `Evaluate this B2B outreach state and recommend the single best next decision.

Lead: ${lead.name} (${lead.jobTitle} at ${lead.company})
Status: ${lead.status}, Lead Score: ${lead.leadScore}
Campaign: ${campaign?.name ?? 'Unassigned'}
Latest Reply Snippet: ${replyText || 'No reply received yet'}
Has Draft Message: ${Boolean(lead.generatedConnectionMessage)}

Choose exactly one recommendation from: ${allowedRecommendations.join(', ')}. Provide confidenceScore (0.50 to 0.99) and a 1-2 sentence concise explanation.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are an autonomous outreach supervisor agent. Output only structured JSON with a crisp, transparent explanation—never internal reasoning.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendation: { type: Type.STRING },
              confidenceScore: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
            },
            required: ['recommendation', 'confidenceScore', 'explanation'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        recommendation: string;
        confidenceScore: number;
        explanation: string;
      };

      const validRec = allowedRecommendations.includes(
        parsed.recommendation as AgentRecommendationType
      )
        ? (parsed.recommendation as AgentRecommendationType)
        : 'Request human approval';

      return {
        recommendation: validRec,
        confidenceScore: Math.min(
          0.99,
          Math.max(0.5, Number(parsed.confidenceScore) || 0.85)
        ),
        explanation: parsed.explanation,
        mode: 'gemini' as const,
        retryAttempts: currentLiveStatus.attempt,
        fallbackActivated: false,
      };
    },
    mockFallback: (meta) => {
      let recommendation: AgentRecommendationType = 'Generate personalized message';
      let confidenceScore = 0.86;
      let explanation = `${lead.name} is at stage "${lead.status}" with a lead score of ${lead.leadScore}.`;

      if (replyText && /book|meet|call|interested|next week|demo|yes/i.test(replyText)) {
        recommendation = 'Mark lead interested';
        confidenceScore = 0.94;
        explanation = `Reply signals explicit interest ("${replyText.slice(0, 90)}"). Recommend marking Interested and routing to operator handoff.`;
      } else if (
        replyText &&
        /not interested|unsubscribe|stop|remove|no thanks/i.test(replyText)
      ) {
        recommendation = 'Stop campaign';
        confidenceScore = 0.96;
        explanation = `Prospect opted out in reply. Recommend halting sequence immediately to preserve brand trust.`;
      } else if (replyText && /security|legal|procurement|compliance|question|who else/i.test(replyText)) {
        recommendation = 'Move lead to human review';
        confidenceScore = 0.91;
        explanation = `Reply introduces nuanced compliance/stakeholder questions best handled by a senior operator.`;
      } else if (lead.status === 'Connected') {
        recommendation = 'Recommend follow-up';
        confidenceScore = 0.89;
        explanation = `Connection was accepted by ${lead.name}; timely value-first follow-up maximizes reply conversion.`;
      } else if (lead.status === 'Connection Sent') {
        recommendation = 'Wait for response';
        confidenceScore = 0.84;
        explanation = `Connection request is active in cooldown window; wait before sending next touchpoint.`;
      } else if (lead.leadScore >= 90 && !lead.generatedConnectionMessage) {
        recommendation = 'Move lead to human review';
        confidenceScore = 0.87;
        explanation = `High-value Tier-1 account (${lead.company}, score ${lead.leadScore}) warrants quick human review before sending.`;
      }

      return {
        recommendation,
        confidenceScore,
        explanation,
        mode: 'mock' as const,
        retryAttempts: meta.retryAttempts,
        fallbackActivated: meta.fallbackActivated,
        fallbackReason: meta.fallbackReason,
      };
    },
  });
}
