import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  MovementType,
  Prisma,
  TransactionStatus,
} from '@prisma/client';
import { isUUID } from 'class-validator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  endOfWibDay,
  formatWibDateCompact,
  startOfWibDay,
} from '../../common/utils/date-wib.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

const TRANSACTION_INCLUDE = {
  user: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      itemName: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
    },
  },
} as const;

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private formatTransaction(
    tx: TransactionWithRelations,
    cancelledByUser?: { id: string; name: string } | null,
  ) {
    return {
      id: tx.id,
      transactionNumber: tx.transactionNumber,
      transactionDate: tx.transactionDate,
      status: tx.status,
      subtotal: tx.subtotal,
      discount: tx.discount,
      totalAmount: tx.totalAmount,
      paymentMethod: tx.paymentMethod,
      cancelReason: tx.cancelReason,
      cancelledBy: tx.cancelledBy
        ? (cancelledByUser ?? { id: tx.cancelledBy, name: null })
        : null,
      cancelledAt: tx.cancelledAt,
      items: tx.items,
      createdBy: tx.user,
    };
  }

  async create(
    idempotencyKey: string | undefined,
    dto: CreateTransactionDto,
    userId: string,
  ) {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        'Header Idempotency-Key wajib diisi dengan UUID yang valid',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Gabungkan item duplikat dan urutkan berdasarkan productId untuk mencegah deadlock
    const mergedItemsMap = new Map<string, number>();
    for (const item of dto.items) {
      mergedItemsMap.set(
        item.productId,
        (mergedItemsMap.get(item.productId) ?? 0) + item.quantity,
      );
    }
    const sortedItems = [...mergedItemsMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([productId, quantity]) => ({ productId, quantity }));

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.transaction.findUnique({
            where: { idempotencyKey },
            include: TRANSACTION_INCLUDE,
          });

          if (existing) {
            if (existing.userId !== userId) {
              throw new AppException(
                ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
                'Idempotency-Key sudah digunakan oleh pengguna lain',
                HttpStatus.CONFLICT,
              );
            }
            return {
              replayed: true,
              transaction: this.formatTransaction(existing),
            };
          }

          const productIds = sortedItems.map((i) => i.productId);
          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
          });

          if (products.length !== productIds.length) {
            const foundIds = new Set(products.map((p) => p.id));
            const missingId = productIds.find((id) => !foundIds.has(id));
            throw new AppException(
              ErrorCode.NOT_FOUND,
              `Barang tidak ditemukan (${missingId})`,
              HttpStatus.NOT_FOUND,
            );
          }

          const productMap = new Map(products.map((p) => [p.id, p]));

          let subtotal = 0;
          const preparedItems = sortedItems.map(({ productId, quantity }) => {
            const product = productMap.get(productId)!;
            if (!product.isActive) {
              throw new AppException(
                ErrorCode.PRODUCT_INACTIVE,
                `Barang ${product.name} sedang nonaktif`,
                HttpStatus.UNPROCESSABLE_ENTITY,
              );
            }
            const unitPrice = product.sellingPrice;
            const itemSubtotal = unitPrice * quantity;
            subtotal += itemSubtotal;
            return {
              productId,
              itemName: product.name,
              quantity,
              unitPrice,
              subtotal: itemSubtotal,
            };
          });

          const discount = dto.discount ?? 0;
          if (discount > subtotal) {
            throw new AppException(
              ErrorCode.VALIDATION_ERROR,
              'Diskon tidak boleh melebihi subtotal',
              HttpStatus.BAD_REQUEST,
            );
          }
          const totalAmount = subtotal - discount;

          // Kurangi stok secara atomik bersyarat dalam urutan productId
          const stockAfterMap = new Map<string, number>();
          for (const item of preparedItems) {
            const updated = await tx.product.updateMany({
              where: {
                id: item.productId,
                stockQuantity: { gte: item.quantity },
              },
              data: {
                stockQuantity: { decrement: item.quantity },
              },
            });

            if (updated.count === 0) {
              const latest = await tx.product.findUnique({
                where: { id: item.productId },
                select: { name: true, stockQuantity: true },
              });
              throw new AppException(
                ErrorCode.INSUFFICIENT_STOCK,
                `Stok ${latest?.name ?? item.itemName} tidak cukup (productId: ${item.productId}). Tersedia ${latest?.stockQuantity ?? 0}.`,
                HttpStatus.CONFLICT,
              );
            }

            const after = await tx.product.findUniqueOrThrow({
              where: { id: item.productId },
              select: { stockQuantity: true },
            });
            stockAfterMap.set(item.productId, after.stockQuantity);
          }

          const now = new Date();
          const seqResult = await tx.$queryRaw<Array<{ nextval: bigint }>>`
            SELECT nextval('transaction_number_seq')
          `;
          const seqNumber = String(seqResult[0].nextval).padStart(6, '0');
          const transactionNumber = `TRX-${formatWibDateCompact(now)}-${seqNumber}`;

          const created = await tx.transaction.create({
            data: {
              transactionNumber,
              idempotencyKey,
              userId,
              transactionDate: now,
              subtotal,
              discount,
              totalAmount,
              paymentMethod: dto.paymentMethod,
              status: TransactionStatus.SELESAI,
              items: {
                create: preparedItems,
              },
            },
            include: TRANSACTION_INCLUDE,
          });

          await tx.stockMovement.createMany({
            data: preparedItems.map((item) => ({
              productId: item.productId,
              userId,
              movementType: MovementType.JUAL,
              quantityChange: -item.quantity,
              stockAfter: stockAfterMap.get(item.productId)!,
              referenceId: created.id,
              notes: `Penjualan ${transactionNumber}`,
            })),
          });

          return {
            replayed: false,
            transaction: this.formatTransaction(created),
          };
        },
        {
          maxWait: 5000,
          timeout: 10000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = String(error.meta?.target ?? '');
        if (
          target.includes('idempotency_key') ||
          target.includes('idempotencyKey')
        ) {
          const existing = await this.prisma.transaction.findUnique({
            where: { idempotencyKey },
            include: TRANSACTION_INCLUDE,
          });
          if (existing) {
            if (existing.userId !== userId) {
              throw new AppException(
                ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
                'Idempotency-Key sudah digunakan oleh pengguna lain',
                HttpStatus.CONFLICT,
              );
            }
            return {
              replayed: true,
              transaction: this.formatTransaction(existing),
            };
          }
        }
      }
      throw error;
    }
  }

  async findAll(query: QueryTransactionDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {};
    if (query.search?.trim()) {
      where.transactionNumber = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }
    if (query.startDate || query.endDate) {
      where.transactionDate = {};
      if (query.startDate) {
        where.transactionDate.gte = startOfWibDay(new Date(query.startDate));
      }
      if (query.endDate) {
        where.transactionDate.lte = endOfWibDay(new Date(query.endDate));
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.formatTransaction(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: TRANSACTION_INCLUDE,
    });

    if (!tx) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Transaksi tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    let cancelledByUser: { id: string; name: string } | null = null;
    if (tx.cancelledBy) {
      cancelledByUser = await this.prisma.user.findUnique({
        where: { id: tx.cancelledBy },
        select: { id: true, name: true },
      });
    }

    return this.formatTransaction(tx, cancelledByUser);
  }

  async cancel(id: string, dto: CancelTransactionDto, userId: string) {
    const reason = dto.reason.trim();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.transaction.updateMany({
          where: { id, status: TransactionStatus.SELESAI },
          data: {
            status: TransactionStatus.DIBATALKAN,
            cancelReason: reason,
            cancelledBy: userId,
            cancelledAt: new Date(),
          },
        });

        if (updated.count === 0) {
          const existing = await tx.transaction.findUnique({
            where: { id },
            select: { id: true, status: true },
          });
          if (!existing) {
            throw new AppException(
              ErrorCode.NOT_FOUND,
              'Transaksi tidak ditemukan',
              HttpStatus.NOT_FOUND,
            );
          }
          throw new AppException(
            ErrorCode.TRANSACTION_ALREADY_CANCELLED,
            'Transaksi sudah dibatalkan sebelumnya',
            HttpStatus.CONFLICT,
          );
        }

        const cancelledTx = await tx.transaction.findUniqueOrThrow({
          where: { id },
          include: TRANSACTION_INCLUDE,
        });

        const sortedItems = [...cancelledTx.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );

        for (const item of sortedItems) {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
            select: { stockQuantity: true },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              userId,
              movementType: MovementType.BATAL,
              quantityChange: item.quantity,
              stockAfter: updatedProduct.stockQuantity,
              referenceId: cancelledTx.id,
              notes: reason,
            },
          });
        }

        const cancelledByUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });

        return this.formatTransaction(cancelledTx, cancelledByUser);
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );

    this.logger.log(
      `Transaksi ${result.transactionNumber} dibatalkan oleh user ${userId}: ${reason}`,
    );

    return result;
  }
}
