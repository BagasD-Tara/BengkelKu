import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'OLI-001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Oli Mesin Yamalube 1L' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ example: 'Yamalube' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ example: 35000, minimum: 0 })
  @IsInt()
  @Min(0)
  purchasePrice!: number;

  @ApiProperty({ example: 45000, minimum: 0 })
  @IsInt()
  @Min(0)
  sellingPrice!: number;

  @ApiProperty({ example: 'botol' })
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiPropertyOptional({ example: 5, minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStock?: number = 0;

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    description: 'Stok awal; jika > 0 dicatat sebagai movement MASUK',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;
}

