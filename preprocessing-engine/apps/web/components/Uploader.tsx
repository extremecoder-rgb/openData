// components/Uploader.tsx

"use client";

import { useState } from "react";
import { uploadDataset } from "../lib/api";

export function Uploader() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setMessage("Please upload a CSV file");
      return;
    }

    setUploading(true);
    setMessage("Uploading...");

    try {
      const result = await uploadDataset(file);
      setMessage(`Uploaded! Dataset ID: ${result.id}`);
      fileInput.value = "";
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 border border-gray-300 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Upload Dataset</h2>
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <input
          type="file"
          name="file"
          accept=".csv"
          className="p-2 border border-gray-300 rounded"
          disabled={uploading}
        />
        <button
          type="submit"
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload CSV"}
        </button>
      </form>
      {message && <p className="mt-4 text-gray-700">{message}</p>}
    </div>
  );
}