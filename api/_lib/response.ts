/**
 * Response Utilities for Vercel API Routes
 */

import type { VercelResponse } from '@vercel/node';

/**
 * Send a success response
 */
export function successResponse(res: VercelResponse, data: Record<string, unknown>, statusCode: number = 200) {
    return res.status(statusCode).json({
        success: true,
        ...data,
    });
}

/**
 * Send an error response
 */
export function errorResponse(res: VercelResponse, message: string, statusCode: number = 500) {
    return res.status(statusCode).json({
        success: false,
        error: { message },
    });
}
