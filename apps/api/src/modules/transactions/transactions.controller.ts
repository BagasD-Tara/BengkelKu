import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Buat transaksi penjualan baru (atomik & idempotent)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID unik per percobaan checkout',
  })
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateTransactionDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.transactionsService.create(
      idempotencyKey,
      dto,
      userId,
    );
    if (result.replayed) {
      res.status(HttpStatus.OK);
      res.setHeader('Idempotent-Replayed', 'true');
    }
    return result.transaction;
  }

  @Get()
  @ApiOperation({ summary: 'Riwayat transaksi dengan filter' })
  findAll(@Query() query: QueryTransactionDto) {
    return this.transactionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail transaksi' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.findOne(id);
  }

  @Roles(Role.OWNER)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batalkan transaksi (Owner)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.transactionsService.cancel(id, dto, userId);
  }
}
