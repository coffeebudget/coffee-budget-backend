import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksClient from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor() {
    // Remove trailing slash from issuer if present to avoid double slashes
    const issuer = process.env.AUTH0_ISSUER?.replace(/\/$/, '') || '';
    const jwksUri = `${issuer}/.well-known/jwks.json`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksClient.passportJwtSecret({
        jwksUri,
        cache: true,
        rateLimit: true,
      }),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: process.env.AUTH0_ISSUER, // Use original value with trailing slash for validation
      algorithms: ['RS256'],
    });

    this.logger.log('JWT Strategy initialized');
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    // Handle array audiences correctly
    const validAudience = Array.isArray(payload.aud)
      ? payload.aud.includes(process.env.AUTH0_AUDIENCE)
      : payload.aud === process.env.AUTH0_AUDIENCE;

    if (!validAudience) {
      this.logger.warn('Invalid audience in token');
      throw new UnauthorizedException('Invalid token audience');
    }

    return { sub: payload.sub, email: payload.email };
  }
}
