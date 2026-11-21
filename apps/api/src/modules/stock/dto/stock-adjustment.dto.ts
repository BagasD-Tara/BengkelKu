import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class StockAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 12, minimum: 0 })
  @IsInt()
  @Min(0)
  newQuantity!: number;

  @ApiProperty({ example: 'Hasil stock opname bulanan' })
  @IsString()
  @IsNotEmpty()
  notes!: string;
}

