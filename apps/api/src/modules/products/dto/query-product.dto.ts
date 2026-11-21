import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export enum StockStatusFilter {
  ALL = 'ALL',
  LOW = 'LOW',
  OUT = 'OUT',
  AVAILABLE = 'AVAILABLE',
}

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cari nama atau kode barang' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: StockStatusFilter, default: StockStatusFilter.ALL })
  @IsOptional()
  @IsEnum(StockStatusFilter)
  stockStatus?: StockStatusFilter = StockStatusFilter.ALL;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean = true;
}

