import { UnauthorizedException } from '@nestjs/common';
import { UserService } from '../users/users.service';
import { User } from '../users/user.entity';

export async function validateUser(
  userService: UserService,
  auth0Id: string,
): Promise<User> {
  try {
    const user = await userService.findByAuth0Id(auth0Id);
    return user;
  } catch (error) {
    console.error('Error finding user:', error);
    throw new UnauthorizedException('User not found');
  }
}
