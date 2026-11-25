import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import {
  StatusText,
  formatPreciseTimestamp,
  formatRelativeTime,
} from '../components/ui/StatusIndicator';
import type { ActivityCategory, ActivityLog } from '../types/outreach';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
}

const CATEGORIES: ('All' | ActivityCategory)[] = [
  'All',
  'Lead',
  'AI',
  'Campaign',
  'Browser',
  'Queue',
  'Agent',
  'System',
];

const STATUSES: ('All' | ActivityLog['status'])[] = [
  'All',
  'Success',
  'Warning',
  'Error',
  'Info',
];

export function ActivityLogsView({ logs }: ActivityLogsViewProps) {
  const [category, setCategory] = useState<'All' | ActivityCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ActivityLog['status']>('All');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const catOk = category === 'All' || l.category === category;
      const statusOk = statusFilter === 'All' || l.status === statusFilter;
      const q = search.trim().toLowerCase();
      const searchOk =
        !q ||
        l.title.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q) ||
        (l.entityId && l.entityId.toLowerCase().includes(q));
      return catOk && statusOk && searchOk;
    });
  }, [logs, category, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                category === c
                  ? 'bg-white/[0.1] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | ActivityLog['status'])}
            className="rounded-md border border-white/10 bg-[#111318] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter events or entity ID..."
              className="w-full rounded-md border border-white/10 bg-[#111318] pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-slate-400">
                <th className="py-3 px-6 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Event</th>
                <th className="py-3 px-6 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-6 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                    {formatPreciseTimestamp(log.timestamp)}
                    <span className="block text-[10px] text-slate-600">
                      {formatRelativeTime(log.timestamp)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 font-medium whitespace-nowrap">
                    {log.category}
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-medium text-slate-100">{log.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{log.detail}</p>
                  </td>
                  <td className="py-3.5 px-6 text-right whitespace-nowrap">
                    <StatusText status={log.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Execution Event Details · ${selectedLog?.id ?? ''}`}
        subtitle={
          selectedLog ? `${selectedLog.category} · ${formatPreciseTimestamp(selectedLog.timestamp)}` : ''
        }
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-3 border-b border-white/[0.07]">
              <div>
                <span className="text-slate-500 block">Status</span>
                <StatusText status={selectedLog.status} />
              </div>
              <div>
                <span className="text-slate-500 block">Category</span>
                <span className="text-slate-200 font-medium">{selectedLog.category}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Entity Reference</span>
                <span className="font-mono text-slate-300">{selectedLog.entityId || 'Workspace'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-slate-500 block">Summary</span>
              <p className="text-sm font-medium text-slate-100">{selectedLog.title}</p>
              <p className="text-slate-300 leading-relaxed">{selectedLog.detail}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
