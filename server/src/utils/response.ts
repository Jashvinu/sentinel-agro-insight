// Response Helpers for Express
import { Response } from 'express';

/**
 * Send a successful JSON response
 */
export function successResponse(res: Response, data: any, status: number = 200): void {
  res.status(status).json({
    success: true,
    ...data,
  });
}

/**
 * Send an error JSON response
 */
export function errorResponse(
  res: Response,
  message: string,
  status: number = 500,
  error?: any
): void {
  const response: any = {
    success: false,
    error: message,
  };

  if (error instanceof Error) {
    response.details = error.message;
  } else if (error) {
    response.details = error;
  }

  res.status(status).json(response);
}
