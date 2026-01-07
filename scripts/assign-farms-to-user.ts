/**
 * Script to assign farms to an existing user
 * This script updates farms to belong to a specific user_id
 * 
 * Usage: 
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
 *   USER_EMAIL=evergreen@gmail.com \
 *   FARM_NAME_PATTERN=evergreen \
 *   npx tsx scripts/assign-farms-to-user.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const userEmail = process.env.USER_EMAIL || 'evergreen@gmail.com';
const farmNamePattern = process.env.FARM_NAME_PATTERN || 'evergreen';

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('   Get it from: Supabase Dashboard → Project Settings → API');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log(`🔧 Assigning farms matching "${farmNamePattern}" to ${userEmail}...\n`);

  try {
    // Step 1: Find user
    console.log('1️⃣ Finding user...');
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) throw userError;

    const user = users.users.find(u => u.email === userEmail);
    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      console.error('\n   Please create the user first, or check the email address.');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.id} (${user.email})`);

    // Step 2: Find farms
    console.log(`\n2️⃣ Finding farms matching "${farmNamePattern}"...`);
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('id, name, user_id')
      .ilike('name', `%${farmNamePattern}%`);

    if (farmsError) throw farmsError;

    if (!farms || farms.length === 0) {
      console.log(`⚠️  No farms found matching "${farmNamePattern}"`);
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
      console.log(`   - ${f.name} (${f.id}) - Current user_id: ${f.user_id || 'null'}`);
    });

    // Step 3: Update farms
    console.log(`\n3️⃣ Assigning farms to ${userEmail}...`);
    const farmIds = farms.map(f => f.id);
    
    const { data: updated, error: updateError } = await supabase
      .from('farms')
      .update({ user_id: user.id })
      .in('id', farmIds)
      .select('id, name, user_id');

    if (updateError) throw updateError;

    console.log(`✅ Successfully assigned ${updated?.length || 0} farm(s):`);
    updated?.forEach(f => {
      console.log(`   - ${f.name} (${f.id})`);
    });

    console.log('\n🎉 Done!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();







