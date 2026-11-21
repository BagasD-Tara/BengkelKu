import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const createMockHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const getResponse = () => ({ status });
    const getRequest = () => ({ method: 'GET', url: '/api/test' });
    const host = {
      switchToHttp: () => ({ getResponse, getRequest }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  };

  it('memformat AppException menjadi { message, code }', () => {
    const { host, status, json } = createMockHost();
    filter.catch(
      new AppException(
        ErrorCode.INSUFFICIENT_STOCK,
        'Stok tidak mencukupi',
        HttpStatus.CONFLICT,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      message: 'Stok tidak mencukupi',
      code: ErrorCode.INSUFFICIENT_STOCK,
    });
  });

  it('memformat error validasi BadRequestException array menjadi { message, code }', () => {
    const { host, status, json } = createMockHost();
    filter.catch(
      new BadRequestException(['email harus valid', 'password minimal 8 karakter']),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      message: 'email harus valid; password minimal 8 karakter',
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('memetakan NotFoundException menjadi NOT_FOUND', () => {
    const { host, status, json } = createMockHost();
    filter.catch(new NotFoundException('Barang tidak ditemukan'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      message: 'Barang tidak ditemukan',
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('memetakan Prisma P2002 email ke 409 EMAIL_ALREADY_EXISTS', () => {
    const { host, status, json } = createMockHost();
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '6.0.0',
      meta: { target: ['email'] },
    });

    filter.catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      message: 'Data sudah terdaftar',
      code: ErrorCode.EMAIL_ALREADY_EXISTS,
    });
  });

  it('memetakan error tak terduga menjadi 500 INTERNAL_ERROR tanpa membocorkan detail', () => {
    const { host, status, json } = createMockHost();
    filter.catch(new Error('secret db stack'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      message: 'Terjadi kesalahan pada server',
      code: ErrorCode.INTERNAL_ERROR,
    });
  });
});

