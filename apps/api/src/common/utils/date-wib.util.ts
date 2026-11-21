import { HttpStatus } from '@nestjs/common';
import { ReportPeriod } from '../dto/date-range-query.dto';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_DAYS = 366;

/**
 * Mengembalikan awal hari (00:00:00.000) dalam zona WIB (UTC+7) sebagai Date UTC.
 */
export function startOfWibDay(date: Date = new Date()): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const utcMidnightWib = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(utcMidnightWib - WIB_OFFSET_MS);
}

/**
 * Mengembalikan akhir hari (23:59:59.999) dalam zona WIB (UTC+7) sebagai Date UTC.
 */
export function endOfWibDay(date: Date = new Date()): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const utcEndWib = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return new Date(utcEndWib - WIB_OFFSET_MS);
}

/**
 * Format tanggal WIB menjadi YYYYMMDD (untuk nomor transaksi TRX-YYYYMMDD-NNNNNN).
 */
export function formatWibDateCompact(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Mengembalikan rentang tanggal UTC [start, end] berdasarkan periode WIB.
 */
export function resolveWibDateRange(
  period: ReportPeriod = ReportPeriod.TODAY,
  startDate?: string,
  endDate?: string,
): { start: Date; end: Date } {
  const now = new Date();

  switch (period) {
    case ReportPeriod.TODAY:
      return { start: startOfWibDay(now), end: endOfWibDay(now) };

    case ReportPeriod.LAST_7_DAYS: {
      const sevenDaysAgo = new Date(now.getTime() - 6 * ONE_DAY_MS);
      return { start: startOfWibDay(sevenDaysAgo), end: endOfWibDay(now) };
    }

    case ReportPeriod.THIS_MONTH: {
      const wib = new Date(now.getTime() + WIB_OFFSET_MS);
      const firstOfMonthWib = new Date(
        Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_OFFSET_MS,
      );
      return { start: firstOfMonthWib, end: endOfWibDay(now) };
    }

    case ReportPeriod.CUSTOM: {
      if (!startDate || !endDate) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'startDate dan endDate wajib diisi untuk period CUSTOM',
          HttpStatus.BAD_REQUEST,
        );
      }
      const start = startOfWibDay(new Date(startDate));
      const end = endOfWibDay(new Date(endDate));
      if (end.getTime() < start.getTime()) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'endDate tidak boleh sebelum startDate',
          HttpStatus.BAD_REQUEST,
        );
      }
      const diffDays = (end.getTime() - start.getTime()) / ONE_DAY_MS;
      if (diffDays > MAX_CUSTOM_RANGE_DAYS) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          `Rentang tanggal maksimal ${MAX_CUSTOM_RANGE_DAYS} hari`,
          HttpStatus.BAD_REQUEST,
        );
      }
      return { start, end };
    }
  }
}
