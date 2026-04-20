import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase URL or Publishable Key is not configured' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const PRIMARY_ADMIN_EMAIL = 'nopanat.aplus@gmail.com';
    if (user.email?.toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: Only primary admin can invite users' }, { status: 403 });
    }

    const body = await request.json();
    const { email, fullName } = body;

    if (!email || !fullName) {
      return NextResponse.json({ error: 'Email and Full Name are required' }, { status: 400 });
    }

    // Invite the user
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName }
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUser = inviteData.user;

    if (invitedUser) {
      // Upsert into admin_profiles to pre-approve them
      const { error: profileError } = await supabaseAdmin
        .from('admin_profiles')
        .upsert({
          id: invitedUser.id,
          email: invitedUser.email,
          full_name: fullName,
          status: 'approved',
        });

      if (profileError) {
         console.warn('Failed to pre-approve profile:', profileError);
      }
    }

    return NextResponse.json({ success: true, user: invitedUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
