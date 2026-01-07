/**
 * Quick script to create evergreen user via public signup API
 * This doesn't require service role key, but email confirmation must be disabled
 * 
 * Usage: npx tsx scripts/create-evergreen-user-quick.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY is required');
  console.error('   Get it from: Supabase Dashboard → Project Settings → API → anon public key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const EMAIL = 'evergreen@gmail.com';
const PASSWORD = 'evergreen123';

async function main() {
  console.log('🌲 Creating evergreen account...\n');

  try {
    // Try to sign up
    console.log('1️⃣ Attempting to create account...');
    const { data, error } = await supabase.auth.signUp({
      email: EMAIL,
      password: PASSWORD,
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        console.log('✅ Account already exists!');
        console.log('\n   Trying to sign in to verify...');
        
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: EMAIL,
          password: PASSWORD,
        });

        if (signInError) {
          console.error('❌ Sign in failed:', signInError.message);
          console.error('\n   Possible issues:');
          console.error('   - Email confirmation required (check your email)');
          console.error('   - Wrong password');
          console.error('   - Account disabled');
          process.exit(1);
        }

        console.log('✅ Sign in successful! Account is ready.');
        console.log(`   User ID: ${signInData.user?.id}`);
      } else {
        console.error('❌ Error creating account:', error.message);
        console.error('\n   Possible solutions:');
        console.error('   1. Disable email confirmation in Supabase Dashboard');
        console.error('      Authentication → Settings → Enable email confirmations (OFF)');
        console.error('   2. Use the service role key method instead:');
        console.error('      SUPABASE_SERVICE_ROLE_KEY=key npx tsx scripts/setup-evergreen-account.ts');
        process.exit(1);
      }
    } else if (data.user) {
      console.log('✅ Account created successfully!');
      console.log(`   User ID: ${data.user.id}`);
      
      if (!data.session) {
        console.log('\n⚠️  Email confirmation may be required.');
        console.log('   Check your email or disable email confirmation in Supabase Dashboard.');
      } else {
        console.log('✅ Session created - ready to use!');
      }
    }

    console.log('\n📧 Login credentials:');
    console.log(`   Email: ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log('\n🎉 Done! You can now log in.');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();







