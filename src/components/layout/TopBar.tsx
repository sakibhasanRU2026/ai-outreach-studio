import { Menu, Play, Search } from 'lucide-react';
import type { NavSection } from '../../types/outreach';

interface TopBarProps {
  activeSection: NavSection;
  aiMode: 'gemini' | 'mock';
  fallbackActive?: boolean;
  onSelectSection: (section: NavSection) => void;
  onOpenMobileMenu: () => void;
  onRunDemoAutomation: () => void;
  onOpenCommandPalette?: () => void;
}

const SECTION_META: Record<NavSection, { group: string; title: string }> = {
  dashboard: { group: 'Workspace', title: 'Overview' },
  leads: { group: 'Workspace', title: 'Lead Management' },
  'ai-research': { group: 'Workspace', title: 'AI Research & Personalization' },
  campaigns: { group: 'Workspace', title: 'Campaign Builder' },
  'browser-engine': { group: 'Execution Engine', title: 'Browser Automation Engine' },
  sessions: { group: 'Execution Engine', title: 'Session Management' },
  'job-queue': { group: 'Execution Engine', title: 'Background Job Queue' },
  'ai-agent': { group: 'Execution Engine', title: 'AI Agent Control Center' },
  analytics: { group: 'Observability', title: 'Analytics & Reports' },
  'execution-history': { group: 'Observability', title: 'Automation Execution History' },
  'system-health': { group: 'Observability', title: 'System Health & Observability' },
  'activity-logs': { group: 'Observability', title: 'Activity Logs' },
  settings: { group: 'Observability', title: 'Settings & Integrations' },
};

export function TopBar({
  activeSection,
  aiMode,
  fallbackActive,
  onSelectSection,
  onOpenMobileMenu,
  onRunDemoAutomation,
  onOpenCommandPalette,
}: TopBarProps) {
  const meta = SECTION_META[activeSection];
  const isHealthyGemini = aiMode === 'gemini' && !fallbackActive;

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-white/[0.07] bg-[#090A0D]/85 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Trigger + Context Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-md text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-[13px] min-w-0 truncate">
          <span className="text-[#6B7280] hidden sm:inline whitespace-nowrap">
            {meta.group}
          </span>
          <span className="text-white/20 hidden sm:inline">/</span>
          <h1 className="font-semibold tracking-[-0.015em] text-[#F4F5F7] truncate">
            {meta.title}
          </h1>
        </div>
      </div>

      {/* Right: Command Palette + Telemetry Pill + Primary CTA */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {onOpenCommandPalette && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden xl:inline-flex items-center gap-2.5 h-8 px-2.5 rounded-lg bg-[#111318] hover:bg-[#181B22] border border-white/[0.07] hover:border-white/[0.14] text-xs text-[#9CA3AF] transition-all cursor-pointer"
            title="Quick navigation (Cmd+K)"
          >
            <Search className="h-3.5 w-3.5 text-[#6B7280]" />
            <span>Jump to...</span>
            <kbd className="font-mono text-[10px] text-[#6B7280] bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelectSection('system-health')}
          className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-[#111318] hover:bg-[#181B22] border border-white/[0.07] hover:border-white/[0.14] text-[11px] text-[#9CA3AF] hover:text-[#F4F5F7] transition-all whitespace-nowrap cursor-pointer"
          title="Open System Health & E2E Testing"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isHealthyGemini ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="font-mono text-[#F4F5F7]">
            {aiMode === 'gemini'
              ? fallbackActive
                ? 'Gemini Fallback'
                : 'Gemini Live'
              : 'Mock Engine'}
          </span>
          <span className="text-white/15">·</span>
          <span className="text-[#9CA3AF]">Sandbox</span>
        </button>

        <button
          type="button"
          onClick={onRunDemoAutomation}
          className="inline-flex items-center gap-2 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3.5 text-xs font-medium text-white transition-all whitespace-nowrap shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] cursor-pointer"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Run Demo</span>
        </button>
      </div>
    </header>
  );
}
