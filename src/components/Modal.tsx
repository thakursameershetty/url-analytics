'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from './charts/shared';

export interface Origin {
  x: number;
  y: number;
}

/** Point at the centre of the element that was clicked, for "grow from here" modals. */
export function originOf(el: Element): Origin {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export default function Modal({
  open,
  onClose,
  title,
  origin,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Viewport point the dialog should appear to grow out of. */
  origin?: Origin | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.dataset.state = 'open';
      d.showModal();
      const r = d.getBoundingClientRect();
      d.style.transformOrigin = origin
        ? `${origin.x - r.left}px ${origin.y - r.top}px`
        : 'center';
    }
    if (!open && d.open) d.close();
  }, [open, origin]);

  // Play the exit animation, then actually close.
  const requestClose = useCallback(() => {
    const d = ref.current;
    if (!d || closing.current) return;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    closing.current = true;
    d.dataset.state = 'closing';
    setTimeout(() => {
      closing.current = false;
      onClose();
    }, 160);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      className="modal m-auto w-[min(720px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" onClick={requestClose} className="btn-ghost" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
