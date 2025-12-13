/**
 * Confirm evergreen user account (bypass email confirmation)
 * Requires SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('   Get it from: Supabase Dashboard → Project Settings → API → service_role key');
  console.error('\n   Then run:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-key npx tsx scripts/confirm-evergreen-user.ts');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const EMAIL = 'evergreen@gmail.com';

async function main() {
  console.log('🌲 Confirming evergreen account...\n');

  try {
    // Find user
    console.log('1️⃣ Finding user...');
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;

    const user = users.users.find(u => u.email === EMAIL);
    if (!user) {
      console.error(`❌ User not found: ${EMAIL}`);
      console.error('   Please create the user first using: npx tsx scripts/create-evergreen-user-quick.ts');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.id}`);
    console.log(`   Email confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);

    if (user.email_confirmed_at) {
      console.log('✅ User is already confirmed!');
    } else {
      // Confirm the user
      console.log('\n2️⃣ Confirming user email...');
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { email_confirm: true }
      );

      if (updateError) throw updateError;

      console.log('✅ User confirmed successfully!');
    }

    // Assign farms
    console.log('\n3️⃣ Assigning evergreen farms...');
    const { data: farms, error: farmsError } = await supabase
      .from('farms')
      .select('id, name, user_id')
      .ilike('name', '%evergreen%');

    if (farmsError) {
      console.warn('⚠️  Error fetching farms:', farmsError.message);
    } else if (farms && farms.length > 0) {
      const farmIds = farms.map(f => f.id);
      const { data: updated, error: updateError } = await supabase
        .from('farms')
        .update({ user_id: user.id })
        .in('id', farmIds)
        .select('id, name');

      if (updateError) {
        console.warn('⚠️  Error updating farms:', updateError.message);
      } else {
        console.log(`✅ Assigned ${updated?.length || 0} farm(s) to evergreen account:`);
        updated?.forEach(f => console.log(`   - ${f.name}`));
      }
    } else {
      console.log('⚠️  No farms found with "evergreen" in the name');
    }

    console.log('\n🎉 Done! You can now log in with:');
    console.log(`   Email: ${EMAIL}`);
    console.log(`   Password: evergreen123`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

