// lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface Dataset {
  id: string;
  filename: string;
  status: "uploaded" | "profiling" | "processing" | "done" | "failed";
  row_count: number | null;
  column_count: number | null;
  leakage_report: LeakageReport | null;
  created_at: string;
  updated_at: string;
}

export interface LeakageReport {
  has_leakage: boolean;
  leaking_columns: string[];
  leakage_risk_score: number;
  details: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  dataset_id: string;
  column_name: string;
  issue_detected: string;
  strategy_chosen: string;
  reason: string;
  confidence_score: number;
  accuracy_delta: number;
}

export interface DatasetResults {
  dataset: Dataset;
  auditLogs: AuditLog[];
}

export async function listDatasets(): Promise<Dataset[]> {
  const res = await fetch(`${API_URL}/datasets`);
  if (!res.ok) throw new Error("Failed to fetch datasets");
  return res.json();
}

export async function getDataset(id: string): Promise<Dataset> {
  const res = await fetch(`${API_URL}/datasets/${id}`);
  if (!res.ok) throw new Error("Failed to fetch dataset");
  return res.json();
}

export async function getDatasetResults(id: string): Promise<DatasetResults> {
  const res = await fetch(`${API_URL}/datasets/${id}/results`);
  if (!res.ok) throw new Error("Failed to fetch dataset results");
  return res.json();
}

export async function downloadComplianceReport(id: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/datasets/${id}/compliance-report`);
  if (!res.ok) throw new Error("Failed to fetch compliance report");
  return res.blob();
}

export async function uploadDataset(file: File): Promise<Dataset> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to upload file");
  return res.json();
}