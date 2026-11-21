import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Budi Santoso', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'budi@bengkelku.id' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Rahasia123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

