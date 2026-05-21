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

  async saveUserCorrection(
    auditLogId: string,
    originalStrategy: string,
    correctedStrategy: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('user_corrections')
      .insert({
        audit_log_id: auditLogId,
        original_strategy: originalStrategy,
        corrected_strategy: correctedStrategy,
      });

    if (error) {
      this.logger.error(`Failed to save user correction for audit log ${auditLogId}:`, error);
      throw new Error(`Failed to save correction: ${error.message}`);
    }

    try {
      const aiServiceUrl = this.configService.getOrThrow<string>('AI_SERVICE_URL');
      await fetch(`${aiServiceUrl}/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audit_log_id: auditLogId,
          original_strategy: originalStrategy,
          corrected_strategy: correctedStrategy,
        }),
      });
    } catch (learnErr) {
      this.logger.warn(`Failed to propagate feedback to AI learning service: ${learnErr.message}`);
    }
  }

  async seedDemoDataset(type: string): Promise<{ id: string }> {
    const isTitanic = type === 'titanic';
    const filename = isTitanic ? 'titanic_demo.csv' : 'house_prices_demo.csv';
    const rowCount = isTitanic ? 891 : 1460;
    const colCount = isTitanic ? 12 : 81;
    const leakageReport = {
      has_leakage: false,
      leakage_risk_score: 0.0,
      leaking_columns: [],
    };

    // 1. Create dataset record
    const { data: dataset, error } = await this.supabase
      .from('datasets')
      .insert({
        filename,
        r2_key: `demo/${filename}`,
        status: 'done',
        row_count: rowCount,
        column_count: colCount,
        leakage_report: leakageReport,
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error('Failed to seed demo dataset:', error);
      throw new Error(`Failed to seed demo dataset: ${error.message}`);
    }

    const datasetId = dataset.id;

    // 2. Insert corresponding audit logs
    const logs = isTitanic
      ? [
          {
            dataset_id: datasetId,
            column_name: 'Age',
            issue_detected: 'missing_values',
            strategy_chosen: 'imputation:median',
            reason: 'The Age column is skewed (skewness=0.389) and has 177 missing values. Median imputation preserves distribution without introducing outliers.',
            confidence_score: 0.92,
            accuracy_delta: 0.034,
          },
          {
            dataset_id: datasetId,
            column_name: 'Cabin',
            issue_detected: 'high_cardinality',
            strategy_chosen: 'encoding:frequency',
            reason: 'Cabin column has high cardinality with multiple distinct cabin strings. Frequency encoding reduces dimensions while retaining class density information.',
            confidence_score: 0.81,
            accuracy_delta: 0.012,
          },
          {
            dataset_id: datasetId,
            column_name: 'Fare',
            issue_detected: 'skewness',
            strategy_chosen: 'scaling:robust',
            reason: 'Fare is heavily skewed (skewness=4.78). Robust scaling using IQR scaling limits the impact of high fare outliers.',
            confidence_score: 0.95,
            accuracy_delta: 0.052,
          },
        ]
      : [
          {
            dataset_id: datasetId,
            column_name: 'LotFrontage',
            issue_detected: 'missing_values',
            strategy_chosen: 'imputation:mean',
            reason: 'LotFrontage has 259 missing values. Mean imputation is selected as it represents standard normal distribution.',
            confidence_score: 0.88,
            accuracy_delta: 0.008,
          },
          {
            dataset_id: datasetId,
            column_name: 'Neighborhood',
            issue_detected: 'is_categorical',
            strategy_chosen: 'encoding:onehot',
            reason: 'Neighborhood categories contain qualitative names with low cardinality ratio (0.017). One-hot encoding creates optimal sparse vectors.',
            confidence_score: 0.94,
            accuracy_delta: 0.045,
          },
        ];

    const { error: logsError } = await this.supabase
      .from('audit_logs')
      .insert(logs);

    if (logsError) {
      this.logger.error('Failed to seed audit logs for demo dataset:', logsError);
      throw new Error(`Failed to seed demo logs: ${logsError.message}`);
    }

    return { id: datasetId };
  }
}
