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
    label: 'Observability',
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
    <div className="flex flex-col h-full bg-[#0D0F14] border-r border-white/[0.07] w-[252px] select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.07] shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelect('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <div className="h-7 w-7 rounded-lg bg-[#161922] border border-white/[0.1] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] group-hover:border-blue-500/40 transition-colors">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-3.5 w-3.5 text-blue-400"
              aria-hidden="true"
            >
              <path
                d="M3.5 10L8.5 5L13.5 10L8.5 15L3.5 10Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M11.5 5L16.5 10L11.5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.55"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block text-[13px] font-semibold tracking-[-0.01em] text-[#F4F5F7] leading-none">
              Outreach Studio
            </span>
            <span className="block text-[10px] font-mono uppercase tracking-[0.08em] text-[#6B7280] mt-1 leading-none">
              Ops Console
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Grouped Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Primary">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 mb-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.09em] text-[#6B7280]">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                const isAgent = item.id === 'ai-agent';
                const isQueue = item.id === 'job-queue';
                const count = isAgent
                  ? pendingApprovalsCount
                  : isQueue
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
                    aria-current={active ? 'page' : undefined}
                    className={`relative w-full flex items-center justify-between gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer ${
                      active
                        ? 'bg-[#181B22] text-[#F4F5F7] font-medium border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                        : 'text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.035] border border-transparent'
                    }`}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-blue-500"
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-[15px] w-[15px] shrink-0 transition-colors ${
                          active
                            ? item.id === 'ai-research' || isAgent
                              ? 'text-indigo-400'
                              : 'text-blue-400'
                            : 'text-[#6B7280]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>

                    {count > 0 && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-medium tabular-nums ${
                          isQueue
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        }`}
                      >
                        {isQueue && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
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

      {/* Operator & Environment Footer */}
      <div className="p-3 border-t border-white/[0.07] shrink-0">
        <div className="rounded-lg bg-[#111318] border border-white/[0.07] p-2.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.06em] text-amber-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Demo Mode
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[#6B7280] bg-white/[0.04] px-1.5 py-0.5 rounded">
              Sandbox
            </span>
          </div>

          <div className="flex items-center gap-2.5 pt-2 border-t border-white/[0.06]">
            <div className="relative shrink-0">
              {!avatarError ? (
                <img
                  src="/src/assets/images/avatar_operator_1795540651815.jpg"
                  alt="Claire Vance operator avatar"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="h-8 w-8 rounded-md object-cover border border-white/[0.1]"
                />
              ) : (
                <div className="h-8 w-8 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-[11px] font-mono font-semibold text-blue-300">
                  CV
                </div>
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-[#111318]"
                title="Operator Online"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#F4F5F7] truncate leading-tight">
                Claire Vance
              </p>
              <p className="text-[11px] text-[#6B7280] truncate mt-0.5 leading-tight">
                Growth Ops · Workspace
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
