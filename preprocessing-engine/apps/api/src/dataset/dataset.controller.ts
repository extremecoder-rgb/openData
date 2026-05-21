import { Controller, Get, Post, Body, Param, NotFoundException } from '@nestjs/common';
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

  @Get(':id/columns')
  async getDatasetColumns(@Param('id') id: string): Promise<string[]> {
    const columns = await this.datasetService.getDatasetColumns(id);
    if (!columns) {
      throw new NotFoundException('Dataset columns not found');
    }
    return columns;
  }

  @Post(':id/preprocess')
  async preprocessDataset(
    @Param('id') id: string,
    @Body('targetColumn') targetColumn: string,
  ): Promise<{ message: string }> {
    if (!targetColumn) {
      throw new NotFoundException('targetColumn is required');
    }
    await this.datasetService.preprocessDataset(id, targetColumn);
    return { message: 'Preprocessing task has been queued successfully' };
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

  @Post(':id/feedback')
  async saveUserCorrection(
    @Body('auditLogId') auditLogId: string,
    @Body('originalStrategy') originalStrategy: string,
    @Body('correctedStrategy') correctedStrategy: string,
  ): Promise<{ success: boolean }> {
    if (!auditLogId || !originalStrategy || !correctedStrategy) {
      throw new NotFoundException('auditLogId, originalStrategy, and correctedStrategy are required');
    }
    await this.datasetService.saveUserCorrection(auditLogId, originalStrategy, correctedStrategy);
    return { success: true };
  }

  @Post('/seed-demo')
  async seedDemoDataset(@Body('type') type: string): Promise<{ id: string }> {
    if (!type || (type !== 'titanic' && type !== 'housing')) {
      throw new NotFoundException('type must be titanic or housing');
    }
    return this.datasetService.seedDemoDataset(type);
  }
}
