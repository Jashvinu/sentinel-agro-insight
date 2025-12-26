# Evergreen Account Setup Guide

This guide explains how to create the `evergreen@gmail.com` account and assign evergreen farms to it.

## 📋 Prerequisites

You'll need your **Supabase Service Role Key** for admin operations:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Project Settings** → **API**
4. Copy the **`service_role`** key (⚠️ Keep this secret! Never commit it to git)

## 🚀 Method 1: Automated Setup (Recommended)

### Option A: Create User + Assign Farms (All-in-one)

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here \
npx tsx scripts/setup-evergreen-account.ts
```

This script will:
1. ✅ Check if `evergreen@gmail.com` exists, create if needed
2. ✅ Find all farms with "evergreen" in the name
3. ✅ Assign those farms to the evergreen account
4. ✅ Verify the assignment

### Option B: Assign Farms to Existing User

If the user already exists, you can just assign farms:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here \
USER_EMAIL=evergreen@gmail.com \
FARM_NAME_PATTERN=evergreen \
npx tsx scripts/assign-farms-to-user.ts
```

## 🔧 Method 2: Manual Setup via Supabase Dashboard

### Step 1: Create User Account

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add User** → **Create User**
3. Enter:
   - **Email**: `evergreen@gmail.com`
   - **Password**: `evergreen123`
   - ✅ **Auto Confirm User** (check this box)
4. Click **Create User**
5. Copy the **User ID** (UUID) - you'll need it in the next step

### Step 2: Update Farms in Database

1. Go to **Supabase Dashboard** → **Table Editor** → **farms**
2. Find farms with "evergreen" in the name
3. For each farm:
   - Click on the farm row
   - Edit the `user_id` field
   - Paste the User ID from Step 1
   - Save

### Step 3: Verify

1. Go to **Authentication** → **Users**
2. Click on `evergreen@gmail.com`
3. Check that the user exists and is confirmed

## 📝 Method 3: Using SQL Editor

If you prefer SQL, you can run this in **Supabase Dashboard** → **SQL Editor**:

```sql
-- Step 1: Create the user (if not exists)
-- Note: This requires admin access. Use Supabase Dashboard → Authentication instead.

-- Step 2: Get the user ID
-- Run this to find the user ID:
SELECT id, email FROM auth.users WHERE email = 'evergreen@gmail.com';

-- Step 3: Update farms (replace 'USER_ID_HERE' with the actual UUID from Step 2)
UPDATE farms 
SET user_id = 'USER_ID_HERE'
WHERE LOWER(name) LIKE '%evergreen%';

-- Step 4: Verify
SELECT id, name, user_id 
FROM farms 
WHERE user_id = 'USER_ID_HERE';
```

## ✅ Verification

After setup, verify everything works:

1. **Login Test:**
   - Go to your app's login page
   - Login with:
     - Email: `evergreen@gmail.com`
     - Password: `evergreen123`
   - You should see the evergreen farms in the dashboard

2. **Database Check:**
   ```sql
   SELECT f.id, f.name, f.user_id, u.email
   FROM farms f
   LEFT JOIN auth.users u ON f.user_id = u.id
   WHERE LOWER(f.name) LIKE '%evergreen%';
   ```

## 🔐 Security Notes

- ⚠️ **Never commit** the service role key to git
- ⚠️ **Never share** the service role key publicly
- ✅ Use environment variables for the key
- ✅ The service role key bypasses RLS policies (use carefully)

## 🐛 Troubleshooting

### "User already exists"
- The script will use the existing user
- No action needed

### "No farms found"
- Check farm names in the database
- Adjust `FARM_NAME_PATTERN` if needed
- The script will show all available farms

### "Permission denied"
- Make sure you're using the **service_role** key (not anon key)
- Check that RLS policies allow updates

### "RLS policy violation"
- The service role key should bypass RLS
- If issues persist, temporarily disable RLS for farms table (not recommended for production)

## 📧 Account Details

- **Email**: `evergreen@gmail.com`
- **Password**: `evergreen123`
- **Purpose**: Dummy account for evergreen farms

---

**Need help?** Check the main [AUTHENTICATION_SETUP.md](../AUTHENTICATION_SETUP.md) file.






