import { Controller, Get, Param, UseGuards, Post, Req, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserService } from './users.service';
import { User } from './user.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':auth0Id')
  @ApiResponse({ status: 200, description: 'Retrieve user by Auth0 ID.' })
  async findByAuth0Id(@Param('auth0Id') auth0Id: string): Promise<User> {
    return this.userService.findByAuth0Id(auth0Id);
  }

  @Post('auth/callback')
  @ApiResponse({ status: 201, description: 'Create a new user after Auth0 login.' })
  async authCallback(@Req() req): Promise<{ message: string; user: User }> {
    const { user } = req; // Assuming the user information is available in the request
    const auth0Id = user.sub; // Auth0 ID
    const email = user.email; // User email

    // Check if auth0Id is empty, undefined, or null
    if (!auth0Id) {
        throw new BadRequestException('Auth0 ID is required');
    }

    // Check if email is empty, undefined, or null
    if (!email) {
        throw new BadRequestException('Email is required');
    }

    // Attempt to find the user
    let existingUser;
    try {
        existingUser = await this.userService.findByAuth0Id(auth0Id);
    } catch (error) {
        // If the user is not found, log the event and proceed to create a new user
        if (error instanceof NotFoundException) {
            const createUserDto: CreateUserDto = { auth0Id, email }; // Create user with required fields
            existingUser = await this.userService.createUser(createUserDto);
        } else {
            throw error; // Rethrow if it's not a NotFoundException
        }
    }

    return {
        message: 'User authenticated successfully',
        user: existingUser, // Return the existing or newly created user
    };
  }
}
