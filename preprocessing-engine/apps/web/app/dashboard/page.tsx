// app/dashboard/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDatasets, type Dataset } from "../../lib/api";
import { Uploader } from "../../components/Uploader";

const statusColors: Record<string, string> = {
  uploaded: "bg-yellow-100 text-yellow-800",
  profiling: "bg-blue-100 text-blue-800",
  profiled: "bg-purple-100 text-purple-800",
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-sm text-gray-500 uppercase mb-2">Upload Dataset</h3>
            <Uploader />
          </div>
          <div className="p-6 border border-indigo-200 rounded-lg bg-indigo-50 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-sm text-indigo-900 uppercase mb-2">Demo & Sandbox Mode</h3>
              <p className="text-xs text-indigo-700 mb-4">
                Don't have a dataset ready? Trigger our sandboxes to seed pre-loaded industry standard datasets and explore the AI Preprocessing environment in one click.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/datasets/seed-demo`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "titanic" }),
                    });
                    if (!res.ok) throw new Error("Seeding failed");
                    alert("Titanic Demo Dataset seeded successfully!");
                    window.location.reload();
                  } catch (err) {
                    alert("Seeding failed: " + (err as Error).message);
                  }
                }}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition"
              >
                Seed Titanic (Classification)
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/datasets/seed-demo`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "housing" }),
                    });
                    if (!res.ok) throw new Error("Seeding failed");
                    alert("Housing Prices Demo Dataset seeded successfully!");
                    window.location.reload();
                  } catch (err) {
                    alert("Seeding failed: " + (err as Error).message);
                  }
                }}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition"
              >
                Seed House Prices (Regression)
              </button>
            </div>
          </div>
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