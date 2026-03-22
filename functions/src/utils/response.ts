/**
 * Response Utilities for Express routes
 */

import { Response } from 'express';

/**
 * Send a success response
 */
export function successResponse(res: Response, data: any, statusCode: number = 200) {
    return res.status(statusCode).json({
        success: true,
        ...data,
    });
}

/**
 * Send an error response
 */
export function errorResponse(res: Response, message: string, statusCode: number = 500) {
    return res.status(statusCode).json({
        success: false,
        error: { message },
    });
}
