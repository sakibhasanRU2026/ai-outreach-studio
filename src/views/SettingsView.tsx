import { useState } from 'react';
import { Check, Database, RotateCcw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import { StatusText } from '../components/ui/StatusIndicator';
import { useToast } from '../components/ui/ToastProvider';
import type { IntegrationSetting } from '../types/outreach';

interface SettingsViewProps {
  integrations: IntegrationSetting[];
  postgresDdl: string;
  onRefresh: () => Promise<void>;
}

export function SettingsView({
  integrations,
  postgresDdl,
  onRefresh,
}: SettingsViewProps) {
  const { pushToast } = useToast();
  const [ddlOpen, setDdlOpen] = useState(false);
  const [draftConfigs, setDraftConfigs] = useState<
    Record<string, Record<string, string | number | boolean>>
  >(() => {
    const map: Record<string, Record<string, string | number | boolean>> = {};
    integrations.forEach((i) => {
      map[i.id] = { ...i.config };
    });
    return map;
  });

  const updateField = (
    id: string,
    key: string,
    val: string | number | boolean
  ) => {
    setDraftConfigs((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: val,
      },
    }));
  };

  const handleSave = async (item: IntegrationSetting) => {
    try {
      await api.updateIntegration(item.id, draftConfigs[item.id] || item.config);
      await onRefresh();
      pushToast('Settings saved', `${item.name} configuration updated.`, 'success');
    } catch (err) {
      pushToast('Save failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleTest = async (item: IntegrationSetting) => {
    try {
      await api.testIntegration(item.id);
      await onRefresh();
      pushToast('Connection verified', `${item.name} health check passed.`, 'success');
    } catch (err) {
      pushToast('Health check failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleResetDemo = async () => {
    try {
      await api.resetDemoData();
      await onRefresh();
      pushToast('Workspace reset', 'Restored initial realistic B2B demo dataset.', 'info');
    } catch (err) {
      pushToast('Reset failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-slate-400">
          Manage AI models, PostgreSQL schema readiness, Redis worker settings, Playwright sandbox parameters, CRM sync, and webhooks. Secret credentials remain server-side only.
        </p>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setDdlOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" />
            PostgreSQL Schema
          </button>
          <button
            type="button"
            onClick={handleResetDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Demo Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {integrations.map((item) => {
          const cfg = draftConfigs[item.id] || item.config;
          return (
            <div
              key={item.id}
              className="rounded-xl border border-white/[0.07] bg-[#111318] p-6 space-y-4 text-xs flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/[0.07]">
                  <div>
                    <span className="text-[11px] text-slate-500">{item.category}</span>
                    <h3 className="text-sm font-semibold text-slate-100 font-display mt-0.5">
                      {item.name}
                    </h3>
                    <p className="text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                  </div>
                  <StatusText status={item.status} />
                </div>

                {/* Safe non-secret configuration controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(cfg).map(([key, val]) => {
                    if (key === 'serverKeyConfigured') {
                      return (
                        <div key={key} className="sm:col-span-2 rounded-md border border-white/[0.06] bg-[#0D0F14] px-3 py-2 flex items-center justify-between">
                          <span className="text-slate-400">Server Runtime Key</span>
                          <span className="font-mono text-slate-200">
                            {val ? 'Configured via Environment Secrets' : 'Not set (Mock AI Fallback Active)'}
                          </span>
                        </div>
                      );
                    }

                    if (typeof val === 'boolean') {
                      return (
                        <label
                          key={key}
                          className="flex items-center justify-between rounded-md border border-white/[0.06] bg-[#0D0F14] px-3 py-2 cursor-pointer"
                        >
                          <span className="text-slate-300">{key}</span>
                          <input
                            type="checkbox"
                            checked={val}
                            onChange={(e) => updateField(item.id, key, e.target.checked)}
                            className="accent-blue-500"
                          />
                        </label>
                      );
                    }

                    return (
                      <div key={key} className={key === 'endpointUrl' || key === 'events' ? 'sm:col-span-2' : ''}>
                        <label className="block text-slate-400 mb-1">{key}</label>
                        <input
                          type={typeof val === 'number' ? 'number' : 'text'}
                          value={String(val)}
                          onChange={(e) =>
                            updateField(
                              item.id,
                              key,
                              typeof val === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                          className="w-full rounded-md border border-white/10 bg-[#181B22] px-3 py-1.5 text-slate-100 font-mono text-[11px]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => handleTest(item)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-1.5 font-medium text-slate-200 cursor-pointer"
                >
                  <Send className="h-3 w-3" />
                  Test Connection
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(item)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3 py-1.5 font-medium text-white cursor-pointer"
                >
                  <Check className="h-3 w-3" />
                  Save Config
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={ddlOpen}
        onClose={() => setDdlOpen(false)}
        title="PostgreSQL Relational Schema (DDL)"
        subtitle="Production-ready schema modeled cleanly alongside the workspace repository"
        maxWidthClass="max-w-3xl"
      >
        <pre className="rounded-lg border border-white/[0.07] bg-[#0D0F14] p-4 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[60vh]">
          {postgresDdl}
        </pre>
      </Modal>
    </div>
  );
}
