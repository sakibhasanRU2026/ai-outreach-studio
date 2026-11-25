import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  ChevronRight,
  GitBranch,
} from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import { StatusText, formatPreciseTimestamp } from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type {
  AutomationRunRecord,
  Campaign,
  MessageTone,
  WorkflowStep,
  WorkflowStepType,
} from '../types/outreach';

interface CampaignsViewProps {
  campaigns: Campaign[];
  automationRuns: AutomationRunRecord[];
  onRefresh: () => Promise<void>;
}

const STEP_TYPES: WorkflowStepType[] = [
  'Lead Added',
  'Lead Research',
  'Lead Scoring',
  'AI Personalization',
  'Generate Personalized Message',
  'Human Approval',
  'Connection Request Simulation',
  'Browser Action',
  'Wait',
  'Connection Status Check',
  'Follow-up Message',
  'Reply Analysis',
  'AI Next Action',
  'AI Agent Decision',
  'Campaign Completion',
];

const DEFAULT_DESCRIPTIONS: Record<WorkflowStepType, string> = {
  'Lead Added': 'Ingest matching prospect segment into campaign.',
  'Lead Research': 'Summarize prospect profile and identify business challenges.',
  'Lead Scoring': 'Calculate ICP & intent score from profile and company context.',
  'AI Personalization': 'Generate tailored connection request and follow-up copy.',
  'Generate Personalized Message': 'Synthesize multi-variant personalized outreach copy.',
  'Human Approval': 'Require operator approval before simulated outreach.',
  'Connection Request Simulation': 'Execute simulated profile inspection and connection note.',
  'Browser Action': 'Run Playwright-compatible simulated browser action with safety checks.',
  Wait: 'Pause sequence cleanly to preserve human-paced cadence.',
  'Connection Status Check': 'Check whether simulated connection request was accepted.',
  'Check Connection Status': 'Inspect prospect connection acceptance status in sandbox.',
  'Follow-up Message': 'Send tailored follow-up message after acceptance.',
  'Send Follow-up': 'Queue post-connection follow-up message execution.',
  'Reply Analysis': 'Classify reply sentiment and buying intent.',
  'Analyze Reply': 'Analyze incoming response intent with AI classifier.',
  'AI Next Action': 'Generate next action recommendation for operator.',
  'AI Agent Decision': 'Evaluate stage and propose autonomous next step for review.',
  'Campaign Completion': 'Sync outcome and close campaign sequence.',
};

export function CampaignsView({ campaigns, automationRuns, onRefresh }: CampaignsViewProps) {
  const { pushToast } = useToast();
  const [selectedId, setSelectedId] = useState<string>(campaigns[0]?.id || '');
  const [draftCampaign, setDraftCampaign] = useState<Campaign | null>(campaigns[0] || null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    campaigns[0]?.steps[0]?.id || null
  );
  const [addStepType, setAddStepType] = useState<WorkflowStepType>('Wait');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', description: '', targetPersona: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const found = campaigns.find((c) => c.id === selectedId) || campaigns[0];
    if (found) {
      setDraftCampaign(JSON.parse(JSON.stringify(found)) as Campaign);
      if (!selectedStepId || !found.steps.some((s) => s.id === selectedStepId)) {
        setSelectedStepId(found.steps[0]?.id || null);
      }
    }
  }, [campaigns, selectedId]);

  const activeStep =
    draftCampaign?.steps.find((s) => s.id === selectedStepId) || draftCampaign?.steps[0] || null;

  const handleToggleStatus = async (cmp: Campaign) => {
    try {
      const res = await api.toggleCampaign(cmp.id);
      await onRefresh();
      pushToast(
        `Campaign ${res.campaign.status === 'Active' ? 'started' : 'paused'}`,
        `${res.campaign.name} is now ${res.campaign.status}.`,
        'success'
      );
    } catch (err) {
      pushToast('Toggle failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleAddStep = () => {
    if (!draftCampaign) return;
    const step: WorkflowStep = {
      id: `step-${Date.now()}`,
      type: addStepType,
      title: addStepType,
      description: DEFAULT_DESCRIPTIONS[addStepType],
      config: {
        ...(addStepType === 'Wait' ? { delayHours: 48 } : {}),
        ...(addStepType === 'AI Personalization' || addStepType === 'Follow-up Message'
          ? { tone: 'Consultative' as MessageTone }
          : {}),
        ...(addStepType === 'Human Approval' ? { requireApproval: true } : {}),
      },
    };
    setDraftCampaign({
      ...draftCampaign,
      steps: [...draftCampaign.steps, step],
    });
    setSelectedStepId(step.id);
  };

  const handleMoveStep = (index: number, dir: -1 | 1) => {
    if (!draftCampaign) return;
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= draftCampaign.steps.length) return;
    const copy = [...draftCampaign.steps];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setDraftCampaign({ ...draftCampaign, steps: copy });
  };

  const handleRemoveStep = (id: string) => {
    if (!draftCampaign) return;
    const filtered = draftCampaign.steps.filter((s) => s.id !== id);
    setDraftCampaign({ ...draftCampaign, steps: filtered });
    if (selectedStepId === id) {
      setSelectedStepId(filtered[0]?.id || null);
    }
  };

  const handleUpdateActiveStep = (patch: Partial<WorkflowStep>) => {
    if (!draftCampaign || !activeStep) return;
    setDraftCampaign({
      ...draftCampaign,
      steps: draftCampaign.steps.map((s) =>
        s.id === activeStep.id ? { ...s, ...patch } : s
      ),
    });
  };

  const handleSaveCampaign = async () => {
    if (!draftCampaign) return;
    setSaving(true);
    try {
      await api.updateCampaign(draftCampaign.id, {
        name: draftCampaign.name,
        description: draftCampaign.description,
        targetPersona: draftCampaign.targetPersona,
        steps: draftCampaign.steps,
      });
      await onRefresh();
      pushToast('Campaign saved', `${draftCampaign.name} workflow saved.`, 'success');
    } catch (err) {
      pushToast('Save failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createCampaign(newForm);
      await onRefresh();
      setSelectedId(res.campaign.id);
      setNewModalOpen(false);
      setNewForm({ name: '', description: '', targetPersona: '' });
      pushToast('Campaign created', `${res.campaign.name} ready to configure.`, 'success');
    } catch (err) {
      pushToast('Create failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleDeleteCampaign = async (cmp: Campaign) => {
    try {
      await api.deleteCampaign(cmp.id);
      await onRefresh();
      setSelectedId('');
      pushToast('Campaign deleted', `${cmp.name} removed from workspace.`, 'warning');
    } catch (err) {
      pushToast('Delete failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const campaignRuns = draftCampaign
    ? automationRuns.filter((r) => r.campaignId === draftCampaign.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Campaign Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                draftCampaign?.id === c.id
                  ? 'border-blue-500 bg-blue-500/15 text-slate-100'
                  : 'border-white/10 bg-[#111318] text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5 text-blue-400" />
              <span>{c.name}</span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                ({c.steps.length})
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setNewModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer shrink-0 self-start lg:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          New Campaign
        </button>
      </div>

      {draftCampaign && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left / Center: Visual Workflow Graph */}
          <div className="xl:col-span-7 rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-slate-100 font-display">
                    {draftCampaign.name}
                  </h3>
                  <StatusText status={draftCampaign.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{draftCampaign.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(draftCampaign)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    draftCampaign.status === 'Active'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  {draftCampaign.status === 'Active' ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      {draftCampaign.status === 'Paused' ? 'Resume' : 'Start'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveCampaign}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 px-3.5 py-1.5 text-xs font-medium text-white cursor-pointer whitespace-nowrap"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Workflow
                </button>
                {campaigns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCampaign(draftCampaign)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-xs font-medium text-rose-300 cursor-pointer whitespace-nowrap"
                    title="Delete campaign"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Add Step Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={addStepType}
                onChange={(e) => setAddStepType(e.target.value as WorkflowStepType)}
                className="flex-1 min-w-[200px] rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-xs text-slate-200"
              >
                {STEP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 text-xs font-medium text-slate-100 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Step
              </button>
            </div>

            {/* Connected Vertical Nodes */}
            <div className="space-y-0">
              {draftCampaign.steps.map((step, idx) => {
                const isSelected = activeStep?.id === step.id;
                return (
                  <div key={step.id}>
                    <div
                      onClick={() => setSelectedStepId(step.id)}
                      className={`group rounded-lg border p-3.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/[0.07] bg-[#0D0F14] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-slate-500 tabular-nums">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            <span className="font-medium text-slate-100">{step.title}</span>
                            <span className="text-slate-500">·</span>
                            <span className="text-[11px] text-blue-400">{step.type}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{step.description}</p>
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(idx, -1)}
                            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] disabled:opacity-30 cursor-pointer"
                            aria-label="Move step up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === draftCampaign.steps.length - 1}
                            onClick={() => handleMoveStep(idx, 1)}
                            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] disabled:opacity-30 cursor-pointer"
                            aria-label="Move step down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(step.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            aria-label="Remove step"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {idx < draftCampaign.steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="h-4 w-px bg-white/15" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Step Inspector & Campaign Stats */}
          <div className="xl:col-span-5 space-y-6">
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4 text-xs">
              <h3 className="text-sm font-semibold text-slate-100 font-display pb-3 border-b border-white/[0.07]">
                Step Inspector
              </h3>

              {activeStep ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-400 mb-1">Step Type</label>
                    <select
                      value={activeStep.type}
                      onChange={(e) =>
                        handleUpdateActiveStep({
                          type: e.target.value as WorkflowStepType,
                        })
                      }
                      className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
                    >
                      {STEP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Step Title</label>
                    <input
                      value={activeStep.title}
                      onChange={(e) => handleUpdateActiveStep({ title: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={activeStep.description}
                      onChange={(e) => handleUpdateActiveStep({ description: e.target.value })}
                      className="w-full rounded-md border border-white/10 bg-[#0D0F14] p-3 text-slate-200"
                    />
                  </div>

                  {activeStep.type === 'Wait' && (
                    <div>
                      <label className="block text-slate-400 mb-1">Cooldown Hours</label>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={activeStep.config.delayHours ?? 48}
                        onChange={(e) =>
                          handleUpdateActiveStep({
                            config: { ...activeStep.config, delayHours: Number(e.target.value) },
                          })
                        }
                        className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  )}

                  {(activeStep.type === 'AI Personalization' ||
                    activeStep.type === 'Follow-up Message') && (
                    <div>
                      <label className="block text-slate-400 mb-1">AI Message Tone</label>
                      <select
                        value={activeStep.config.tone ?? 'Executive Peer'}
                        onChange={(e) =>
                          handleUpdateActiveStep({
                            config: {
                              ...activeStep.config,
                              tone: e.target.value as MessageTone,
                            },
                          })
                        }
                        className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
                      >
                        <option value="Executive Peer">Executive Peer</option>
                        <option value="Consultative">Consultative</option>
                        <option value="Direct & Concise">Direct & Concise</option>
                        <option value="Warm Challenger">Warm Challenger</option>
                      </select>
                    </div>
                  )}

                  {activeStep.type === 'Human Approval' && (
                    <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(activeStep.config.requireApproval ?? true)}
                        onChange={(e) =>
                          handleUpdateActiveStep({
                            config: { ...activeStep.config, requireApproval: e.target.checked },
                          })
                        }
                        className="accent-blue-500"
                      />
                      <span>Pause workflow until operator approves in AI Agent Control Center</span>
                    </label>
                  )}

                  <div>
                    <label className="block text-slate-400 mb-1">
                      Branch / Trigger Condition (Optional)
                    </label>
                    <input
                      type="text"
                      value={activeStep.config.condition ?? ''}
                      onChange={(e) =>
                        handleUpdateActiveStep({
                          config: { ...activeStep.config, condition: e.target.value },
                        })
                      }
                      placeholder="e.g. leadScore >= 80 OR connectionAccepted === true"
                      className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 placeholder:text-slate-500 font-mono text-[11px]"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Select a workflow node on the left to edit.</p>
              )}
            </div>

            {/* Campaign Attribution Stats */}
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 font-display">
                  Sequence Telemetry
                </h3>
                <span className="text-slate-500 inline-flex items-center gap-1">
                  {draftCampaign.targetPersona}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-slate-500 block">Leads Enrolled</span>
                  <span className="text-lg font-mono font-semibold text-slate-100 tabular-nums">
                    {draftCampaign.stats.leadsEnrolled}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Connections Sent</span>
                  <span className="text-lg font-mono font-semibold text-slate-100 tabular-nums">
                    {draftCampaign.stats.connectionsSent}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Accepted</span>
                  <span className="text-lg font-mono font-semibold text-emerald-400 tabular-nums">
                    {draftCampaign.stats.accepted}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Positive Replies</span>
                  <span className="text-lg font-mono font-semibold text-blue-400 tabular-nums">
                    {draftCampaign.stats.positiveReplies}
                  </span>
                </div>
              </div>
            </div>

            {/* Campaign Execution History */}
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 font-display">
                  Campaign Execution History
                </h3>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {campaignRuns.length} runs
                </span>
              </div>
              {campaignRuns.length === 0 ? (
                <p className="text-slate-500">
                  No automation runs logged for this campaign yet.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-lg bg-[#0D0F14]">
                  {campaignRuns.slice(0, 5).map((run) => (
                    <div key={run.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200 truncate">
                          {run.id} · {run.leadName}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {formatPreciseTimestamp(run.startedAt)} · {run.durationMs}ms
                        </p>
                      </div>
                      <StatusText status={run.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        title="Create Outreach Campaign"
        subtitle="Initialize a new visual automation sequence"
      >
        <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Campaign Name *</label>
            <input
              required
              value={newForm.name}
              onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
              placeholder="e.g. Series B FinTech CTOs"
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Target Persona</label>
            <input
              value={newForm.targetPersona}
              onChange={(e) => setNewForm({ ...newForm, targetPersona: e.target.value })}
              placeholder="e.g. CTO / VP Engineering"
              className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Description</label>
            <textarea
              rows={3}
              value={newForm.description}
              onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
              className="w-full rounded-md border border-white/10 bg-[#0D0F14] p-3 text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNewModalOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 font-medium text-white cursor-pointer"
            >
              Create Campaign
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
