// app/datasets/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDatasetResults, downloadComplianceReport, type Dataset, type AuditLog } from "../../../lib/api";

const statusColors: Record<string, string> = {
  uploaded: "bg-yellow-100 text-yellow-800",
  profiling: "bg-blue-100 text-blue-800",
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
          {dataset.row_count} rows × {dataset.column_count} columns • Created{" "}
          {new Date(dataset.created_at).toLocaleDateString()}
        </p>

        <div className="mb-6 flex items-center gap-4">
          <span
            className={`px-3 py-1 rounded-full text-sm ${
              statusColors[dataset.status] || "bg-gray-100"
            }`}
          >
            {dataset.status}
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading || dataset.status !== "done"}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {downloading ? "Generating..." : "Download Compliance PDF"}
          </button>
        </div>

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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}