'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import Swal from 'sweetalert2';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import {
  fetchTickets,
  getCurrentAdminUser,
  getAdminProfile,
  createAdminProfile,
  fetchAdminProfiles,
  updateAdminProfileStatus,
  isSupabaseConfigured,
  isPrimaryAdmin,
  PRIMARY_ADMIN_EMAIL,
  requestAdminPasswordReset,
  signInAdmin,
  signInWithGoogle,
  signOutAdmin,
  subscribeToAdminAuthState,
  TicketRecord,
  TicketStatus,
  updateTicket,
  uploadImages,
  AdminProfile,
} from '../../lib/supabase';

function getAdminLoginMessage(error: unknown, t: (th: string, en: string) => string) {
  if (!(error instanceof Error)) {
    return t('กรุณาตรวจสอบอีเมล รหัสผ่าน และสถานะผู้ใช้ใน Supabase Auth', 'Please check email, password, and user status in Supabase Auth');
  }

  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return t('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือผู้ใช้นี้ยังไม่ได้ถูกสร้างใน Supabase Auth', 'Invalid email or password, or user not created in Supabase Auth');
  }

  if (message.includes('email logins are disabled') || message.includes('unsupported grant type')) {
    return t('ใน Supabase ยังไม่ได้เปิด Email provider กรุณาไปที่ Authentication > Sign In / Providers แล้วเปิด Email', 'Email provider is not enabled in Supabase. Go to Authentication > Sign In / Providers and enable Email.');
  }

  if (message.includes('email not confirmed')) {
    return t('บัญชีนี้ยังไม่ยืนยันอีเมล กรุณายืนยันอีเมลใน Supabase หรือปิด email confirmation ชั่วคราว', 'Email not confirmed. Please confirm email in Supabase or temporarily disable email confirmation.');
  }

  if (message.includes('email rate limit exceeded')) {
    return t('มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 'Too many login attempts. Please try again later.');
  }

  if (message.includes('ไม่มีสิทธิ์ผู้ดูแลระบบ') || message.includes('No admin privileges')) {
    return error.message;
  }

  return `${error.message} | ${t('ตรวจสอบว่าเปิด Email provider และสร้างผู้ใช้ผู้ดูแลด้วยอีเมล', 'Make sure Email provider is enabled and admin user is created with email')} ${PRIMARY_ADMIN_EMAIL}`;
}

function getStatusMeta(status: TicketStatus, t: (th: string, en: string) => string) {
  switch (status) {
    case 'Pending':
      return {
        label: t('รอดำเนินการ', 'Pending'),
        badgeClass: 'bg-amber-100 text-amber-700',
        cardClass: 'from-amber-50 to-white border-amber-200',
      };
    case 'Approved':
      return {
        label: t('กำลังทำ', 'In Progress'),
        badgeClass: 'bg-sky-100 text-sky-700',
        cardClass: 'from-sky-50 to-white border-sky-200',
      };
    case 'Completed':
      return {
        label: t('เสร็จสิ้น', 'Completed'),
        badgeClass: 'bg-emerald-100 text-emerald-700',
        cardClass: 'from-emerald-50 to-white border-emerald-200',
      };
    case 'Rejected':
      return {
        label: t('ไม่ผ่าน', 'Rejected'),
        badgeClass: 'bg-rose-100 text-rose-700',
        cardClass: 'from-rose-50 to-white border-rose-200',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-slate-100 text-slate-700',
        cardClass: 'from-slate-50 to-white border-slate-200',
      };
  }
}

function buildRankings(values: string[], total: number, t: (th: string, en: string) => string) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const key = value?.trim() || t('ไม่ระบุ', 'Unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function formatTicketDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [filter, setFilter] = useState<TicketStatus | 'All'>('Pending');
  
  // Profile system
  const [authProfile, setAuthProfile] = useState<AdminProfile | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [allProfiles, setAllProfiles] = useState<AdminProfile[]>([]);
  const [showAdminMgmt, setShowAdminMgmt] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Selection for edit
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [updateStatus, setUpdateStatus] = useState<TicketStatus>('Pending');
  const [updateFeedback, setUpdateFeedback] = useState('');
  const [updateAfterDetail, setUpdateAfterDetail] = useState('');
  const [newAfterImages, setNewAfterImages] = useState<File[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let cancelled = false;

    async function restoreSession() {
      try {
        const user = await getCurrentAdminUser();
        if (!cancelled) {
          setAuthUser(user);
          
          if (user) {
            const profile = await getAdminProfile(user.id);
            setAuthProfile(profile);

            const isAllowed = isPrimaryAdmin(user) || profile?.status === 'approved';
            
            if (isAllowed) {
              const data = await fetchTickets();
              if (!cancelled) setTickets(data);
              
              if (isPrimaryAdmin(user)) {
                const profiles = await fetchAdminProfiles();
                setAllProfiles(profiles);
              }
            }
          }
          setAuthLoading(false);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setAuthLoading(false);
      }
    }

    void restoreSession();

    const { data: subscription } = subscribeToAdminAuthState(async (user) => {
      setAuthUser(user);

      if (!user) {
        setAuthProfile(null);
        setTickets([]);
        setAllProfiles([]);
        setSelectedTicket(null);
        return;
      }

      try {
        const profile = await getAdminProfile(user.id);
        setAuthProfile(profile);

        const isAllowed = isPrimaryAdmin(user) || profile?.status === 'approved';

        if (isAllowed) {
          const data = await fetchTickets();
          if (!cancelled) setTickets(data);

          if (isPrimaryAdmin(user)) {
            const profiles = await fetchAdminProfiles();
            setAllProfiles(profiles);
          }
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await signInAdmin(email, password);
      
      const profile = await getAdminProfile(user.id);
      setAuthProfile(profile);

      const isAllowed = isPrimaryAdmin(user) || profile?.status === 'approved';
      if (!isAllowed && profile?.status !== 'pending' && profile?.status !== 'rejected') {
        // No profile yet, but could be an admin using email/password
        // If it's the primary admin, it's fine. If not, they need a profile.
        if (!isPrimaryAdmin(user)) {
          await signOutAdmin();
          throw new Error(t(`บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ`, `No admin privileges.`));
        }
      }

      if (isAllowed) {
        const data = await fetchTickets();
        setTickets(data);
      }
      
      setEmail('');
      setPassword('');
    } catch (e: unknown) {
      Swal.fire({
        icon: 'error',
        title: t('เข้าสู่ระบบไม่สำเร็จ', 'Login Failed'),
        text: getAdminLoginMessage(e, t),
        footer: `Admin email: ${PRIMARY_ADMIN_EMAIL}`,
      });
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    const fullName = (e.target as any).fullName.value;
    if (!fullName) return;

    setRequestingAccess(true);
    try {
      await createAdminProfile({
        id: authUser.id,
        email: authUser.email!,
        fullName,
      });
      const profile = await getAdminProfile(authUser.id);
      setAuthProfile(profile);
      Swal.fire({
        icon: 'success',
        title: t('ส่งคำขอสำเร็จ', 'Request Sent'),
        text: t('กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติสิทธิ์', 'Please wait for the administrator to review and approve your access.'),
      });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setRequestingAccess(false);
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteFullName) return;

    setIsInviting(true);
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        throw new Error(t('ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่', 'Session not found. Please log in again.'));
      }

      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify({ email: inviteEmail, fullName: inviteFullName })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to invite user');
      }

      Swal.fire({
        icon: 'success',
        title: t('ส่งคำเชิญสำเร็จ', 'Invite Sent'),
        text: t(`ระบบส่งลิงก์เชิญไปที่ ${inviteEmail} แล้ว`, `An invite link has been sent to ${inviteEmail}.`),
      });

      setInviteEmail('');
      setInviteFullName('');
      
      const profiles = await fetchAdminProfiles();
      setAllProfiles(profiles);
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: t('เกิดข้อผิดพลาด', 'Error Occurred'),
        text: error.message
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateProfileStatus = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      await updateAdminProfileStatus(userId, status);
      const profiles = await fetchAdminProfiles();
      setAllProfiles(profiles);
      Swal.fire({ icon: 'success', title: 'Success', timer: 1500 });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setSelectedTicket(null);
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      Swal.fire({
        icon: 'error',
        title: t('เข้าสู่ระบบไม่สำเร็จ', 'Login Failed'),
        text: e instanceof Error ? e.message : t('เกิดข้อผิดพลาด', 'An error occurred'),
        footer: `Admin email: ${PRIMARY_ADMIN_EMAIL}`,
      });
    }
  };

  const handleForgotPassword = async () => {
    setResetLoading(true);

    try {
      const redirectTo =
        typeof window === 'undefined'
          ? ''
          : `${window.location.origin}/reset-password`;

      await requestAdminPasswordReset(PRIMARY_ADMIN_EMAIL, redirectTo);
      await Swal.fire({
        icon: 'success',
        title: t('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', 'Password Reset Link Sent'),
        text: t(`กรุณาตรวจสอบอีเมล ${PRIMARY_ADMIN_EMAIL} แล้วเปิดลิงก์เพื่อกำหนดรหัสผ่านใหม่`, `Please check your email ${PRIMARY_ADMIN_EMAIL} and open the link to set a new password`),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? getAdminLoginMessage(error, t) : t('ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้', 'Unable to send password reset link');
      await Swal.fire({
        icon: 'error',
        title: t('ส่งลิงก์ไม่สำเร็จ', 'Failed to Send Link'),
        text: message,
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !authUser) return;

    Swal.fire({ title: t('กำลังบันทึก...', 'Saving...'), allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
      // 1. Upload new after images if any
      let addedAfterUrls: string[] = [];
      if (newAfterImages.length > 0) {
        addedAfterUrls = await uploadImages(newAfterImages, selectedTicket.ticketId, 'after_update');
      }

      // Combine old afterImages with new ones
      const combinedAfterImages = [...(selectedTicket.afterImages || []), ...addedAfterUrls];

      await updateTicket(selectedTicket.dbId, {
        status: updateStatus,
        managerFeedback: updateFeedback,
        afterDetail: updateAfterDetail,
        afterImages: combinedAfterImages,
      });

      Swal.fire({ icon: 'success', title: t('อัปเดตงานสำเร็จ', 'Update Successful'), text: t('บันทึกข้อมูลเรียบร้อยแล้ว', 'Data saved successfully') });
      setSelectedTicket(null);
      setNewAfterImages([]);
      
      const data = await fetchTickets();
      setTickets(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('ไม่สามารถบันทึกข้อมูลได้', 'Unable to save data');
      Swal.fire({ icon: 'error', title: t('เกิดข้อผิดพลาด', 'Error Occurred'), text: message });
    }
  };

  const openTicket = (t: TicketRecord) => {
    setSelectedTicket(t);
    setUpdateStatus(t.status || 'Pending');
    setUpdateFeedback(t.managerFeedback || '');
    setUpdateAfterDetail(t.afterDetail || '');
    setNewAfterImages([]);
  };

  const filteredTickets = tickets.filter((ticket) => filter === 'All' || ticket.status === filter);
  const totalTickets = tickets.length;
  const completedTickets = tickets.filter((ticket) => ticket.status === 'Completed').length;
  const pendingTickets = tickets.filter((ticket) => ticket.status === 'Pending').length;
  const approvedTickets = tickets.filter((ticket) => ticket.status === 'Approved').length;
  const rejectedTickets = tickets.filter((ticket) => ticket.status === 'Rejected').length;
  const completionRate = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;
  const resolvedTickets = completedTickets + rejectedTickets;
  const resolvedRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;
  const ticketsWithImages = tickets.filter(
    (ticket) => ticket.beforeImages.length > 0 || ticket.afterImages.length > 0,
  ).length;
  const imageCoverage = totalTickets > 0 ? Math.round((ticketsWithImages / totalTickets) * 100) : 0;
  const thisMonth = new Date();
  const thisMonthTickets = tickets.filter((ticket) => {
    const createdAt = new Date(ticket.createdAt);
    return (
      createdAt.getFullYear() === thisMonth.getFullYear() &&
      createdAt.getMonth() === thisMonth.getMonth()
    );
  }).length;

  const departmentRanking = buildRankings(
    tickets.map((ticket) => {
      if (ticket.department === 'อื่นๆ' && ticket.otherDepartment.trim()) {
        return ticket.otherDepartment;
      }

      return ticket.department;
    }),
    totalTickets,
    t,
  );
  const suggestionTypeRanking = buildRankings(
    tickets.map((ticket) => ticket.suggestionType),
    totalTickets,
    t,
  );
  const topDepartment = departmentRanking[0]?.label || '-';

  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const bucketDate = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - (5 - index), 1);
    const count = tickets.filter((ticket) => {
      const createdAt = new Date(ticket.createdAt);
      return (
        createdAt.getFullYear() === bucketDate.getFullYear() &&
        createdAt.getMonth() === bucketDate.getMonth()
      );
    }).length;

    return {
      label: new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit' }).format(bucketDate),
      count,
    };
  });
  const maxMonthlyCount = Math.max(...monthlyTrend.map((item) => item.count), 1);
  const latestTickets = tickets.slice(0, 5);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="rounded-3xl bg-white px-6 py-8 shadow-xl border border-slate-100 text-slate-500">
          {t('กำลังตรวจสอบสิทธิ์...', 'Checking permissions...')}
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-3xl border border-amber-300 bg-white p-8 text-center shadow-xl">
          <h1 className="mb-4 text-2xl font-bold text-amber-700">{t('Supabase ยังไม่ถูกตั้งค่า', 'Supabase is not configured')}</h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {t('เพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local` จากนั้นสร้างตารางและ bucket ตามไฟล์ `supabase/setup.sql`', 'Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`, then create the table and bucket according to `supabase/setup.sql`')}
          </p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border top-0 border-slate-100">
          <div className="text-5xl mb-4">🛡️</div>
          <h1 className="text-xl font-bold text-teal-700 mb-6">{t('กรุณาเข้าสู่ระบบ', 'Admin Login')}</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder={t('อีเมลผู้ดูแล', 'Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <input
              type="password"
              placeholder={t('รหัสผ่าน', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold p-3 rounded-xl transition shadow-lg shadow-teal-200">{t('เข้าสู่ระบบ', 'Login')}</button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">{t('หรือ', 'or')}</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-3 w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 font-semibold p-3 rounded-xl transition hover:bg-slate-50 shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {t('เข้าสู่ระบบด้วย Google', 'Sign in with Google')}
          </button>

          <div className="mt-4 space-y-2 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              className="text-sm font-semibold text-teal-700 transition hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {resetLoading ? t('กำลังส่งลิงก์...', 'Sending link...') : t('ลืมรหัสผ่าน?', 'Forgot Password?')}
            </button>
            <p className="text-[11px] text-slate-400">
              {t('หากเปิดอีเมลจากลิงก์ reset แล้วเด้งกลับหน้าแรก ระบบจะพาไปหน้าเปลี่ยนรหัสผ่านให้อัตโนมัติ', 'If you open the email from the reset link and it redirects to the home page, the system will automatically take you to the password reset page.')}
            </p>
            <p className="text-[11px] text-slate-400">
              {t('หรือเปิดตรงที่', 'Or open')} <Link href="/reset-password" className="font-semibold text-teal-700 hover:text-teal-800">{t('หน้าเปลี่ยนรหัสผ่าน', 'Password Reset Page')}</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check Profile Status
  const isMaster = isPrimaryAdmin(authUser);
  const isApproved = authProfile?.status === 'approved' || isMaster;

  if (!isApproved) {
    if (!authProfile) {
      // Show Request Access Form
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-slate-100">
            <div className="text-5xl mb-4">📋</div>
            <h1 className="text-xl font-bold text-teal-700 mb-6">{t('กรอกชื่อเพื่อขอสิทธิ์', 'Request Access')}</h1>
            <p className="mb-6 text-sm text-slate-500">{t('ระบุชื่อ-นามสกุลของคุณเพื่อให้ผู้ดูแลระบบตรวจสอบและยืนยันตัวตนพนักงาน', 'Provide your full name so the administrator can verify your identity.')}</p>
            <form onSubmit={handleRequestAccess} className="space-y-4">
              <input name="fullName" type="text" placeholder={t('ชื่อ - นามสกุล', 'Full Name')} className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-teal-500" required />
              <button disabled={requestingAccess} type="submit" className="w-full bg-teal-600 text-white font-bold p-3 rounded-xl hover:bg-teal-700 transition disabled:bg-slate-300">
                {requestingAccess ? t('กำลังส่ง...', 'Sending...') : t('ส่งคำขอเข้าใช้งาน', 'Send Request')}
              </button>
            </form>
            <button onClick={() => signOutAdmin()} className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline">{t('ยกเลิก', 'Cancel')}</button>
          </div>
        </div>
      );
    }

    if (authProfile.status === 'pending') {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-slate-100">
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="text-xl font-bold text-amber-600 mb-6">{t('รอกำลังอนุมัติ', 'Approval Pending')}</h1>
            <p className="mb-4 text-sm text-slate-500">{t('คุณได้ส่งคำขอเข้าใช้งานแล้ว กรุณารอผู้ดูแลตรวจสอบสิทธิ์', 'You have sent an access request. Please wait for authorization.')}</p>
            <div className="bg-slate-50 p-4 rounded-xl text-left border mb-6">
              <p className="text-[10px] uppercase font-bold text-slate-400">ชื่อที่ลงทะเบียน</p>
              <p className="font-bold text-slate-700">{authProfile.fullName}</p>
            </div>
            <button onClick={() => signOutAdmin()} className="w-full bg-slate-100 text-slate-600 font-bold p-3 rounded-xl hover:bg-slate-200 transition">{t('ออกจากระบบ', 'Sign Out')}</button>
          </div>
        </div>
      );
    }

    if (authProfile.status === 'rejected') {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-rose-100">
            <div className="text-5xl mb-4">🚫</div>
            <h1 className="text-xl font-bold text-rose-600 mb-6">{t('ถูกปฏิเสธการเข้าถึง', 'Access Denied')}</h1>
            <p className="mb-6 text-sm text-slate-500">{t('ใบคำขอของคุณไม่ได้รับอนุมัติ หากมีข้อสงสัยกรุณาติดต่อผู้ดูแลระบบ', 'Your request has not been approved. If you have questions, please contact the administrator.')}</p>
            <button onClick={() => signOutAdmin()} className="w-full bg-rose-600 text-white font-bold p-3 rounded-xl transition">{t('ตกลง', 'Okay')}</button>
          </div>
        </div>
      );
    }
  }

  if (selectedTicket) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 text-white p-6 rounded-b-[2rem] shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Hyeok-sin Admin</h1>
            <p className="text-xs opacity-90">{t('จัดการรายละเอียดงาน (Edit)', 'Manage Task Details (Edit)')}</p>
          </div>
          <button onClick={() => setSelectedTicket(null)} className="text-xs bg-white/20 px-3 py-2 rounded-lg font-bold">{t('กลับ', 'Back')}</button>
        </div>

        <div className="max-w-3xl mx-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-teal-700 mb-4 border-b pb-2">📌 {t('รายละเอียดนวัตกรรม (Before)', 'Innovation Details (Before)')}</h2>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">Ticket ID</span>
                <div className="font-medium text-slate-800">{selectedTicket.ticketId}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">{t('สถานะปัจจุบัน', 'Current Status')}</span>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusMeta(selectedTicket.status, t).badgeClass}`}>
                    {selectedTicket.status}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">{t('ผู้ส่ง', 'Sender')}</span>
                <div className="text-slate-800">{selectedTicket.fullName}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">{t('แผนก', 'Department')}</span>
                <div className="text-slate-800">
                  {selectedTicket.department === 'อื่นๆ' && selectedTicket.otherDepartment
                    ? selectedTicket.otherDepartment
                    : selectedTicket.department}
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">{t('ปัญหาที่พบ', 'Problem Found')}</span>
                <div className="text-slate-800">{selectedTicket.problem}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">{t('การแก้ไข', 'Solution')}</span>
                <div className="text-slate-800">{selectedTicket.solution}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 md:col-span-2">
                <span className="text-slate-500 font-bold block mb-1">{t('รายละเอียด', 'Details')}</span>
                <div className="text-slate-800 whitespace-pre-wrap">{selectedTicket.detail}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 md:col-span-2">
                <span className="text-slate-500 font-bold block mb-1">{t('สาเหตุ', 'Cause')}</span>
                <div className="text-slate-800 whitespace-pre-wrap">{selectedTicket.cause}</div>
              </div>
            </div>
            
            <div className="mt-4">
              <span className="text-slate-500 font-bold block mb-2">{t('รูปภาพ Before', 'Before Images')}</span>
              <div className="flex gap-2 overflow-x-auto">
                {selectedTicket.beforeImages?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} className="w-20 h-20 object-cover rounded-xl border" alt={`Before image ${i + 1}`} /></a>
                ))}
                {(!selectedTicket.beforeImages || selectedTicket.beforeImages.length === 0) && <span className="text-xs text-slate-400">{t('ไม่มีรูปภาพ', 'No Image')}</span>}
              </div>
            </div>

            <div className="mt-4">
              <span className="text-slate-500 font-bold block mb-2">{t('รูปภาพ After (ที่มีแล้ว)', 'After Images (If any)')}</span>
              <div className="flex gap-2 overflow-x-auto">
                {selectedTicket.afterImages?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} className="w-20 h-20 object-cover rounded-xl border" alt={`After image ${i + 1}`} /></a>
                ))}
                {(!selectedTicket.afterImages || selectedTicket.afterImages.length === 0) && <span className="text-xs text-slate-400">{t('ไม่มีรูปภาพ', 'No Image')}</span>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-teal-700 mb-4 border-b pb-2">✍️ {t('อัปเดตการดำเนินการ', 'Update Status')}</h2>
            <form onSubmit={handleUpdate} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-slate-600 mb-1">{t('สถานะ', 'Status')}</label>
                <select
                  value={updateStatus}
                  onChange={e => setUpdateStatus(e.target.value as TicketStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-700 outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Pending">{t('Pending (รอดำเนินการ)', 'Pending')}</option>
                  <option value="Approved">{t('Approved (อนุมัติ/กำลังทำ)', 'Approved (In Progress)')}</option>
                  <option value="Completed">{t('Completed (เสร็จสิ้น)', 'Completed')}</option>
                  <option value="Rejected">{t('Rejected (ไม่ผ่าน)', 'Rejected')}</option>
                </select>
              </div>
              
              <div>
                <label className="block font-bold text-slate-600 mb-1">ข้อเสนอแนะ{t('จาก', 'out of')}ผู้บริหาร</label>
                <textarea
                  rows={3}
                  value={updateFeedback}
                  onChange={e => setUpdateFeedback(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={t('พิมพ์ข้อเสนอแนะ..', 'Type feedback..')}
                ></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ข้อมูลหลัง{t('การแก้ไข', 'Solution')}</label>
                <textarea
                  rows={3}
                  value={updateAfterDetail}
                  onChange={e => setUpdateAfterDetail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={t('ผลลัพธ์ที่ได้..', 'Result..')}
                ></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">{t('เพิ่มรูปหลังแก้ไข (After Image)', 'Add After Image')}</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => e.target.files && setNewAfterImages(Array.from(e.target.files))}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-700"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setSelectedTicket(null)} className="flex-1 p-3 bg-slate-200 rounded-xl font-bold text-slate-700">{t('ยกเลิก', 'Cancel')}</button>
                <button type="submit" className="flex-1 p-3 bg-teal-600 rounded-xl font-bold text-white shadow-lg shadow-teal-200">{t('บันทึก', 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-teal-700 to-teal-500 text-white p-6 lg:px-12 rounded-b-[2rem] shadow-md flex justify-between items-center">
        <div>
          <div className="flex justify-between items-center w-full"><h1 className="text-2xl font-bold">Hyeok-sin Admin</h1><LanguageSwitcher /></div>
          <p className="text-sm opacity-90">{t('ระบบภาพรวมนวัตกรรม', 'Innovation Overview System')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isMaster && (
            <button onClick={() => setShowAdminMgmt(!showAdminMgmt)} className={`text-sm px-4 py-2 rounded-xl font-bold transition ${showAdminMgmt ? 'bg-white text-teal-700' : 'bg-white/20 hover:bg-white/30'}`}>
              {showAdminMgmt ? t('ดูงาน', 'View Tickets') : t('จัดการสิทธิ์', 'Manage Admins')}
              {allProfiles.some(p => p.status === 'pending') && !showAdminMgmt && <span className="ml-2 w-2 h-2 bg-rose-500 rounded-full inline-block animate-pulse"></span>}
            </button>
          )}
          <button onClick={handleLogout} className="text-sm bg-white/20 px-4 py-2 rounded-xl font-bold hover:bg-white/30 transition">{t('ออกจากระบบ', 'Sign Out')}</button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-4">
        {showAdminMgmt && isMaster ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm border space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800">👥 {t('จัดการสิทธิ์ผู้ใช้งาน', 'Admin Management')}</h2>
              <p className="text-sm text-slate-500">{t('ตรวจสอบและอนุมัติรายชื่อพนักงานที่ขอเข้าใช้งานระบบหลังบ้าน', 'Review and approve employees requesting admin access.')}</p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-teal-700 mb-3">{t('เชิญผู้ดูแลระบบใหม่', 'Invite New Admin')}</h3>
              <form onSubmit={handleInviteAdmin} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  placeholder={t('อีเมล', 'Email')}
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400"
                  required
                />
                <input
                  type="text"
                  placeholder={t('ชื่อ - นามสกุล', 'Full Name')}
                  value={inviteFullName}
                  onChange={e => setInviteFullName(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400"
                  required
                />
                <button
                  type="submit"
                  disabled={isInviting}
                  className="bg-teal-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-teal-700 transition disabled:bg-slate-300 whitespace-nowrap shadow-sm shadow-teal-200"
                >
                  {isInviting ? t('กำลังเชิญ...', 'Inviting...') : t('ส่งคำเชิญ', 'Send Invite')}
                </button>
              </form>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 text-slate-500">
                    <th className="pb-3 px-2">{t('ชื่อ - นามสกุล', 'Full Name')}</th>
                    <th className="pb-3 px-2">Email</th>
                    <th className="pb-3 px-2">{t('วันที่ขอ', 'Date')}</th>
                    <th className="pb-3 px-2">{t('สถานะ', 'Status')}</th>
                    <th className="pb-3 px-2 text-right">{t('จัดการ', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {allProfiles.filter(p => !isPrimaryAdmin(p)).map(profile => (
                    <tr key={profile.id} className="border-b hover:bg-slate-50">
                      <td className="py-4 px-2 font-bold text-slate-700">{profile.fullName}</td>
                      <td className="py-4 px-2 text-slate-500">{profile.email}</td>
                      <td className="py-4 px-2 text-slate-400">{formatTicketDate(profile.createdAt)}</td>
                      <td className="py-4 px-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          profile.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          profile.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>{profile.status}</span>
                      </td>
                      <td className="py-4 px-2 text-right space-x-2">
                        {profile.status !== 'approved' && (
                          <button onClick={() => handleUpdateProfileStatus(profile.id, 'approved')} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition">{t('อนุมัติ', 'Approve')}</button>
                        )}
                        {profile.status !== 'rejected' && (
                          <button onClick={() => handleUpdateProfileStatus(profile.id, 'rejected')} className="bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-200 transition">{t('ปฏิเสธ', 'Reject')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {allProfiles.length <= 1 && (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">{t('ยังไม่มีคำขอเข้าใช้งาน', 'No requests found')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-teal-700">{t('ข้อเสนอทั้งหมด', 'Total Suggestions')}</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{totalTickets}</p>
            <p className="mt-2 text-xs text-slate-500">{t('งานใหม่เดือนนี้', 'New Tasks This Month')} {thisMonthTickets} {t('รายการ', 'Items')}</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-emerald-700">{t('อัตราปิดงาน', 'Completion Rate')}</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{completionRate}%</p>
            <p className="mt-2 text-xs text-slate-500">{t('เสร็จสิ้นแล้ว', 'Completed')} {completedTickets} {t('จาก', 'out of')} {totalTickets || 0} {t('งาน', 'tasks')}</p>
          </div>
          <div className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-sky-700">{t('งานที่มีรูปแนบ', 'Tasks with Images')}</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{imageCoverage}%</p>
            <p className="mt-2 text-xs text-slate-500">{t('มีรูปก่อนหรือหลังรวม', 'Contains before or after images:')} {ticketsWithImages} {t('รายการ', 'Items')}</p>
          </div>
          <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-violet-700">{t('แผนกที่ส่งมากสุด', 'Top Sending Dept')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{topDepartment}</p>
            <p className="mt-2 text-xs text-slate-500">{t('อัตรางานปิดแล้ว', 'Resolved Rate:')} {resolvedRate}%</p>
          </div>
        </div>

        <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('ภาพรวมสถานะงาน', 'Task Status Overview')}</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                อัปเดต{t('จาก', 'out of')}ข้อมูล{t('ล่าสุด', 'Latest')}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {([
                ['Pending', pendingTickets],
                ['Approved', approvedTickets],
                ['Completed', completedTickets],
                ['Rejected', rejectedTickets],
              ] as Array<[TicketStatus, number]>).map(([status, count]) => {
                const meta = getStatusMeta(status, t);
                const width = totalTickets > 0 ? Math.max((count / totalTickets) * 100, count > 0 ? 8 : 0) : 0;

                return (
                  <div key={status} className={`rounded-2xl border bg-gradient-to-br p-4 ${meta.cardClass}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.badgeClass}`}>{status}</span>
                      <span className="text-sm font-semibold text-slate-500">{meta.label}</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-800">{count}</p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-teal-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('แนวโน้ม 6 เดือนล่าสุด', '6-Month Trend')}</h2>
              <span className="text-xs font-semibold text-slate-400">{t('จำนวนข้อเสนอ', 'Suggestions')}</span>
            </div>
            <div className="space-y-4">
              {monthlyTrend.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-600">{item.label}</span>
                    <span className="text-slate-400">{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
                      style={{ width: `${Math.max((item.count / maxMonthlyCount) * 100, item.count > 0 ? 10 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('รายงานตามแผนก', 'Report by Department')}</h2>
              <span className="text-xs font-semibold text-slate-400">Top 6</span>
            </div>
            <div className="space-y-4">
              {departmentRanking.slice(0, 6).map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="text-slate-400">{item.count} งาน</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
              {departmentRanking.length === 0 && (
                <p className="text-sm text-slate-400">{t('ยังไม่มีข้อมูลสำหรับจัดอันดับแผนก', 'No data available for department ranking')}</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{t('รายงานตามประเภทข้อเสนอ', 'Report by Suggestion Type')}</h2>
              <span className="text-xs font-semibold text-slate-400">Top 5</span>
            </div>
            <div className="space-y-4">
              {suggestionTypeRanking.slice(0, 5).map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="text-slate-400">{item.count} งาน</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
              {suggestionTypeRanking.length === 0 && (
                <p className="text-sm text-slate-400">{t('ยังไม่มีข้อมูลสำหรับจัดอันดับประเภทข้อเสนอ', 'No data available for suggestion type ranking')}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{t('รายงานล่าสุด', 'Latest Reports')}</h2>
              <p className="text-sm text-slate-500">{t('รายการใหม่ล่าสุดและสถานะปัจจุบันสำหรับติดตามอย่างรวดเร็ว', 'Latest items and current status for quick tracking')}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {t('ล่าสุด', 'Latest')} {latestTickets.length} รายการ
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {latestTickets.map((ticket) => (
              <button
                key={ticket.dbId}
                type="button"
                onClick={() => openTicket(ticket)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-white"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{ticket.ticketId}</p>
                    <p className="text-sm text-slate-500">{ticket.fullName}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusMeta(ticket.status, t).badgeClass}`}>
                    {ticket.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {(ticket.department === 'อื่นๆ' && ticket.otherDepartment) || ticket.department}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{ticket.problem}</p>
                <p className="mt-3 text-xs text-slate-400">{formatTicketDate(ticket.createdAt)}</p>
              </button>
            ))}
            {latestTickets.length === 0 && (
              <p className="text-sm text-slate-400">ยังไม่มีรายการ{t('ล่าสุด', 'Latest')}ให้แสดง</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">📋 {t('รายการตรวจสอบ', 'Checklist')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('แสดงผล', 'Showing')} {filteredTickets.length} {t('จาก', 'out of')}{t('ทั้งหมด', 'Total')} {totalTickets} {t('รายการ', 'Items')}</p>
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value as TicketStatus | 'All')} className="border rounded-xl p-2 px-4 outline-none text-sm font-semibold text-slate-700 bg-slate-50">
              <option value="All">{t('ทั้งหมด', 'Total')}</option>
              <option value="Pending">{t('Pending (รอดำเนินการ)', 'Pending')}</option>
              <option value="Approved">{t('Approved (กำลังทำ)', 'Approved (In Progress)')}</option>
              <option value="Completed">{t('Completed (เสร็จสิ้น)', 'Completed')}</option>
              <option value="Rejected">{t('Rejected (ไม่ผ่าน)', 'Rejected')}</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="text-slate-500 border-b-2">
                  <th className="pb-3 px-2">Ticket ID</th>
                  <th className="pb-3 px-2">{t('แผนก', 'Department')}</th>
                  <th className="pb-3 px-2">{t('ผู้ส่ง', 'Sender')}</th>
                  <th className="pb-3 px-2">{t('วันที่ส่ง', 'Date')}</th>
                  <th className="pb-3 px-2">{t('สถานะ', 'Status')}</th>
                  <th className="pb-3 px-2">{t('จัดการ', 'Manage')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticketItem => (
                  <tr key={ticketItem.dbId} className="border-b transition hover:bg-slate-50">
                    <td className="py-4 px-2 font-bold text-slate-700">{ticketItem.ticketId}</td>
                    <td className="py-4 px-2 text-slate-600">
                      {(ticketItem.department === 'อื่นๆ' && ticketItem.otherDepartment) || ticketItem.department}
                    </td>
                    <td className="py-4 px-2 text-slate-600">{ticketItem.fullName}</td>
                    <td className="py-4 px-2 text-slate-500">{formatTicketDate(ticketItem.createdAt)}</td>
                    <td className="py-4 px-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusMeta(ticketItem.status, t).badgeClass}`}>{getStatusMeta(ticketItem.status, t).label}</span>
                    </td>
                    <td className="py-4 px-2">
                      <button onClick={() => openTicket(ticketItem)} className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-teal-700">{t('ดู/แก้ไข', 'View/Edit')}</button>
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">{t('ไม่พบรายการที่ตรงตามเงื่อนไข', 'No matching records found')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
