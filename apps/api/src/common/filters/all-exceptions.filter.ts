import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-codes';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server';
    let code: string = ErrorCode.INTERNAL_ERROR;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
        code = this.mapStatusToCode(status);
      } else if (typeof body === 'object' && body !== null) {
        const resBody = body as Record<string, unknown>;
        const rawMessage = resBody.message;
        if (Array.isArray(rawMessage)) {
          message = rawMessage.join('; ');
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
        code =
          typeof resBody.code === 'string'
            ? resBody.code
            : this.mapStatusToCode(status);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = this.mapUniqueConstraintToCode(exception.meta?.target);
        message = 'Data sudah terdaftar';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ErrorCode.NOT_FOUND;
        message = 'Data tidak ditemukan';
      } else {
        this.logger.error(
          `Prisma error ${exception.code} on ${request.method} ${request.url}`,
          exception.stack,
        );
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({ message, code });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private mapUniqueConstraintToCode(target: unknown): string {
    const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
    if (fields.includes('email')) return ErrorCode.EMAIL_ALREADY_EXISTS;
    if (fields.includes('code')) return ErrorCode.CODE_ALREADY_EXISTS;
    if (fields.includes('name')) return ErrorCode.CATEGORY_NAME_EXISTS;
    if (fields.includes('idempotency_key') || fields.includes('idempotencyKey')) {
      return ErrorCode.IDEMPOTENCY_KEY_CONFLICT;
    }
    return ErrorCode.VALIDATION_ERROR;
  }
}

