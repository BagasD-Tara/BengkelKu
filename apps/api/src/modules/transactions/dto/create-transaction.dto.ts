import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransactionItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateTransactionDto {
  @ApiProperty({ type: [TransactionItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items!: TransactionItemDto[];

  @ApiPropertyOptional({
    example: 5000,
    minimum: 0,
    default: 0,
    description: 'Diskon nominal rupiah per transaksi',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  discount?: number = 0;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.TUNAI })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

