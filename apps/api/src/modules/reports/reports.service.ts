import { Injectable } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';
import { resolveWibDateRange } from '../../common/utils/date-wib.util';
import { PrismaService } from '../../prisma/prisma.service';
import { computeStockStatus } from '../products/products.service';
import { ReportTopProductsQueryDto } from './dto/report-top-products-query.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSales(query: DateRangeQueryDto) {
    const { start, end } = resolveWibDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const [completedAgg, cancelledAgg, byMethodRaw, dailyRaw] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            status: TransactionStatus.SELESAI,
            transactionDate: { gte: start, lte: end },
          },
          _count: { _all: true },
          _sum: { totalAmount: true, discount: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            status: TransactionStatus.DIBATALKAN,
            transactionDate: { gte: start, lte: end },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ['paymentMethod'],
          where: {
            status: TransactionStatus.SELESAI,
            transactionDate: { gte: start, lte: end },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
        this.prisma.$queryRaw<
          Array<{ date: string; count: bigint; total: bigint }>
        >`
          SELECT
            TO_CHAR(transaction_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS "date",
            COUNT(*)::bigint AS "count",
            COALESCE(SUM(total_amount), 0)::bigint AS "total"
          FROM transactions
          WHERE status = 'SELESAI'
            AND transaction_date >= ${start}
            AND transaction_date <= ${end}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ]);

    return {
      summary: {
        transactionCount: completedAgg._count._all,
        totalSales: completedAgg._sum.totalAmount ?? 0,
        totalDiscount: completedAgg._sum.discount ?? 0,
        cancelledCount: cancelledAgg._count._all,
        cancelledAmount: cancelledAgg._sum.totalAmount ?? 0,
      },
      byPaymentMethod: byMethodRaw.map((row) => ({
        method: row.paymentMethod,
        count: row._count._all,
        total: row._sum.totalAmount ?? 0,
      })),
      daily: dailyRaw.map((row) => ({
        date: row.date,
        count: Number(row.count),
        total: Number(row.total),
      })),
    };
  }

  async getTopProducts(query: ReportTopProductsQueryDto) {
    const { start, end } = resolveWibDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );
    const limit = query.limit ?? 10;

    const rows = await this.prisma.$queryRaw<
      Array<{
        productId: string;
        code: string;
        name: string;
        totalQuantity: bigint;
        totalRevenue: bigint;
      }>
    >`
      SELECT
        ti.product_id AS "productId",
        p.code AS "code",
        p.name AS "name",
        SUM(ti.quantity)::bigint AS "totalQuantity",
        SUM(ti.subtotal)::bigint AS "totalRevenue"
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      INNER JOIN products p ON p.id = ti.product_id
      WHERE t.status = 'SELESAI'
        AND t.transaction_date >= ${start}
        AND t.transaction_date <= ${end}
      GROUP BY ti.product_id, p.code, p.name
      ORDER BY "totalQuantity" DESC, "totalRevenue" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      productId: row.productId,
      code: row.code,
      name: row.name,
      totalQuantity: Number(row.totalQuantity),
      totalRevenue: Number(row.totalRevenue),
    }));
  }

  async getStock(query: DateRangeQueryDto) {
    const { start, end } = resolveWibDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        productId: string;
        code: string;
        name: string;
        unit: string;
        stockQuantity: number;
        minimumStock: number;
        qtyIn: bigint;
        qtyOut: bigint;
      }>
    >`
      SELECT
        p.id AS "productId",
        p.code AS "code",
        p.name AS "name",
        p.unit AS "unit",
        p.stock_quantity AS "stockQuantity",
        p.minimum_stock AS "minimumStock",
        COALESCE(SUM(CASE WHEN sm.movement_type = 'MASUK' THEN sm.quantity_change ELSE 0 END), 0)::bigint AS "qtyIn",
        COALESCE(SUM(
          CASE
            WHEN sm.movement_type = 'JUAL' THEN -sm.quantity_change
            WHEN sm.movement_type = 'BATAL' THEN -sm.quantity_change
            ELSE 0
          END
        ), 0)::bigint AS "qtyOut"
      FROM products p
      LEFT JOIN stock_movements sm
        ON sm.product_id = p.id
        AND sm.created_at >= ${start}
        AND sm.created_at <= ${end}
      WHERE p.is_active = true
      GROUP BY p.id, p.code, p.name, p.unit, p.stock_quantity, p.minimum_stock
      ORDER BY p.name ASC
    `;

    return rows.map((row) => ({
      productId: row.productId,
      code: row.code,
      name: row.name,
      unit: row.unit,
      stockQuantity: row.stockQuantity,
      minimumStock: row.minimumStock,
      status: computeStockStatus(row.stockQuantity, row.minimumStock),
      qtyIn: Number(row.qtyIn),
      qtyOut: Number(row.qtyOut),
    }));
  }
}
