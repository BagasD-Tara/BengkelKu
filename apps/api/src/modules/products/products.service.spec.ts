import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { computeStockStatus, ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prismaMock: {
    product: {
      findUnique: jest.Mock;
    };
  };
  let stockServiceMock: { recordStockInTx: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      product: {
        findUnique: jest.fn(),
      },
    };
    stockServiceMock = {
      recordStockInTx: jest.fn(),
    };
    service = new ProductsService(
      prismaMock as unknown as PrismaService,
      stockServiceMock as unknown as StockService,
    );
  });

  it('maps stock status correctly', () => {
    expect(computeStockStatus(0, 5)).toBe('HABIS');
    expect(computeStockStatus(5, 5)).toBe('MENIPIS');
    expect(computeStockStatus(3, 5)).toBe('MENIPIS');
    expect(computeStockStatus(6, 5)).toBe('TERSEDIA');
  });

  it('omits purchasePrice for KASIR and keeps it for OWNER', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'p-1',
      code: 'OLI-01',
      name: 'Oli Mesin',
      purchasePrice: 35000,
      sellingPrice: 45000,
      stockQuantity: 10,
      minimumStock: 3,
      category: { id: 'c-1', name: 'Oli' },
    });

    const kasirView = await service.findOne('p-1', Role.KASIR);
    expect(kasirView).not.toHaveProperty('purchasePrice');
    expect(kasirView.stockStatus).toBe('TERSEDIA');

    const ownerView = await service.findOne('p-1', Role.OWNER);
    expect(ownerView).toHaveProperty('purchasePrice', 35000);
  });
});

