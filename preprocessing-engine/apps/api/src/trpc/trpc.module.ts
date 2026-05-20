import { Module } from '@nestjs/common';
import { DatasetModule } from '../dataset/dataset.module';

@Module({
  imports: [DatasetModule],
})
export class TrpcModule {}
