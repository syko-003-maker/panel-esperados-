/**
 * LYG Infos Endpoint Prober
 * 
 * Since LYG API doc doesn't clearly specify the infos endpoint,
 * we probe multiple possible endpoints to discover the correct one.
 */

import { LygResponse } from "./lyg-client";
import { getLygConfig } from "./lyg";
import { debug, error as logError } from "./logger";

export interface ProbeResult {
  path: string;
  status: number;
  ok: boolean;
  contentType?: string | null;
  hasData: boolean;
  tried: boolean;
}

export interface ProbeInfosResponse {
  data?: any;
  ok: boolean;
  status: number;
  error?: string;
  probedPath?: string;
  probeResults: ProbeResult[];
}

/**
 * Probe multiple possible infos endpoints and return the first working one
 * 
 * CRITICAL: Always uses slug "esperados", ignores familySlug parameter
 * Tries in order (slug only):
 * 1. /familles/esperados
 * 2. /familles/esperados/infos
 * 3. /familles/esperados/info
 */
export async function lygProbeInfos(
  familySlug?: string,
  opts?: { timeoutMs?: number }
): Promise<ProbeInfosResponse> {
  // Warn if non-slug parameter received
  if (familySlug && familySlug !== "esperados") {
    console.warn("[lyg-probe] Ignoring non-slug familySlug parameter, using FAMILY_SLUG", {
      received: familySlug,
      enforced: "esperados",
    });
  }

  const config = getLygConfig();
  const timeoutMs = opts?.timeoutMs || 15_000;
  const FAMILY_SLUG = "esperados"; // CRITICAL: Force slug-only

  // Endpoints to probe (in order)
  const endpoints = [
    `/familles/${FAMILY_SLUG}`,
    `/familles/${FAMILY_SLUG}/infos`,
    `/familles/${FAMILY_SLUG}/info`,
  ];

  const probeResults: ProbeResult[] = [];
  let successfulData: any;
  let successfulPath: string = "";

  for (const path of endpoints) {
    try {
      const fullUrl = `${config.baseUrl}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(fullUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      const contentType = res.headers.get("content-type");
      const rawText = await res.text().catch(() => "");

      let parsedData: any;
      let hasData = false;

      if (res.ok && rawText) {
        try {
          parsedData = JSON.parse(rawText);
          hasData = !!parsedData && Object.keys(parsedData).length > 0;
        } catch (e) {
          hasData = rawText.length > 0;
        }
      }

      const probeResult: ProbeResult = {
        path,
        status: res.status,
        ok: res.ok && hasData,
        contentType,
        hasData,
        tried: true,
      };

      probeResults.push(probeResult);

      debug(`[lyg-probe-infos] Tried ${path}`, {
        status: res.status,
        hasData,
        ok: probeResult.ok,
      });

      // Success: found a working endpoint with data
      if (probeResult.ok) {
        successfulData = parsedData;
        successfulPath = path;
        break;
      }
    } catch (err: any) {
      const probeResult: ProbeResult = {
        path,
        status: 0,
        ok: false,
        hasData: false,
        tried: true,
      };

      probeResults.push(probeResult);

      debug(`[lyg-probe-infos] Failed to probe ${path}`, {
        error: err.message,
      });
    }
  }

  if (successfulData) {
    debug("[lyg-probe-infos] Success", {
      path: successfulPath,
      totalProbed: probeResults.length,
    });

    return {
      data: successfulData,
      ok: true,
      status: 200,
      probedPath: successfulPath,
      probeResults,
    };
  }

  // All endpoints failed
  logError("[lyg-probe-infos] All endpoints failed", {
    familySlug,
    totalProbed: probeResults.length,
    results: probeResults.map((r) => ({ path: r.path, status: r.status })),
  });

  return {
    ok: false,
    status: 404,
    error: "No working infos endpoint found",
    probedPath: undefined,
    probeResults,
  };
}
