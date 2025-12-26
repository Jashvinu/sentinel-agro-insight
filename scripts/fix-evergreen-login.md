# Fix Evergreen Login Issue

The account `evergreen@gmail.com` has been created, but you're getting "Invalid login credentials". This is likely because **email confirmation is required** in Supabase.

## Quick Fix Options

### Option 1: Disable Email Confirmation (Easiest)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **Settings**
4. Find **"Enable email confirmations"**
5. **Turn it OFF**
6. Try logging in again

### Option 2: Confirm Email Manually (If you have service role key)

Run this script to confirm the user:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://udbnskydigoqpxmmduvr.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: users } = await supabase.auth.admin.listUsers();
const user = users.users.find(u => u.email === 'evergreen@gmail.com');
if (user) {
  await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
  console.log('✅ User confirmed!');
} else {
  console.log('❌ User not found');
}
"
```

### Option 3: Check Email (If confirmation emails are working)

1. Check the inbox for `evergreen@gmail.com`
2. Look for a confirmation email from Supabase
3. Click the confirmation link
4. Try logging in again

## Verify Account Status

After fixing, you should be able to:
- ✅ Login with `evergreen@gmail.com` / `evergreen123`
- ✅ See evergreen farms in the dashboard

## Assign Farms (If not done automatically)

If farms weren't assigned automatically, run:

```bash
VITE_SUPABASE_URL=https://udbnskydigoqpxmmduvr.supabase.co \
VITE_SUPABASE_ANON_KEY=your-anon-key \
npx tsx scripts/assign-farms-to-user.ts
```

Or manually via Supabase Dashboard:
1. Go to **Table Editor** → **farms**
2. Find farms with "evergreen" in name
3. Update `user_id` to: `39682409-670b-4367-b4d3-14eaa011470a`






