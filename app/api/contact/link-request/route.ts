import { NextResponse } from "next/server";

/**
 * Demande de liaison en self-service : DÉSACTIVÉE.
 *
 * L'accès au panel passe uniquement par un recrutement validé (ou un lien fait
 * par le staff). On ne crée donc plus de demande de liaison depuis le site — la
 * page « Compte non lié » oriente vers le recrutement / un Recruteur / EM / Chef.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "LINK_REQUEST_DISABLED",
      message:
        "L'accès au panel se fait via un recrutement. Contacte un Recruteur, un État-Major ou un Chef sur Discord.",
    },
    { status: 403 }
  );
}
