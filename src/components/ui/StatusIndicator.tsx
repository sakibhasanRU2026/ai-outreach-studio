import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  PauseCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

function resolveTone(status: string): Tone {
  const s = status.toLowerCase();
  if (
    s.includes('failed') ||
    s.includes('error') ||
    s.includes('expired') ||
    s.includes('rejected') ||
    s.includes('blocked') ||
    s.includes('degraded') ||
    s.includes('disconnected') ||
    s.includes('needs re-auth')
  ) {
    return 'error';
  }
  if (s.includes('not configured')) {
    return 'neutral';
  }
  if (
    s.includes('active') ||
    s.includes('completed') ||
    s.includes('connected') ||
    s.includes('authenticated') ||
    s.includes('interested') ||
    s.includes('replied') ||
    s.includes('approved') ||
    s.includes('nominal') ||
    s.includes('success') ||
    s.includes('configured') ||
    s.includes('passed')
  ) {
    return 'success';
  }
  if (
    s.includes('running') ||
    s.includes('researched') ||
    s.includes('connection sent') ||
    s.includes('simulated') ||
    s.includes('info')
  ) {
    return 'info';
  }
  if (
    s.includes('pending') ||
    s.includes('retrying') ||
    s.includes('queued') ||
    s.includes('idle') ||
    s.includes('paused') ||
    s.includes('rate limited') ||
    s.includes('throttled') ||
    s.includes('standby') ||
    s.includes('mock') ||
    s.includes('fallback') ||
    s.includes('warning') ||
    s.includes('challenge')
  ) {
    return 'warning';
  }
  return 'neutral';
}

export function StatusText({ status, showIcon = true }: { status: string; showIcon?: boolean }) {
  const tone = resolveTone(status);
  const colorMap: Record<Tone, string> = {
    success: 'text-emerald-400',
    info: 'text-blue-400',
    warning: 'text-amber-400',
    error: 'text-rose-400',
    neutral: 'text-slate-400',
  };

  const renderIcon = () => {
    if (!showIcon) return null;
    const lower = status.toLowerCase();
    if (lower === 'running' || lower === 'retrying') {
      return <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />;
    }
    if (lower === 'paused') {
      return <PauseCircle className="h-3.5 w-3.5 shrink-0" />;
    }
    if (lower.includes('needs re-auth') || lower.includes('rate limited')) {
      return <ShieldAlert className="h-3.5 w-3.5 shrink-0" />;
    }
    if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
    if (tone === 'warning') return <Clock className="h-3.5 w-3.5 shrink-0" />;
    if (tone === 'error') return <XCircle className="h-3.5 w-3.5 shrink-0" />;
    if (tone === 'info') return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
    return null;
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorMap[tone]}`}>
      {renderIcon()}
      <span>{status}</span>
    </span>
  );
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatIsoTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}Z`;
}

export function formatPreciseTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${formatIsoTimeOnly(iso)}`;
}
