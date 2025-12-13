/**
 * Assign evergreen farms to the evergreen user account
 * This script signs in as evergreen user and assigns farms
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('🌲 Assigning evergreen farms...\n');

  try {
    // Sign in as evergreen user
    console.log('1️⃣ Signing in as evergreen user...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'evergreen@gmail.com',
      password: 'evergreen123',
    });

    if (signInError) {
      console.error('❌ Sign in failed:', signInError.message);
      console.error('\n⚠️  This usually means:');
      console.error('   1. Email confirmation is required');
      console.error('   2. Account is not confirmed yet');
      console.error('\n💡 Solution: Disable email confirmation in Supabase Dashboard:');
      console.error('   Authentication → Settings → Enable email confirmations (OFF)');
      process.exit(1);
    }

    if (!signInData.user) {
      console.error('❌ No user data returned');
      process.exit(1);
    }

    console.log(`✅ Signed in successfully! User ID: ${signInData.user.id}`);

    // Find evergreen farms
    console.log('\n2️⃣ Finding evergreen farms...');
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('id, name, user_id')
      .ilike('name', '%evergreen%');

    if (farmsError) {
      console.error('❌ Error fetching farms:', farmsError.message);
      throw farmsError;
    }

    if (!farms || farms.length === 0) {
      console.log('⚠️  No farms found with "evergreen" in the name.');
      console.log('\n   Available farms:');
      const { data: allFarms } = await supabase
        .from('farms')
        .select('id, name, user_id')
        .limit(20);
      allFarms?.forEach(f => {
        console.log(`   - ${f.name} (user_id: ${f.user_id || 'null'})`);
      });
      return;
    }

    console.log(`✅ Found ${farms.length} farm(s):`);
    farms.forEach(f => {
      console.log(`   - ${f.name} (${f.id})`);
    });

    // Assign farms
    console.log('\n3️⃣ Assigning farms to evergreen account...');
    const farmIds = farms.map(f => f.id);
    
    const { data: updated, error: updateError } = await supabase
      .from('farms')
      .update({ user_id: signInData.user.id })
      .in('id', farmIds)
      .select('id, name, user_id');

    if (updateError) {
      console.error('❌ Error updating farms:', updateError.message);
      throw updateError;
    }

    console.log(`✅ Successfully assigned ${updated?.length || 0} farm(s):`);
    updated?.forEach(f => {
      console.log(`   - ${f.name}`);
    });

    console.log('\n🎉 Done! Evergreen account is ready.');
    console.log('\n📧 Login credentials:');
    console.log('   Email: evergreen@gmail.com');
    console.log('   Password: evergreen123');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

