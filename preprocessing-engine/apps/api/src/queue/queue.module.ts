import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PreprocessProcessor } from './preprocess.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        redis: {
          host: process.env.UPSTASH_REDIS_URL,
          port: 6379,
          password: process.env.UPSTASH_REDIS_TOKEN,
          tls: {},
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'preprocess',
    }),
  ],
  providers: [PreprocessProcessor],
  exports: [BullModule],
})
export class QueueModule {}
