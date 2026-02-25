import {
  Controller,
  Get,
  Param,
  UseGuards,
  Post,
  Req,
  Res,
  Body,
  Delete,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { UserService } from './users.service';
import { User } from './user.entity';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { CurrentUser } from '../auth/user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('account/export')
  @ApiResponse({
    status: 200,
    description: 'Export all user data as JSON.',
  })
  async exportAccountData(
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.userService.exportAccountData(user.id);
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="coffeebudget-export-${date}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }

  @Get(':auth0Id')
  @ApiResponse({ status: 200, description: 'Retrieve user by Auth0 ID.' })
  async findByAuth0Id(@Param('auth0Id') auth0Id: string): Promise<User> {
    return this.userService.findByAuth0Id(auth0Id);
  }

  @Post()
  @ApiResponse({
    status: 201,
    description: 'Create a new user.',
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.createUser(createUserDto);
  }

  @Post('auth/callback')
  @ApiResponse({
    status: 201,
    description: 'Create a new user after Auth0 login.',
  })
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

  @Delete('account')
  @ApiResponse({
    status: 200,
    description: 'Delete user account and all associated data.',
  })
  async deleteAccount(@CurrentUser() user: User): Promise<{ message: string }> {
    await this.userService.deleteAccount(user.id);
    return { message: 'Account deleted successfully' };
  }
}
