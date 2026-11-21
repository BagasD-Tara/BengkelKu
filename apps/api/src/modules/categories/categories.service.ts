import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const existing = await this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new AppException(
        ErrorCode.CATEGORY_NAME_EXISTS,
        'Nama kategori sudah terdaftar',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.category.create({
      data: {
        name,
        description: dto.description?.trim() ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Kategori tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppException(
          ErrorCode.CATEGORY_NAME_EXISTS,
          'Nama kategori sudah terdaftar',
          HttpStatus.CONFLICT,
        );
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Kategori tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      throw new AppException(
        ErrorCode.CATEGORY_IN_USE,
        'Kategori tidak dapat dihapus karena masih digunakan oleh barang',
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { id, deleted: true };
  }
}
