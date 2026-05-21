/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

export interface DatasetRow {
  id: string;
  filename: string;
  r2_key: string;
  status: string;
  row_count: number | null;
  column_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  dataset_id: string;
  column_name: string;
  issue_detected: string;
  strategy_chosen: string;
  reason: string;
  confidence_score: number;
  accuracy_delta: number;
  created_at: string;
}

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private readonly supabase;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    let supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Gracefully bypass placeholder keys and fallback to active anon key
    if (!supabaseKey || supabaseKey.startsWith('your_') || supabaseKey === '') {
      supabaseKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async listDatasets(): Promise<DatasetRow[]> {
    const { data, error } = await this.supabase
      .from('datasets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to list datasets:', error);
      throw new Error(`Failed to list datasets: ${error.message}`);
    }

    return (data ?? []) as DatasetRow[];
  }

  async getDataset(id: string): Promise<DatasetRow> {
    const { data, error } = await this.supabase
      .from('datasets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Dataset not found');
      }
      throw new Error(`Failed to get dataset: ${error.message}`);
    }

    return data as DatasetRow;
  }

  async getDatasetResults(
    id: string,
  ): Promise<{ dataset: DatasetRow; auditLogs: AuditLogRow[] }> {
    const dataset = await this.getDataset(id);

    const { data: auditLogs, error } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('dataset_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch audit logs for dataset ${id}:`, error);
      throw new Error(`Failed to fetch audit logs: ${error.message}`);
    }

    return {
      dataset,
      auditLogs: (auditLogs ?? []) as AuditLogRow[],
    };
  }
}
