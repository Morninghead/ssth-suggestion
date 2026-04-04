'use client';

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { createTicket, isSupabaseConfigured, uploadImages } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

type SuggestionFormData = {
  fullName: string;
  department: string;
  productionLine: string;
  otherDepartment: string;
  suggestionType: string;
  detail: string;
  cause: string;
  problem: string;
  solution: string;
};

type DetailField = 'detail' | 'cause' | 'problem' | 'solution';

export default function Home() {
  const { t, lang } = useLanguage();
  const [formData, setFormData] = useState<SuggestionFormData>({
    fullName: '',
    department: '',
    productionLine: '',
    otherDepartment: '',
    suggestionType: '',
    detail: '',
    cause: '',
    problem: '',
    solution: '',
  });

  const [beforeImages, setBeforeImages] = useState<File[]>([]);
  const [afterImages, setAfterImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash;
    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery' || !params.get('access_token')) {
      return;
    }

    window.location.replace(`/reset-password${hash}`);
  }, []);

  const departments = [
    'Admin', 'Material/Purchasing', 'SCM', 'QA', 'R&D', 'Maintenance', 
    'Coating', 'Production', 'New Mold', 'Repair Mold', 'Marketing', 
    'Human Resources', 'อื่นๆ'
  ];

  const suggestionTypes = [
    { value: 'Safety First', desc: t('การปรับปรุงด้านความปลอดภัยในพื้นที่ปฏิบัติงาน', 'Safety improvements in the workplace') },
    { value: 'Wasted Reduction', desc: t('การลดความสูญเสียของเวลา วัตถุดิบ หรือพลังงาน', 'Reducing loss of time, raw materials, or energy') },
    { value: 'Quality Improvement', desc: t('การเพิ่มคุณภาพของผลิตภัณฑ์ หรือบริการ', 'Improving product or service quality') },
    { value: 'Work Environment', desc: t('การปรับปรุงสิ่งแวดล้อมในพื้นที่การทำงานให้ดีขึ้น', 'Improving the work environment') },
    { value: 'People & Culture', desc: t('มุ่งเน้นคน คุณภาพชีวิต ความก้าวหน้า', 'Focus on people, quality of life, and progress') },
  ];

  const detailFields: Array<{ name: DetailField; label: string }> = [
    { name: 'detail', label: t('รายละเอียด', 'Details') },
    { name: 'cause', label: t('สาเหตุ', 'Cause') },
    { name: 'problem', label: t('ปัญหา', 'Problem') },
    { name: 'solution', label: t('การแก้ไข', 'Solution') },
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name as keyof SuggestionFormData]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      if (type === 'before') setBeforeImages(prev => [...prev, ...filesArray]);
      else setAfterImages(prev => [...prev, ...filesArray]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      Swal.fire({ icon: 'error', title: t('Supabase ยังไม่ถูกตั้งค่า', 'Supabase is not configured'), text: t('กรุณาเพิ่ม NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ก่อนใช้งาน', 'Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using') });
      return;
    }

    if (!formData.suggestionType) {
      Swal.fire({ icon: 'warning', title: t('แจ้งเตือน', 'Warning'), text: t('กรุณาเลือกประเภทข้อเสนอแนะ', 'Please select a suggestion type') });
      return;
    }

    setIsSubmitting(true);
    Swal.fire({
      title: t('กำลังบันทึกข้อมูล Hyeok-sin...', 'Saving Hyeok-sin data...'),
      text: t('กรุณารอสักครู่', 'Please wait'),
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading() }
    });

    try {
      // 1. Create a ticket record to get the ID placeholder
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const ticketId = `HS-${dateStr}`;

      // 2. Upload images if they exist
      const beforeUrls = beforeImages.length > 0 ? await uploadImages(beforeImages, ticketId, 'before') : [];
      const afterUrls = afterImages.length > 0 ? await uploadImages(afterImages, ticketId, 'after') : [];

      await createTicket({
        ticketId,
        ...formData,
        beforeImages: beforeUrls,
        afterImages: afterUrls,
      });
      
      Swal.fire({ icon: 'success', title: t('ส่งผลงานสำเร็จ!', 'Submission successful!'), text: t(`บันทึกหมายเลข ${ticketId} สำเร็จ`, `Successfully saved ticket ${ticketId}`) });
      setFormData({
        fullName: '', department: '', productionLine: '', otherDepartment: '',
        suggestionType: '', detail: '', cause: '', problem: '', solution: ''
      });
      setBeforeImages([]);
      setAfterImages([]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('ไม่สามารถบันทึกข้อมูลได้', 'Unable to save data');
      Swal.fire({ icon: 'error', title: t('เกิดข้อผิดพลาด', 'Error'), text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-800">
      {!isSupabaseConfigured && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("ยังไม่ได้ตั้งค่า Supabase ในโปรเจกต์นี้ กรุณาเพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ก่อนส่งข้อมูลจริง", "Supabase is not configured yet. Please add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` before submitting real data.")}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-teal-700 to-blue-600 text-white pt-10 pb-8 px-6 rounded-b-[2rem] shadow-lg max-w-2xl mx-auto relative">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('ระบบนวัตกรรม (Hyeok-sin)', 'Hyeok-sin Innovation System')}</h1>
        <p className="text-sm opacity-90 leading-relaxed">
          {t('เปิดโอกาสให้พนักงานมีส่วนร่วมในการพลิกโฉม ปรับปรุงคุณภาพ ลดต้นทุน เพิ่มความปลอดภัย และพัฒนาประสิทธิภาพอย่างก้าวกระโดด', 'An opportunity for employees to engage in transformation, quality improvement, cost reduction, safety enhancement, and breakthrough efficiency development.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mt-4 px-4 space-y-4">
        {/* Section: User Info */}
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">👤 {t('ข้อมูลผู้เสนอแนะ', 'Suggester Information')}</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">{t('ชื่อ - นามสกุล', 'Full Name')} <span className="text-red-500">*</span></label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} required className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition" placeholder={t('กรอกชื่อ - นามสกุล', 'Enter your full name')} />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">{t('แผนก', 'Department')} <span className="text-red-500">*</span></label>
              <select name="department" value={formData.department} onChange={handleInputChange} required className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition appearance-none bg-white">
                <option value="">-- {t('เลือกแผนก', 'Select Department')} --</option>
                {departments.map((dep, i) => <option key={i} value={dep}>{dep === 'อื่นๆ' ? t('อื่นๆ', 'Other') : dep}</option>)}
              </select>
            </div>

            {formData.department === (lang === 'en' ? 'Other' : 'อื่นๆ') || formData.department === 'อื่นๆ' ? (
              <div>
                <label className="block text-sm font-semibold mb-1">{t('ระบุแผนกอื่นๆ', 'Specify Other Department')} <span className="text-red-500">*</span></label>
                <input type="text" name="otherDepartment" value={formData.otherDepartment} onChange={handleInputChange} required className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:border-blue-500 outline-none" placeholder={t('กรอกชื่อแผนก', 'Enter department name')} />
              </div>
            ) : null}

            {formData.department === 'Production' && (
              <div>
                <label className="block text-sm font-semibold mb-1">{t('ไลน์การผลิต', 'Production Line')}</label>
                <input type="text" name="productionLine" value={formData.productionLine} onChange={handleInputChange} className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:border-blue-500 outline-none" placeholder={t('เช่น Line A / Line 1', 'e.g., Line A / Line 1')} />
              </div>
            )}
          </div>
        </div>

        {/* Section: Type */}
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold mb-1">🎯 {t('ประเภทการปรับปรุง', 'Improvement Category')}</h2>
          <p className="text-xs text-slate-500 mb-4">{t('เลือก 1 หัวข้อที่ตรงกับข้อเสนอแนะของคุณมากที่สุด', 'Select 1 category that best fits your suggestion')}</p>
          
          <div className="grid gap-3">
            {suggestionTypes.map((type, i) => (
              <label key={i} className={`relative block border rounded-xl p-4 cursor-pointer transition ${formData.suggestionType === type.value ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="suggestionType" value={type.value} onChange={handleInputChange} className="absolute opacity-0" />
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 min-w-[18px] w-[18px] h-[18px] rounded-full border-2 ${formData.suggestionType === type.value ? 'border-blue-600 bg-blue-600 outline outline-2 outline-blue-200' : 'border-slate-300'}`}></div>
                  <div>
                    <div className="font-bold text-sm text-slate-800">{type.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{type.desc}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Section: Details */}
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold mb-4">📝 {t('รายละเอียดนวัตกรรม', 'Innovation Details')}</h2>
          <div className="space-y-4">
            {detailFields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-semibold mb-1">{field.label} <span className="text-red-500">*</span></label>
                <textarea
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  required
                  rows={3}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:border-blue-500 outline-none"
                  placeholder={t(`อธิบาย${field.label}...`, `Explain ${field.label}...`)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section: Images */}
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold mb-1">📸 {t('รูปภาพประกอบ', 'Attached Images')}</h2>
          <p className="text-xs text-slate-500 mb-4">{t('รองรับการอัปโหลดไฟล์รูปภาพหรือถ่ายจากมือถือ', 'Supports uploading picture files or taking photos from mobile')}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="font-semibold text-sm mb-2 text-slate-700">{t('ก่อนการปรับปรุง', 'Before Improvement')}</div>
              <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition cursor-pointer">
                <input type="file" multiple accept="image/*" onChange={(e) => handleFileChange(e, 'before')} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <span className="text-sm font-bold text-slate-600">{t('แนบรูป Before +', 'Attach Before Image +')}</span>
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {beforeImages.map((file, i) => (
                  <img key={i} src={URL.createObjectURL(file)} className="w-16 h-16 object-cover rounded-lg border flex-shrink-0" alt={`Before preview ${i + 1}`} />
                ))}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4">
              <div className="font-semibold text-sm mb-2 text-slate-700">{t('หลังการปรับปรุง (ถ้ามี)', 'After Improvement (If any)')}</div>
              <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition cursor-pointer">
                <input type="file" multiple accept="image/*" onChange={(e) => handleFileChange(e, 'after')} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <span className="text-sm font-bold text-slate-600">{t('แนบรูป After +', 'Attach After Image +')}</span>
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {afterImages.map((file, i) => (
                  <img key={i} src={URL.createObjectURL(file)} className="w-16 h-16 object-cover rounded-lg border flex-shrink-0" alt={`After preview ${i + 1}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t p-3 z-50">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button type="button" onClick={() => window.location.reload()} disabled={isSubmitting} className="flex-1 bg-slate-200 text-slate-700 font-bold rounded-xl py-3 border border-slate-300 hover:bg-slate-300 transition">{t('ล้างข้อมูล', 'Clear Data')}</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-bold rounded-xl py-3 shadow-lg shadow-blue-200 hover:bg-blue-700 transition">{t('ส่งข้อเสนอแนะ', 'Submit Suggestion')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
