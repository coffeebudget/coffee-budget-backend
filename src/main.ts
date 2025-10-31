import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ModuleRef } from '@nestjs/core';
import { AuthService } from './auth/auth.service';
import * as bodyParser from 'body-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  // Set up logger with appropriate log levels based on environment
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const app = await NestFactory.create(AppModule, {
    logger: isDevelopment
      ? ['error', 'warn', 'log', 'debug', 'verbose'] // Include all logs in development
      : ['error', 'warn', 'log'], // Exclude debug logs in production
  });

  // 🔒 SECURITY: Global ValidationPipe with strict validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // 🔒 SECURITY: Helmet.js for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  const authService = app.get(AuthService);
  app.use((req, res, next) => {
    req.moduleRef = app.get(ModuleRef);
    req.authService = authService;
    next();
  });

  // 🔒 SECURITY: Enhanced CORS configuration
  let allowedOrigins: string[];
  
  if (isDevelopment) {
    allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  } else {
    // Production: Use CORS_ORIGIN environment variable (comma-separated)
    const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
    if (corsOrigin) {
      allowedOrigins = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);
    } else {
      // Fallback for production if not set
      allowedOrigins = ['http://localhost:3000'];
      Logger.warn('⚠️  CORS_ORIGIN not set in production! Using localhost fallback. This may cause CORS errors.', 'Bootstrap');
    }
  }

  Logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`, 'Bootstrap');

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 200,
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

  Logger.log(
    `Application is running in ${isDevelopment ? 'development' : 'production'} mode`,
    'Bootstrap',
  );
  Logger.log(`Server running on: ${await app.getUrl()}`, 'Bootstrap');
}
bootstrap();
