import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

export const CurrentUser = createParamDecorator(
  async (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const authService = request.authService;
    
    if (!authService) {
      throw new UnauthorizedException('Auth service not available');
    }

    return await authService.validateUser(request.user.sub);
  },
); 