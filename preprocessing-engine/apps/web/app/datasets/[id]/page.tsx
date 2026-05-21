// app/datasets/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getDatasetResults,
  downloadComplianceReport,
  getDatasetColumns,
  runPreprocessing,
  type Dataset,
  type AuditLog,
} from "../../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: string }> = {
  uploaded: { label: "Uploaded", badgeClass: "badge badge-uploaded", icon: "📤" },
  profiling: { label: "Profiling…", badgeClass: "badge badge-profiling", icon: "🔍" },
  profiled: { label: "Profiled", badgeClass: "badge badge-profiled", icon: "✅" },
  processing: { label: "Processing…", badgeClass: "badge badge-processing", icon: "⚙️" },
  done: { label: "Done", badgeClass: "badge badge-done", icon: "🎉" },
  failed: { label: "Failed", badgeClass: "badge badge-failed", icon: "❌" },
};

const CORRECTION_OPTIONS = [
  { group: "Imputation", options: [{ value: "imputation:mean", label: "Mean imputation" }, { value: "imputation:median", label: "Median imputation" }] },
  { group: "Encoding", options: [{ value: "encoding:onehot", label: "One-Hot encoding" }, { value: "encoding:frequency", label: "Frequency encoding" }] },
  { group: "Scaling", options: [{ value: "scaling:standard", label: "Standard scaler" }, { value: "scaling:robust", label: "Robust scaler" }] },
  { group: "Outlier", options: [{ value: "outlier:clip_iqr", label: "Clip IQR" }] },
];

export default function DatasetDetail() {
  const params = useParams();
  const id = params.id as string;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [targetColumn, setTargetColumn] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<Record<string, { type: "success" | "error"; text: string }>>({});

  const fetchData = () => {
    getDatasetResults(id)
      .then((data) => {
        setDataset(data.dataset);
        setAuditLogs(data.auditLogs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (dataset?.status === "profiled") {
      getDatasetColumns(id).then(setColumns).catch(console.error);
    }
  }, [dataset, id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadComplianceReport(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `compliance-${id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const handleTrigger = async () => {
    if (!targetColumn) return;
    setTriggering(true);
    try {
      await runPreprocessing(id, targetColumn);
      fetchData();
    } catch {
      alert("Failed to queue preprocessing task");
    } finally {
      setTriggering(false);
    }
  };

  const handleFeedback = async (logId: string, originalStrategy: string) => {
    const corrected = corrections[logId];
    if (!corrected) return;
    setSubmitting((p) => ({ ...p, [logId]: true }));
    try {
      const res = await fetch(`${API_URL}/datasets/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogId: logId, originalStrategy, correctedStrategy: corrected }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackMsg((p) => ({ ...p, [logId]: { type: "success", text: "Correction saved! Agent will learn from this." } }));
    } catch {
      setFeedbackMsg((p) => ({ ...p, [logId]: { type: "error", text: "Failed to submit." } }));
    } finally {
      setSubmitting((p) => ({ ...p, [logId]: false }));
    }
  };

  const exportJSON = () => {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ dataset, auditLogs }, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", data);
    a.setAttribute("download", `audit-${id}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) return (
    <div style={{ minHeight: "100vh" }}>
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>OpenData AI</span>
          </Link>
        </div>
      </nav>
      <div className="page-container" style={{ paddingTop: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[200, 80, 120, 80, 80].map((h, i) => (
            <div key={i} className="skeleton" style={{ height: h, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "#f87171", fontSize: 16, marginBottom: 24 }}>Error: {error}</p>
        <Link href="/dashboard"><button className="btn-secondary">← Back to Dashboard</button></Link>
      </div>
    </div>
  );

  if (!dataset) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Dataset not found</p>
        <Link href="/dashboard"><button className="btn-secondary">← Back to Dashboard</button></Link>
      </div>
    </div>
  );

  const cfg = STATUS_CONFIG[dataset.status] || { label: dataset.status, badgeClass: "badge", icon: "•" };
  const avgConfidence = auditLogs.length
    ? (auditLogs.reduce((a, l) => a + (l.confidence_score || 0), 0) / auditLogs.length) * 100
    : 0;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Nav */}
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>OpenData AI</span>
          </Link>
        </div>
        <Link href="/dashboard">
          <button className="btn-secondary" style={{ padding: "7px 16px", fontSize: 13 }}>← Dashboard</button>
        </Link>
      </nav>

      <div className="page-container" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "rgba(99,102,241,0.12)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                  }}
                >📄</div>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                    {dataset.filename}
                  </h1>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                    {dataset.row_count?.toLocaleString() || "—"} rows × {dataset.column_count || "—"} cols •{" "}
                    {new Date(dataset.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={cfg.badgeClass}>{cfg.icon} {cfg.label}</span>
                {dataset.status === "done" && dataset.leakage_report && (
                  <span className={`badge ${dataset.leakage_report.has_leakage ? "badge-failed" : "badge-done"}`}>
                    {dataset.leakage_report.has_leakage ? "⚠ Leakage Detected" : "✓ Zero Leakage"}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {dataset.status === "done" && (
                <>
                  <button onClick={exportJSON} className="btn-secondary" style={{ fontSize: 13, padding: "9px 18px" }}>
                    Export JSON
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="btn-primary"
                    style={{ fontSize: 13, padding: "9px 18px" }}
                  >
                    {downloading ? "Generating…" : "📄 Download PDF"}
                  </button>
                </>
              )}
              <button
                onClick={fetchData}
                style={{
                  padding: "9px 14px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Inter, sans-serif",
                }}
              >↻</button>
            </div>
          </div>
        </div>

        {/* Stats Cards — only when done */}
        {dataset.status === "done" && (
          <div
            className="animate-fade-up-1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}
          >
            {[
              {
                label: "Features Engineered",
                value: auditLogs.length.toString(),
                sub: "Column actions by RL agent",
                color: "#6366f1",
              },
              {
                label: "Leakage Risk",
                value: dataset.leakage_report?.has_leakage ? "High" : "Zero",
                sub: `Score: ${((dataset.leakage_report?.leakage_risk_score || 0) * 100).toFixed(0)}%`,
                color: dataset.leakage_report?.has_leakage ? "#ef4444" : "#10b981",
              },
              {
                label: "Avg ML Confidence",
                value: `${avgConfidence.toFixed(0)}%`,
                sub: "Strategy confidence by LLM",
                color: "#8b5cf6",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="stat-card"
                style={{ "--accent": stat.color } as React.CSSProperties}
              >
                <style>{`.stat-card::after { background: ${stat.color} !important; }`}</style>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em", color: stat.color, marginBottom: 4 }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Run Preprocessing — when profiled */}
        {dataset.status === "profiled" && (
          <div
            className="animate-fade-up-1 glass-card"
            style={{
              padding: 28,
              marginBottom: 32,
              background: "rgba(139,92,246,0.05)",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Run AI Preprocessing Agent</h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Select the target variable to launch the RL pipeline
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Target Column
                </label>
                <select
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  className="select-field"
                >
                  <option value="">— Select target variable —</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleTrigger}
                disabled={triggering || !targetColumn}
                className="btn-primary"
                style={{ padding: "10px 24px" }}
              >
                {triggering ? "⏳ Starting…" : "🚀 Run AI Preprocessing"}
              </button>
            </div>
          </div>
        )}

        {/* Leakage Report — when done */}
        {dataset.status === "done" && dataset.leakage_report && (
          <div
            className="animate-fade-up-2 glass-card"
            style={{
              padding: 24,
              marginBottom: 32,
              background: dataset.leakage_report.has_leakage
                ? "rgba(239,68,68,0.04)"
                : "rgba(16,185,129,0.04)",
              border: `1px solid ${dataset.leakage_report.has_leakage ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{dataset.leakage_report.has_leakage ? "⚠️" : "🛡️"}</span>
              Data Leakage Assessment
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: dataset.leakage_report.has_leakage ? "#f87171" : "#34d399" }}>
                {dataset.leakage_report.has_leakage ? "Leakage Detected" : "Zero Leakage Verified"}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Risk Score: {(dataset.leakage_report.leakage_risk_score * 100).toFixed(0)}%
              </span>
              {dataset.leakage_report.leaking_columns.length > 0 && (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Leaking: {dataset.leakage_report.leaking_columns.join(", ")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Audit Trail */}
        <div className="animate-fade-up-3">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Audit Trail
              {auditLogs.length > 0 && (
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
                  {auditLogs.length}
                </span>
              )}
            </h2>
          </div>

          {auditLogs.length === 0 ? (
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                border: "2px dashed var(--border-color)",
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                No preprocessing actions recorded yet.
                {dataset.status === "profiled" && " Run the AI agent above to generate audit logs."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {auditLogs.map((log, i) => (
                <div
                  key={log.id}
                  className="audit-item"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{log.column_name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.15)",
                            borderRadius: 6,
                            fontSize: 12,
                            color: "#f87171",
                            fontWeight: 500,
                          }}
                        >
                          {log.issue_detected}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>→</span>
                        <span
                          style={{
                            padding: "3px 10px",
                            background: "rgba(16,185,129,0.08)",
                            border: "1px solid rgba(16,185,129,0.15)",
                            borderRadius: 6,
                            fontSize: 12,
                            color: "#34d399",
                            fontWeight: 500,
                          }}
                        >
                          {log.strategy_chosen}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {log.confidence_score != null && (
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 800,
                            letterSpacing: "-0.03em",
                            color: log.confidence_score >= 0.8 ? "#34d399" : log.confidence_score >= 0.6 ? "#fbbf24" : "#f87171",
                          }}
                        >
                          {(log.confidence_score * 100).toFixed(0)}%
                        </div>
                      )}
                      {log.accuracy_delta !== 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: log.accuracy_delta > 0 ? "#34d399" : "#f87171",
                            fontWeight: 600,
                          }}
                        >
                          {log.accuracy_delta > 0 ? "+" : ""}{log.accuracy_delta.toFixed(3)} Δ
                        </div>
                      )}
                    </div>
                  </div>

                  {log.reason && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16, paddingLeft: 1 }}>
                      {log.reason}
                    </p>
                  )}

                  {/* Feedback */}
                  <div
                    style={{
                      paddingTop: 14,
                      borderTop: "1px solid var(--border-color)",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                        Override Strategy (Human Feedback)
                      </label>
                      <select
                        value={corrections[log.id] || ""}
                        onChange={(e) => setCorrections((p) => ({ ...p, [log.id]: e.target.value }))}
                        className="select-field"
                        style={{ fontSize: 13 }}
                      >
                        <option value="">— Propose correction —</option>
                        {CORRECTION_OPTIONS.map((group) => (
                          <optgroup key={group.group} label={group.group}>
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleFeedback(log.id, log.strategy_chosen)}
                      disabled={submitting[log.id] || !corrections[log.id]}
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: "9px 18px" }}
                    >
                      {submitting[log.id] ? "Saving…" : "Submit Correction"}
                    </button>
                  </div>

                  {(() => {
                    const msg = feedbackMsg[log.id];
                    if (!msg) return null;
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "8px 14px",
                          borderRadius: 8,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          background: msg.type === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                          border: `1px solid ${msg.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                          color: msg.type === "success" ? "#34d399" : "#f87171",
                        }}
                      >
                        {msg.type === "success" ? "✓" : "⚠"} {msg.text}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}