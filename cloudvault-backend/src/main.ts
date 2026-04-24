import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
//
app.enableCors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Action-Token'],
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
});

//
  await app.listen(process.env.PORT ?? 5000);
  

}
bootstrap();
 