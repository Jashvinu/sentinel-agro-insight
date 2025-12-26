import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env file manually
const envPath = join(process.cwd(), '.env');
try {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      process.env[key.trim()] = value;
    }
  });
} catch (error) {
  console.warn('⚠️ Could not load .env file, using existing environment variables');
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nSet them in your .env file:');
  console.error('VITE_SUPABASE_URL=your_url');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function forceWaterSync() {
  try {
    console.log('🔄 Force syncing water metrics cache using service role...');

    // Get all farms
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('*');

    if (farmsError) {
      console.error('❌ Failed to fetch farms:', farmsError.message);
      return;
    }

    console.log(`📊 Found ${farms?.length || 0} farms`);

    if (!farms || farms.length === 0) {
      console.log('No farms to sync');
      return;
    }

    // For each farm, get observation dates and populate cache
    for (const farm of farms) {
      console.log(`\n🌾 Processing farm: ${farm.name || farm.id}`);

      // Get observation dates
      const { data: observations, error: obsError } = await supabase
        .from('satellite_observations')
        .select('observation_date')
        .eq('farm_id', farm.id)
        .order('observation_date', { ascending: false })
        .limit(14);

      if (obsError) {
        console.error(`  ❌ Failed to fetch observations: ${obsError.message}`);
        continue;
      }

      if (!observations || observations.length === 0) {
        console.log(`  ⚠️ No observations found. Run sync-satellite-dates first.`);
        continue;
      }

      console.log(`  📅 Found ${observations.length} observation dates`);

      // Check which dates need water metrics
      const { data: cachedData } = await supabase
        .from('water_metrics_cache')
        .select('*')
        .eq('farm_id', farm.id);

      const cached = cachedData || [];
      console.log(`  💾 Currently cached: ${cached.length} records`);

      // Find missing dates
      let fetchCount = 0;
      let errorCount = 0;

      for (const obs of observations) {
        const date = obs.observation_date;
        
        // Check if we have all 3 indices for this date
        const hasNdwi = cached.some(c => c.observation_date === date && c.index_type === 'ndwi');
        const hasMoisture = cached.some(c => c.observation_date === date && c.index_type === 'moisture');
        const hasSarMoisture = cached.some(c => c.observation_date === date && c.index_type === 'sar_moisture');

        if (hasNdwi && hasMoisture && hasSarMoisture) {
          console.log(`  ✓ ${date} - all indices cached`);
          continue;
        }

        console.log(`  🔍 ${date} - fetching missing indices...`);

        // Fetch each missing index
        const indices: Array<'ndwi' | 'moisture' | 'sar_moisture'> = ['ndwi', 'moisture', 'sar_moisture'];
        
        for (const indexType of indices) {
          const hasCached = cached.some(c => c.observation_date === date && c.index_type === indexType);
          if (hasCached) {
            console.log(`    ✓ ${indexType} already cached`);
            continue;
          }

          try {
            // Fetch from API
            const polygon = JSON.stringify(farm.geometry);
            const targetDate = new Date(date);
            const startDate = new Date(targetDate);
            startDate.setDate(targetDate.getDate() - 2);
            const endDate = new Date(targetDate);
            endDate.setDate(targetDate.getDate() + 2);

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const apiUrl = `${SUPABASE_URL}/functions/v1/agricultural-indices?index=${indexType}&polygon=${encodeURIComponent(polygon)}&start=${startStr}&end=${endStr}`;

            const response = await fetch(apiUrl, {
              headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              }
            });

            if (!response.ok) {
              if (response.status === 404) {
                console.log(`    ℹ️ ${indexType} - no imagery available (404)`);
              } else {
                console.log(`    ⚠️ ${indexType} - API error ${response.status}`);
              }
              errorCount++;
              continue;
            }

            const data = await response.json();
            
            // Extract mean_value from response
            let meanValue: number | null = null;
            let stdDev: number | null = null;
            let minValue: number | null = null;
            let maxValue: number | null = null;

            if (data.satellites && data.satellites.length > 0) {
              const satData = data.satellites[0];
              meanValue = satData.mean_value ?? satData.meanValue ?? null;
              stdDev = satData.std_dev ?? satData.stdDev ?? 0;
              minValue = satData.min_value ?? satData.minValue ?? null;
              maxValue = satData.max_value ?? satData.maxValue ?? null;
            } else {
              meanValue = data.mean_value ?? data.meanValue ?? null;
              stdDev = data.std_dev ?? data.stdDev ?? 0;
              minValue = data.min_value ?? data.minValue ?? null;
              maxValue = data.max_value ?? data.maxValue ?? null;
            }

            if (meanValue === null) {
              console.log(`    ⚠️ ${indexType} - no mean value in response`);
              errorCount++;
              continue;
            }

            // Insert into cache
            const { error: insertError } = await supabase
              .from('water_metrics_cache')
              .insert({
                farm_id: farm.id,
                observation_date: date,
                index_type: indexType,
                mean_value: meanValue,
                std_dev: stdDev || 0,
                min_value: minValue,
                max_value: maxValue,
              });

            if (insertError) {
              console.log(`    ❌ ${indexType} - cache insert failed: ${insertError.message}`);
              errorCount++;
            } else {
              console.log(`    ✅ ${indexType} - cached (mean: ${meanValue.toFixed(3)})`);
              fetchCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error: any) {
            console.log(`    ❌ ${indexType} - error: ${error.message}`);
            errorCount++;
          }
        }
      }

      console.log(`  📊 Farm complete: ${fetchCount} records cached, ${errorCount} errors`);
    }

    console.log('\n✅ Water metrics sync complete!');
    console.log('🔄 Refresh your browser to see the updated Water Distribution card');
  } catch (error: any) {
    console.error('❌ Sync failed:', error.message);
  }
}

forceWaterSync();

