/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
  private readonly s3: S3Client;

  constructor(
    private configService: ConfigService,
    @InjectQueue('preprocess') private preprocessQueue: Queue,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
    );

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.configService.getOrThrow<string>('CLOUDFLARE_R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
      forcePathStyle: true,
    });
  }

  async handleUpload(file: Express.Multer.File) {
    this.logger.log(
      `Processing upload: ${file.originalname} (${file.size} bytes)`,
    );

    const r2Key = `uploads/${Date.now()}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.configService.getOrThrow<string>('R2_BUCKET_NAME'),
        Key: r2Key,
        Body: file.buffer,
        ContentType: 'text/csv',
      }),
    );

    this.logger.log(`Uploaded to R2: ${r2Key}`);

    const { data, error } = await this.supabase
      .from('datasets')
      .insert({
        filename: file.originalname,
        r2_key: r2Key,
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
      r2Key,
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
