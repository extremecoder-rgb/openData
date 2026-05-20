import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createAppRouter } from './trpc/trpc.router';
import { DatasetService } from './dataset/dataset.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const datasetService = app.get(DatasetService);
  const appRouter = createAppRouter(datasetService);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: () => ({}),
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
