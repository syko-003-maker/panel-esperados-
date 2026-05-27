"use client";

import { ReactNode, useCallback, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Hook impératif pour remplacer `window.confirm()` par notre <ConfirmDialog/>
 * stylé, sans avoir à gérer state + JSX dans chaque composant.
 *
 * Usage :
 *   const { confirm, dialog } = useConfirm();
 *
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: "Supprimer cette sanction ?",
 *       description: "Cette action est irréversible.",
 *       confirmLabel: "Supprimer",
 *       tone: "danger",
 *     });
 *     if (!ok) return;
 *     // ...exécute la suppression
 *   }
 *
 *   return (<>
 *     {dialog}
 *     <Button onClick={handleDelete}>Supprimer</Button>
 *   </>);
 *
 * Note : confirm() retourne une promesse qui résout à `true` (OK) ou `false`
 * (Annuler/Échap/clic en dehors). Si le composant unmount avant la décision,
 * la promesse reste pending — c'est OK, l'awaiter ne reprendra pas.
 */
type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
};

type PendingState = ConfirmOptions & {
  resolve: (v: boolean) => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (pending) {
      pending.resolve(true);
      setPending(null);
    }
  }, [pending]);

  const handleCancel = useCallback(() => {
    if (pending) {
      pending.resolve(false);
      setPending(null);
    }
  }, [pending]);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      tone={pending?.tone ?? "danger"}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
