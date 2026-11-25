import { useEffect, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Save,
  Send,
  Loader2,
  Copy,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/ui/ToastProvider';
import { StatusText } from '../components/ui/StatusIndicator';
import type {
  Lead,
  MessageLength,
  MessageTone,
  MessageTypeOption,
  NavSection,
  PersonalizationLevel,
} from '../types/outreach';

interface AiResearchViewProps {
  leads: Lead[];
  initialLeadId?: string | null;
  aiMode: 'gemini' | 'mock';
  onRefresh: () => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const TONES: MessageTone[] = [
  'Executive Peer',
  'Consultative',
  'Direct & Concise',
  'Warm Challenger',
];

const MESSAGE_TYPES: MessageTypeOption[] = [
  'Connection Request',
  'First Outreach',
  'Follow-up',
  'Sales Introduction',
  'Re-engagement',
];

const LENGTHS: MessageLength[] = ['Short', 'Standard', 'Detailed'];
const LEVELS: PersonalizationLevel[] = ['Light', 'Balanced', 'Deep'];

export function AiResearchView({
  leads,
  initialLeadId,
  aiMode,
  onRefresh,
  onNavigate,
}: AiResearchViewProps) {
  const { pushToast } = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState<string>(
    initialLeadId || leads[0]?.id || ''
  );
  const [tone, setTone] = useState<MessageTone>('Executive Peer');
  const [messageType, setMessageType] = useState<MessageTypeOption>('Connection Request');
  const [messageLength, setMessageLength] = useState<MessageLength>('Standard');
  const [personalizationLevel, setPersonalizationLevel] =
    useState<PersonalizationLevel>('Deep');
  const [campaignObjective, setCampaignObjective] = useState('Book discovery conversation');
  const [targetAudience, setTargetAudience] = useState('');
  const [offer, setOffer] = useState('12-minute workflow architecture walkthrough');
  const [customFocus, setCustomFocus] = useState('');

  const [connectionDraft, setConnectionDraft] = useState('');
  const [firstOutreachDraft, setFirstOutreachDraft] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [salesIntroDraft, setSalesIntroDraft] = useState('');
  const [reengagementDraft, setReengagementDraft] = useState('');

  const [researchBusy, setResearchBusy] = useState(false);
  const [savingResearch, setSavingResearch] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [researchStatus, setResearchStatus] = useState<
    'Completed' | 'Retrying' | 'Mock Mode' | 'Failed'
  >(aiMode === 'gemini' ? 'Completed' : 'Mock Mode');
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || leads[0];

  useEffect(() => {
    if (initialLeadId) {
      setSelectedLeadId(initialLeadId);
    }
  }, [initialLeadId]);

  useEffect(() => {
    if (selectedLead) {
      setConnectionDraft(selectedLead.generatedConnectionMessage || '');
      setFirstOutreachDraft(selectedLead.generatedFirstOutreachMessage || '');
      setFollowUpDraft(selectedLead.generatedFollowUpMessage || '');
      setSalesIntroDraft(selectedLead.generatedSalesIntroMessage || '');
      setReengagementDraft(selectedLead.generatedReengagementMessage || '');
      setTargetAudience(selectedLead.jobTitle || '');
      if (selectedLead.selectedTone) {
        setTone(selectedLead.selectedTone);
      }
    }
  }, [
    selectedLead?.id,
    selectedLead?.generatedConnectionMessage,
    selectedLead?.generatedFirstOutreachMessage,
    selectedLead?.generatedFollowUpMessage,
    selectedLead?.generatedSalesIntroMessage,
    selectedLead?.generatedReengagementMessage,
  ]);

  if (!selectedLead) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-12 text-center text-sm text-slate-400">
        Add a lead first to run AI research and personalized message generation.
      </div>
    );
  }

  const activeDraftValue = (() => {
    switch (messageType) {
      case 'First Outreach':
        return firstOutreachDraft;
      case 'Follow-up':
        return followUpDraft;
      case 'Sales Introduction':
        return salesIntroDraft;
      case 'Re-engagement':
        return reengagementDraft;
      case 'Connection Request':
      default:
        return connectionDraft;
    }
  })();

  const setActiveDraftValue = (value: string) => {
    switch (messageType) {
      case 'First Outreach':
        setFirstOutreachDraft(value);
        break;
      case 'Follow-up':
        setFollowUpDraft(value);
        break;
      case 'Sales Introduction':
        setSalesIntroDraft(value);
        break;
      case 'Re-engagement':
        setReengagementDraft(value);
        break;
      case 'Connection Request':
      default:
        setConnectionDraft(value);
        break;
    }
  };

  const startStatusPoll = () =>
    window.setInterval(async () => {
      try {
        const live = await api.getAiStatus();
        if (live.status === 'Retrying') {
          setResearchStatus('Retrying');
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 350);

  const handleRunResearch = async () => {
    setResearchBusy(true);
    setFallbackMessage(null);
    const timer = startStatusPoll();
    try {
      const res = await api.researchLead(selectedLead.id);
      window.clearInterval(timer);
      setResearchStatus(res.research.aiStatus);
      await onRefresh();
      if (res.research.fallbackActivated) {
        const reason =
          res.research.fallbackReason ||
          'Gemini temporarily unavailable — switched to local Mock AI.';
        setFallbackMessage(reason);
        pushToast('AI Fallback Mode Activated', reason, 'warning');
      } else {
        pushToast(
          'Lead research complete',
          `Analyzed ${selectedLead.name} using ${res.research.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}.`,
          'success'
        );
      }
    } catch (err) {
      window.clearInterval(timer);
      setResearchStatus('Failed');
      pushToast('Research failed', err instanceof Error ? err.message : 'AI error', 'error');
    } finally {
      setResearchBusy(false);
    }
  };

  const handleSaveResearch = async () => {
    setSavingResearch(true);
    try {
      await api.updateLead(selectedLead.id, {
        profileSummary: selectedLead.profileSummary,
        companyOverview: selectedLead.companyOverview,
        painPoints: selectedLead.painPoints,
        industryContext: selectedLead.industryContext,
        outreachOpportunities: selectedLead.outreachOpportunities,
        conversationStarters: selectedLead.conversationStarters,
        aiInsights: selectedLead.aiInsights,
        recommendedNextAction: selectedLead.recommendedNextAction,
        researchSource: selectedLead.researchSource || aiMode,
      });
      await onRefresh();
      pushToast('Research saved', `Persisted dossier for ${selectedLead.name}.`, 'success');
    } catch (err) {
      pushToast('Save failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSavingResearch(false);
    }
  };

  const handleGenerateMessages = async () => {
    setGenerateBusy(true);
    const timer = startStatusPoll();
    try {
      const res = await api.personalizeLead(
        selectedLead.id,
        tone,
        customFocus.trim() || undefined,
        {
          messageType,
          campaignObjective,
          targetAudience,
          offer,
          messageLength,
          personalizationLevel,
        }
      );
      window.clearInterval(timer);
      setResearchStatus(res.result.aiStatus);
      setConnectionDraft(res.lead.generatedConnectionMessage || '');
      setFirstOutreachDraft(res.lead.generatedFirstOutreachMessage || '');
      setFollowUpDraft(res.lead.generatedFollowUpMessage || '');
      setSalesIntroDraft(res.lead.generatedSalesIntroMessage || '');
      setReengagementDraft(res.lead.generatedReengagementMessage || '');
      await onRefresh();
      if (res.result.fallbackActivated) {
        const reason =
          res.result.fallbackReason ||
          'Gemini temporarily unavailable — generated copy via local Mock AI.';
        setFallbackMessage(reason);
        pushToast('AI Fallback Mode Activated', reason, 'warning');
      } else {
        pushToast(
          'Outreach drafts generated',
          `Crafted all 5 message types in ${tone} tone (${res.result.mode === 'gemini' ? 'Gemini AI' : 'Mock AI'}).`,
          'success'
        );
      }
    } catch (err) {
      window.clearInterval(timer);
      setResearchStatus('Failed');
      pushToast('Generation failed', err instanceof Error ? err.message : 'AI error', 'error');
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleSaveEdits = async (approvalStatus?: 'Approved' | 'Rejected') => {
    setSavingDraft(true);
    try {
      await api.updateLead(selectedLead.id, {
        generatedConnectionMessage: connectionDraft,
        generatedFirstOutreachMessage: firstOutreachDraft,
        generatedFollowUpMessage: followUpDraft,
        generatedSalesIntroMessage: salesIntroDraft,
        generatedReengagementMessage: reengagementDraft,
        selectedTone: tone,
        approvalStatus: approvalStatus ?? selectedLead.approvalStatus,
      });
      await onRefresh();
      pushToast(
        approvalStatus ? `Copy ${approvalStatus}` : 'Draft saved',
        approvalStatus
          ? `Marked ${messageType} draft as ${approvalStatus} for ${selectedLead.name}.`
          : `Updated personalized messages for ${selectedLead.name}.`,
        approvalStatus === 'Rejected' ? 'warning' : 'success'
      );
    } catch (err) {
      pushToast('Save failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!activeDraftValue) return;
    try {
      await navigator.clipboard.writeText(activeDraftValue);
      pushToast('Copied to clipboard', `${messageType} copy copied.`, 'success');
    } catch {
      pushToast('Copy blocked', 'Clipboard unavailable in sandbox iframe.', 'warning');
    }
  };

  const handleQueueBrowserExecution = async () => {
    try {
      await api.queueJob({
        leadId: selectedLead.id,
        type: 'Browser Execution',
        campaignId: selectedLead.campaignId,
      });
      await onRefresh();
      pushToast(
        'Queued outreach job',
        `Added Browser Execution task for ${selectedLead.name} to Redis queue.`,
        'success'
      );
      onNavigate('job-queue');
    } catch (err) {
      pushToast('Queue failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const sourceLabel =
    selectedLead.researchSource === 'gemini' || (!selectedLead.researchSource && aiMode === 'gemini')
      ? 'Gemini AI'
      : 'Mock AI';

  return (
    <div className="space-y-6">
      {/* Top Selection Bar */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-slate-400 mb-1.5">
              Select Prospect for Research & Personalization
            </label>
            <select
              value={selectedLead.id}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full md:max-w-md rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.jobTitle} at {l.company} (Score {l.leadScore})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-[11px] text-slate-500 block">
                Source · {sourceLabel}
              </span>
              <StatusText status={researchStatus} />
            </div>
            <button
              type="button"
              disabled={savingResearch}
              onClick={handleSaveResearch}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Research</span>
            </button>
            <button
              type="button"
              disabled={researchBusy}
              onClick={handleRunResearch}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {researchBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{researchBusy ? 'Researching...' : 'Run AI Research'}</span>
            </button>
          </div>
        </div>
        {fallbackMessage && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Fallback active: {fallbackMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Prospect Research Dossier */}
        <div className="xl:col-span-5 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-5 text-xs">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.07]">
            <div>
              <h3 className="text-base font-semibold text-slate-100 font-display">
                {selectedLead.name}
              </h3>
              <p className="text-slate-400 mt-0.5">
                {selectedLead.jobTitle} · {selectedLead.company}
              </p>
              <p className="text-slate-500 mt-0.5">
                {selectedLead.industry} · {selectedLead.location} · Score{' '}
                <span className="font-mono text-slate-300 tabular-nums">
                  {selectedLead.leadScore}/100
                </span>
              </p>
            </div>
            <StatusText status={selectedLead.status} />
          </div>

          <div className="space-y-1.5">
            <h4 className="font-semibold text-slate-200">Prospect Summary</h4>
            <p className="text-slate-400 leading-relaxed">
              {selectedLead.profileSummary || 'Click Run AI Research to summarize this prospect.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-semibold text-slate-200">Company Overview</h4>
            <p className="text-slate-400 leading-relaxed">
              {selectedLead.companyOverview || 'Company context will populate after research.'}
            </p>
          </div>

          {selectedLead.industryContext && (
            <div className="space-y-1.5">
              <h4 className="font-semibold text-slate-200">Industry Context</h4>
              <p className="text-slate-400 leading-relaxed">{selectedLead.industryContext}</p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-semibold text-slate-200">Potential Business Challenges</h4>
            {selectedLead.painPoints.length > 0 ? (
              <ul className="space-y-2 text-slate-300">
                {selectedLead.painPoints.map((pt, idx) => (
                  <li
                    key={idx}
                    className="rounded-md border border-white/[0.06] bg-[#181B22] px-3 py-2 leading-relaxed"
                  >
                    {pt}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">No pain points extracted yet.</p>
            )}
          </div>

          {selectedLead.outreachOpportunities && selectedLead.outreachOpportunities.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-semibold text-slate-200">Outreach Opportunities</h4>
              <ul className="space-y-1 text-slate-300 list-disc pl-4">
                {selectedLead.outreachOpportunities.map((op, i) => (
                  <li key={i} className="leading-relaxed">
                    {op}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedLead.conversationStarters && selectedLead.conversationStarters.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-semibold text-slate-200">Conversation Starters</h4>
              <ul className="space-y-1.5 text-slate-300">
                {selectedLead.conversationStarters.map((starter, i) => (
                  <li
                    key={i}
                    className="rounded border border-white/[0.06] bg-[#0D0F14] px-3 py-2 text-slate-300"
                  >
                    “{starter}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 border-t border-white/[0.07] space-y-1.5">
            <h4 className="font-semibold text-slate-200">AI Insights & Recommended Next Action</h4>
            <p className="text-slate-300 leading-relaxed">{selectedLead.aiInsights}</p>
            <p className="text-blue-400 font-medium pt-1">{selectedLead.recommendedNextAction}</p>
          </div>
        </div>

        {/* Right: AI Personalization Studio */}
        <div className="xl:col-span-7 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-100 font-display">
                  AI Message Personalization Engine
                </h3>
                {selectedLead.approvalStatus && (
                  <StatusText status={selectedLead.approvalStatus} />
                )}
              </div>
              <p className="text-slate-400 mt-0.5">
                Configure message type, tone, objective, length, and personalization depth
              </p>
            </div>
            <button
              type="button"
              disabled={generateBusy}
              onClick={handleGenerateMessages}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-4 py-2 font-medium text-white cursor-pointer shrink-0 whitespace-nowrap"
            >
              {generateBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>
                {activeDraftValue ? 'Regenerate All Drafts' : 'Generate Personalized Messages'}
              </span>
            </button>
          </div>

          {/* Message Type Selector */}
          <div className="space-y-2">
            <label className="block text-slate-400 font-medium">Message Type</label>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_TYPES.map((mt) => (
                <button
                  key={mt}
                  type="button"
                  onClick={() => setMessageType(mt)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    messageType === mt
                      ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mt}
                </button>
              ))}
            </div>
          </div>

          {/* Tone, Length, Personalization Depth */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-slate-400 font-medium">Message Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      tone === t
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-medium">Message Length</label>
                <div className="flex gap-1">
                  {LENGTHS.map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => setMessageLength(len)}
                      className={`flex-1 py-1.5 rounded border text-[11px] cursor-pointer ${
                        messageLength === len
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-white/10 bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      {len}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-slate-400 font-medium">Personalization</label>
                <div className="flex gap-1">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setPersonalizationLevel(lvl)}
                      className={`flex-1 py-1.5 rounded border text-[11px] cursor-pointer ${
                        personalizationLevel === lvl
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-white/10 bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Campaign Objective, Target Audience, Offer, Hook */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Campaign Objective</label>
              <input
                type="text"
                value={campaignObjective}
                onChange={(e) => setCampaignObjective(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Offer / CTA</label>
              <input
                type="text"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Optional Value Hook</label>
              <input
                type="text"
                value={customFocus}
                onChange={(e) => setCustomFocus(e.target.value)}
                placeholder="e.g. Mention Q2 hiring or safe browser pacing"
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Active Message Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-slate-200">{messageType} Draft</label>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono tabular-nums ${
                    messageType === 'Connection Request' && activeDraftValue.length > 300
                      ? 'text-rose-400'
                      : 'text-slate-500'
                  }`}
                >
                  {activeDraftValue.length}
                  {messageType === 'Connection Request' ? '/300' : ''} chars
                </span>
                <button
                  type="button"
                  onClick={handleCopyDraft}
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={activeDraftValue}
              onChange={(e) => setActiveDraftValue(e.target.value)}
              placeholder={`Generate or edit your ${messageType.toLowerCase()} copy...`}
              className="w-full rounded-md border border-white/10 bg-[#0D0F14] p-3 text-sm text-slate-100 leading-relaxed focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Relevance Explanation */}
          {selectedLead.messageRelevanceReason && (
            <div className="rounded-lg border border-white/[0.07] bg-[#181B22] p-4 space-y-1">
              <span className="font-medium text-blue-300 block">
                Why This Message Is Relevant
              </span>
              <p className="text-slate-300 leading-relaxed">
                {selectedLead.messageRelevanceReason}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.07]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => handleSaveEdits('Approved')}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 font-medium text-emerald-300 cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => handleSaveEdits('Rejected')}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 font-medium text-rose-300 cursor-pointer whitespace-nowrap"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => handleSaveEdits()}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2 font-medium text-slate-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                Save Edits
              </button>
              <button
                type="button"
                onClick={handleQueueBrowserExecution}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium text-white cursor-pointer whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                Queue Browser Outreach
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
