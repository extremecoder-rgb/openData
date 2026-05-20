/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { createClient } from '@supabase/supabase-js';

interface DatasetRecord {
  id: string;
  filename: string;
  r2_key: string;
  status: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly supabase;

  constructor(
    private configService: ConfigService,
    @InjectQueue('preprocess') private preprocessQueue: Queue,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
    );
  }

  async handleUpload(file: Express.Multer.File) {
    this.logger.log(
      `Processing upload: ${file.originalname} (${file.size} bytes)`,
    );

    const fileKey = `uploads/${Date.now()}-${file.originalname}`;

    await this.supabase.storage
      .from('datasets')
      .upload(fileKey, file.buffer, { contentType: 'text/csv' });

    this.logger.log(`Uploaded to Supabase Storage: ${fileKey}`);

    const { data, error } = await this.supabase
      .from('datasets')
      .insert({
        filename: file.originalname,
        r2_key: fileKey,
        status: 'uploaded',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Supabase error:', error);
      throw new Error(`Failed to create dataset record: ${error.message}`);
    }

    const record = data as DatasetRecord;
    this.logger.log(`Dataset record created: ${record.id}`);

    await this.preprocessQueue.add('preprocess', {
      datasetId: record.id,
      r2Key: fileKey,
      filename: file.originalname,
    });

    this.logger.log(`Preprocess job queued for dataset: ${record.id}`);

    return {
      id: record.id,
      filename: record.filename,
      status: record.status,
      message: 'File uploaded and queued for processing',
    };
  }
}
