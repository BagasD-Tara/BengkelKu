import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeType } from './error-codes';

export class AppException extends HttpException {
  readonly code: ErrorCodeType;

  constructor(
    code: ErrorCodeType,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, code }, status);
    this.code = code;
  }
}

