import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StockInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 35000, minimum: 0, description: 'Biaya perolehan per satuan' })
  @IsInt()
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({ example: 'Restock dari distributor A' })
  @IsOptional()
  @IsString()
  notes?: string;
}

