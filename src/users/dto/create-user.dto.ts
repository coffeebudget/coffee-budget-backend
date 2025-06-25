import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Auth0 User ID' })
  @IsString()
  @IsNotEmpty()
  auth0Id: string;

  @ApiProperty({ description: 'Email of the user' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
