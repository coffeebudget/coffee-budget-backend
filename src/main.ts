import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ModuleRef } from '@nestjs/core';
import { AuthService } from './auth/auth.service';
import * as bodyParser from 'body-parser';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // Set up logger with appropriate log levels based on environment
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const app = await NestFactory.create(AppModule, {
    logger: isDevelopment 
      ? ['error', 'warn', 'log', 'debug', 'verbose'] // Include all logs in development
      : ['error', 'warn', 'log'],                    // Exclude debug logs in production
  });

  const authService = app.get(AuthService);
  app.use((req, res, next) => {
    req.moduleRef = app.get(ModuleRef);
    req.authService = authService;
    next();
  });

  app.enableCors({
    origin: "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

  const config = new DocumentBuilder()
    .setTitle('CoffeeBudget API')
    .setDescription('API for CoffeeBudget')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3002);
  
  Logger.log(`Application is running in ${isDevelopment ? 'development' : 'production'} mode`, 'Bootstrap');
  Logger.log(`Server running on: ${await app.getUrl()}`, 'Bootstrap');
}
bootstrap();
