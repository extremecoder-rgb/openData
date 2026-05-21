// components/Uploader.tsx

"use client";

import { useState, useCallback } from "react";
import { uploadDataset } from "../lib/api";
import { useRouter } from "next/navigation";

export function Uploader() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setMessage({ type: "error", text: "Only .csv files are supported." });
      return;
    }

    setUploading(true);
    setProgress(0);
    setMessage(null);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 88));
    }, 150);

    try {
      const result = await uploadDataset(file);
      clearInterval(interval);
      setProgress(100);
      setMessage({ type: "success", text: `"${file.name}" uploaded! Redirecting…` });
      setTimeout(() => router.push(`/datasets/${result.id}`), 1000);
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setUploading(false);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }, [router]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div>
      <label
        htmlFor="uploader-input"
        className={`drop-zone ${isDragging ? "drag-over" : ""}`}
        style={{
          display: "block",
          cursor: uploading ? "default" : "pointer",
          padding: "32px 24px",
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <input
          id="uploader-input"
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                margin: "0 auto 12px",
                animation: "spin 1s linear infinite",
              }}
            >
              ⚙
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text-primary)" }}>
              Uploading…
            </p>
            <div className="progress-bar" style={{ maxWidth: 200, margin: "0 auto" }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{progress}%</p>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                margin: "0 auto 12px",
              }}
            >
              📁
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>
              {isDragging ? "Drop it here!" : "Drop CSV or click to browse"}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>.csv files only</p>
          </div>
        )}
      </label>

      {message && (
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
            background:
              message.type === "success"
                ? "rgba(16,185,129,0.08)"
                : "rgba(239,68,68,0.08)",
            border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
            color: message.type === "success" ? "#34d399" : "#f87171",
          }}
        >
          <span>{message.type === "success" ? "✓" : "⚠"}</span>
          {message.text}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}