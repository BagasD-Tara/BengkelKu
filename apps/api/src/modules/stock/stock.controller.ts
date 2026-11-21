import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockService } from './stock.service';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller()
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('stock-in')
  @ApiOperation({ summary: 'Catat barang masuk (Owner & Kasir)' })
  stockIn(@Body() dto: StockInDto, @CurrentUser('id') userId: string) {
    return this.stockService.stockIn(dto, userId);
  }

  @Get('stock-movements')
  @ApiOperation({ summary: 'Riwayat pergerakan stok' })
  findMovements(@Query() query: QueryStockMovementDto) {
    return this.stockService.findMovements(query);
  }

  @Roles(Role.OWNER)
  @Post('stock-adjustments')
  @ApiOperation({ summary: 'Penyesuaian stok bercatatan (Owner)' })
  adjust(
    @Body() dto: StockAdjustmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stockService.adjust(dto, userId);
  }
}
