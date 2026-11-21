import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CancelTransactionDto {
  @ApiProperty({ example: 'Pelanggan salah memilih barang', minLength: 5 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason!: string;
}

