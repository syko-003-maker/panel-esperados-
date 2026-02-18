import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { lygProbeInfos } from "@/lib/lyg-probe-infos";
import { debug } from "@/lib/logger";

export async function GET() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    debug("[lyg/infos] Starting infos probe");
    
    const probeResult = await lygProbeInfos(DEFAULT_FAMILY_ID, {
      timeoutMs: 15_000,
    });

    if (!probeResult.ok) {
      debug("[lyg/infos] No working endpoint found", {
        totalProbed: probeResult.probeResults.length,
      });

      return NextResponse.json(
        {
          ok: false,
          error: probeResult.error,
          probeResults: probeResult.probeResults,
        },
        { status: 404 }
      );
    }

    debug("[lyg/infos] Found working endpoint", {
      path: probeResult.probedPath,
    });

    return NextResponse.json({
      data: probeResult.data,
      ok: true,
      probedPath: probeResult.probedPath,
      probeResults: probeResult.probeResults,
    });
  } catch (err: any) {
    debug("[lyg/infos] Unexpected error", {
      error: err.message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: err.message ?? "LYG infos request failed",
      },
      { status: 500 }
    );
  }
}
