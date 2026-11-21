import { HttpStatus, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { endOfWibDay, startOfWibDay } from '../../common/utils/date-wib.util';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockInDto } from './dto/stock-in.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper untuk mencatat barang masuk di dalam transaksi Prisma yang sudah berjalan
   * (dipakai oleh stockIn maupun initialStock saat pembuatan barang).
   */
  async recordStockInTx(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      userId: string;
      quantity: number;
      unitCost: number;
      notes?: string | null;
    },
  ) {
    const updatedProduct = await tx.product.update({
      where: { id: params.productId },
      data: {
        stockQuantity: { increment: params.quantity },
      },
      select: { id: true, stockQuantity: true },
    });

    return tx.stockMovement.create({
      data: {
        productId: params.productId,
        userId: params.userId,
        movementType: MovementType.MASUK,
        quantityChange: params.quantity,
        stockAfter: updatedProduct.stockQuantity,
        unitCost: params.unitCost,
        notes: params.notes ?? null,
      },
      include: {
        product: { select: { id: true, code: true, name: true, unit: true } },
        user: { select: { id: true, name: true } },
      },
    });
  }

  async stockIn(dto: StockInDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, name: true, isActive: true },
      });

      if (!product) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          'Barang tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!product.isActive) {
        throw new AppException(
          ErrorCode.PRODUCT_INACTIVE,
          `Barang ${product.name} sedang nonaktif`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return this.recordStockInTx(tx, {
        productId: dto.productId,
        userId,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        notes: dto.notes?.trim() ?? null,
      });
    });
  }

  async findMovements(query: QueryStockMovementDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.movementType) {
      where.movementType = query.movementType;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = startOfWibDay(new Date(query.startDate));
      }
      if (query.endDate) {
        where.createdAt.lte = endOfWibDay(new Date(query.endDate));
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async adjust(dto: StockAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, stockQuantity: true },
      });

      if (!product) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          'Barang tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );
      }

      const quantityChange = dto.newQuantity - product.stockQuantity;

      await tx.product.update({
        where: { id: dto.productId },
        data: { stockQuantity: dto.newQuantity },
      });

      return tx.stockMovement.create({
        data: {
          productId: dto.productId,
          userId,
          movementType: MovementType.PENYESUAIAN,
          quantityChange,
          stockAfter: dto.newQuantity,
          notes: dto.notes.trim(),
        },
        include: {
          product: { select: { id: true, code: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
        },
      });
    });
  }
}
