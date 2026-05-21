import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'preprocess',
    }),
  ],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
