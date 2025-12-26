/**
 * Test script to manually trigger water metrics sync
 * Useful for debugging and testing
 */

import { createClient } from '@supabase/supabase-js';

// Get API base URL from env
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co/functions/v1';
const API_ENDPOINTS = {
  agriculturalIndices: 'agricultural-indices'
};

function buildApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}/${path}`;
}

function getSupabaseFunctionHeaders(): Record<string, string> {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const headers: Record<string, string> = {};
  if (anonKey) {
    headers['apikey'] = anonKey;
    headers['Authorization'] = `Bearer ${anonKey}`;
  }
  return headers;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fetchWaterIndexFromAPI(
  farm: any,
  indexType: string,
  date: string
): Promise<any> {
  try {
    if (!farm.geometry) {
      console.error('Farm geometry is missing');
      return null;
    }

    const polygon = JSON.stringify(farm.geometry);
    const apiUrl = `${API_ENDPOINTS.agriculturalIndices}?index=${indexType}&polygon=${encodeURIComponent(polygon)}&start=${date}&end=${date}`;
    
    const headers = getSupabaseFunctionHeaders();
    const response = await fetch(buildApiUrl(apiUrl), {
      headers: Object.keys(headers).length > 0 ? headers : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Failed to fetch ${indexType} for ${date}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`API response for ${indexType} on ${date}:`, {
      hasSatellites: !!data.satellites,
      satellitesCount: data.satellites?.length || 0,
      hasMeanValue: data.mean_value !== undefined,
      firstSatMeanValue: data.satellites?.[0]?.mean_value
    });
    
    // Check satellites array
    if (data.satellites && Array.isArray(data.satellites) && data.satellites.length > 0) {
      const validSats = data.satellites.filter((s: any) => 
        s.mean_value !== null && s.mean_value !== undefined
      );
      
      if (validSats.length > 0) {
        const firstSat = validSats[0];
        return {
          mean_value: firstSat.mean_value,
          std_dev: firstSat.std_dev || 0,
          min_value: firstSat.min_value,
          max_value: firstSat.max_value,
        };
      }
    }
    
    // Fallback
    if (data.mean_value !== null && data.mean_value !== undefined) {
      return {
        mean_value: data.mean_value,
        std_dev: data.std_dev || 0,
        min_value: data.min_value,
        max_value: data.max_value,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching ${indexType} for ${date}:`, error);
    return null;
  }
}

async function testSync() {
  console.log('🧪 Testing Water Metrics Sync...\n');

  try {
    // Get first farm
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('id, name, geometry')
      .limit(1);

    if (farmsError || !farms || farms.length === 0) {
      console.error('❌ No farms found');
      return;
    }

    const farm = farms[0];
    console.log(`📋 Testing with farm: ${farm.name || farm.id}`);
    console.log(`   Has geometry: ${!!farm.geometry}\n`);

    // Test fetching one date
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - 1); // Yesterday
    const dateStr = testDate.toISOString().split('T')[0];

    console.log(`🔍 Testing API fetch for date: ${dateStr}`);
    console.log(`   Index: ndwi\n`);

    const apiData = await fetchWaterIndexFromAPI(farm, 'ndwi', dateStr);

    if (apiData) {
      console.log('✅ API returned data:');
      console.log(`   Mean value: ${apiData.mean_value}`);
      console.log(`   Std dev: ${apiData.std_dev}`);
      console.log(`   Min: ${apiData.min_value}`);
      console.log(`   Max: ${apiData.max_value}\n`);

      // Try to insert into cache
      console.log('💾 Testing cache insert...');
      const { data: inserted, error: insertError } = await supabase
        .from('water_metrics_cache')
        .insert({
          farm_id: farm.id,
          observation_date: dateStr,
          index_type: 'ndwi',
          mean_value: apiData.mean_value,
          std_dev: apiData.std_dev || 0,
          min_value: apiData.min_value,
          max_value: apiData.max_value,
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Cache insert failed:', insertError.message);
      } else {
        console.log('✅ Cache insert successful!');
        console.log(`   Inserted ID: ${inserted.id}\n`);

        // Verify it's in cache
        const { data: cached } = await supabase
          .from('water_metrics_cache')
          .select('*')
          .eq('farm_id', farm.id)
          .eq('observation_date', dateStr)
          .eq('index_type', 'ndwi')
          .single();

        if (cached) {
          console.log('✅ Verified in cache:');
          console.log(`   Mean value: ${cached.mean_value}`);
        }
      }
    } else {
      console.log('⚠️  API returned no data');
      console.log('   This might be normal if no satellite data is available for this date');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testSync();

