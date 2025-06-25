import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserController } from './users.controller';
import { UserService } from './users.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), CategoriesModule],
  exports: [TypeOrmModule, UserService],
  controllers: [UserController],
  providers: [UserService],
})
export class UsersModule {}
