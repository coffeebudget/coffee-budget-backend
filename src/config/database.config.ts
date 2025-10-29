import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Support both DATABASE_URL (Railway) and individual variables (local dev)
  // Prioritize DATABASE_URL if it exists
  if (process.env.DATABASE_URL) {
    try {
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
    } catch (error) {
      console.error('Error parsing DATABASE_URL:', error);
      throw new Error('Invalid DATABASE_URL format');
    }
  } else {
    // Fallback to individual variables for local development
    // Check if we have all required variables
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || '5432';
    const username = process.env.DB_USER;
    const password = process.env.DB_PASS;
    const database = process.env.DB_NAME;

    if (!host || !username || !password || !database) {
      throw new Error(
        'Database configuration missing. Please set either DATABASE_URL or all of DB_HOST, DB_USER, DB_PASS, DB_NAME',
      );
    }

    return {
      type: 'postgres',
      host,
      port: parseInt(port, 10),
      username,
      password,
      database,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.DB_LOGGING === 'true',
    };
  }
});
