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
  isSupabaseConfigured,
  isPrimaryAdmin,
  PRIMARY_ADMIN_EMAIL,
  requestAdminPasswordReset,
  signInAdmin,
  signOutAdmin,
  subscribeToAdminAuthState,
  TicketRecord,
  TicketStatus,
  updateTicket,
  uploadImages,
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

function buildRankings(values: string[], total: number) {
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
          const allowedUser = isPrimaryAdmin(user) ? user : null;
          setAuthUser(allowedUser);
          setAuthLoading(false);
          if (allowedUser) {
            const data = await fetchTickets();
            if (!cancelled) {
              setTickets(data);
            }
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void restoreSession();

    const { data: subscription } = subscribeToAdminAuthState(async (user) => {
      if (!isPrimaryAdmin(user)) {
        setAuthUser(null);
        setTickets([]);
        setSelectedTicket(null);
        return;
      }

      setAuthUser(user);

      if (!user) {
        setTickets([]);
        setSelectedTicket(null);
        return;
      }

      try {
        const data = await fetchTickets();
        if (!cancelled) {
          setTickets(data);
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
      if (!isPrimaryAdmin(user)) {
        await signOutAdmin();
        throw new Error(t(`บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ ใช้อีเมล ${PRIMARY_ADMIN_EMAIL} เท่านั้น`, `No admin privileges. Use ${PRIMARY_ADMIN_EMAIL} only.`));
      }

      const data = await fetchTickets();
      setTickets(data);
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

  const handleLogout = async () => {
    await signOutAdmin();
    setSelectedTicket(null);
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
  );
  const suggestionTypeRanking = buildRankings(
    tickets.map((ticket) => ticket.suggestionType),
    totalTickets,
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
          <h1 className="text-xl font-bold text-teal-700 mb-6">{t('กรุณาเข้าสู่ระบบ', 'Please Login')}</h1>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            {t('เข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้ใน Supabase Auth', 'Login with an admin account created in Supabase Auth')}
          </p>
          <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
            {t('ถ้า login ไม่ผ่าน ให้ตรวจสอบว่าเปิด Email provider แล้ว, สร้างผู้ใช้ผู้ดูแลแล้ว, และหากเปิด Confirm email อยู่ต้องยืนยันอีเมลก่อน', 'If login fails, check if Email provider is enabled, admin user is created, and if Confirm email is required, confirm it first.')}
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder={t('อีเมลผู้ดูแล', 'Admin Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <input
              type="password"
              placeholder={t('รหัสผ่าน', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold p-3 rounded-xl transition shadow-lg shadow-teal-200">{t('เข้าสู่ระบบ', 'Login')}</button>
          </form>
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
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={t('พิมพ์ข้อเสนอแนะ..', 'Type feedback..')}
                ></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ข้อมูลหลัง{t('การแก้ไข', 'Solution')}</label>
                <textarea
                  rows={3}
                  value={updateAfterDetail}
                  onChange={e => setUpdateAfterDetail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-teal-500"
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
        <button onClick={handleLogout} className="text-sm bg-white/20 px-4 py-2 rounded-xl font-bold hover:bg-white/30 transition">{t('ออกจากระบบ', 'Sign Out')}</button>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-4">
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
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t('ไม่พบรายการข้อมูล', 'No data found')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
