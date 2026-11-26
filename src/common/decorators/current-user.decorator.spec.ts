import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CurrentUser } from './current-user.decorator.js';

function getParamDecoratorFactory() {
  class TestController {
    handler(@CurrentUser() _user: unknown) {
      return _user;
    }
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    'handler',
  );
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser decorator', () => {
  const factory = getParamDecoratorFactory();

  const createContext = (user?: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('returns null when request.user is undefined', () => {
    expect(factory(undefined, createContext(undefined))).toBeNull();
  });

  it('returns full user payload when no field key is specified', () => {
    const user = { id: 'u-1', email: 'a@b.com', username: 'alice' };
    expect(factory(undefined, createContext(user))).toEqual(user);
  });

  it('returns specific user property when field key is provided', () => {
    const user = { id: 'u-1', email: 'a@b.com', username: 'alice' };
    expect(factory('username', createContext(user))).toBe('alice');
  });
});
