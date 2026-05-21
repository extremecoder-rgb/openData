"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { uploadDataset } from "../lib/api";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setMessage({ type: "error", text: "Please upload a CSV file." });
      return;
    }

    setUploading(true);
    setMessage(null);

    // Fake progress animation
    const progressInterval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 10, 85));
    }, 150);

    try {
      const result = await uploadDataset(file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully!` });
      setTimeout(() => router.push(`/datasets/${result.id}`), 1200);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed. Please try again.",
      });
      setUploading(false);
    }
  }, [router]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Nav */}
      <nav className="nav">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ⚡
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>OpenData AI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/dashboard">
            <button className="btn-secondary" style={{ padding: "8px 20px", fontSize: 13 }}>
              Dashboard →
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="page-container" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div style={{ textAlign: "center", marginBottom: 64 }} className="animate-fade-up">
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: 100,
              marginBottom: 28,
              fontSize: 13,
              fontWeight: 600,
              color: "#a5b4fc",
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ color: "#6366f1" }}>✦</span> Powered by RL Agents + LLM Explanations
          </div>

          <h1
            style={{
              fontSize: "clamp(40px, 6vw, 72px)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
              marginBottom: 24,
              background: "linear-gradient(135deg, #f1f5f9 30%, #a5b4fc 70%, #8b5cf6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            AI Preprocessing
            <br />
            Engine
          </h1>

          <p
            style={{
              fontSize: 18,
              color: "var(--text-secondary)",
              maxWidth: 560,
              margin: "0 auto 40px",
              lineHeight: 1.7,
            }}
          >
            Transform messy CSV data into ML-ready datasets in seconds. Our RL agent selects
            optimal preprocessing strategies — automatically.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard">
              <button className="btn-primary" style={{ fontSize: 15, padding: "14px 32px" }}>
                Open Dashboard →
              </button>
            </Link>
          </div>
        </div>

        {/* Upload Card */}
        <div
          className="glass-card animate-fade-up-1"
          style={{
            maxWidth: 640,
            margin: "0 auto 80px",
            padding: 32,
            background: "rgba(99, 102, 241, 0.04)",
            border: "1px solid rgba(99, 102, 241, 0.15)",
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Upload Your Dataset</h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Drop a CSV file to instantly start AI preprocessing
            </p>
          </div>

          <label
            htmlFor="file-upload"
            className={`drop-zone ${isDragging ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{ display: "block", cursor: uploading ? "not-allowed" : "pointer" }}
          >
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleInputChange}
              disabled={uploading}
            />

            {uploading ? (
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Uploading your dataset…</p>
                <div className="progress-bar" style={{ margin: "0 auto", maxWidth: 280 }}>
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>{uploadProgress}%</p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    margin: "0 auto 16px",
                  }}
                >
                  📁
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {isDragging ? "Drop it here!" : "Drag & drop your CSV file"}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  or click to browse files
                </p>
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 16px",
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#a5b4fc",
                    fontWeight: 600,
                  }}
                >
                  .CSV files only
                </span>
              </div>
            )}
          </label>

          {/* Message */}
          {message && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                background:
                  message.type === "success"
                    ? "rgba(16, 185, 129, 0.1)"
                    : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                color: message.type === "success" ? "#34d399" : "#f87171",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{message.type === "success" ? "✓" : "⚠"}</span>
              {message.text}
            </div>
          )}
        </div>

        {/* Feature Cards */}
        <div
          className="animate-fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginBottom: 80,
          }}
        >
          {[
            {
              icon: "📤",
              color: "#6366f1",
              title: "Upload CSV",
              desc: "Drop any messy CSV file — missing values, mixed types, duplicates. We handle it all.",
            },
            {
              icon: "🤖",
              color: "#8b5cf6",
              title: "RL Agent Processes",
              desc: "Reinforcement learning agent intelligently selects the best strategy per column.",
            },
            {
              icon: "📊",
              color: "#10b981",
              title: "Download Clean Data",
              desc: "Get ML-ready datasets with full audit trails, leakage reports, and PDF compliance.",
            },
          ].map((feat) => (
            <div
              key={feat.title}
              className="glass-card"
              style={{ padding: "28px 24px" }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `${feat.color}1a`,
                  border: `1px solid ${feat.color}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  marginBottom: 16,
                }}
              >
                {feat.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{feat.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{feat.desc}</p>
            </div>
          ))}
        </div>

        {/* Stats Row */}
        <div
          className="animate-fade-up-3"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { label: "Data Issues Fixed", value: "12 Types" },
            { label: "Processing Speed", value: "< 30s" },
            { label: "Leakage Detection", value: "100%" },
            { label: "Audit Coverage", value: "Full" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: "20px 24px",
                textAlign: "center",
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  background: "linear-gradient(135deg, #a5b4fc, #8b5cf6)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  marginBottom: 4,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border-color)",
          padding: "24px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          position: "relative",
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          © 2026 OpenData AI Preprocessing Engine
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Built with RL + LLM ⚡
        </span>
      </footer>
    </div>
  );
}