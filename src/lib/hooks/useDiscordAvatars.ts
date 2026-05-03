import { useEffect, useRef, useState } from "react";

/**
 * Hook pour charger les avatars Discord d'un ensemble de membres côté client.
 *
 * Fonctionnement en 3 passes :
 *  - Passe 1 (0 s)   : retourne ce qui est en cache (Account table + cache mémoire)
 *  - Passe 2 (3 s)   : le fetch Discord background a eu le temps de traiter ~15 IDs
 *  - Passe 3 (10 s)  : le fetch background est terminé pour les 53 IDs restants
 *
 * Les avatars apparaissent progressivement sans jamais bloquer le rendu.
 */
export function useDiscordAvatars(
  discordIds: (string | null | undefined)[]
): Map<string, string | null> {
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
        const data: Record<string, string | null> = res.ok ? await res.json() : {};
        if (!cancelled) {
          setAvatars((prev) => {
            const next = new Map(prev);
            for (const [id, url] of Object.entries(data)) {
              // Conserver une vraie URL si on la remplace par null
              if (url !== null || !prev.has(id)) next.set(id, url);
            }
            return next;
          });
        }
      } catch { /* silencieux */ }
    }

    // Passe 1 : immédiate
    void fetchAvatars();

    // Passes suivantes : le serveur fait le fetch Discord en background
    // Concurrence 5 + 100 ms → ~53 IDs en ~3-5 s (avec retries 429)
    const delays = [3000, 10000];
    timersRef.current = delays.map((ms) =>
      setTimeout(() => { if (!cancelled) void fetchAvatars(); }, ms)
    );

    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return avatars;
}
