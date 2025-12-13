/**
 * Script to create evergreen@gmail.com account and assign evergreen farms to it
 * 
 * Usage: 
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
 *   npx tsx scripts/setup-evergreen-account.ts
 */

import { createClient } from '@supabase/supabase-js';

// Get from environment or use default project
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('❌ Missing SUPABASE_URL');
  console.error('   Please set VITE_SUPABASE_URL or SUPABASE_URL');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not found.');
  console.warn('   Will attempt to use signup API (requires email confirmation disabled)');
  console.warn('   For admin operations, set SUPABASE_SERVICE_ROLE_KEY in environment\n');
}

// Create Supabase client with service role key (for admin operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const EMAIL = 'evergreen@gmail.com';
const PASSWORD = 'evergreen123';

async function main() {
  console.log('🌲 Setting up Evergreen account...\n');

  try {
    let userId: string;

    if (supabaseServiceKey) {
      // Use admin API if service role key is available
      console.log('1️⃣ Checking if user exists (admin mode)...');
      const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) {
        console.error('❌ Error listing users:', listError.message);
        throw listError;
      }

      const existingUser = existingUsers.users.find(u => u.email === EMAIL);

      if (existingUser) {
        console.log(`✅ User already exists: ${existingUser.id}`);
        userId = existingUser.id;
      } else {
        // Step 2: Create the user using admin API
        console.log('2️⃣ Creating new user account (admin mode)...');
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: EMAIL,
          password: PASSWORD,
          email_confirm: true, // Auto-confirm email
        });

        if (createError) {
          console.error('❌ Error creating user:', createError.message);
          throw createError;
        }

        if (!newUser.user) {
          throw new Error('User creation returned no user data');
        }

        console.log(`✅ User created: ${newUser.user.id}`);
        userId = newUser.user.id;
      }
    } else {
      console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY is required for this operation.');
      console.error('   Please get your service role key from:');
      console.error('   Supabase Dashboard → Project Settings → API → service_role key');
      console.error('\n   Then run:');
      console.error(`   SUPABASE_SERVICE_ROLE_KEY=your-key-here npx tsx scripts/setup-evergreen-account.ts\n`);
      process.exit(1);
    }

    // Step 3: Find evergreen farms
    console.log('\n3️⃣ Finding evergreen farms...');
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
      console.log('   Available farms:');
      const { data: allFarms } = await supabase
        .from('farms')
        .select('id, name, user_id')
        .limit(10);
      allFarms?.forEach(farm => {
        console.log(`   - ${farm.name} (${farm.id})`);
      });
      return;
    }

    console.log(`✅ Found ${farms.length} evergreen farm(s):`);
    farms.forEach(farm => {
      console.log(`   - ${farm.name} (${farm.id}) - Current user_id: ${farm.user_id || 'null'}`);
    });

    // Step 4: Update farms to assign to evergreen user
    console.log('\n4️⃣ Assigning farms to evergreen account...');
    const farmIds = farms.map(f => f.id);
    
    const { data: updatedFarms, error: updateError } = await supabase
      .from('farms')
      .update({ user_id: userId })
      .in('id', farmIds)
      .select('id, name, user_id');

    if (updateError) {
      console.error('❌ Error updating farms:', updateError.message);
      throw updateError;
    }

    console.log(`✅ Successfully assigned ${updatedFarms?.length || 0} farm(s) to evergreen account:`);
    updatedFarms?.forEach(farm => {
      console.log(`   - ${farm.name} (${farm.id})`);
    });

    // Step 5: Verify
    console.log('\n5️⃣ Verifying assignment...');
    const { data: verifyFarms } = await supabase
      .from('farms')
      .select('id, name, user_id')
      .eq('user_id', userId);

    console.log(`✅ Verified: ${verifyFarms?.length || 0} farm(s) now belong to evergreen account`);

    console.log('\n🎉 Setup complete!');
    console.log(`\n📧 Login credentials:`);
    console.log(`   Email: ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`\n🔗 Login at: ${supabaseUrl.replace('/rest/v1', '')}/auth/v1/authorize`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

