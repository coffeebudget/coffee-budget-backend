import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy";
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" }), UsersModule],
  providers: [JwtStrategy, AuthService],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
