import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Upload,
  Sparkles,
  Trash2,
  X,
  ExternalLink,
  Pencil,
  Send,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusText, formatRelativeTime } from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import { api } from '../lib/api';
import type { Campaign, Lead, LeadStatus } from '../types/outreach';

interface LeadsViewProps {
  leads: Lead[];
  campaigns: Campaign[];
  onRefresh: () => Promise<void>;
  onOpenAiResearch: (leadId: string) => void;
}

const LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Researched',
  'Queued',
  'Connection Sent',
  'Connected',
  'Replied',
  'Interested',
  'Archived',
];

const SAMPLE_CSV = `Name,Job Title,Company,Industry,Location,Profile URL,Email,Lead Score
Claire Bennett,VP Marketing,Northstar Cloud,B2B SaaS,Denver CO,https://sandbox.outreach.local/in/claire-bennett,claire@northstarcloud.io,88
Ryan Okafor,Head of Sales,PulseLedger,FinTech SaaS,Atlanta GA,https://sandbox.outreach.local/in/ryan-okafor,ryan@pulseledger.com,91`;

export function LeadsView({
  leads,
  campaigns,
  onRefresh,
  onOpenAiResearch,
}: LeadsViewProps) {
  const { pushToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [industryFilter, setIndustryFilter] = useState<string>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [busyAction, setBusyAction] = useState(false);

  // Add/Edit form fields
  const [formState, setFormState] = useState({
    name: '',
    jobTitle: '',
    company: '',
    industry: 'B2B SaaS',
    location: '',
    profileUrl: '',
    email: '',
    leadScore: 82,
    status: 'New' as LeadStatus,
    campaignId: '',
  });

  const industries = useMemo(() => {
    const set = new Set(leads.map((l) => l.industry));
    return ['All', ...Array.from(set)];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.jobTitle.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'All' || l.status === statusFilter;
      const matchesIndustry = industryFilter === 'All' || l.industry === industryFilter;
      return matchesSearch && matchesStatus && matchesIndustry;
    });
  }, [leads, search, statusFilter, industryFilter]);

  const detailLead = useMemo(
    () => leads.find((l) => l.id === detailLeadId) || null,
    [leads, detailLeadId]
  );

  const openAddModal = () => {
    setEditingLead(null);
    setFormState({
      name: '',
      jobTitle: '',
      company: '',
      industry: 'B2B SaaS',
      location: 'San Francisco, CA',
      profileUrl: '',
      email: '',
      leadScore: 84,
      status: 'New',
      campaignId: campaigns[0]?.id || '',
    });
    setFormOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setFormState({
      name: lead.name,
      jobTitle: lead.jobTitle,
      company: lead.company,
      industry: lead.industry,
      location: lead.location,
      profileUrl: lead.profileUrl,
      email: lead.email,
      leadScore: lead.leadScore,
      status: lead.status,
      campaignId: lead.campaignId || '',
    });
    setFormOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      if (editingLead) {
        await api.updateLead(editingLead.id, formState);
        pushToast('Lead updated', `${formState.name} saved cleanly.`, 'success');
      } else {
        await api.createLead(formState);
        pushToast('Lead added', `${formState.name} added to pipeline.`, 'success');
      }
      await onRefresh();
      setFormOpen(false);
    } catch (err) {
      pushToast('Save failed', err instanceof Error ? err.message : 'Error saving lead', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleImportCsv = async () => {
    setBusyAction(true);
    try {
      const res = await api.importLeadsCsv(csvText);
      await onRefresh();
      setCsvModalOpen(false);
      pushToast('CSV imported', `Imported ${res.importedCount} new leads.`, 'success');
    } catch (err) {
      pushToast('CSV import error', err instanceof Error ? err.message : 'Invalid CSV', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkAction = async (
    action: 'delete' | 'assignCampaign' | 'queueResearch',
    campaignId?: string
  ) => {
    if (selectedIds.length === 0) return;
    setBusyAction(true);
    try {
      await api.bulkLeadAction(selectedIds, action, campaignId);
      await onRefresh();
      setSelectedIds([]);
      pushToast('Bulk action applied', `Updated ${selectedIds.length} selected leads.`, 'success');
    } catch (err) {
      pushToast('Action failed', err instanceof Error ? err.message : 'Bulk action error', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickResearch = async (lead: Lead) => {
    setBusyAction(true);
    try {
      const res = await api.researchLead(lead.id);
      await onRefresh();
      if (res.research.fallbackActivated) {
        pushToast(
          'AI Fallback Mode Activated',
          res.research.fallbackReason ||
            `Gemini unavailable; completed ${lead.name} research in Mock AI mode.`,
          'warning'
        );
      } else {
        pushToast(
          'AI Research completed',
          `Updated insights for ${lead.name} (${res.research.mode === 'gemini' ? 'Gemini' : 'Mock AI'}).`,
          'success'
        );
      }
    } catch (err) {
      pushToast('Research failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, title, email..."
              className="w-full rounded-md border border-white/10 bg-[#111318] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-white/10 bg-[#111318] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="rounded-md border border-white/10 bg-[#111318] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind === 'All' ? 'All Industries' : ind}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setCsvModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs">
          <span className="font-medium text-blue-200 font-mono tabular-nums">
            {selectedIds.length} lead{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleBulkAction('assignCampaign', e.target.value);
              }}
              className="rounded border border-white/15 bg-[#111318] px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="" disabled>
                Assign to campaign...
              </option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => handleBulkAction('queueResearch')}
              className="rounded border border-white/15 bg-[#111318] hover:bg-white/[0.08] px-3 py-1.5 text-slate-200 cursor-pointer"
            >
              Queue AI Research
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => handleBulkAction('delete')}
              className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 px-3 py-1.5 text-rose-300 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* High-Density Lead Table */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <p className="text-sm font-medium text-slate-200">No leads match current filters</p>
            <p className="text-xs text-slate-500">
              Clear your search criteria or import prospects via CSV to begin outreach.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Lead
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-slate-400 bg-white/[0.01]">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredLeads.length > 0 && selectedIds.length === filteredLeads.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all leads"
                      className="rounded border-white/20 bg-transparent accent-blue-500"
                    />
                  </th>
                  <th className="py-3 px-4 font-medium">Prospect</th>
                  <th className="py-3 px-4 font-medium">Company & Industry</th>
                  <th className="py-3 px-4 font-medium">Campaign & Last Activity</th>
                  <th className="py-3 px-4 font-medium text-right">Score</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setDetailLeadId(lead.id)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td
                      className="py-3 px-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(lead.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(lead.id)}
                        onChange={() => {}}
                        aria-label={`Select ${lead.name}`}
                        className="rounded border-white/20 bg-transparent accent-blue-500"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-100">{lead.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {lead.jobTitle} · {lead.email || 'No email'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-200">{lead.company}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {lead.industry} · {lead.location}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-300 truncate max-w-[180px]">
                        {campaigns.find((c) => c.id === lead.campaignId)?.name || 'Unassigned'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                        {lead.outreachHistory[0]
                          ? `${lead.outreachHistory[0].channel} · ${formatRelativeTime(lead.outreachHistory[0].timestamp)}`
                          : `Updated ${formatRelativeTime(lead.updatedAt)}`}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-200">
                      {lead.leadScore}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={lead.status} />
                    </td>
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenAiResearch(lead.id)}
                          title="Research & Personalize"
                          className="rounded px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                        >
                          AI Research
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(lead)}
                          title="Edit lead"
                          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lead Detail Slide-Over Drawer */}
      {detailLead && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="fixed inset-0" onClick={() => setDetailLeadId(null)} />
          <div className="relative z-10 w-full max-w-xl h-full bg-[#0D0F14] border-l border-white/10 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-slate-100 font-display">
                    {detailLead.name}
                  </h3>
                  <StatusText status={detailLead.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {detailLead.jobTitle} at {detailLead.company} · {detailLead.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailLeadId(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Quick Metadata Row */}
              <div className="grid grid-cols-3 gap-4 pb-5 border-b border-white/[0.07]">
                <div>
                  <span className="text-slate-500 block">Lead Score</span>
                  <span className="text-base font-mono font-semibold text-slate-100 tabular-nums">
                    {detailLead.leadScore}/100
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Industry</span>
                  <span className="text-slate-200 font-medium">{detailLead.industry}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Sandbox Profile</span>
                  <span className="inline-flex items-center gap-1 text-blue-400 font-mono truncate max-w-full">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{detailLead.profileUrl.replace('https://', '')}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => handleQuickResearch(detailLead)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3.5 py-2 font-medium text-white cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Refresh AI Research
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailLeadId(null);
                    onOpenAiResearch(detailLead.id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 font-medium text-slate-200 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  Draft Outreach Message
                </button>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-slate-200">Profile Summary</h4>
                <p className="text-slate-400 leading-relaxed">
                  {detailLead.profileSummary || 'No profile summary generated yet.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-slate-200">Company Overview</h4>
                <p className="text-slate-400 leading-relaxed">
                  {detailLead.companyOverview || 'No company overview generated yet.'}
                </p>
              </div>

              {detailLead.industryContext && (
                <div className="space-y-1.5">
                  <h4 className="font-semibold text-slate-200">Industry Context</h4>
                  <p className="text-slate-400 leading-relaxed">{detailLead.industryContext}</p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-200">Potential Pain Points</h4>
                {detailLead.painPoints.length > 0 ? (
                  <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                    {detailLead.painPoints.map((p, i) => (
                      <li key={i} className="leading-relaxed">
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">Run AI Research to identify business challenges.</p>
                )}
              </div>

              {detailLead.conversationStarters && detailLead.conversationStarters.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-200">Suggested Talking Points</h4>
                  <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                    {detailLead.conversationStarters.map((starter, i) => (
                      <li key={i} className="leading-relaxed">
                        {starter}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(detailLead.generatedConnectionMessage || detailLead.generatedFollowUpMessage) && (
                <div className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-200">Personalized Messages</h4>
                    {detailLead.approvalStatus && (
                      <StatusText status={detailLead.approvalStatus} />
                    )}
                  </div>
                  {detailLead.generatedConnectionMessage && (
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-0.5">
                        Connection Request
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {detailLead.generatedConnectionMessage}
                      </p>
                    </div>
                  )}
                  {detailLead.generatedFollowUpMessage && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <span className="text-[11px] text-slate-500 block mb-0.5">Follow-up</span>
                      <p className="text-slate-300 leading-relaxed">
                        {detailLead.generatedFollowUpMessage}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-white/[0.07] bg-[#14171F] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-100">AI-Generated Insights</h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    {detailLead.researchSource === 'gemini' ? 'Gemini AI' : 'Mock AI'}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">{detailLead.aiInsights}</p>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5">Recommended Next Action</span>
                  <p className="text-blue-300 font-medium">{detailLead.recommendedNextAction}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="font-semibold text-slate-200">Outreach History</h4>
                {detailLead.outreachHistory.length === 0 ? (
                  <p className="text-slate-500">No outreach touches recorded yet.</p>
                ) : (
                  <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-lg bg-[#0D0F14]">
                    {detailLead.outreachHistory.map((h) => (
                      <div key={h.id} className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-200">{h.channel}</span>
                            <StatusText status={h.status} showIcon={false} />
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            {formatRelativeTime(h.timestamp)}
                          </span>
                        </div>
                        <p className="text-slate-400 leading-relaxed">{h.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Lead Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingLead ? `Edit Lead · ${editingLead.name}` : 'Add New Lead'}
        subtitle="Store prospect profile details for AI research and campaign enrollment"
      >
        <form onSubmit={handleSaveLead} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Full Name *</label>
              <input
                required
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Job Title *</label>
              <input
                required
                value={formState.jobTitle}
                onChange={(e) => setFormState({ ...formState, jobTitle: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Company *</label>
              <input
                required
                value={formState.company}
                onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Industry</label>
              <input
                value={formState.industry}
                onChange={(e) => setFormState({ ...formState, industry: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Location</label>
              <input
                value={formState.location}
                onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={formState.email}
                onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Lead Score (1–100)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={formState.leadScore}
                onChange={(e) => setFormState({ ...formState, leadScore: Number(e.target.value) })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Status</label>
              <select
                value={formState.status}
                onChange={(e) =>
                  setFormState({ ...formState, status: e.target.value as LeadStatus })
                }
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Profile URL (Sandbox or Supplied)</label>
              <input
                value={formState.profileUrl}
                onChange={(e) => setFormState({ ...formState, profileUrl: e.target.value })}
                placeholder="https://sandbox.outreach.local/in/prospect-name"
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Assigned Campaign</label>
              <select
                value={formState.campaignId}
                onChange={(e) => setFormState({ ...formState, campaignId: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-2 text-slate-100"
              >
                <option value="">Unassigned</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-slate-300 hover:bg-white/[0.05] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyAction}
              className="rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 font-medium text-white cursor-pointer disabled:opacity-50"
            >
              {editingLead ? 'Save Changes' : 'Create Lead'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        title="Import Leads from CSV"
        subtitle="Upload a .csv file or paste comma-separated prospect rows below"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-slate-200 cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Choose CSV File</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileUpload}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={() => setCsvText(SAMPLE_CSV)}
              className="text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Load Sample CSV
            </button>
          </div>
          <textarea
            rows={7}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0D0F14] p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCsvModalOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={handleImportCsv}
              className="rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-4 py-2 font-medium text-white cursor-pointer disabled:opacity-50"
            >
              Import Prospects
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
