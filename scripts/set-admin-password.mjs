import { createClient } from '@supabase/supabase-js';

const DEFAULT_ADMIN_EMAIL = 'nopanat.aplus@gmail.com';

function printUsage() {
  console.log(`
Usage:
  npm run admin:set-password -- <new-password>
  npm run admin:set-password -- <new-password> --email someone@example.com

Required environment variables:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional environment variables:
  ADMIN_EMAIL
`.trim());
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function looksLikePlaceholder(value) {
  return (
    value.includes('ใส่') ||
    value.includes('service role key จริง') ||
    value.toLowerCase().includes('your-service-role-key')
  );
}

async function main() {
  const newPassword = process.argv[2];
  const requestedEmail = readArg('--email');

  if (!newPassword || newPassword.startsWith('--')) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters long.');
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = (requestedEmail || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

  if (!supabaseUrl) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL.');
    process.exitCode = 1;
    return;
  }

  if (!serviceRoleKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
    process.exitCode = 1;
    return;
  }

  if (looksLikePlaceholder(serviceRoleKey)) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is still a placeholder text. Replace it with the real service role key from Supabase > Project Settings > API.');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error(`Failed to list users: ${listError.message}`);
    process.exitCode = 1;
    return;
  }

  const existingUser = usersData.users.find((user) => user.email?.toLowerCase() === email);

  if (existingUser) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: newPassword,
      email_confirm: true,
    });

    if (updateError) {
      console.error(`Failed to update password for ${email}: ${updateError.message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Password updated successfully for ${email}.`);
    return;
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password: newPassword,
    email_confirm: true,
  });

  if (createError) {
    console.error(`Failed to create admin user ${email}: ${createError.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Admin user created successfully for ${email}.`);
}

await main();
