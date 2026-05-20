// app/dashboard/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDatasets, type Dataset } from "../../lib/api";
import { Uploader } from "../../components/Uploader";

const statusColors: Record<string, string> = {
  uploaded: "bg-yellow-100 text-yellow-800",
  profiling: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function Dashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listDatasets()
      .then(setDatasets)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        <div className="mb-8">
          <Uploader />
        </div>

        <h2 className="text-xl font-semibold mb-4">Your Datasets</h2>

        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && datasets.length === 0 && (
          <p className="text-gray-500">No datasets yet. Upload one above!</p>
        )}

        <div className="space-y-4">
          {datasets.map((ds) => (
            <Link
              key={ds.id}
              href={`/datasets/${ds.id}`}
              className="block p-4 border border-gray-200 rounded hover:border-gray-400 transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{ds.filename}</p>
                  <p className="text-sm text-gray-500">
                    {ds.row_count ? `${ds.row_count} rows` : "—"} ×{" "}
                    {ds.column_count ? `${ds.column_count} cols` : "—"} •{" "}
                    {new Date(ds.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {ds.status === "done" && ds.leakage_report && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ds.leakage_report.has_leakage
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {ds.leakage_report.has_leakage
                        ? "Leakage"
                        : "Zero Leakage"}
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${
                      statusColors[ds.status] || "bg-gray-100"
                    }`}
                  >
                    {ds.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}