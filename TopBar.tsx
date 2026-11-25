import { Menu, Play } from 'lucide-react';
import type { NavSection } from '../../types/outreach';

interface TopBarProps {
  activeSection: NavSection;
  aiMode: 'gemini' | 'mock';
  fallbackActive?: boolean;
  onSelectSection: (section: NavSection) => void;
  onOpenMobileMenu: () => void;
  onRunDemoAutomation: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Overview',
  leads: 'Lead Management',
  'ai-research': 'AI Research & Personalization',
  campaigns: 'Campaign Builder',
  'browser-engine': 'Browser Automation Engine',
  sessions: 'Session Management',
  'job-queue': 'Background Job Queue',
  'ai-agent': 'AI Agent Control Center',
  analytics: 'Analytics & Reports',
  'execution-history': 'Automation Execution History',
  'system-health': 'System Health & Observability',
  'activity-logs': 'Activity Logs',
  settings: 'Settings & Integrations',
};

export function TopBar({
  activeSection,
  aiMode,
  fallbackActive,
  onSelectSection,
  onOpenMobileMenu,
  onRunDemoAutomation,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-white/[0.08] bg-[#0B0E14]/90 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0 truncate">
          <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Workspace</span>
          <span className="text-slate-600 hidden sm:inline">/</span>
          <h1 className="font-display font-medium text-slate-100 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <button
          type="button"
          onClick={() => onSelectSection('system-health')}
          className="hidden md:inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          title="Open System Health & E2E Testing"
        >
          <span className="font-mono text-amber-300 font-medium">Demo Mode</span>
          <span className="text-slate-600">·</span>
          <span>
            {aiMode === 'gemini'
              ? fallbackActive
                ? 'Gemini (Fallback Active)'
                : 'Gemini Connected'
              : 'Mock AI Engine'}
          </span>
          <span className="text-slate-600">·</span>
          <span>Sandbox Browser</span>
        </button>
        <button
          type="button"
          onClick={onRunDemoAutomation}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 shadow-sm shadow-blue-950/50 cursor-pointer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Run Demo Automation</span>
        </button>
      </div>
    </header>
  );
}
