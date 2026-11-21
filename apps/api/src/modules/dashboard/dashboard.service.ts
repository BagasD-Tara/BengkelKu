import { Injectable } from '@nestjs/common';
import { MovementType, TransactionStatus } from '@prisma/client';
import { endOfWibDay, startOfWibDay } from '../../common/utils/date-wib.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const todayStart = startOfWibDay(now);
    const todayEnd = endOfWibDay(now);
    const sevenDaysStart = startOfWibDay(
      new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    );

    const [
      todaySalesAgg,
      activeProductCount,
      lowStockCount,
      outOfStockCount,
      lowStockItems,
      topProductsRaw,
      recentTransactions,
      recentStockIns,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.SELESAI,
          transactionDate: { gte: todayStart, lte: todayEnd },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({
        where: {
          isActive: true,
          stockQuantity: { gt: 0, lte: this.prisma.product.fields.minimumStock },
        },
      }),
      this.prisma.product.count({
        where: { isActive: true, stockQuantity: 0 },
      }),
      this.prisma.product.findMany({
        where: {
          isActive: true,
          stockQuantity: { lte: this.prisma.product.fields.minimumStock },
        },
        select: {
          id: true,
          code: true,
          name: true,
          stockQuantity: true,
          minimumStock: true,
        },
        orderBy: [{ stockQuantity: 'asc' }, { name: 'asc' }],
        take: 10,
      }),
      this.prisma.$queryRaw<
        Array<{ productId: string; name: string; totalQuantity: bigint }>
      >`
        SELECT
          ti.product_id AS "productId",
          p.name AS "name",
          SUM(ti.quantity)::bigint AS "totalQuantity"
        FROM transaction_items ti
        INNER JOIN transactions t ON t.id = ti.transaction_id
        INNER JOIN products p ON p.id = ti.product_id
        WHERE t.status = 'SELESAI'
          AND t.transaction_date >= ${sevenDaysStart}
          AND t.transaction_date <= ${todayEnd}
        GROUP BY ti.product_id, p.name
        ORDER BY "totalQuantity" DESC
        LIMIT 5
      `,
      this.prisma.transaction.findMany({
        orderBy: { transactionDate: 'desc' },
        take: 10,
        select: {
          transactionNumber: true,
          totalAmount: true,
          status: true,
          transactionDate: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { movementType: MovementType.MASUK },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          quantityChange: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      }),
    ]);

    const recentActivities = [
      ...recentTransactions.map((t) => ({
        type: 'TRANSACTION' as const,
        label: `${t.transactionNumber} - Rp${t.totalAmount.toLocaleString('id-ID')} (${t.status})`,
        at: t.transactionDate.toISOString(),
      })),
      ...recentStockIns.map((m) => ({
        type: 'STOCK_IN' as const,
        label: `Barang masuk ${m.product.name} (+${m.quantityChange})`,
        at: m.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10);

    return {
      todayRevenue: todaySalesAgg._sum.totalAmount ?? 0,
      todayTransactionCount: todaySalesAgg._count._all,
      activeProductCount,
      lowStockCount,
      outOfStockCount,
      lowStockItems,
      topProducts: topProductsRaw.map((row) => ({
        productId: row.productId,
        name: row.name,
        totalQuantity: Number(row.totalQuantity),
      })),
      recentActivities,
    };
  }
}
