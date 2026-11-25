import React, { useState } from 'react';
import { Bot, Check, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { StatusText, formatRelativeTime } from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type { AgentDecision, Lead } from '../types/outreach';

interface AiAgentViewProps {
  decisions: AgentDecision[];
  leads: Lead[];
  onRefresh: () => Promise<void>;
}

export function AiAgentView({ decisions, leads, onRefresh }: AiAgentViewProps) {
  const { pushToast } = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || '');
  const [replySnippet, setReplySnippet] = useState('');
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) return;
    setEvaluating(true);
    try {
      const res = await api.evaluateAgent(selectedLeadId, replySnippet.trim() || undefined);
      await onRefresh();
      setReplySnippet('');
      pushToast(
        'Agent evaluation ready',
        `Recommended "${res.decision.recommendation}" for ${res.decision.leadName}.`,
        'info'
      );
    } catch (err) {
      pushToast('Evaluation failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  const handleResolve = async (
    decision: AgentDecision,
    resolution: 'Approved' | 'Rejected'
  ) => {
    try {
      await api.resolveAgentDecision(decision.id, resolution);
      await onRefresh();
      pushToast(
        `Decision ${resolution.toLowerCase()}`,
        `${decision.recommendation} for ${decision.leadName}.`,
        resolution === 'Approved' ? 'success' : 'warning'
      );
    } catch (err) {
      pushToast('Action failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Context Evaluator Bar */}
      <form
        onSubmit={handleEvaluate}
        className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 font-display">
              Evaluate Campaign Context
            </h3>
            <p className="text-slate-400 mt-0.5">
              Analyze lead stage or an incoming prospect reply to generate a guarded next-action recommendation
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.company} ({l.status})
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-6">
            <input
              type="text"
              value={replySnippet}
              onChange={(e) => setReplySnippet(e.target.value)}
              placeholder="Optional prospect reply text (e.g. 'Interested — let us meet next Tuesday')"
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={evaluating}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2 font-medium text-white cursor-pointer"
            >
              {evaluating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
              <span>Evaluate</span>
            </button>
          </div>
        </div>
      </form>

      {/* Recommendations Queue */}
      <div className="divide-y divide-white/[0.08] rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        {decisions.map((d) => (
          <div
            key={d.id}
            className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
          >
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-slate-500">{d.id}</span>
                <span className="font-semibold text-slate-100 text-sm">{d.leadName}</span>
                <span className="text-slate-400">· {d.leadCompany}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300">{d.campaignName}</span>
                <span className="text-slate-500">/</span>
                <span className="text-blue-400">{d.campaignStage}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="font-medium text-slate-100">
                  Recommendation: <span className="text-blue-300">{d.recommendation}</span>
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  Confidence: {Math.round(d.confidenceScore * 100)}%
                </span>
                <span className="font-mono text-slate-500">
                  {formatRelativeTime(d.createdAt)}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                {d.explanation}
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {d.status === 'Pending' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleResolve(d, 'Rejected')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/30 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolve(d, 'Approved')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </>
              ) : (
                <StatusText status={d.status} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
