import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Debug: Log all environment variables that start with DB or DATABASE
  console.log('Environment variables check:');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('DB_HOST:', process.env.DB_HOST ? 'SET' : 'NOT SET');
  console.log('DB_USER:', process.env.DB_USER ? 'SET' : 'NOT SET');
  console.log('DB_PASS:', process.env.DB_PASS ? 'SET' : 'NOT SET');
  console.log('DB_NAME:', process.env.DB_NAME ? 'SET' : 'NOT SET');
  
  // Log all environment variables for debugging
  const dbVars = Object.keys(process.env).filter(key => 
    key.includes('DB') || key.includes('DATABASE') || key.includes('POSTGRES')
  );
  console.log('All DB-related environment variables:', dbVars);
  
  // Support both DATABASE_URL (Railway) and individual variables (local dev)
  // Prioritize DATABASE_URL if it exists
  // Handle Railway template variables like ${{DATABASE_URL}}
  let databaseUrl = process.env.DATABASE_URL;
  
  // Check if DATABASE_URL is a Railway template variable that needs resolution
  if (databaseUrl && databaseUrl.includes('${{')) {
    console.log('Railway template variable detected:', databaseUrl);
    console.log('This should be automatically resolved by Railway, but it seems to not be working.');
    console.log('Please check Railway documentation or contact support.');
    databaseUrl = null; // Treat as not set to fall back to individual variables
  }
  
  if (databaseUrl) {
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
    // Railway might set these automatically when you connect a database
    const host = process.env.DB_HOST || process.env.PGHOST;
    const port = process.env.DB_PORT || process.env.PGPORT || '5432';
    const username = process.env.DB_USER || process.env.PGUSER;
    const password = process.env.DB_PASS || process.env.PGPASSWORD;
    const database = process.env.DB_NAME || process.env.PGDATABASE;

    console.log('Using individual DB variables:');
    console.log('DB_HOST:', host);
    console.log('DB_PORT:', port);
    console.log('DB_USER:', username);
    console.log('DB_PASS:', password ? '***' : 'NOT SET');
    console.log('DB_NAME:', database);

    if (!host || !username || !password || !database) {
      console.error('Missing required database variables:');
      console.error('- DB_HOST:', host ? 'OK' : 'MISSING');
      console.error('- DB_USER:', username ? 'OK' : 'MISSING');
      console.error('- DB_PASS:', password ? 'OK' : 'MISSING');
      console.error('- DB_NAME:', database ? 'OK' : 'MISSING');
      
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
