import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prismaMock: {
    category: {
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    product: {
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      category: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      product: {
        count: jest.fn(),
      },
    };
    service = new CategoriesService(prismaMock as unknown as PrismaService);
  });

  it('rejects deleting category still referenced by products with 409 CATEGORY_IN_USE', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.count.mockResolvedValue(2);

    await expect(service.remove('cat-1')).rejects.toMatchObject({
      code: ErrorCode.CATEGORY_IN_USE,
    });
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });

  it('deletes category when no products reference it', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.category.delete.mockResolvedValue({ id: 'cat-1' });

    const res = await service.remove('cat-1');
    expect(res).toEqual({ id: 'cat-1', deleted: true });
    expect(prismaMock.category.delete).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
    });
  });
});

