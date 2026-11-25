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
      <div className="h-56 flex items-center justify-center text-xs text-[#6B7280]">
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

  const buildSmoothPath = (accessor: (d: AnalyticsDayPoint) => number) => {
    const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(accessor(d)) }));
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = ((p0.x + p1.x) / 2).toFixed(1);
      path += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return path;
  };

  const sentPath = buildSmoothPath((d) => d.connectionsSent);
  const acceptedPath = buildSmoothPath((d) => d.connectionsAccepted);
  const replyPath = buildSmoothPath((d) => d.repliesReceived);

  const sentArea = `${sentPath} L ${xFor(data.length - 1).toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;
  const acceptedArea = `${acceptedPath} L ${xFor(data.length - 1).toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const hovered = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
        <div className="flex items-center gap-4 text-[#9CA3AF]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span>Sent</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Accepted</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>Replies</span>
          </span>
        </div>

        {hovered && (
          <div className="inline-flex items-center gap-3 px-2.5 py-1 rounded-md bg-[#181B22] border border-white/[0.08] font-mono text-[11px] tabular-nums">
            <span className="text-[#6B7280]">{hovered.date}</span>
            <span className="text-blue-400">Sent {hovered.connectionsSent}</span>
            <span className="text-emerald-400">Acc {hovered.connectionsAccepted}</span>
            <span className="text-amber-300">Rep {hovered.repliesReceived}</span>
          </div>
        )}
      </div>

      <svg
        role="img"
        aria-label="Outreach performance chart showing connections sent, accepted, and replies over time"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="acceptedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
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
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="2 4"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
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
              className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
            >
              {d.date.slice(5)}
            </text>
          );
        })}

        <path d={sentArea} fill="url(#sentGrad)" />
        <path d={acceptedArea} fill="url(#acceptedGrad)" />
        <path d={sentPath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
        <path d={acceptedPath} fill="none" stroke="#10B981" strokeWidth="1.75" strokeLinecap="round" />
        <path
          d={replyPath}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.75"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {hoverIdx !== null && (
          <g>
            <line
              x1={xFor(hoverIdx)}
              x2={xFor(hoverIdx)}
              y1={padTop}
              y2={padTop + chartH}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1"
            />
            <circle
              cx={xFor(hoverIdx)}
              cy={yFor(data[hoverIdx].connectionsSent)}
              r="4.5"
              fill="#090A0D"
              stroke="#3B82F6"
              strokeWidth="2"
            />
            <circle
              cx={xFor(hoverIdx)}
              cy={yFor(data[hoverIdx].connectionsAccepted)}
              r="4"
              fill="#090A0D"
              stroke="#10B981"
              strokeWidth="2"
            />
            <circle
              cx={xFor(hoverIdx)}
              cy={yFor(data[hoverIdx].repliesReceived)}
              r="4"
              fill="#090A0D"
              stroke="#F59E0B"
              strokeWidth="2"
            />
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
              className="cursor-crosshair"
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
    <div className="space-y-4">
      {items.map((item) => {
        const pct = Math.round((item.completed / maxVal) * 100);
        const failPct = Math.round((item.failed / maxVal) * 100);
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[#F4F5F7]">{item.label}</span>
              <span className="text-[#9CA3AF] font-mono text-[11px] tabular-nums">
                <span className="text-emerald-400">{item.completed} ok</span>
                <span className="text-white/20 mx-1.5">·</span>
                <span className={item.failed > 0 ? 'text-rose-400' : 'text-[#6B7280]'}>
                  {item.failed} err
                </span>
                <span className="text-white/20 mx-1.5">·</span>
                <span>{item.latencyMs}ms</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex">
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
