/**
 * Script to apply water_metrics_cache table migration
 * 
 * Usage: npx tsx scripts/apply-water-metrics-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('   Get it from: Supabase Dashboard → Project Settings → API → service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('📦 Applying water_metrics_cache migration...\n');

  try {
    // Read migration file
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20250113000000_create_water_metrics_cache.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('1️⃣ Executing migration SQL...');
    
    // Execute migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // Try direct SQL execution
      console.log('   Trying alternative method...');
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ sql: migrationSQL }),
      });

      if (!response.ok) {
        console.error('❌ Migration failed. Please apply manually via Supabase Dashboard SQL Editor.');
        console.error('\n📝 Steps:');
        console.error('1. Go to Supabase Dashboard → SQL Editor');
        console.error('2. Copy the SQL from: supabase/migrations/20250113000000_create_water_metrics_cache.sql');
        console.error('3. Paste and run it');
        process.exit(1);
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('\n📊 Table created: water_metrics_cache');
    console.log('   - Stores 14 days of water metrics per farm');
    console.log('   - Auto-cleans data older than 14 days');
    console.log('   - RLS policies enabled');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\n📝 Please apply migration manually:');
    console.error('   1. Go to Supabase Dashboard → SQL Editor');
    console.error('   2. Copy SQL from: supabase/migrations/20250113000000_create_water_metrics_cache.sql');
    console.error('   3. Paste and execute');
    process.exit(1);
  }
}

main();







