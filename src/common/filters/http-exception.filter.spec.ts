import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/v1/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('handles HttpException with string response', () => {
    filter.catch(
      new HttpException('Custom string error', HttpStatus.NOT_FOUND),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Custom string error',
        errors: null,
        path: '/api/v1/test',
      }),
    );
  });

  it('handles HttpException with array validation messages', () => {
    filter.catch(
      new BadRequestException(['email must be an email', 'body is required']),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: ['email must be an email', 'body is required'],
      }),
    );
  });

  it('handles HttpException with object response containing errors and fallback message', () => {
    filter.catch(
      new HttpException({ errors: { field: 'invalid' } }, HttpStatus.CONFLICT),
      host,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'Internal server error',
        errors: { field: 'invalid' },
      }),
    );

    filter.catch(
      new HttpException({ message: 'Forbidden resource' }, HttpStatus.FORBIDDEN),
      host,
    );
    expect(jsonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Forbidden resource',
        errors: null,
      }),
    );
  });

  it('handles generic Error instances as 500 Internal Server Error', () => {
    filter.catch(new Error('Database crashed'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database crashed',
        errors: null,
      }),
    );
  });

  it('handles non-Error unknown thrown values safely', () => {
    filter.catch('unexpected-primitive', host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        errors: null,
      }),
    );
  });
});
