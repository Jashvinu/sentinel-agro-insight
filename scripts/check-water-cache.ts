/**
 * Script to check water_metrics_cache table and sync status
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('🔍 Checking Water Metrics Cache Status...\n');

  try {
    // Check if table exists
    console.log('1️⃣ Checking if water_metrics_cache table exists...');
    const { data: tableCheck, error: tableError } = await supabase
      .from('water_metrics_cache')
      .select('*')
      .limit(1);

    if (tableError) {
      if (tableError.code === '42P01') {
        console.error('❌ Table does not exist!');
        console.error('\n📝 Apply migration:');
        console.error('   1. Go to Supabase Dashboard → SQL Editor');
        console.error('   2. Run: supabase/migrations/20250113000000_create_water_metrics_cache.sql');
        process.exit(1);
      } else {
        console.error('❌ Error checking table:', tableError.message);
        process.exit(1);
      }
    }

    console.log('✅ Table exists');

    // Get farms
    console.log('\n2️⃣ Checking farms...');
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('id, name, geometry')
      .limit(10);

    if (farmsError) {
      console.error('❌ Error fetching farms:', farmsError.message);
      process.exit(1);
    }

    if (!farms || farms.length === 0) {
      console.log('⚠️  No farms found');
      process.exit(0);
    }

    console.log(`✅ Found ${farms.length} farm(s)`);

    // Check cache for each farm
    for (const farm of farms) {
      console.log(`\n3️⃣ Checking cache for farm: ${farm.name || farm.id}`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const { data: cache, error: cacheError } = await supabase
        .from('water_metrics_cache')
        .select('*')
        .eq('farm_id', farm.id)
        .gte('observation_date', cutoffDateStr)
        .order('observation_date', { ascending: false });

      if (cacheError) {
        console.error(`   ❌ Error: ${cacheError.message}`);
        continue;
      }

      const cacheCount = cache?.length || 0;
      console.log(`   📊 Cached records: ${cacheCount}`);

      if (cacheCount === 0) {
        console.log(`   ⚠️  No cached data - sync needed`);
      } else {
        const dates = new Set(cache?.map(c => c.observation_date) || []);
        const indices = new Set(cache?.map(c => c.index_type) || []);
        console.log(`   📅 Dates: ${dates.size} unique dates`);
        console.log(`   🔢 Index types: ${Array.from(indices).join(', ')}`);
        
        // Check if we have all 14 days
        const expectedDays = 14;
        if (dates.size < expectedDays) {
          console.log(`   ⚠️  Missing ${expectedDays - dates.size} days`);
        } else {
          console.log(`   ✅ All ${expectedDays} days cached`);
        }
      }
    }

    console.log('\n✅ Check complete!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();






