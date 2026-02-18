import { Logger, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../users/users.service';
import { User } from '../users/user.entity';

const logger = new Logger('AuthUtils');

export async function validateUser(
  userService: UserService,
  auth0Id: string,
): Promise<User> {
  try {
    const user = await userService.findByAuth0Id(auth0Id);
    return user;
  } catch (error) {
    logger.error('Error finding user', error);
    throw new UnauthorizedException('User not found');
  }
}
