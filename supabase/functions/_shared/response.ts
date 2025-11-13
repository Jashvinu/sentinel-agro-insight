// Shared response helpers for Edge Functions
import { corsHeaders } from './cors.ts';

export function successResponse(data: any, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

export function errorResponse(message: string, status = 500, error?: any): Response {
  return new Response(
    JSON.stringify({
      success: false,
      message,
      error: error?.toString(),
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}




