import { setTimeout as delay } from "node:timers/promises";
const BASE_URL = process.env.INGEST_BASE_URL;
const SECRET = process.env.INGEST_SECRET;
export async function ingest(event) {
    if (!BASE_URL || !SECRET) {
        return { ok: false, error: "Missing INGEST_BASE_URL or INGEST_SECRET" };
    }
    // Simple retry (2 attempts max)
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch(`${BASE_URL}/api/ingest/tickets`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-ingest-secret": SECRET,
                },
                body: JSON.stringify(event),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                return { ok: false, error: `HTTP ${res.status} ${text}` };
            }
            return { ok: true };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (attempt === 2)
                return { ok: false, error: message };
            await delay(400);
        }
    }
    return { ok: false, error: "Unknown ingest failure" };
}
/**
 * Check how many open tickets a user has for a given type
 */
export async function getOpenCount(type, discordId) {
    if (!BASE_URL || !SECRET) {
        return { ok: false, error: "Missing INGEST_BASE_URL or INGEST_SECRET" };
    }
    try {
        const url = new URL(`${BASE_URL}/api/ingest/tickets/open`);
        url.searchParams.set("type", type);
        url.searchParams.set("discordId", discordId);
        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "x-ingest-secret": SECRET,
            },
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { ok: false, error: `HTTP ${res.status} ${text}` };
        }
        const data = await res.json();
        if (data.ok && typeof data.openCount === "number") {
            return { ok: true, openCount: data.openCount };
        }
        return { ok: false, error: data.error ?? "Invalid response" };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: message };
    }
}
export function mustEnv(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing env ${name}`);
    return v;
}
