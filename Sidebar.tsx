import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Sparkles,
  GitBranch,
  Globe,
  ShieldCheck,
  Layers,
  Bot,
  BarChart3,
  History,
  Activity,
  ScrollText,
  Settings,
  X,
} from 'lucide-react';
import type { NavSection } from '../../types/outreach';

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  pendingApprovalsCount: number;
  runningJobsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_GROUPS: {
  label: string;
  items: { id: NavSection; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'leads', label: 'Leads', icon: Users },
      { id: 'ai-research', label: 'AI Research', icon: Sparkles },
      { id: 'campaigns', label: 'Campaigns', icon: GitBranch },
    ],
  },
  {
    label: 'Execution Engine',
    items: [
      { id: 'browser-engine', label: 'Browser Engine', icon: Globe },
      { id: 'sessions', label: 'Sessions', icon: ShieldCheck },
      { id: 'job-queue', label: 'Job Queue', icon: Layers },
      { id: 'ai-agent', label: 'AI Agent', icon: Bot },
    ],
  },
  {
    label: 'Observability & Reports',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'execution-history', label: 'Execution History', icon: History },
      { id: 'system-health', label: 'System Health', icon: Activity },
      { id: 'activity-logs', label: 'Activity Logs', icon: ScrollText },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({
  activeSection,
  onSelect,
  pendingApprovalsCount,
  runningJobsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [avatarError, setAvatarError] = useState(false);

  const navContent = (
    <div className="flex flex-col h-full bg-[#0C0F16] border-r border-white/[0.08] w-64">
      <div className="flex items-center justify-between h-14 px-5 border-b border-white/[0.08] shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelect('dashboard');
            onCloseMobile();
          }}
          className="text-left font-display text-sm font-semibold tracking-tight text-slate-100 whitespace-nowrap"
        >
          AI Outreach Studio
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1 text-slate-400 hover:text-slate-100"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-2 text-[11px] font-medium text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                const count =
                  item.id === 'ai-agent'
                    ? pendingApprovalsCount
                    : item.id === 'job-queue'
                    ? runningJobsCount
                    : 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white/[0.08] text-slate-100 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? 'text-blue-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {count > 0 && (
                      <span className="font-mono text-[11px] tabular-nums text-slate-400">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.08] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-amber-300/90">
          <span>DEMO MODE</span>
          <span className="text-slate-500">SANDBOX ENV</span>
        </div>
        <div className="flex items-center gap-3">
          {!avatarError ? (
            <img
              src="/src/assets/images/avatar_operator_1795540651815.jpg"
              alt="Claire Vance operator avatar"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="h-8 w-8 rounded-md object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="h-8 w-8 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-semibold text-blue-300 shrink-0">
              CV
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">Claire Vance</p>
            <p className="text-[11px] text-slate-500 truncate">Growth Ops · Demo Workspace</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
