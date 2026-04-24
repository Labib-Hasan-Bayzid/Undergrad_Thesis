import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { raw, json  } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin, cb) => cb(null, true), // dev-friendly
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Stripe webhook needs raw body for signature verification
app.use('/payments/stripe/webhook', raw({ type: 'application/json' }));
// normal JSON for everything else
app.use(json({ limit: '10mb' }));
  await app.listen(process.env.PORT || 5001);
  
}
bootstrap();
