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
    paymentAccounts: [],
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
            deleteAccount: jest.fn(),
            exportAccountData: jest.fn(),
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

  describe('deleteAccount', () => {
    it('should call userService.deleteAccount with the user id', async () => {
      const mockUser = { id: 1, auth0Id: 'auth0|123', email: 'test@example.com' } as User;
      userService.deleteAccount = jest.fn().mockResolvedValue(undefined);

      const result = await userController.deleteAccount(mockUser);

      expect(userService.deleteAccount).toHaveBeenCalledWith(1);
      expect(result).toEqual({ message: 'Account deleted successfully' });
    });
  });

  describe('exportAccountData', () => {
    it('should call userService.exportAccountData and set response headers', async () => {
      const mockUser = {
        id: 1,
        auth0Id: 'auth0|123',
        email: 'test@example.com',
      } as User;
      const mockExportData = {
        exportedAt: '2026-02-25',
        user: { email: 'test@example.com' },
        transactions: [],
      };
      userService.exportAccountData = jest
        .fn()
        .mockResolvedValue(mockExportData);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await userController.exportAccountData(mockUser, mockRes as any);

      expect(userService.exportAccountData).toHaveBeenCalledWith(1);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('coffeebudget-export-'),
      );
      expect(mockRes.send).toHaveBeenCalled();
    });
  });
});
