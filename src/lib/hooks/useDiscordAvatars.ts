import { useEffect, useRef, useState } from "react";

/**
 * Hook pour charger les avatars Discord d'un ensemble de membres côté client.
 *
 * Fonctionnement deux passes :
 *  1. Appel immédiat → retourne ce qui est en cache serveur (Account table, cache mémoire)
 *  2. Appel après 4 s → le serveur a eu le temps de finir le fetch Discord API en arrière-plan
 *
 * Fusionne les deux résultats : les avatars apparaissent progressivement.
 */
export function useDiscordAvatars(
  discordIds: (string | null | undefined)[]
): Map<string, string | null> {
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clé stable : IDs triés et dédupliqués
  const ids = discordIds.filter((id): id is string => Boolean(id));
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    if (!key) return;

    const uniqueIds = key.split(",");
    let cancelled = false;

    async function fetchAvatars() {
      try {
        const res  = await fetch(`/api/staff/avatars?ids=${encodeURIComponent(uniqueIds.join(","))}`);
        const data = res.ok ? (await res.json() as Record<string, string | null>) : {};
        if (!cancelled) {
          setAvatars((prev) => {
            const next = new Map(prev);
            for (const [id, url] of Object.entries(data)) {
              // Ne remplacer une URL existante que si on reçoit quelque chose de mieux
              if (url !== null || !prev.has(id)) next.set(id, url);
            }
            return next;
          });
        }
      } catch { /* silencieux */ }
    }

    // Passe 1 : immédiate
    void fetchAvatars();

    // Passe 2 : après 4 s (le cache Discord API a eu le temps de se remplir)
    retryRef.current = setTimeout(() => {
      if (!cancelled) void fetchAvatars();
    }, 4000);

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return avatars;
}
