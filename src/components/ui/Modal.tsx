"use client";
import { useEffect, useRef, type ReactNode } from "react";

// Shared modal shell: Tab trap, focus restore, Escape to close and body
// scroll lock. The caller renders it only while the modal is open.
export type ModalLayout = "center" | "popover";

type ModalProps = {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  /** "center": centered dialog panel. "popover": panel positioned by panelClassName (e.g. absolute under a trigger). */
  layout?: ModalLayout;
  /** Extra classes for the panel; replaces the default centered-panel classes. */
  panelClassName?: string;
  /** Focus the first focusable element on open (default true). */
  autoFocus?: boolean;
  /** Lock body scroll while open (default true). */
  lockScroll?: boolean;
  /** Keep Tab inside the panel (default true). */
  trapFocus?: boolean;
  /** Clicking the overlay closes the modal (default true). */
  closeOnOverlayClick?: boolean;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const CENTER_PANEL_CLASS =
  "relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-xl";

export function Modal({
  onClose,
  ariaLabel,
  children,
  layout = "center",
  panelClassName,
  autoFocus = true,
  lockScroll = true,
  trapFocus = true,
  closeOnOverlayClick = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    if (autoFocus && panel) {
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!trapFocus || e.key !== "Tab" || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const list = Array.from(els).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [autoFocus, lockScroll, trapFocus]);

  if (layout === "popover") {
    return (
      <>
        <div className="fixed inset-0 z-30" onClick={closeOnOverlayClick ? () => onCloseRef.current() : undefined} />
        <div ref={panelRef} role="dialog" aria-label={ariaLabel} className={panelClassName ?? ""}>
          {children}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={closeOnOverlayClick ? () => onCloseRef.current() : undefined} aria-label="بستن" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={panelClassName ?? CENTER_PANEL_CLASS}
      >
        {children}
      </div>
    </div>
  );
}
