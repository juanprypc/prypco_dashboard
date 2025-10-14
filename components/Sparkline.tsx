'use client';

type SparklineProps = {
  data: Array<{ label: string; value: number }>;
  stroke?: string;
  fill?: string;
  height?: number;
};

export function Sparkline({ data, stroke = '#7f5af0', fill = 'rgba(127, 90, 240, 0.18)', height = 68 }: SparklineProps) {
  const width = 220;
  if (!data.length) {
    return (
      <div className="flex h-16 w-full items-center justify-center text-xs text-[var(--color-outer-space)]/40">
        No data
      </div>
    );
  }

  const values = data.map((item) => item.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * width;
    const normalised = (item.value - min) / range;
    const y = height - normalised * height;
    return { x, y };
  });

  const path = points
    .map((pt, index) => `${index === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${path} L${points.at(-1)?.x.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
