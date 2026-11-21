import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      this.logger.warn(`Login gagal: email tidak ditemukan (${email})`);
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email atau kata sandi salah',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`Login gagal: kata sandi salah (${email})`);
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Email atau kata sandi salah',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      this.logger.warn(`Login ditolak: akun nonaktif (${email})`);
      throw new AppException(
        ErrorCode.USER_INACTIVE,
        'Akun pengguna tidak aktif',
        HttpStatus.FORBIDDEN,
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SAFE_SELECT,
    });

    if (!user) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Pengguna tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }
}
