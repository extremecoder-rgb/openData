import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { DatasetService } from '../dataset/dataset.service';

const t = initTRPC.create();

export function createAppRouter(datasetService: DatasetService) {
  return t.router({
    dataset: t.router({
      list: t.procedure.query(async () => {
        return datasetService.listDatasets();
      }),
      getById: t.procedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          return datasetService.getDataset(input.id);
        }),
      getResults: t.procedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          return datasetService.getDatasetResults(input.id);
        }),
    }),
    auditLog: t.router({
      byDataset: t.procedure
        .input(z.object({ datasetId: z.string() }))
        .query(async ({ input }) => {
          const results = await datasetService.getDatasetResults(input.datasetId);
          return results.auditLogs;
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
