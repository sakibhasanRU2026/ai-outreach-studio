import fs from 'fs';
import path from 'path';
import type { ActivityLog, WorkspaceState } from '../types.ts';
import { createInitialSeedState } from './schema.ts';

const STORE_PATH = path.resolve('/tmp', 'ai-outreach-studio-store.json');

class DataRepository {
  private state: WorkspaceState | null = null;

  private isGeminiConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  public load(): WorkspaceState {
    if (this.state) {
      this.syncGeminiIntegrationStatus(this.state);
      return this.state;
    }

    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as WorkspaceState;
        if (parsed && Array.isArray(parsed.leads) && Array.isArray(parsed.campaigns)) {
          this.state = parsed;
          this.syncGeminiIntegrationStatus(this.state);
          return this.state;
        }
      }
    } catch {
      // Fallback to fresh seed if file is corrupted
    }

    this.state = createInitialSeedState(this.isGeminiConfigured());
    this.save();
    return this.state;
  }

  private syncGeminiIntegrationStatus(state: WorkspaceState): void {
    const geminiConfigured = this.isGeminiConfigured();
    if (!state.aiTelemetry) {
      state.aiTelemetry = {
        providerPreference: geminiConfigured ? 'gemini' : 'mock',
        totalRequests: 0,
        geminiSuccessCount: 0,
        retryCountTotal: 0,
        rateLimitHits: 0,
        overloadHits: 0,
        fallbackCount: 0,
        lastStatus: geminiConfigured ? 'Completed' : 'Mock Mode',
        lastCheckedAt: new Date().toISOString(),
        rpmWindowCount: 0,
        rpmLimit: 15,
        maxRetries: 3,
        baseRetryDelayMs: 450,
      };
    } else {
      state.aiTelemetry.maxRetries ??= 3;
      state.aiTelemetry.baseRetryDelayMs ??= 450;
    }
    if (!Array.isArray(state.automationRuns)) {
      state.automationRuns = [];
    }
    state.sessions.forEach((s, idx) => {
      if (!s.assignedWorker) {
        s.assignedWorker = `pw-worker-0${(idx % 3) + 1}`;
      }
      if (!Array.isArray(s.logs)) {
        s.logs = [`[${s.lastActive}] Session ${s.id} initialized (${s.status}).`];
      }
    });
    const geminiInt = state.integrations.find((item) => item.id === 'gemini');
    if (geminiInt) {
      geminiInt.status =
        state.aiTelemetry.providerPreference === 'mock'
          ? 'Mock Mode'
          : geminiConfigured
          ? 'Connected'
          : 'Mock Mode';
      geminiInt.config = {
        ...geminiInt.config,
        serverKeyConfigured: geminiConfigured,
      };
    }
  }

  public save(): void {
    if (!this.state) return;
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only edge cases; state remains live in memory
    }
  }

  public reset(): WorkspaceState {
    this.state = createInitialSeedState(this.isGeminiConfigured());
    this.save();
    return this.state;
  }

  public addActivity(entry: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
    const state = this.load();
    const item: ActivityLog = {
      id: `ACT-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    state.activityLogs.unshift(item);
    if (state.activityLogs.length > 120) {
      state.activityLogs = state.activityLogs.slice(0, 120);
    }
    this.save();
    return item;
  }

  public bumpTodayAnalytics(delta: {
    leadsProcessed?: number;
    connectionsSent?: number;
    connectionsAccepted?: number;
    repliesReceived?: number;
    positiveReplies?: number;
    failedExecutions?: number;
  }): void {
    const state = this.load();
    const todayStr = new Date().toISOString().slice(0, 10);
    let point = state.analyticsSeries.find((p) => p.date === todayStr);
    if (!point) {
      point = {
        date: todayStr,
        leadsProcessed: 0,
        connectionsSent: 0,
        connectionsAccepted: 0,
        repliesReceived: 0,
        positiveReplies: 0,
        failedExecutions: 0,
      };
      state.analyticsSeries.push(point);
    }
    point.leadsProcessed += delta.leadsProcessed ?? 0;
    point.connectionsSent += delta.connectionsSent ?? 0;
    point.connectionsAccepted += delta.connectionsAccepted ?? 0;
    point.repliesReceived += delta.repliesReceived ?? 0;
    point.positiveReplies += delta.positiveReplies ?? 0;
    point.failedExecutions += delta.failedExecutions ?? 0;
    this.save();
  }
}

export const repository = new DataRepository();
