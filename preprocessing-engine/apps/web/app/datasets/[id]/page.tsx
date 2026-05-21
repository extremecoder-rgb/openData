// app/datasets/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDatasetResults, downloadComplianceReport, getDatasetColumns, runPreprocessing, type Dataset, type AuditLog, type LeakageReport } from "../../../lib/api";

const statusColors: Record<string, string> = {
  uploaded: "bg-yellow-100 text-yellow-800",
  profiling: "bg-blue-100 text-blue-800",
  profiled: "bg-purple-100 text-purple-800",
  processing: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function DatasetDetail() {
  const params = useParams();
  const id = params.id as string;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [correctionsSubmitting, setCorrectionsSubmitting] = useState<Record<string, boolean>>({});
  const [selectedCorrections, setSelectedCorrections] = useState<Record<string, string>>({});

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const handleFeedbackSubmit = async (auditLogId: string, originalStrategy: string) => {
    const correctedStrategy = selectedCorrections[auditLogId];
    if (!correctedStrategy) return alert("Please select a correction first");

    setCorrectionsSubmitting(prev => ({ ...prev, [auditLogId]: true }));
    try {
      const res = await fetch(`${API_URL}/datasets/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditLogId,
          originalStrategy,
          correctedStrategy,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit feedback");
      alert("Feedback saved! XGBoost policy will now align with your choice next time.");
    } catch (err) {
      alert("Failed to submit feedback: " + (err as Error).message);
    } finally {
      setCorrectionsSubmitting(prev => ({ ...prev, [auditLogId]: false }));
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadComplianceReport(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    getDatasetResults(id)
      .then((data) => {
        setDataset(data.dataset);
        setAuditLogs(data.auditLogs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (dataset && dataset.status === "profiled") {
      getDatasetColumns(id)
        .then(setColumns)
        .catch(console.error);
    }
  }, [dataset, id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!dataset) return <div className="p-8">Dataset not found</div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-2">{dataset.filename}</h1>
        <p className="text-gray-500 mb-6">
          {dataset.row_count || 0} rows × {dataset.column_count || 0} columns • Created{" "}
          {new Date(dataset.created_at).toLocaleDateString()}
        </p>

        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              statusColors[dataset.status] || "bg-gray-100"
            }`}
          >
            {dataset.status}
          </span>
          {dataset.status === "done" && dataset.leakage_report && (
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                dataset.leakage_report.has_leakage
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {dataset.leakage_report.has_leakage
                ? "Leakage Detected"
                : "Zero Leakage Verified"}
            </span>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading || dataset.status !== "done"}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {downloading ? "Generating..." : "Download Compliance PDF"}
          </button>
        </div>

        {dataset.status === "profiled" && (
          <div className="mb-8 p-6 border border-purple-200 rounded-lg bg-purple-50">
            <h2 className="text-xl font-semibold mb-2 text-purple-900">
              Run AI Preprocessing Search Agent
            </h2>
            <p className="text-sm text-purple-700 mb-4">
              Your dataset has been successfully profiled. Select the target variable column (predictive label) to launch the Reinforcement Learning agent pipeline.
            </p>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-purple-900 uppercase mb-2">
                  Target Column
                </label>
                <select
                  value={selectedTargetColumn}
                  onChange={(e) => setSelectedTargetColumn(e.target.value)}
                  className="w-full p-2 border border-purple-300 rounded bg-white text-sm"
                >
                  <option value="">-- Select target variable --</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={async () => {
                  if (!selectedTargetColumn) return alert("Please select a target column");
                  setTriggering(true);
                  try {
                    await runPreprocessing(id, selectedTargetColumn);
                    alert("Reinforcement learning preprocessing pipeline triggered!");
                    window.location.reload();
                  } catch (err) {
                    alert("Failed to queue preprocessing task");
                  } finally {
                    setTriggering(false);
                  }
                }}
                disabled={triggering || !selectedTargetColumn}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded text-sm disabled:opacity-50"
              >
                {triggering ? "Starting Agent..." : "Run AI Preprocessing"}
              </button>
            </div>
          </div>
        )}

        {dataset.status === "done" && dataset.leakage_report && (
          <>
            <div className="mb-6 p-4 border rounded bg-gray-50">
              <h2 className="text-xl font-semibold mb-2">
                Data Leakage Assessment
              </h2>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-lg font-bold ${
                    dataset.leakage_report.has_leakage
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {dataset.leakage_report.has_leakage
                    ? "Leakage Detected"
                    : "Zero Leakage Verified"}
                </span>
                <span className="text-sm text-gray-500">
                  (Risk: {(dataset.leakage_report.leakage_risk_score * 100).toFixed(0)}%)
                </span>
              </div>
              {dataset.leakage_report.leaking_columns.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">Leaking columns: </span>
                  {dataset.leakage_report.leaking_columns.join(", ")}
                </div>
              )}
            </div>
          </>
        )}

        <h2 className="text-xl font-semibold mb-4">Audit Trail</h2>

        {auditLogs.length === 0 && (
          <p className="text-gray-500">No preprocessing actions recorded yet.</p>
        )}

        <div className="space-y-4">
          {auditLogs.map((log) => (
            <div key={log.id} className="p-4 border border-gray-200 rounded">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{log.column_name}</p>
                  <p className="text-sm text-gray-600">
                    {log.issue_detected} → {log.strategy_chosen}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">
                    {log.confidence_score
                      ? `${(log.confidence_score * 100).toFixed(0)}% confidence`
                      : "—"}
                  </span>
                  {log.accuracy_delta !== 0 && (
                    <p
                      className={`text-sm ${
                        log.accuracy_delta > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {log.accuracy_delta > 0 ? "+" : ""}
                      {log.accuracy_delta.toFixed(3)}
                    </p>
                  )}
                </div>
              </div>
              {log.reason && (
                <p className="text-gray-700 text-sm mt-2">{log.reason}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                    Override Action Strategy (Human Feedback)
                  </label>
                  <select
                    value={selectedCorrections[log.id] || ""}
                    onChange={(e) =>
                      setSelectedCorrections((prev) => ({
                        ...prev,
                        [log.id]: e.target.value,
                      }))
                    }
                    className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">-- Propose correction strategy --</option>
                    <optgroup label="Imputation">
                      <option value="imputation:mean">imputation:mean</option>
                      <option value="imputation:median">imputation:median</option>
                    </optgroup>
                    <optgroup label="Encoding">
                      <option value="encoding:onehot">encoding:onehot</option>
                      <option value="encoding:frequency">encoding:frequency</option>
                    </optgroup>
                    <optgroup label="Scaling">
                      <option value="scaling:standard">scaling:standard</option>
                      <option value="scaling:robust">scaling:robust</option>
                    </optgroup>
                    <optgroup label="Outlier">
                      <option value="outlier:clip_iqr">outlier:clip_iqr</option>
                    </optgroup>
                  </select>
                </div>
                <button
                  onClick={() => handleFeedbackSubmit(log.id, log.strategy_chosen)}
                  disabled={correctionsSubmitting[log.id] || !selectedCorrections[log.id]}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded text-xs font-medium disabled:opacity-50"
                >
                  {correctionsSubmitting[log.id] ? "Submitting..." : "Submit Correction"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}