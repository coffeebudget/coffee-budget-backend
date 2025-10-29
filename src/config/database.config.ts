import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Support both DATABASE_URL (Railway) and individual variables (local dev)
  // Prioritize DATABASE_URL if it exists
  if (process.env.DATABASE_URL) {
    try {
      console.log('DATABASE_URL found:', process.env.DATABASE_URL);
      
      // Parse DATABASE_URL for Railway deployment
      const url = new URL(process.env.DATABASE_URL);
      
      console.log('Parsed URL components:', {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        username: url.username,
        password: url.password ? '***' : 'missing',
        database: url.pathname.substring(1)
      });
      
      const config = {
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
      
      console.log('Database config:', {
        ...config,
        password: config.password ? '***' : 'missing'
      });
      
      return config;
    } catch (error) {
      console.error('Error parsing DATABASE_URL with URL constructor:', error);
      console.error('DATABASE_URL value:', process.env.DATABASE_URL);
      
      // Fallback: try manual parsing for Railway format
      try {
        const dbUrl = process.env.DATABASE_URL;
        const match = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
        
        if (match) {
          const [, username, password, hostname, port, database] = match;
          
          console.log('Fallback parsing successful:', {
            hostname,
            port,
            username,
            password: '***',
            database
          });
          
          return {
            type: 'postgres',
            host: hostname,
            port: parseInt(port, 10),
            username,
            password,
            database,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: process.env.NODE_ENV !== 'production',
            logging: process.env.DB_LOGGING === 'true',
          };
        } else {
          throw new Error('DATABASE_URL does not match expected format');
        }
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError);
        throw new Error(`Invalid DATABASE_URL format: ${error.message}. Fallback parsing also failed: ${fallbackError.message}`);
      }
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
