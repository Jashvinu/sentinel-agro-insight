#!/usr/bin/env tsx
/**
 * Script to fetch agricultural indices for Abe's farm
 * 
 * Usage: npx tsx scripts/fetch-indices-for-abe-farm.ts [index_type]
 * 
 * Example: npx tsx scripts/fetch-indices-for-abe-farm.ts ndvi
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const apiBaseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:54321/functions/v1';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ABE_FARM_ID = '970cfcb9-6332-486a-9562-1180f2a5478a';
const INDEX_TYPES = ['ndvi', 'evi', 'savi', 'msavi', 'ndwi', 'nitrogen', 'phosphorus', 'potassium', 'salinity', 'carbon', 'sar_moisture'];

async function getFarmGeometry(farmId: string) {
  const { data, error } = await supabase
    .from('farms')
    .select('geometry, name')
    .eq('id', farmId)
    .single();
  
  if (error || !data) {
    throw new Error(`Farm not found: ${farmId}`);
  }
  
  return { geometry: data.geometry, name: data.name };
}

async function fetchIndices(farmId: string, indexType: string = 'ndvi') {
  try {
    console.log(`\n📡 Fetching ${indexType.toUpperCase()} indices for Abe's farm...`);
    
    // Get farm geometry
    const { geometry, name } = await getFarmGeometry(farmId);
    console.log(`   Farm: ${name}`);
    
    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`   Date range: ${startStr} to ${endStr}`);
    
    // Build API URL
    const polygonParam = encodeURIComponent(JSON.stringify(geometry));
    const apiUrl = `${apiBaseUrl}/agricultural-indices?index=${indexType}&polygon=${polygonParam}&start=${startStr}&end=${endStr}`;
    
    console.log(`   Calling API: ${apiBaseUrl}/agricultural-indices`);
    
    // Fetch indices
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log(`\n✅ Successfully fetched ${indexType.toUpperCase()} indices!`);
    console.log(`   Mean value: ${data.mean_value ?? 'N/A'}`);
    console.log(`   Min value: ${data.min_value ?? 'N/A'}`);
    console.log(`   Max value: ${data.max_value ?? 'N/A'}`);
    console.log(`   Std dev: ${data.std_dev ?? 'N/A'}`);
    console.log(`   Cloud cover: ${data.cloudCover ?? 'N/A'}%`);
    if (data.satellites) {
      console.log(`   Satellites: ${data.satellites.join(', ')}`);
    }
    
    return data;
  } catch (error: any) {
    console.error(`\n❌ Error fetching ${indexType}:`, error.message);
    return null;
  }
}

async function main() {
  const indexType = process.argv[2] || 'ndvi';
  
  if (!INDEX_TYPES.includes(indexType.toLowerCase())) {
    console.error(`❌ Invalid index type: ${indexType}`);
    console.error(`   Available types: ${INDEX_TYPES.join(', ')}`);
    process.exit(1);
  }
  
  console.log('🌾 Fetching agricultural indices for Abe\'s farm');
  console.log(`   Farm ID: ${ABE_FARM_ID}`);
  console.log(`   Index type: ${indexType}`);
  
  await fetchIndices(ABE_FARM_ID, indexType.toLowerCase());
  
  console.log('\n💡 To fetch other indices, run:');
  console.log(`   npx tsx scripts/fetch-indices-for-abe-farm.ts <index_type>`);
  console.log(`   Available: ${INDEX_TYPES.join(', ')}\n`);
}

main();
















