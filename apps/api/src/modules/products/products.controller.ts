import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar barang dengan pencarian, filter, dan paginasi' })
  findAll(@Query() query: QueryProductDto, @CurrentUser('role') role: Role) {
    return this.productsService.findAll(query, role);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Daftar barang dengan stok menipis atau habis' })
  findLowStock(
    @Query() query: PaginationQueryDto,
    @CurrentUser('role') role: Role,
  ) {
    return this.productsService.findLowStock(query, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail barang' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.productsService.findOne(id, role);
  }

  @Roles(Role.OWNER)
  @Post()
  @ApiOperation({ summary: 'Tambah barang baru (Owner)' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.productsService.create(dto, userId, role);
  }

  @Roles(Role.OWNER)
  @Patch(':id')
  @ApiOperation({ summary: 'Ubah atau nonaktifkan barang (Owner)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('role') role: Role,
  ) {
    return this.productsService.update(id, dto, role);
  }
}
