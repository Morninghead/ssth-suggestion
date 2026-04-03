'use client';

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import type { User } from '@supabase/supabase-js';
import {
  fetchTickets,
  getCurrentAdminUser,
  isSupabaseConfigured,
  isPrimaryAdmin,
  PRIMARY_ADMIN_EMAIL,
  signInAdmin,
  signOutAdmin,
  subscribeToAdminAuthState,
  TicketRecord,
  TicketStatus,
  updateTicket,
  uploadImages,
} from '../../lib/supabase';

function getAdminLoginMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'กรุณาตรวจสอบอีเมล รหัสผ่าน และสถานะผู้ใช้ใน Supabase Auth';
  }

  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือผู้ใช้นี้ยังไม่ได้ถูกสร้างใน Supabase Auth';
  }

  if (message.includes('email logins are disabled') || message.includes('unsupported grant type')) {
    return 'ใน Supabase ยังไม่ได้เปิด Email provider กรุณาไปที่ Authentication > Sign In / Providers แล้วเปิด Email';
  }

  if (message.includes('email not confirmed')) {
    return 'บัญชีนี้ยังไม่ยืนยันอีเมล กรุณายืนยันอีเมลใน Supabase หรือปิด email confirmation ชั่วคราว';
  }

  if (message.includes('email rate limit exceeded')) {
    return 'มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  }

  if (message.includes('ไม่มีสิทธิ์ผู้ดูแลระบบ')) {
    return error.message;
  }

  return `${error.message} | ตรวจสอบว่าเปิด Email provider และสร้างผู้ใช้ผู้ดูแลด้วยอีเมล ${PRIMARY_ADMIN_EMAIL}`;
}

export default function AdminDashboard() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        throw new Error(`บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ ใช้อีเมล ${PRIMARY_ADMIN_EMAIL} เท่านั้น`);
      }

      const data = await fetchTickets();
      setTickets(data);
      setEmail('');
      setPassword('');
    } catch (e: unknown) {
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: getAdminLoginMessage(e),
        footer: `Admin email: ${PRIMARY_ADMIN_EMAIL}`,
      });
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setSelectedTicket(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !authUser) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

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

      Swal.fire({ icon: 'success', title: 'อัปเดตงานสำเร็จ', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
      setSelectedTicket(null);
      setNewAfterImages([]);
      
      const data = await fetchTickets();
      setTickets(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'ไม่สามารถบันทึกข้อมูลได้';
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: message });
    }
  };

  const openTicket = (t: TicketRecord) => {
    setSelectedTicket(t);
    setUpdateStatus(t.status || 'Pending');
    setUpdateFeedback(t.managerFeedback || '');
    setUpdateAfterDetail(t.afterDetail || '');
    setNewAfterImages([]);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="rounded-3xl bg-white px-6 py-8 shadow-xl border border-slate-100 text-slate-500">
          กำลังตรวจสอบสิทธิ์...
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-3xl border border-amber-300 bg-white p-8 text-center shadow-xl">
          <h1 className="mb-4 text-2xl font-bold text-amber-700">Supabase ยังไม่ถูกตั้งค่า</h1>
          <p className="text-sm leading-relaxed text-slate-600">
            เพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local`
            จากนั้นสร้างตารางและ bucket ตามไฟล์ `supabase/setup.sql`
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
          <h1 className="text-xl font-bold text-teal-700 mb-6">กรุณาเข้าสู่ระบบ</h1>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            เข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้ใน Supabase Auth
          </p>
          <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
            ถ้า login ไม่ผ่าน ให้ตรวจสอบว่าเปิด Email provider แล้ว, สร้างผู้ใช้ผู้ดูแลแล้ว,
            และหากเปิด Confirm email อยู่ต้องยืนยันอีเมลก่อน
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder="อีเมลผู้ดูแล"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <input
              type="password"
              placeholder="รหัสผ่าน"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-center text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold p-3 rounded-xl transition shadow-lg shadow-teal-200">เข้าสู่ระบบ</button>
          </form>
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
            <p className="text-xs opacity-90">จัดการรายละเอียดงาน (Edit)</p>
          </div>
          <button onClick={() => setSelectedTicket(null)} className="text-xs bg-white/20 px-3 py-2 rounded-lg font-bold">กลับ</button>
        </div>

        <div className="max-w-3xl mx-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-teal-700 mb-4 border-b pb-2">📌 รายละเอียดนวัตกรรม (Before)</h2>
            <div className="grid gap-3 text-sm">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">Ticket ID</span>
                <div className="font-medium text-slate-800">{selectedTicket.ticketId}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">ปัญหาที่พบ</span>
                <div className="text-slate-800">{selectedTicket.problem}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-bold block mb-1">การแก้ไข</span>
                <div className="text-slate-800">{selectedTicket.solution}</div>
              </div>
            </div>
            
            <div className="mt-4">
              <span className="text-slate-500 font-bold block mb-2">รูปภาพ Before</span>
              <div className="flex gap-2 overflow-x-auto">
                {selectedTicket.beforeImages?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} className="w-20 h-20 object-cover rounded-xl border" alt={`Before image ${i + 1}`} /></a>
                ))}
                {(!selectedTicket.beforeImages || selectedTicket.beforeImages.length === 0) && <span className="text-xs text-slate-400">ไม่มีรูปภาพ</span>}
              </div>
            </div>

            <div className="mt-4">
              <span className="text-slate-500 font-bold block mb-2">รูปภาพ After (ที่มีแล้ว)</span>
              <div className="flex gap-2 overflow-x-auto">
                {selectedTicket.afterImages?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} className="w-20 h-20 object-cover rounded-xl border" alt={`After image ${i + 1}`} /></a>
                ))}
                {(!selectedTicket.afterImages || selectedTicket.afterImages.length === 0) && <span className="text-xs text-slate-400">ไม่มีรูปภาพ</span>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-teal-700 mb-4 border-b pb-2">✍️ อัปเดตการดำเนินการ</h2>
            <form onSubmit={handleUpdate} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-slate-600 mb-1">สถานะ</label>
                <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value as TicketStatus)} className="w-full border rounded-xl p-3 bg-white outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="Pending">Pending (รอดำเนินการ)</option>
                  <option value="Approved">Approved (อนุมัติ/กำลังทำ)</option>
                  <option value="Completed">Completed (เสร็จสิ้น)</option>
                  <option value="Rejected">Rejected (ไม่ผ่าน)</option>
                </select>
              </div>
              
              <div>
                <label className="block font-bold text-slate-600 mb-1">ข้อเสนอแนะจากผู้บริหาร</label>
                <textarea rows={3} value={updateFeedback} onChange={e => setUpdateFeedback(e.target.value)} className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500" placeholder="พิมพ์ข้อเสนอแนะ.."></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ข้อมูลหลังการแก้ไข</label>
                <textarea rows={3} value={updateAfterDetail} onChange={e => setUpdateAfterDetail(e.target.value)} className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500" placeholder="ผลลัพธ์ที่ได้.."></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">เพิ่มรูปหลังแก้ไข (After Image)</label>
                <input type="file" multiple accept="image/*" onChange={e => e.target.files && setNewAfterImages(Array.from(e.target.files))} className="w-full border rounded-xl p-2" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setSelectedTicket(null)} className="flex-1 p-3 bg-slate-200 rounded-xl font-bold text-slate-700">ยกเลิก</button>
                <button type="submit" className="flex-1 p-3 bg-teal-600 rounded-xl font-bold text-white shadow-lg shadow-teal-200">บันทึก</button>
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
          <h1 className="text-2xl font-bold">Hyeok-sin Admin</h1>
          <p className="text-sm opacity-90">ระบบภาพรวมนวัตกรรม</p>
        </div>
        <button onClick={handleLogout} className="text-sm bg-white/20 px-4 py-2 rounded-xl font-bold hover:bg-white/30 transition">ออกจากระบบ</button>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">📋 รายการตรวจสอบ</h2>
            <select value={filter} onChange={e => setFilter(e.target.value as TicketStatus | 'All')} className="border rounded-xl p-2 px-4 outline-none text-sm font-semibold text-slate-700 bg-slate-50">
              <option value="All">ทั้งหมด</option>
              <option value="Pending">Pending (รอดำเนินการ)</option>
              <option value="Approved">Approved (กำลังทำ)</option>
              <option value="Completed">Completed (เสร็จสิ้น)</option>
              <option value="Rejected">Rejected (ไม่ผ่าน)</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="text-slate-500 border-b-2">
                  <th className="pb-3 px-2">Ticket ID</th>
                  <th className="pb-3 px-2">แผนก</th>
                  <th className="pb-3 px-2">ผู้ส่ง</th>
                  <th className="pb-3 px-2">สถานะ</th>
                  <th className="pb-3 px-2">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {tickets.filter(t => filter === 'All' || t.status === filter).map(t => (
                  <tr key={t.dbId} className="border-b transition hover:bg-slate-50">
                    <td className="py-4 px-2 font-bold text-slate-700">{t.ticketId}</td>
                    <td className="py-4 px-2 text-slate-600">{t.department}</td>
                    <td className="py-4 px-2 text-slate-600">{t.fullName}</td>
                    <td className="py-4 px-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        t.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 
                        t.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                        t.status === 'Completed' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-4 px-2">
                      <button onClick={() => openTicket(t)} className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-teal-700">ดู/แก้ไข</button>
                    </td>
                  </tr>
                ))}
                {tickets.filter(t => filter === 'All' || t.status === filter).length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">ไม่พบรายการข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
