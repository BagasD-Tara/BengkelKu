import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const mockContext = {} as ExecutionContext;

  it('membungkus payload biasa ke dalam { data }', async () => {
    const next: CallHandler = { handle: () => of({ id: '1', name: 'Oli' }) };
    const result = await lastValueFrom(interceptor.intercept(mockContext, next));
    expect(result).toEqual({ data: { id: '1', name: 'Oli' } });
  });

  it('meneruskan payload yang sudah berbentuk { data, meta }', async () => {
    const paginated = {
      data: [{ id: '1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    const next: CallHandler = { handle: () => of(paginated) };
    const result = await lastValueFrom(interceptor.intercept(mockContext, next));
    expect(result).toEqual(paginated);
  });

  it('mengubah payload undefined menjadi { data: null }', async () => {
    const next: CallHandler = { handle: () => of(undefined) };
    const result = await lastValueFrom(interceptor.intercept(mockContext, next));
    expect(result).toEqual({ data: null });
  });
});

