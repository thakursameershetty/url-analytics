'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

type Level = 'L' | 'M' | 'Q' | 'H';

const PRESETS = [
  { fg: '#0b0b0b', bg: '#ffffff' },
  { fg: '#1c5cab', bg: '#ffffff' },
  { fg: '#ffffff', bg: '#0b0b0b' },
  { fg: '#6250d6', bg: '#f3f1ff' },
  { fg: '#0f6b4c', bg: '#eefaf4' },
];

interface Props {
  /** The short link, without tracking params. */
  url: string;
  fileName: string;
}

/**
 * Live QR preview with colour/correction controls and PNG/SVG export.
 * Encodes `?src=qr` by default so scans are counted separately from clicks.
 */
export default function QrStudio({ url, fileName }: Props) {
  const [fg, setFg] = useState(PRESETS[0].fg);
  const [bg, setBg] = useState(PRESETS[0].bg);
  const [level, setLevel] = useState<Level>('M');
  const [margin, setMargin] = useState(2);
  const [track, setTrack] = useState(true);
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  const encoded = track ? `${url}${url.includes('?') ? '&' : '?'}src=qr` : url;
  const opts = { errorCorrectionLevel: level, margin, color: { dark: fg, light: bg } } as const;

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(encoded, { ...opts, type: 'svg' }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encoded, fg, bg, level, margin]);

  async function downloadPng(size: number) {
    const dataUrl = await QRCode.toDataURL(encoded, { ...opts, width: size });
    trigger(dataUrl, `${fileName}-${size}.png`);
  }

  async function downloadSvg() {
    const s = await QRCode.toString(encoded, { ...opts, type: 'svg' });
    const blobUrl = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    trigger(blobUrl, `${fileName}.svg`);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  async function copyPng() {
    try {
      const dataUrl = await QRCode.toDataURL(encoded, { ...opts, width: 1024 });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard image support varies (and needs a secure context); fall back to download.
      downloadPng(1024);
    }
  }

  const contrastLow = luminanceContrast(fg, bg) < 3;

  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="space-y-3">
        <div
          className="mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl border border-line shadow-sm transition-colors [&>svg]:size-full"
          style={{ background: bg }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="truncate text-center font-mono text-[11px] text-muted" title={encoded}>
          {encoded.replace(/^https?:\/\//, '')}
        </p>
      </div>

      <div className="space-y-5 text-sm">
        <Field label="Colors">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.fg + p.bg}
                type="button"
                onClick={() => {
                  setFg(p.fg);
                  setBg(p.bg);
                }}
                aria-label={`Preset ${p.fg} on ${p.bg}`}
                className={`grid size-8 place-items-center rounded-full border transition ${fg === p.fg && bg === p.bg ? 'border-accent ring-2 ring-accent-soft' : 'border-line'}`}
                style={{ background: p.bg }}
              >
                <span className="size-3.5 rounded-sm" style={{ background: p.fg }} />
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-grid" />
            <ColorInput label="Code" value={fg} onChange={setFg} />
            <ColorInput label="Background" value={bg} onChange={setBg} />
          </div>
          {contrastLow && (
            <p className="mt-2 text-xs text-critical">Low contrast — some phone cameras won&apos;t read this.</p>
          )}
        </Field>

        <Field label="Error correction" hint="Higher survives smudges and logos, but makes a denser code.">
          <Segmented
            value={level}
            onChange={(v) => setLevel(v as Level)}
            options={[
              ['L', 'Low'],
              ['M', 'Medium'],
              ['Q', 'High'],
              ['H', 'Max'],
            ]}
          />
        </Field>

        <Field label={`Quiet zone · ${margin}`}>
          <input
            type="range"
            min={0}
            max={6}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full max-w-xs accent-[var(--accent)]"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            Count scans separately
            <span className="block text-xs text-muted">Adds ?src=qr so analytics can tell scans from clicks.</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => downloadPng(1024)} className="btn-primary">
            <Download className="size-4" /> PNG
          </button>
          <button type="button" onClick={downloadSvg} className="btn-secondary">
            <Download className="size-4" /> SVG
          </button>
          <button type="button" onClick={() => downloadPng(2048)} className="btn-secondary">
            <Download className="size-4" /> Print (2048px)
          </button>
          <button type="button" onClick={copyPng} className="btn-secondary">
            {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy image'}
          </button>
        </div>
      </div>
    </div>
  );
}

function trigger(href: string, download: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = download;
  a.click();
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="btn-secondary h-8! cursor-pointer gap-1.5! px-3! text-xs! font-normal! text-ink-2!">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-4 cursor-pointer overflow-hidden rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        aria-label={`${label} color`}
      />
      {label}
    </label>
  );
}

export function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          data-active={value === v}
          className="segmented-item"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function luminanceContrast(a: string, b: string) {
  const lum = (hex: string) => {
    const n = hex.replace('#', '');
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
