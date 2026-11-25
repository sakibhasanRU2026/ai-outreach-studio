import { useState } from 'react';
import type { AnalyticsDayPoint } from '../../types/outreach';

interface OutreachAreaChartProps {
  data: AnalyticsDayPoint[];
  height?: number;
}

export function OutreachAreaChart({ data, height = 240 }: OutreachAreaChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500">
        No outreach telemetry available for this range.
      </div>
    );
  }

  const width = 760;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(
    10,
    ...data.map((d) => Math.max(d.connectionsSent, d.connectionsAccepted, d.repliesReceived))
  );
  const yMax = Math.ceil(maxVal / 5) * 5;

  const xFor = (i: number) =>
    data.length === 1 ? padLeft + chartW / 2 : padLeft + (i / (data.length - 1)) * chartW;
  const yFor = (val: number) => padTop + chartH - (val / yMax) * chartH;

  const buildPath = (accessor: (d: AnalyticsDayPoint) => number) =>
    data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(accessor(d)).toFixed(1)}`)
      .join(' ');

  const sentPath = buildPath((d) => d.connectionsSent);
  const acceptedPath = buildPath((d) => d.connectionsAccepted);
  const replyPath = buildPath((d) => d.repliesReceived);

  const sentArea = `${sentPath} L ${xFor(data.length - 1).toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3 text-xs text-slate-400">
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-xs bg-blue-500" />
            Connections Sent
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-xs bg-emerald-400" />
            Accepted
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-xs bg-amber-400" />
            Replies
          </span>
        </div>
        {hovered && (
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-200 tabular-nums">
            <span className="text-slate-400">{hovered.date}</span>
            <span>Sent: {hovered.connectionsSent}</span>
            <span className="text-emerald-400">Accepted: {hovered.connectionsAccepted}</span>
            <span className="text-amber-400">Replies: {hovered.repliesReceived}</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={d.date}
              x={xFor(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] font-mono tabular-nums"
            >
              {d.date.slice(5)}
            </text>
          );
        })}

        <path d={sentArea} fill="url(#sentGrad)" />
        <path d={sentPath} fill="none" stroke="#3B82F6" strokeWidth="2" />
        <path d={acceptedPath} fill="none" stroke="#34D399" strokeWidth="1.75" />
        <path d={replyPath} fill="none" stroke="#FBBF24" strokeWidth="1.75" />

        {hoverIdx !== null && (
          <g>
            <line
              x1={xFor(hoverIdx)}
              x2={xFor(hoverIdx)}
              y1={padTop}
              y2={padTop + chartH}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx].connectionsSent)} r="4" fill="#3B82F6" />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx].connectionsAccepted)} r="3.5" fill="#34D399" />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx].repliesReceived)} r="3.5" fill="#FBBF24" />
          </g>
        )}

        {data.map((d, i) => {
          const sliceW = chartW / Math.max(1, data.length);
          return (
            <rect
              key={d.date}
              x={xFor(i) - sliceW / 2}
              y={padTop}
              width={Math.max(4, sliceW)}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function WorkerThroughputBars({
  items,
}: {
  items: { label: string; completed: number; failed: number; latencyMs: number }[];
}) {
  const maxVal = Math.max(10, ...items.map((i) => i.completed + i.failed));

  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const pct = Math.round((item.completed / maxVal) * 100);
        const failPct = Math.round((item.failed / maxVal) * 100);
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-200">{item.label}</span>
              <span className="text-slate-400 font-mono tabular-nums">
                {item.completed} ok · {item.failed} err · {item.latencyMs}ms avg
              </span>
            </div>
            <div className="h-2 w-full rounded-sm bg-white/[0.05] overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
              {failPct > 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${failPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
