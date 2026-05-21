/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { createClient } from '@supabase/supabase-js';

export interface DatasetRow {
  id: string;
  filename: string;
  r2_key: string;
  status: string;
  row_count: number | null;
  column_count: number | null;
  leakage_report: Record<string, unknown> | null;
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

  constructor(
    private configService: ConfigService,
    @InjectQueue('preprocess') private preprocessQueue: Queue,
  ) {
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

  async getDatasetColumns(id: string): Promise<string[]> {
    const dataset = await this.getDataset(id);
    const bucketName = this.configService.get<string>('SUPABASE_BUCKET_NAME') || 'datasets';
    const { data, error } = await this.supabase.storage
      .from(bucketName)
      .download(dataset.r2_key);

    if (error) {
      this.logger.error(`Failed to download dataset ${id} from storage:`, error);
      throw new Error(`Failed to download file from storage: ${error.message}`);
    }

    const csvContent = Buffer.from(await data.arrayBuffer()).toString('utf-8');
    const firstLine = csvContent.split('\n')[0];
    const columns = firstLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return columns.filter(c => c.length > 0);
  }

  async preprocessDataset(id: string, targetColumn: string): Promise<void> {
    const dataset = await this.getDataset(id);
    await this.supabase
      .from('datasets')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', id);

    await this.preprocessQueue.add('preprocess', {
      datasetId: id,
      r2Key: dataset.r2_key,
      filename: dataset.filename,
      targetColumn,
    });

    this.logger.log(`Queued RL preprocessing for dataset: ${id} with target: ${targetColumn}`);
  }
}
