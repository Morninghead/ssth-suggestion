'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import {
  PRIMARY_ADMIN_EMAIL,
  getCurrentAuthSession,
  isPrimaryAdmin,
  isSupabaseConfigured,
  signOutAdmin,
  subscribeToAdminAuthState,
  updateAdminPassword,
} from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function restoreRecoverySession() {
      try {
        const session = await getCurrentAuthSession();
        if (!cancelled && session?.user && isPrimaryAdmin(session.user)) {
          setSessionReady(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void restoreRecoverySession();

    const { data: subscription } = subscribeToAdminAuthState((user) => {
      if (cancelled) {
        return;
      }

      setSessionReady(Boolean(user && isPrimaryAdmin(user)));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      await Swal.fire({
        icon: 'warning',
        title: t('รหัสผ่านสั้นเกินไป', 'Password too short'),
        text: t('กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร', 'Please set a password with at least 6 characters'),
      });
      return;
    }

    if (password !== confirmPassword) {
      await Swal.fire({
        icon: 'warning',
        title: t('รหัสผ่านไม่ตรงกัน', 'Passwords do not match'),
        text: t('กรุณาตรวจสอบรหัสผ่านและยืนยันรหัสผ่านอีกครั้ง', 'Please check and confirm your password again'),
      });
      return;
    }

    setSaving(true);

    try {
      const user = await updateAdminPassword(password);

      if (!isPrimaryAdmin(user)) {
        await signOutAdmin();
        throw new Error(t(`บัญชีนี้ไม่ใช่ผู้ดูแลหลัก กรุณาใช้ ${PRIMARY_ADMIN_EMAIL}`, `This account is not the primary admin. Please use ${PRIMARY_ADMIN_EMAIL}`));
      }

      await Swal.fire({
        icon: 'success',
        title: t('เปลี่ยนรหัสผ่านสำเร็จ', 'Password changed successfully'),
        text: t('สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้แล้ว', 'You can now log in with your new password'),
      });

      router.replace('/admin');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('ไม่สามารถเปลี่ยนรหัสผ่านได้', 'Unable to change password');
      await Swal.fire({
        icon: 'error',
        title: t('เปลี่ยนรหัสผ่านไม่สำเร็จ', 'Failed to change password'),
        text: message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md rounded-3xl border border-amber-300 bg-white p-8 text-center shadow-xl">
          <h1 className="mb-4 text-2xl font-bold text-amber-700">{t('Supabase ยังไม่ถูกตั้งค่า', 'Supabase is not configured')}</h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {t('กรุณาเพิ่ม environment variables ให้ครบก่อนใช้งาน reset password', 'Please add all environment variables before using reset password')}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white px-6 py-8 text-slate-500 shadow-xl">
          {t('กำลังเตรียมหน้าเปลี่ยนรหัสผ่าน...', 'Preparing password reset page...')}
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-xl">
          <h1 className="mb-4 text-2xl font-bold text-slate-700">{t('ลิงก์รีเซ็ตรหัสผ่านไม่พร้อมใช้งาน', 'Reset link is not active')}</h1>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            {t('กรุณาเปิดลิงก์จากอีเมลรีเซ็ตรหัสผ่านล่าสุด หรือกลับไปขอส่งลิงก์ใหม่จากหน้า admin', 'Please open the latest password reset link from your email or request a new one from the admin page')}
          </p>
          <Link
            href="/admin"
            className="inline-flex rounded-xl bg-teal-600 px-5 py-3 font-bold text-white shadow-lg shadow-teal-200 transition hover:bg-teal-700"
          >
            {t('กลับไปหน้า admin', 'Return to admin page')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-xl">
        <div className="mb-4 text-5xl">🔐</div>
        <h1 className="mb-3 text-2xl font-bold text-teal-700">{t('ตั้งรหัสผ่านใหม่', 'Set New Password')}</h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-500">
          {t(`สำหรับบัญชีผู้ดูแล ${PRIMARY_ADMIN_EMAIL}`, `For admin account ${PRIMARY_ADMIN_EMAIL}`)}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder={t('รหัสผ่านใหม่', 'New Password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
          <input
            type="password"
            placeholder={t('ยืนยันรหัสผ่านใหม่', 'Confirm New Password')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-teal-600 p-3 font-bold text-white shadow-lg shadow-teal-200 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
          >
            {saving ? t('กำลังบันทึก...', 'Saving...') : t('บันทึกรหัสผ่านใหม่', 'Save New Password')}
          </button>
        </form>
      </div>
    </div>
  );
}
