import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.development' });

// Parse DATABASE_URL or use individual variables
let connectionOptions: any;

if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  connectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    username: url.username,
    password: url.password,
    database: url.pathname.substring(1),
  };
} else {
  connectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  };
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...connectionOptions,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
