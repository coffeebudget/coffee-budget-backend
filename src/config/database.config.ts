import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('DatabaseConfig');

export default registerAs('database', () => {
  // Support both DATABASE_URL (Railway) and individual variables (local dev)
  // Prioritize DATABASE_PUBLIC_URL for external connections (railway run), then DATABASE_URL
  let databaseUrl: string | undefined =
    process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

  // Check if DATABASE_URL is a Railway template variable that needs resolution
  if (databaseUrl && databaseUrl.includes('${{')) {
    logger.warn(
      'Railway template variable detected in DATABASE_URL, falling back to individual variables',
    );

    // Try to get the actual DATABASE_URL from Railway's internal variables
    const possibleDbUrls = [
      process.env.RAILWAY_DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.DATABASE_CONNECTION_STRING,
      process.env.DB_CONNECTION_STRING,
    ];

    const actualDbUrl = possibleDbUrls.find(
      (url) => url && !url.includes('${{'),
    );
    if (actualDbUrl) {
      databaseUrl = actualDbUrl;
    } else {
      databaseUrl = undefined;
    }
  }

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);

      return {
        type: 'postgres',
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        username: url.username,
        password: url.password,
        database: url.pathname.substring(1),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        migrationsRun: process.env.NODE_ENV === 'production',
        synchronize:
          process.env.TYPEORM_SYNCHRONIZE === 'false'
            ? false
            : process.env.NODE_ENV !== 'production',
        logging: process.env.DB_LOGGING === 'true',
      };
    } catch (error) {
      // Fallback: try manual parsing for Railway format
      try {
        if (!databaseUrl) {
          throw new Error('DATABASE_URL is undefined');
        }

        const match = databaseUrl.match(
          /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/,
        );

        if (match) {
          const [, username, password, hostname, port, database] = match;

          return {
            type: 'postgres',
            host: hostname,
            port: parseInt(port, 10),
            username,
            password,
            database,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            migrations: [__dirname + '/../migrations/*{.ts,.js}'],
            migrationsRun: process.env.NODE_ENV === 'production',
            synchronize:
              process.env.TYPEORM_SYNCHRONIZE === 'false'
                ? false
                : process.env.NODE_ENV !== 'production',
            logging: process.env.DB_LOGGING === 'true',
          };
        } else {
          throw new Error('DATABASE_URL does not match expected format');
        }
      } catch (fallbackError) {
        throw new Error(
          `Invalid DATABASE_URL format: ${error.message}. Fallback parsing also failed: ${fallbackError.message}`,
        );
      }
    }
  } else {
    // Fallback to individual variables for local development
    const host =
      process.env.DB_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
    const port =
      process.env.DB_PORT ||
      process.env.PGPORT ||
      process.env.POSTGRES_PORT ||
      '5432';
    const username =
      process.env.DB_USER || process.env.PGUSER || process.env.POSTGRES_USER;
    const password =
      process.env.DB_PASS ||
      process.env.PGPASSWORD ||
      process.env.POSTGRES_PASSWORD;
    const database =
      process.env.DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB;

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
      migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      migrationsRun: process.env.NODE_ENV === 'production',
      synchronize:
        process.env.TYPEORM_SYNCHRONIZE === 'false'
          ? false
          : process.env.NODE_ENV !== 'production',
      logging: process.env.DB_LOGGING === 'true',
    };
  }
});
