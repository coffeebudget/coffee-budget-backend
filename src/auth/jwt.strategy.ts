import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksClient from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    // Remove trailing slash from issuer if present to avoid double slashes
    const issuer = process.env.AUTH0_ISSUER?.replace(/\/$/, '') || '';
    const jwksUri = `${issuer}/.well-known/jwks.json`;
    console.log('🔐 JWT Strategy initialized with JWKS URI:', jwksUri);
    console.log('🔐 Expected audience:', process.env.AUTH0_AUDIENCE);
    console.log('🔐 Expected issuer (normalized):', issuer);
    console.log('🔐 Original AUTH0_ISSUER env var:', process.env.AUTH0_ISSUER);

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
  }

  async validate(payload: any) {
    if (!payload) {
      console.error('❌ Token payload missing!');
      throw new UnauthorizedException('Invalid token');
    }

    // ✅ Handle array audiences correctly
    const validAudience = Array.isArray(payload.aud)
      ? payload.aud.includes(process.env.AUTH0_AUDIENCE) // ✅ Checks if expected audience is present
      : payload.aud === process.env.AUTH0_AUDIENCE;

    if (!validAudience) {
      console.error('❌ Invalid audience in token!');
      console.error('Expected:', process.env.AUTH0_AUDIENCE);
      console.error('Received:', payload.aud);
      throw new UnauthorizedException('Invalid token audience');
    }

    const user = { sub: payload.sub, email: payload.email };
    console.log('✅ JWT validated successfully for user:', payload.sub);
    return user;
  }
}
