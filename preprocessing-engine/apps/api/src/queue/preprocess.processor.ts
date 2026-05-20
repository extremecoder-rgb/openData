/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

interface JobData {
  datasetId: string;
  r2Key: string;
  filename: string;
}

@Processor('preprocess')
export class PreprocessProcessor {
  private readonly logger = new Logger(PreprocessProcessor.name);
  private readonly supabase;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
    );
  }

  @Process('preprocess')
  async handlePreprocess(job: Job<JobData>) {
    const { datasetId, r2Key, filename } = job.data;
    this.logger.log(
      `Processing job for dataset: ${datasetId} (file: ${filename})`,
    );

    try {
      await this.supabase
        .from('datasets')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', datasetId);

      this.logger.log(`Dataset ${datasetId} status -> processing`);

      const aiServiceUrl =
        this.configService.getOrThrow<string>('AI_SERVICE_URL');
      this.logger.log(`Calling AI service at ${aiServiceUrl}/profile`);

      const response = await fetch(`${aiServiceUrl}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2_key: r2Key, filename }),
      });

      if (!response.ok) {
        throw new Error(
          `AI service returned ${response.status}: ${await response.text()}`,
        );
      }

      const profile = (await response.json()) as {
        dataset?: { row_count?: number; col_count?: number };
      };

      await this.supabase
        .from('datasets')
        .update({
          status: 'done',
          row_count: profile?.dataset?.row_count ?? null,
          column_count: profile?.dataset?.col_count ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', datasetId);

      this.logger.log(`Dataset ${datasetId} processing complete`);

      return { success: true, datasetId };
    } catch (error) {
      this.logger.error(`Processing failed for dataset ${datasetId}:`, error);

      await this.supabase
        .from('datasets')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', datasetId);

      throw error;
    }
  }
}
