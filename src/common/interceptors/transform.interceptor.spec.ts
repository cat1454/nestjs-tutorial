import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  const createContext = (statusCode: number): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
    }) as unknown as ExecutionContext;

  it('unwraps objects containing both message and data', async () => {
    const next: CallHandler = {
      handle: () => of({ message: 'Custom OK', data: { id: 1 } }),
    };

    const result = await firstValueFrom(
      interceptor.intercept(createContext(200), next),
    );

    expect(result.statusCode).toBe(200);
    expect(result.message).toBe('Custom OK');
    expect(result.data).toEqual({ id: 1 });
  });

  it('extracts message while preserving payload when object has only message', async () => {
    const next: CallHandler = {
      handle: () => of({ message: 'Logged out' }),
    };

    const result = await firstValueFrom(
      interceptor.intercept(createContext(200), next),
    );

    expect(result.message).toBe('Logged out');
    expect(result.data).toEqual({ message: 'Logged out' });
  });

  it('wraps raw data and null with default Success message', async () => {
    const nextRaw: CallHandler = { handle: () => of({ user: 'alice' }) };
    const rawRes = await firstValueFrom(
      interceptor.intercept(createContext(201), nextRaw),
    );
    expect(rawRes.statusCode).toBe(201);
    expect(rawRes.message).toBe('Success');
    expect(rawRes.data).toEqual({ user: 'alice' });

    const nextNull: CallHandler = { handle: () => of(null) };
    const nullRes = await firstValueFrom(
      interceptor.intercept(createContext(204), nextNull),
    );
    expect(nullRes.statusCode).toBe(204);
    expect(nullRes.message).toBe('Success');
    expect(nullRes.data).toBeNull();
  });
});
