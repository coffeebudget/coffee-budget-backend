import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Support both DATABASE_URL (Railway) and individual variables (local dev)
  if (process.env.DATABASE_URL) {
    // Parse DATABASE_URL for Railway deployment
    const url = new URL(process.env.DATABASE_URL);
    return {
      type: 'postgres',
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: url.username,
      password: url.password,
      database: url.pathname.substring(1), // Remove leading slash
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.DB_LOGGING === 'true',
    };
  } else {
    // Fallback to individual variables for local development
    return {
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.DB_LOGGING === 'true',
    };
  }
});
