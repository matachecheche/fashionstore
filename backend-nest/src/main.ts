import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });   // rawBody: firma de webhooks (Stripe)
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, transform: true, forbidUnknownValues: false,
    exceptionFactory: (errs) => new BadRequestException(errs.flatMap((e) => Object.values(e.constraints ?? { x: `${e.property} inválido` }))),
  }));
  // Imagenes de prendas (assets) y archivos subidos (uploads)
  app.useStaticAssets(resolve(process.cwd(), 'public'), { maxAge: '1h' });
  const puerto = Number(process.env.PORT) || 3000;
  await app.listen(puerto, '0.0.0.0');
  new Logger('FashionStore').log(`API lista en http://localhost:${puerto}/api  (modo de pagos: ${process.env.PAGOS_MODO || 'sandbox'})`);
}
bootstrap();
