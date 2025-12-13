// Shared response utilities for Supabase Edge Functions

import { corsHeaders } from './cors.ts';

export function successResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify({
      success: true,
      ...data,
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

export function errorResponse(
  message: string,
  status: number = 500,
  error?: any
): Response {
  const response: any = {
    success: false,
    error: message,
  };

  if (error) {
    response.details = error instanceof Error ? error.message : String(error);
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
