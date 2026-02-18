"use client";

import { useState, useEffect } from "react";

type DiagnosticsData = {
  envStatus: {
    INGEST_SECRET: boolean;
    NEXT_PUBLIC_DISCORD_GUILD_ID: boolean;
    DATABASE_URL: boolean;
    FAMILY_ID: string;
  };
  dbOk: boolean;
  dbError: string | null;
  familyExists: boolean;
  recruitmentsOpen: number;
  recruitmentsTotal: number;
  complaintsOpen: number;
  complaintsTotal: number;
  isChef: boolean;
};

type LygTest = {
  name: string;
  endpoint: string;
  status: "success" | "error";
  statusCode?: number;
  duration?: number;
  error?: string;
  hint?: string;
};

type LygDiagnostics = {
  ok: boolean;
  results?: {
    config: { baseUrl: string; tokenPresent: boolean };
    tests: LygTest[];
  };
  error?: string;
  message?: string;
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        background: ok ? "#dcfce7" : "#fee2e2",
        color: ok ? "#166534" : "#991b1b",
      }}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

export function DiagnosticsClient({ data }: { data: DiagnosticsData }) {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<string | null>(null);

  const [lygDiag, setLygDiag] = useState<LygDiagnostics | null>(null);
  const [lygLoading, setLygLoading] = useState(false);

  const runBootstrap = async () => {
    setBootstrapLoading(true);
    setBootstrapResult(null);
    try {
      const res = await fetch("/api/admin/bootstrap", { method: "POST" });
      const json = await res.json();
      setBootstrapResult(json.ok ? "✅ Bootstrap OK" : `❌ ${json.error}`);
    } catch (e) {
      setBootstrapResult("❌ Erreur réseau");
    } finally {
      setBootstrapLoading(false);
    }
  };

  const testLyg = async () => {
    setLygLoading(true);
    setLygDiag(null);
    try {
      const res = await fetch("/api/staff/diagnostics/lyg", {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json();
      setLygDiag(json);
    } catch (e: any) {
      setLygDiag({
        ok: false,
        error: "NETWORK_ERROR",
        message: e.message || "Erreur réseau",
      });
    } finally {
      setLygLoading(false);
    }
  };

  // Auto-test on mount for Chef
  useEffect(() => {
    if (data.isChef && !lygDiag && !lygLoading) {
      testLyg();
    }
  }, [data.isChef]);

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1 style={{ marginBottom: 24 }}>🔧 Diagnostics</h1>

      {/* ENV Status */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Variables d'environnement</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatusBadge ok={data.envStatus.INGEST_SECRET} label="INGEST_SECRET" />
          <StatusBadge ok={data.envStatus.NEXT_PUBLIC_DISCORD_GUILD_ID} label="GUILD_ID" />
          <StatusBadge ok={data.envStatus.DATABASE_URL} label="DATABASE_URL" />
        </div>
        <p style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          FAMILY_ID: <code>{data.envStatus.FAMILY_ID}</code>
        </p>
      </section>

      {/* DB Status */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Base de données</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatusBadge ok={data.dbOk} label="Connexion DB" />
          <StatusBadge ok={data.familyExists} label='Family "esperados"' />
        </div>
        {data.dbError && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#991b1b" }}>
            Erreur: {data.dbError}
          </p>
        )}
      </section>

      {/* LYG API Status */}
      {data.isChef && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>API LYG</h2>
          
          <button
            onClick={testLyg}
            disabled={lygLoading}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #e5e5e5",
              background: "white",
              cursor: lygLoading ? "wait" : "pointer",
              opacity: lygLoading ? 0.7 : 1,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            {lygLoading ? "Test en cours..." : "🔄 Tester la connexion LYG"}
          </button>

          {lygDiag && (
            <div>
              {lygDiag.error ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: "1px solid #fee2e2",
                    background: "#fef2f2",
                  }}
                >
                  <p style={{ fontSize: 14, color: "#991b1b", fontWeight: 600 }}>
                    ❌ {lygDiag.error}
                  </p>
                  {lygDiag.message && (
                    <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                      {lygDiag.message}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <StatusBadge ok={lygDiag.ok} label="LYG API" />
                    {lygDiag.results?.config && (
                      <p style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
                        Base URL: <code>{lygDiag.results.config.baseUrl}</code>
                        <br />
                        Token: {lygDiag.results.config.tokenPresent ? "✓ Présent" : "✗ Manquant"}
                      </p>
                    )}
                  </div>

                  {lygDiag.results?.tests.map((test) => (
                    <div
                      key={test.name}
                      style={{
                        border: "1px solid #e5e5e5",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                        background: test.status === "success" ? "#f0fdf4" : "#fef2f2",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          {test.status === "success" ? "✓" : "✗"}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>
                          {test.name}
                        </span>
                        {test.statusCode && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#666",
                              marginLeft: "auto",
                            }}
                          >
                            HTTP {test.statusCode}
                          </span>
                        )}
                        {test.duration !== undefined && (
                          <span style={{ fontSize: 12, color: "#666" }}>
                            {test.duration}ms
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#666",
                          marginTop: 4,
                          fontFamily: "monospace",
                        }}
                      >
                        {test.endpoint}
                      </p>
                      {test.error && (
                        <p
                          style={{
                            fontSize: 13,
                            color: "#991b1b",
                            marginTop: 6,
                          }}
                        >
                          {test.error}
                        </p>
                      )}
                      {test.hint && (
                        <p
                          style={{
                            fontSize: 13,
                            color: "#ea580c",
                            marginTop: 4,
                            fontWeight: 500,
                          }}
                        >
                          💡 {test.hint}
                        </p>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Counts */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tickets Discord</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, color: "#666" }}>Recrutements</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {data.recruitmentsOpen} / {data.recruitmentsTotal}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#666" }}>
                {" "}
                OPEN
              </span>
            </div>
          </div>
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, color: "#666" }}>Plaintes</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {data.complaintsOpen} / {data.complaintsTotal}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#666" }}>
                {" "}
                OPEN
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Admin actions */}
      {data.isChef && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Actions Admin</h2>
          <button
            onClick={runBootstrap}
            disabled={bootstrapLoading}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: bootstrapLoading ? "wait" : "pointer",
              opacity: bootstrapLoading ? 0.7 : 1,
            }}
          >
            {bootstrapLoading ? "..." : "Créer/Update Family esperados"}
          </button>
          {bootstrapResult && (
            <p style={{ marginTop: 8, fontSize: 14 }}>{bootstrapResult}</p>
          )}
        </section>
      )}

      {/* Health endpoint */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Endpoints</h2>
        <p style={{ fontSize: 14 }}>
          <a href="/api/health" target="_blank" rel="noopener noreferrer">
            /api/health
          </a>{" "}
          — Vérification DB + status
        </p>
      </section>
    </div>
  );
}
