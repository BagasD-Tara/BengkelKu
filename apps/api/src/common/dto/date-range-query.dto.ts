import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, ValidateIf } from 'class-validator';

export enum ReportPeriod {
  TODAY = 'TODAY',
  LAST_7_DAYS = 'LAST_7_DAYS',
  THIS_MONTH = 'THIS_MONTH',
  CUSTOM = 'CUSTOM',
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({ enum: ReportPeriod, default: ReportPeriod.TODAY })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod = ReportPeriod.TODAY;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Wajib jika period=CUSTOM (YYYY-MM-DD)' })
  @ValidateIf((o: DateRangeQueryDto) => o.period === ReportPeriod.CUSTOM)
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-21', description: 'Wajib jika period=CUSTOM (YYYY-MM-DD)' })
  @ValidateIf((o: DateRangeQueryDto) => o.period === ReportPeriod.CUSTOM)
  @IsDateString()
  endDate?: string;
}

