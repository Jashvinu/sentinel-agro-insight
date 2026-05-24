import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  hashEmbedding,
  normalizeChunk,
  rankFallbackChunks,
  vectorToPg,
  type FarmTelemetryContext,
  type RagChunk,
  type RagRequest,
} from './rag-core.ts';

export async function retrieveRagChunks(
  supabase: SupabaseClient,
  request: RagRequest,
  context: FarmTelemetryContext | null,
): Promise<{ chunks: RagChunk[]; source: 'supabase' | 'fallback'; error?: string }> {
  const topK = Math.max(2, Math.min(request.top_k ?? 8, 16));
  const query = [
    request.question,
    request.crop,
    request.season,
    request.region ?? 'maharashtra',
    ...(request.constraints ?? []),
  ].join(' ');
  const filter = {
    crop: request.crop,
    season: request.season,
    region: (request.region ?? 'maharashtra').toLowerCase(),
  };

  try {
    const { data, error } = await supabase.rpc('match_rag_chunks', {
      p_query_embedding: vectorToPg(hashEmbedding(query)),
      p_query_text: query,
      p_match_count: topK,
      p_filter: filter,
    });

    if (error) {
      throw new Error(error.message);
    }

    const chunks = (data ?? []).map((row: Record<string, unknown>) => normalizeChunk(row));
    if (chunks.length > 0) {
      return { chunks, source: 'supabase' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      chunks: rankFallbackChunks(request, context, topK),
      source: 'fallback',
      error: message,
    };
  }

  return { chunks: rankFallbackChunks(request, context, topK), source: 'fallback' };
}
