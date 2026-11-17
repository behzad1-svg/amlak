"use client";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel} ariaLabel={title}>
      <h3 className="text-[15px] font-extrabold">{title}</h3>
      {message ? <p className="mt-2 text-[13px] leading-6 text-[var(--ink-2)]">{message}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
