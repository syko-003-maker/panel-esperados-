import { useEffect, useState } from "react";

/**
 * Hook pour charger les avatars Discord d'un ensemble de membres côté client.
 * Appelle /api/staff/avatars?ids=... et retourne une Map discordId → avatarUrl.
 *
 * - Chargement non-bloquant (les avatars arrivent après le premier rendu)
 * - Déduplication automatique des IDs
 * - Ne re-fetch pas si les IDs n'ont pas changé
 */
export function useDiscordAvatars(discordIds: (string | null | undefined)[]): Map<string, string | null> {
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());

  // Sérialiser pour détecter les changements sans référence instable
  const ids = discordIds.filter((id): id is string => Boolean(id));
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    if (!key) return;

    const uniqueIds = key.split(",");
    let cancelled = false;

    fetch(`/api/staff/avatars?ids=${encodeURIComponent(uniqueIds.join(","))}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, string | null>) => {
        if (cancelled) return;
        setAvatars(new Map(Object.entries(data)));
      })
      .catch(() => {/* silencieux — les avatars restent vides */});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return avatars;
}
