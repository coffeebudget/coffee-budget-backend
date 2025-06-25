import { Injectable } from '@nestjs/common';
import { UserService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private userService: UserService) {}

  async validateUser(auth0Id: string) {
    return this.userService.findByAuth0Id(auth0Id);
  }
}
