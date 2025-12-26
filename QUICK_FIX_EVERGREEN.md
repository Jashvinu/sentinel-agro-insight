# Quick Fix: Evergreen Account Login

The `evergreen@gmail.com` account exists but needs email confirmation. Since it's a fake email, here are the quickest ways to fix it:

## Option 1: Disable Email Confirmation (Fastest - 2 minutes)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **Settings** (or **Providers** → **Email**)
4. Find **"Enable email confirmations"** or **"Confirm email"**
5. **Turn it OFF** ✅
6. Save changes
7. Try logging in again with:
   - Email: `evergreen@gmail.com`
   - Password: `evergreen123`

**This will work immediately!** ✅

## Option 2: Confirm User via Admin API (If you have service role key)

Run this command (replace `YOUR_SERVICE_ROLE_KEY`):

```bash
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
npx tsx scripts/confirm-evergreen-user.ts
```

This will:
- ✅ Confirm the evergreen user
- ✅ Assign evergreen farms to the account

## Option 3: Manual Confirmation via Dashboard

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Find `evergreen@gmail.com`
3. Click on the user
4. Click **"Confirm email"** or toggle **"Email confirmed"** to ON
5. Save

## After Fixing

Once email confirmation is disabled or the user is confirmed:
- ✅ Login will work immediately
- ✅ You'll be redirected to the dashboard
- ✅ Evergreen farms will be visible (if assigned)

## Need Help?

If you can't access Supabase Dashboard, you can:
1. Share your `SUPABASE_SERVICE_ROLE_KEY` (keep it secret!)
2. I'll run the confirmation script for you

---

**Recommended:** Use Option 1 (disable email confirmation) - it's the fastest and works for all future test accounts too!






