/** Tiny Task Manager-style sparkline (0–100%). Pure SVG, no chart lib. */

export function UsageChart({
  values,
  color,
  fill,
}: {
  values: number[];
  color: string;
  fill: string;
}) {
  const w = 200;
  const h = 40;
  const pad = 2;

  // Always draw a full-width baseline even with <2 points.
  const pts = values.length > 0 ? values : [0];
  const step = pts.length > 1 ? (w - pad * 2) / (pts.length - 1) : 0;

  const coords = pts.map((v, i) => {
    const x = pad + i * step;
    const clamped = Math.max(0, Math.min(100, v));
    const y = pad + (1 - clamped / 100) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = coords.join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (pts.length - 1) * step},${h - pad}`;

  return (
    <svg className="usage-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={area} fill={fill} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
