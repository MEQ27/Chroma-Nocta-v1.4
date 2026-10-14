export interface SplinePoint {
  readonly x: number;
  readonly y: number;
}

export function getSmoothSplinePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  const second = points[1];
  if (points.length === 2 && second) return `M ${first.x} ${first.y} L ${second.x} ${second.y}`;

  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 && points[i - 1] ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 && points[i + 2] ? points[i + 2] : p2;

    if (!p0 || !p1 || !p2 || !p3) continue;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
