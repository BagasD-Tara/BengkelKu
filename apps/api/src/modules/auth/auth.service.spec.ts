jest.mock('@nestjs/jwt', () => ({
  JwtService: jest.fn(),
}));

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ErrorCode } from '../../common/errors/error-codes';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService & RolesGuard', () => {
  let authService: AuthService;
  let prismaMock: { user: { findUnique: jest.Mock } };
  let jwtServiceMock: { signAsync: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };
    jwtServiceMock = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt-token'),
    };
    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtServiceMock as unknown as JwtService,
    );
  });

  it('logs in active user and returns accessToken without passwordHash', async () => {
    const hash = await bcrypt.hash('Password123!', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      name: 'Owner',
      email: 'owner@bengkelku.id',
      passwordHash: hash,
      role: Role.OWNER,
      isActive: true,
      createdAt: new Date(),
    });

    const result = await authService.login({
      email: 'OWNER@bengkelku.id',
      password: 'Password123!',
    });

    expect(result.accessToken).toBe('signed-jwt-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.role).toBe(Role.OWNER);
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    const hash = await bcrypt.hash('Password123!', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'owner@bengkelku.id',
      passwordHash: hash,
      role: Role.OWNER,
      isActive: true,
    });

    await expect(
      authService.login({
        email: 'owner@bengkelku.id',
        password: 'WrongPassword',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
  });

  it('rejects inactive user with 403 USER_INACTIVE', async () => {
    const hash = await bcrypt.hash('Password123!', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-2',
      email: 'kasir@bengkelku.id',
      passwordHash: hash,
      role: Role.KASIR,
      isActive: false,
    });

    await expect(
      authService.login({
        email: 'kasir@bengkelku.id',
        password: 'Password123!',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.USER_INACTIVE });
  });

  it('RolesGuard blocks KASIR on OWNER-only routes with 403 FORBIDDEN', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.OWNER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.KASIR } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow();
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as { code: string }).code).toBe(ErrorCode.FORBIDDEN);
    }
  });
});

