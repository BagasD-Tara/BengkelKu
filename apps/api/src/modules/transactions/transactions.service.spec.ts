import { HttpStatus } from '@nestjs/common';
import { MovementType, PaymentMethod, TransactionStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let txMock: {
    transaction: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    product: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    stockMovement: {
      createMany: jest.Mock;
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  let prismaMock: {
    $transaction: jest.Mock;
    transaction: { findUnique: jest.Mock };
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const prodA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const prodB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const idempKey = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => {
    txMock = {
      transaction: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        createMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    prismaMock = {
      $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) =>
        cb(txMock),
      ),
      transaction: {
        findUnique: jest.fn(),
      },
    };

    service = new TransactionsService(prismaMock as unknown as PrismaService);
  });

  it('rejects missing or non-UUID Idempotency-Key with 400', async () => {
    await expect(
      service.create(
        'not-a-uuid',
        { items: [{ productId: prodA, quantity: 1 }], paymentMethod: PaymentMethod.TUNAI },
        userId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    });
  });

  it('merges duplicate items, computes totals from DB prices, and records JUAL movements', async () => {
    txMock.transaction.findUnique.mockResolvedValue(null);
    txMock.product.findMany.mockResolvedValue([
      { id: prodA, name: 'Oli 1L', sellingPrice: 40000, isActive: true },
      { id: prodB, name: 'Busi', sellingPrice: 15000, isActive: true },
    ]);
    txMock.product.updateMany.mockResolvedValue({ count: 1 });
    txMock.product.findUniqueOrThrow
      .mockResolvedValueOnce({ stockQuantity: 8 })
      .mockResolvedValueOnce({ stockQuantity: 9 });
    txMock.$queryRaw.mockResolvedValue([{ nextval: BigInt(12) }]);
    txMock.transaction.create.mockResolvedValue({
      id: 'tx-1',
      transactionNumber: 'TRX-20261121-000012',
      transactionDate: new Date('2026-11-21T04:00:00.000Z'),
      status: TransactionStatus.SELESAI,
      subtotal: 95000,
      discount: 5000,
      totalAmount: 90000,
      paymentMethod: PaymentMethod.TUNAI,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      user: { id: userId, name: 'Budi' },
      items: [
        { id: 'i1', productId: prodA, itemName: 'Oli 1L', quantity: 2, unitPrice: 40000, subtotal: 80000 },
        { id: 'i2', productId: prodB, itemName: 'Busi', quantity: 1, unitPrice: 15000, subtotal: 15000 },
      ],
    });

    const result = await service.create(
      idempKey,
      {
        items: [
          { productId: prodA, quantity: 1 },
          { productId: prodB, quantity: 1 },
          { productId: prodA, quantity: 1 },
        ],
        discount: 5000,
        paymentMethod: PaymentMethod.TUNAI,
      },
      userId,
    );

    expect(result.replayed).toBe(false);
    expect(result.transaction.subtotal).toBe(95000);
    expect(result.transaction.totalAmount).toBe(90000);
    expect(txMock.stockMovement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: prodA,
          movementType: MovementType.JUAL,
          quantityChange: -2,
          stockAfter: 8,
        }),
        expect.objectContaining({
          productId: prodB,
          movementType: MovementType.JUAL,
          quantityChange: -1,
          stockAfter: 9,
        }),
      ]),
    });
  });

  it('replays existing transaction with replayed=true for same user', async () => {
    txMock.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      userId,
      transactionNumber: 'TRX-20261121-000001',
      transactionDate: new Date(),
      status: TransactionStatus.SELESAI,
      subtotal: 40000,
      discount: 0,
      totalAmount: 40000,
      paymentMethod: PaymentMethod.QRIS,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      user: { id: userId, name: 'Budi' },
      items: [],
    });

    const result = await service.create(
      idempKey,
      { items: [{ productId: prodA, quantity: 1 }], paymentMethod: PaymentMethod.QRIS },
      userId,
    );

    expect(result.replayed).toBe(true);
    expect(txMock.product.updateMany).not.toHaveBeenCalled();
  });

  it('throws 409 IDEMPOTENCY_KEY_CONFLICT when key belongs to another user', async () => {
    txMock.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      userId: otherUserId,
      user: { id: otherUserId, name: 'Ani' },
      items: [],
    });

    await expect(
      service.create(
        idempKey,
        { items: [{ productId: prodA, quantity: 1 }], paymentMethod: PaymentMethod.TUNAI },
        userId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
    });
  });

  it('throws 409 INSUFFICIENT_STOCK when conditional stock update returns count 0', async () => {
    txMock.transaction.findUnique.mockResolvedValue(null);
    txMock.product.findMany.mockResolvedValue([
      { id: prodA, name: 'Oli 1L', sellingPrice: 40000, isActive: true },
    ]);
    txMock.product.updateMany.mockResolvedValue({ count: 0 });
    txMock.product.findUnique.mockResolvedValue({ name: 'Oli 1L', stockQuantity: 1 });

    await expect(
      service.create(
        idempKey,
        { items: [{ productId: prodA, quantity: 5 }], paymentMethod: PaymentMethod.TUNAI },
        userId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
    });
  });

  it('throws 422 PRODUCT_INACTIVE when product is inactive', async () => {
    txMock.transaction.findUnique.mockResolvedValue(null);
    txMock.product.findMany.mockResolvedValue([
      { id: prodA, name: 'Oli Lama', sellingPrice: 40000, isActive: false },
    ]);

    await expect(
      service.create(
        idempKey,
        { items: [{ productId: prodA, quantity: 1 }], paymentMethod: PaymentMethod.TUNAI },
        userId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PRODUCT_INACTIVE,
    });
  });

  it('cancels SELESAI transaction, restores stock, and rejects second cancel with 409', async () => {
    txMock.transaction.updateMany.mockResolvedValueOnce({ count: 1 });
    txMock.transaction.findUniqueOrThrow.mockResolvedValue({
      id: 'tx-1',
      transactionNumber: 'TRX-20261121-000001',
      transactionDate: new Date(),
      status: TransactionStatus.DIBATALKAN,
      subtotal: 40000,
      discount: 0,
      totalAmount: 40000,
      paymentMethod: PaymentMethod.TUNAI,
      cancelReason: 'Salah barang',
      cancelledBy: userId,
      cancelledAt: new Date(),
      user: { id: userId, name: 'Budi' },
      items: [
        { id: 'i1', productId: prodA, itemName: 'Oli 1L', quantity: 2, unitPrice: 20000, subtotal: 40000 },
      ],
    });
    txMock.product.update.mockResolvedValue({ stockQuantity: 10 });
    txMock.user.findUnique.mockResolvedValue({ id: userId, name: 'Owner' });

    const cancelled = await service.cancel('tx-1', { reason: 'Salah barang' }, userId);
    expect(cancelled.status).toBe(TransactionStatus.DIBATALKAN);
    expect(txMock.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: prodA,
        movementType: MovementType.BATAL,
        quantityChange: 2,
        stockAfter: 10,
      }),
    });

    // Second cancel
    txMock.transaction.updateMany.mockResolvedValueOnce({ count: 0 });
    txMock.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-1',
      status: TransactionStatus.DIBATALKAN,
    });

    await expect(
      service.cancel('tx-1', { reason: 'Salah barang' }, userId),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.cancel('tx-1', { reason: 'Salah barang' }, userId),
    ).rejects.toThrow();

    txMock.transaction.updateMany.mockResolvedValueOnce({ count: 0 });
    txMock.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-1',
      status: TransactionStatus.DIBATALKAN,
    });
    try {
      await service.cancel('tx-1', { reason: 'Salah barang' }, userId);
    } catch (e) {
      expect((e as AppException).code).toBe(ErrorCode.TRANSACTION_ALREADY_CANCELLED);
      expect((e as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });
});

