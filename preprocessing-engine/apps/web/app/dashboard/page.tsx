// app/dashboard/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDatasets, type Dataset } from "../../lib/api";
import { Uploader } from "../../components/Uploader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  uploaded: { label: "Uploaded", badgeClass: "badge badge-uploaded" },
  profiling: { label: "Profiling…", badgeClass: "badge badge-profiling" },
  profiled: { label: "Profiled", badgeClass: "badge badge-profiled" },
  processing: { label: "Processing…", badgeClass: "badge badge-processing" },
  done: { label: "Done ✓", badgeClass: "badge badge-done" },
  failed: { label: "Failed", badgeClass: "badge badge-failed" },
};

async function seedDemo(type: "titanic" | "housing") {
  const res = await fetch(`${API_URL}/datasets/seed-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error("Seeding failed");
}

export default function Dashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDatasets = () => {
    setLoading(true);
    listDatasets()
      .then(setDatasets)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDatasets(); }, []);

  const handleSeed = async (type: "titanic" | "housing") => {
    setSeeding(type);
    setSeedMsg(null);
    try {
      await seedDemo(type);
      setSeedMsg({ type: "success", text: `${type === "titanic" ? "Titanic" : "House Prices"} dataset seeded!` });
      fetchDatasets();
    } catch (err) {
      setSeedMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSeeding(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Nav */}
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}
            >⚡</div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>OpenData AI</span>
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              padding: "6px 14px",
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 8,
              fontSize: 13,
              color: "#a5b4fc",
              fontWeight: 600,
            }}
          >
            Dashboard
          </div>
        </div>
      </nav>

      <div className="page-container" style={{ paddingTop: 40, paddingBottom: 60 }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }} className="animate-fade-up">
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 6,
            }}
          >
            Dashboard
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)" }}>
            Manage your datasets and run AI preprocessing pipelines
          </p>
        </div>

        {/* Upload + Sandbox row */}
        <div
          className="animate-fade-up-1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 20,
            marginBottom: 36,
          }}
        >
          {/* Upload */}
          <div
            className="glass-card"
            style={{ padding: 24, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}
          >
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Upload Dataset</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Upload a CSV file to start AI preprocessing
              </p>
            </div>
            <Uploader />
          </div>

          {/* Sandbox */}
          <div
            className="glass-card"
            style={{ padding: 24, background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.15)" }}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🧪</span>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Demo Sandbox</h2>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                No dataset ready? Seed pre-loaded industry standard datasets to explore in one click.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { type: "titanic" as const, label: "🚢 Titanic — Classification", sub: "891 rows, 12 columns" },
                { type: "housing" as const, label: "🏠 House Prices — Regression", sub: "1460 rows, 81 columns" },
              ].map((demo) => (
                <button
                  key={demo.type}
                  onClick={() => handleSeed(demo.type)}
                  disabled={!!seeding}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: seeding === demo.type ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(139,92,246,0.2)",
                    borderRadius: 10,
                    cursor: seeding ? "not-allowed" : "pointer",
                    opacity: seeding && seeding !== demo.type ? 0.5 : 1,
                    transition: "all 0.2s ease",
                    color: "var(--text-primary)",
                    fontFamily: "Inter, sans-serif",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{demo.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{demo.sub}</div>
                  </div>
                  <span style={{ fontSize: 13, color: "#a5b4fc" }}>
                    {seeding === demo.type ? "⏳" : "→"}
                  </span>
                </button>
              ))}
            </div>

            {seedMsg && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: seedMsg.type === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${seedMsg.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: seedMsg.type === "success" ? "#34d399" : "#f87171",
                }}
              >
                {seedMsg.type === "success" ? "✓" : "⚠"} {seedMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Datasets List */}
        <div className="animate-fade-up-2">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Your Datasets
              {datasets.length > 0 && (
                <span
                  style={{
                    marginLeft: 10,
                    padding: "2px 10px",
                    background: "rgba(99,102,241,0.12)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    borderRadius: 100,
                    fontSize: 13,
                    color: "#a5b4fc",
                    fontWeight: 600,
                  }}
                >
                  {datasets.length}
                </span>
              )}
            </h2>
            <button
              onClick={fetchDatasets}
              style={{
                padding: "7px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s",
              }}
            >
              ↻ Refresh
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: "14px 18px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 12,
                color: "#f87171",
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              ⚠ {error}
            </div>
          )}

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 76, borderRadius: 14 }} />
              ))}
            </div>
          ) : datasets.length === 0 ? (
            <div
              style={{
                padding: "48px 32px",
                textAlign: "center",
                border: "2px dashed var(--border-color)",
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No datasets yet</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                Upload a CSV above or seed a demo dataset to get started
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {datasets.map((ds) => {
                const cfg = STATUS_CONFIG[ds.status] || { label: ds.status, badgeClass: "badge" };
                return (
                  <Link key={ds.id} href={`/datasets/${ds.id}`}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "18px 22px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 14,
                        transition: "all 0.25s ease",
                        cursor: "pointer",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.35)";
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-color)";
                        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div
                          style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.15)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18, flexShrink: 0,
                          }}
                        >
                          📄
                        </div>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{ds.filename}</p>
                          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {ds.row_count ? `${ds.row_count.toLocaleString()} rows` : "—"} ×{" "}
                            {ds.column_count ? `${ds.column_count} cols` : "—"} •{" "}
                            {new Date(ds.created_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {ds.status === "done" && ds.leakage_report && (
                          <span
                            className={`badge ${ds.leakage_report.has_leakage ? "badge-failed" : "badge-done"}`}
                          >
                            {ds.leakage_report.has_leakage ? "Leakage" : "Zero Leakage"}
                          </span>
                        )}
                        <span className={cfg.badgeClass}>{cfg.label}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 18 }}>›</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}