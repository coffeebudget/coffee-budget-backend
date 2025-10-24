import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './users.controller';
import { UserService } from './users.service';
import { User } from './user.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('UserController', () => {
  let userController: UserController;
  let userService: UserService;

  const mockUser: User = {
    id: 1,
    auth0Id: 'auth0|123456',
    email: 'test@example.com',
    isDemoUser: false,
    demoExpiryDate: new Date('2024-12-31'),
    demoActivatedAt: new Date('2024-01-01'),
    bankAccounts: [],
    creditCards: [],
    transactions: null,
    tags: null,
    categories: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            findByAuth0Id: jest.fn(),
            createUser: jest.fn(),
          },
        },
      ],
    }).compile();

    userController = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
  });

  it('should authenticate and create a new user successfully', async () => {
    const req = {
      user: {
        sub: mockUser.auth0Id,
        email: mockUser.email,
      },
    };

    userService.findByAuth0Id = jest
      .fn()
      .mockRejectedValue(new NotFoundException());
    userService.createUser = jest.fn().mockResolvedValue(mockUser);

    const result = await userController.authCallback(req);

    expect(result).toEqual({
      message: 'User authenticated successfully',
      user: mockUser,
    });

    expect(userService.findByAuth0Id).toHaveBeenCalledWith(req.user.sub);
    expect(userService.createUser).toHaveBeenCalledWith({
      auth0Id: req.user.sub,
      email: req.user.email,
    });
  });

  it('should return existing user if found', async () => {
    const req = {
      user: {
        sub: mockUser.auth0Id,
        email: mockUser.email,
      },
    };

    userService.findByAuth0Id = jest.fn().mockResolvedValue(mockUser);

    const result = await userController.authCallback(req);

    expect(result).toEqual({
      message: 'User authenticated successfully',
      user: mockUser,
    });

    expect(userService.findByAuth0Id).toHaveBeenCalledWith(req.user.sub);
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if auth0Id is missing', async () => {
    const req = {
      user: {
        email: mockUser.email,
      },
    };

    await expect(userController.authCallback(req)).rejects.toThrow(
      BadRequestException,
    );
    expect(userService.findByAuth0Id).not.toHaveBeenCalled();
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if email is missing', async () => {
    const req = {
      user: {
        sub: mockUser.auth0Id,
      },
    };

    await expect(userController.authCallback(req)).rejects.toThrow(
      BadRequestException,
    );
    expect(userService.findByAuth0Id).not.toHaveBeenCalled();
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('should propagate unexpected errors', async () => {
    const req = {
      user: {
        sub: mockUser.auth0Id,
        email: mockUser.email,
      },
    };

    const unexpectedError = new Error('Unexpected error');
    userService.findByAuth0Id = jest.fn().mockRejectedValue(unexpectedError);

    await expect(userController.authCallback(req)).rejects.toThrow(
      unexpectedError,
    );
    expect(userService.createUser).not.toHaveBeenCalled();
  });
});
