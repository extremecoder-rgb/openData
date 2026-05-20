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
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    let supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseKey || supabaseKey.startsWith('your_') || supabaseKey === '') {
      supabaseKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async handleUpload(file: Express.Multer.File) {
    this.logger.log(
      `Processing upload: ${file.originalname} (${file.size} bytes)`,
    );

    const storageKey = `uploads/${Date.now()}-${file.originalname}`;
    const bucketName =
      this.configService.get<string>('SUPABASE_BUCKET_NAME') || 'datasets';

    const { error: uploadError } = await this.supabase.storage
      .from(bucketName)
      .upload(storageKey, file.buffer, {
        contentType: 'text/csv',
        duplex: 'half',
      });

    if (uploadError) {
      this.logger.error('Supabase Storage upload error:', uploadError);
      throw new Error(
        `Failed to upload to Supabase Storage: ${uploadError.message}`,
      );
    }

    this.logger.log(
      `Uploaded to Supabase Storage bucket "${bucketName}": ${storageKey}`,
    );

    const { data, error } = await this.supabase
      .from('datasets')
      .insert({
        filename: file.originalname,
        r2_key: storageKey,
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
<<<<<<< HEAD
      r2Key: fileKey,
=======
      r2Key: storageKey,
>>>>>>> 6633737 (Add supabase Storage)
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

