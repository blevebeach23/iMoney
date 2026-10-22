"use client";

import { useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "./button";

export function DeleteConfirmationForm({ action, children, title, description, triggerLabel }: Readonly<{
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  title: string;
  description: string;
  triggerLabel: string;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <Button type="button" variant="secondary" className="w-full text-red-700" onClick={() => dialog.current?.showModal()}>
        <Trash2 aria-hidden className="h-4 w-4" />
        {triggerLabel}
      </Button>
      <dialog ref={dialog} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
        className="w-[calc(100%_-_2rem)] max-w-sm rounded-md border border-border bg-white p-5 shadow-panel backdrop:bg-black/50">
        <form action={action}>
          {children}
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <p id={descriptionId} className="mt-2 text-sm text-zinc-600">{description}</p>
          <ConfirmationButtons onCancel={() => dialog.current?.close()} />
        </form>
      </dialog>
    </>
  );
}

function ConfirmationButtons({ onCancel }: Readonly<{ onCancel: () => void }>) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex gap-3">
      <Button type="button" variant="secondary" className="flex-1" autoFocus disabled={pending} onClick={onCancel}>Annulla</Button>
      <Button type="submit" className="flex-1 bg-red-700 text-white hover:bg-red-800" disabled={pending}>
        {pending ? "Eliminazione…" : "Elimina"}
      </Button>
    </div>
  );
}
