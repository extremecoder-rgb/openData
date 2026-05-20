import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import {
  DatasetService,
  type DatasetRow,
  type AuditLogRow,
} from './dataset.service';

@Controller('datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Get()
  async listDatasets(): Promise<DatasetRow[]> {
    return this.datasetService.listDatasets();
  }

  @Get(':id')
  async getDataset(@Param('id') id: string): Promise<DatasetRow> {
    const dataset = await this.datasetService.getDataset(id);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }
    return dataset;
  }

  @Get(':id/results')
  async getDatasetResults(
    @Param('id') id: string,
  ): Promise<{ dataset: DatasetRow; auditLogs: AuditLogRow[] }> {
    const results = await this.datasetService.getDatasetResults(id);
    if (!results) {
      throw new NotFoundException('Dataset not found');
    }
    return results;
  }
}
