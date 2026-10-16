'use client';

import QRCode from 'qrcode';
import { useMemo } from 'react';

/**
 * Small QR preview whose modules "materialise" outward from the centre.
 * Purely decorative; the full QrStudio handles export.
 */
export default function MiniQr({ value, size = 112 }: { value: string; size?: number }) {
  const { n, cells } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const c = (count - 1) / 2;
    const maxDist = Math.hypot(c, c);
    const out: { x: number; y: number; d: number }[] = [];
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.modules.get(y, x)) out.push({ x, y, d: Math.hypot(x - c, y - c) / maxDist });
      }
    }
    return { n: count, cells: out };
  }, [value]);

  const pad = 2;
  return (
    <svg
      key={value}
      viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code preview"
      className="rounded-xl bg-white"
      shapeRendering="crispEdges"
    >
      {cells.map(({ x, y, d }) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1.02}
          height={1.02}
          fill="#0b0b0b"
          className="qr-cell"
          style={{ animationDelay: `${Math.round(d * 520)}ms` }}
        />
      ))}
    </svg>
  );
}
