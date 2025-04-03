import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CategoriesService } from '../categories/categories.service';


@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private categoriesService: CategoriesService,
  ) {}

  async findByAuth0Id(auth0Id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { auth0Id } });
    if (!user) {
      throw new NotFoundException(`User with Auth0 ID ${auth0Id} not found`);
    }
    return user;
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { auth0Id: createUserDto.auth0Id }
    });
    
    if (existingUser) {
      throw new BadRequestException(`User with Auth0 ID ${createUserDto.auth0Id} already exists`);
    }

    const user = this.usersRepository.create(createUserDto);
    const savedUser = await this.usersRepository.save(user);

    // ✅ Crea categorie predefinite per il nuovo utente
    await this.categoriesService.createDefaultCategoriesForUser(savedUser);

    return savedUser;
  }

  async getAllActive(): Promise<User[]> {
    return this.usersRepository.find();
  }
}
