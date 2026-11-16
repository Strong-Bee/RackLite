'use client';

import React from 'react';

interface Series {
  label: string;
  color: string;
  data: number[];
}

interface MetricChartProps {
  series: Series[];
  maxValue?: number;
  unit?: string;
  height?: number;
}

export function MetricChart({
  series,
  maxValue,
  unit = '%',
  height = 140,
}: MetricChartProps) {
  const width = 520;
  const padY = 10;
  const maxPoints = Math.max(...series.map((s) => s.data.length), 2);
  const computedMax =
    maxValue ??
    Math.max(
      10,
      ...series.flatMap((s) => s.data)
    );

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        preserveAspectRatio="none"
        style={{ height }}
      >
        {/* Garis bantu horizontal */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padY + (height - padY * 2) * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          );
        })}

        {series.map((s) => {
          const pts = s.data;
          if (pts.length < 2) return null;
          const stepX = width / Math.max(1, maxPoints - 1);

          const coords = pts.map((val, idx) => {
            const x = idx * stepX;
            const norm = Math.min(1, Math.max(0, val / computedMax));
            const y = padY + (height - padY * 2) * (1 - norm);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });

          const polylinePoints = coords.join(' ');
          const areaPoints = `0,${height - padY} ${polylinePoints} ${(
            (pts.length - 1) *
            stepX
          ).toFixed(1)},${height - padY}`;

          return (
            <g key={s.label}>
              <polygon
                points={areaPoints}
                fill={s.color}
                fillOpacity={0.12}
              />
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-4">
          {series.map((s) => {
            const latest = s.data[s.data.length - 1] ?? 0;
            return (
              <div key={s.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}:</span>
                <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                  {latest.toFixed(1)}
                  {unit}
                </span>
              </div>
            );
          })}
        </div>
        <span className="font-mono tabular-nums">
          Maks {computedMax.toFixed(0)}
          {unit}
        </span>
      </div>
    </div>
  );
}
