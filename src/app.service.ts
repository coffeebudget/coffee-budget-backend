import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  onModuleInit() {
    const key = process.env.ENCRYPTION_KEY;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!key || key.length !== 64) {
      if (isProduction) {
        throw new Error(
          'ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes) in production',
        );
      }
      this.logger.warn(
        'ENCRYPTION_KEY is not set or invalid. Operations on encrypted fields will fail. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
