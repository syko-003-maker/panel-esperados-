/**
 * GET /reset-cache
 *
 * Force le navigateur à effacer TOUT son cache pour losesperados.fr :
 *   - Cache HTTP (HTML, CSS, JS, images)
 *   - Cookies
 *   - Storage (localStorage, sessionStorage, IndexedDB)
 *
 * Utile quand un client a un HTML obsolète qui référence des assets CSS/JS
 * qui n'existent plus (rebuild avec nouveaux hashes). Après la visite, le
 * navigateur charge tout from scratch.
 *
 * Usage : envoie le lien `https://losesperados.fr/reset-cache` au membre qui
 * a un site bizarre. Une fois cliqué, redirection auto vers /login.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Page HTML simple avec auto-refresh vers / après 1s, pour donner au
  // navigateur le temps d'appliquer le Clear-Site-Data.
  const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Reset cache — Los Esperados</title>
<meta http-equiv="refresh" content="1;url=/" />
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background:#0e0507; color:#fff;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0;
         text-align:center; padding:24px; }
  .box { max-width:420px; }
  h1 { font-size:20px; margin:0 0 12px; }
  p  { color:#bbb; line-height:1.5; }
  .spin { width:32px; height:32px; border:3px solid #444; border-top-color:#9b2335;
          border-radius:50%; margin:16px auto 8px; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head><body>
<div class="box">
  <div class="spin" aria-hidden="true"></div>
  <h1>Cache vidé ✓</h1>
  <p>Redirection en cours vers le site… Si rien ne se passe,
     <a href="/" style="color:#ff8090">clique ici</a>.</p>
</div>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Cette directive ordonne au navigateur d'effacer TOUT pour notre domaine.
      // Supporté Chrome 76+, Firefox 63+, Safari 16+.
      "Clear-Site-Data": '"cache", "cookies", "storage"',
      // S'assurer que cette page elle-même n'est jamais cachée.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
