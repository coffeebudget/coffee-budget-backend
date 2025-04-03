import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import * as jwksClient from "jwks-rsa";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksClient.passportJwtSecret({
        jwksUri: `${process.env.AUTH0_ISSUER}.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      }),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: process.env.AUTH0_ISSUER,
      algorithms: ["RS256"],
    });

  }

  async validate(payload: any) {

    if (!payload) {
        console.error("❌ Token payload missing!");
        throw new UnauthorizedException("Invalid token");
    }

    // ✅ Handle array audiences correctly
    const validAudience = Array.isArray(payload.aud)
        ? payload.aud.includes(process.env.AUTH0_AUDIENCE) // ✅ Checks if expected audience is present
        : payload.aud === process.env.AUTH0_AUDIENCE;


    if (!validAudience) {
        console.error("❌ Invalid audience in token!");
        throw new UnauthorizedException("Invalid token audience");
    }
    
    const user = { sub: payload.sub, email: payload.email };
    return user;
  }
}
