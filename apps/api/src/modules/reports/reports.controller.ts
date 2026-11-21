import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';
import { ReportTopProductsQueryDto } from './dto/report-top-products-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Laporan penjualan (Owner)' })
  getSales(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getSales(query);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Laporan barang terlaris (Owner)' })
  getTopProducts(@Query() query: ReportTopProductsQueryDto) {
    return this.reportsService.getTopProducts(query);
  }

  @Get('stock')
  @ApiOperation({ summary: 'Laporan pergerakan stok (Owner)' })
  getStock(@Query() query: DateRangeQueryDto) {
    return this.reportsService.getStock(query);
  }
}

