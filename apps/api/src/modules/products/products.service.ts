import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto, StockStatusFilter } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export type ProductStockStatus = 'HABIS' | 'MENIPIS' | 'TERSEDIA';

export function computeStockStatus(
  stockQuantity: number,
  minimumStock: number,
): ProductStockStatus {
  if (stockQuantity <= 0) return 'HABIS';
  if (stockQuantity <= minimumStock) return 'MENIPIS';
  return 'TERSEDIA';
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  private serializeProduct<
    T extends {
      stockQuantity: number;
      minimumStock: number;
      purchasePrice?: number;
    },
  >(product: T, role: Role) {
    const stockStatus = computeStockStatus(
      product.stockQuantity,
      product.minimumStock,
    );
    if (role === Role.KASIR) {
      const { purchasePrice: _omitted, ...rest } = product;
      return { ...rest, stockStatus };
    }
    return { ...product, stockStatus };
  }

  async findAll(query: QueryProductDto, role: Role) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.stockStatus === StockStatusFilter.OUT) {
      where.stockQuantity = 0;
    } else if (query.stockStatus === StockStatusFilter.LOW) {
      where.AND = [
        { stockQuantity: { gt: 0 } },
        { stockQuantity: { lte: this.prisma.product.fields.minimumStock } },
      ];
    } else if (query.stockStatus === StockStatusFilter.AVAILABLE) {
      where.stockQuantity = { gt: this.prisma.product.fields.minimumStock };
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serializeProduct(row, role)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findLowStock(query: PaginationQueryDto, role: Role) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      stockQuantity: { lte: this.prisma.product.fields.minimumStock },
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: [{ stockQuantity: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.serializeProduct(row, role)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, role: Role) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Barang tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.serializeProduct(product, role);
  }

  async create(dto: CreateProductDto, userId: string, role: Role) {
    const code = dto.code.trim();
    const existingCode = await this.prisma.product.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existingCode) {
      throw new AppException(
        ErrorCode.CODE_ALREADY_EXISTS,
        'Kode barang sudah terdaftar',
        HttpStatus.CONFLICT,
      );
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Kategori tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          code,
          name: dto.name.trim(),
          categoryId: dto.categoryId,
          brand: dto.brand?.trim() ?? null,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          unit: dto.unit.trim(),
          minimumStock: dto.minimumStock ?? 0,
          stockQuantity: 0,
        },
      });

      if (dto.initialStock && dto.initialStock > 0) {
        await this.stockService.recordStockInTx(tx, {
          productId: product.id,
          userId,
          quantity: dto.initialStock,
          unitCost: dto.purchasePrice,
          notes: 'Stok awal',
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: {
          category: { select: { id: true, name: true } },
        },
      });
    });

    return this.serializeProduct(created, role);
  }

  async update(id: string, dto: UpdateProductDto, role: Role) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Barang tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      const duplicate = await this.prisma.product.findFirst({
        where: { id: { not: id }, code },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppException(
          ErrorCode.CODE_ALREADY_EXISTS,
          'Kode barang sudah terdaftar',
          HttpStatus.CONFLICT,
        );
      }
    }

    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          'Kategori tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.brand !== undefined
          ? { brand: dto.brand?.trim() ?? null }
          : {}),
        ...(dto.purchasePrice !== undefined
          ? { purchasePrice: dto.purchasePrice }
          : {}),
        ...(dto.sellingPrice !== undefined
          ? { sellingPrice: dto.sellingPrice }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
        ...(dto.minimumStock !== undefined
          ? { minimumStock: dto.minimumStock }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return this.serializeProduct(updated, role);
  }
}
