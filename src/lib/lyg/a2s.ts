import dgram from "node:dgram";

/**
 * Requête A2S (Steam server query) vers un serveur GMod/Source.
 *
 * Donne le nombre de joueurs EN DIRECT sur le serveur de jeu, indépendamment de
 * l'API LYG (donc pas de quota, pas de token). On gère le handshake « challenge »
 * rendu obligatoire par Valve en 2020 : le serveur répond d'abord 0x41 + un
 * challenge de 4 octets, qu'il faut renvoyer avec la requête pour obtenir 0x49.
 *
 * Node-only (node:dgram) → toute route qui l'utilise doit être en runtime nodejs.
 */

export type GameServer = { host: string; port: number };

export type A2SInfo = {
  host: string;
  port: number;
  ok: boolean;
  name?: string;
  map?: string;
  /** Joueurs humains (bots déduits). */
  players?: number;
  max?: number;
  bots?: number;
  error?: string;
};

const A2S_INFO_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]);
const A2S_INFO_PAYLOAD = Buffer.from("Source Engine Query\0", "binary");

function buildInfoRequest(challenge: Buffer | null): Buffer {
  return challenge
    ? Buffer.concat([A2S_INFO_HEADER, A2S_INFO_PAYLOAD, challenge])
    : Buffer.concat([A2S_INFO_HEADER, A2S_INFO_PAYLOAD]);
}

export function queryA2SInfo(host: string, port: number, timeoutMs = 2000): Promise<A2SInfo> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    let done = false;
    const finish = (r: A2SInfo) => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {
        /* déjà fermé */
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ host, port, ok: false, error: "timeout" }), timeoutMs);

    sock.on("message", (msg) => {
      try {
        const header = msg.readUInt8(4);
        if (header === 0x41) {
          // Challenge → on renvoie la requête avec les 4 octets de challenge.
          sock.send(buildInfoRequest(msg.subarray(5, 9)), port, host);
          return;
        }
        if (header !== 0x49) return; // pas une réponse info

        let off = 5;
        off += 1; // octet « protocol »
        const readStr = () => {
          const end = msg.indexOf(0x00, off);
          const s = msg.toString("utf8", off, end);
          off = end + 1;
          return s;
        };
        const name = readStr();
        const map = readStr();
        readStr(); // folder
        readStr(); // game
        off += 2; // appid (int16)
        const rawPlayers = msg.readUInt8(off);
        off += 1;
        const max = msg.readUInt8(off);
        off += 1;
        const bots = msg.readUInt8(off);
        off += 1;
        clearTimeout(timer);
        finish({
          host,
          port,
          ok: true,
          name,
          map,
          players: Math.max(0, rawPlayers - bots),
          max,
          bots,
        });
      } catch (e) {
        clearTimeout(timer);
        finish({ host, port, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      finish({ host, port, ok: false, error: e.message });
    });
    try {
      sock.send(buildInfoRequest(null), port, host);
    } catch (e) {
      clearTimeout(timer);
      finish({ host, port, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/**
 * Serveurs GMod DarkRP de LYG où joue la famille (LePtitDarkRP). L'ORDRE = la
 * priorité : le premier est le serveur principal « Famille | LYG » (180 slots),
 * celui dont le compteur affiché (X/180) reflète ce que montre metricsgame /
 * le bot Discord. Le second est le shard « Synchronisé avec le serveur 1 »
 * (128 slots), en général vide (overflow). Surchargeable sans redeploy via
 * l'env `LYG_GMOD_SERVERS` (liste « host:port » séparée par des virgules) si
 * les IP changent.
 *
 * On cible les noms DNS officiels (footer de liveyourgame.fr) plutôt que des IP
 * en dur → robuste si LYG change d'IP. gmod1.lyg.fr = 145.239.211.147 (principal),
 * gmod2.lyg.fr = 188.165.54.100 (shard). node:dgram résout le hostname tout seul.
 */
export function getLygGameServers(): GameServer[] {
  const raw = process.env.LYG_GMOD_SERVERS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const [host, portStr] = entry.split(":");
        return { host: (host ?? "").trim(), port: Number(portStr) || 27015 };
      })
      .filter((s) => s.host);
  }
  return [
    { host: "gmod1.lyg.fr", port: 27015 }, // LePtitDarkRP #1 — principal « Famille | LYG » (180)
    { host: "gmod2.lyg.fr", port: 27015 }, // LePtitDarkRP #2 — shard synchronisé (128, souvent vide)
  ];
}
