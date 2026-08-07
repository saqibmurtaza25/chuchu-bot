import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../logging/LoggerService';

/**
 * Base Application Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;
  public readonly details?: Record<string, any>;

  constructor(message: string, statusCode: number = 500, errorCode: string = 'INTERNAL_ERROR', isOperational: boolean = true, details?: Record<string, any>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource Not Found') {
    super(message, 404, 'NOT_FOUND', true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate Limit Exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
  }
}

export class WebSocketError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 502, 'WEBSOCKET_ERROR', true, details);
  }
}

/**
 * Global Express Error Handling Middleware
 */
export function errorHandlerMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  const logger = LoggerService.getInstance();

  if (err instanceof AppError) {
    logger.warn('ErrorHandlerMiddleware', `Operational Error [${err.statusCode}]: ${err.message}`, {
      code: err.errorCode,
      path: req.path,
      details: err.details
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || null,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  // Unhandled internal server errors
  logger.error('ErrorHandlerMiddleware', `Unhandled Fatal Error: ${err.message}`, err, { path: req.path });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
      timestamp: new Date().toISOString()
    }
  });
}
