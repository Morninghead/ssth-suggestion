'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const suggestionTypes = [
  {
    title: 'Safety First',
    description: 'การปรับปรุงด้านความปลอดภัยในพื้นที่ปฏิบัติงาน',
  },
  {
    title: 'Wasted Reduction',
    description: 'การลดความสูญเสียของเวลา วัตถุดิบ หรือพลังงาน',
  },
  {
    title: 'Quality Improvement',
    description: 'การเพิ่มคุณภาพของผลิตภัณฑ์ หรือบริการ',
  },
  {
    title: 'Work Environment',
    description: 'การปรับปรุงสิ่งแวดล้อมในพื้นที่การทำงานให้ดีขึ้น',
  },
  {
    title: 'People & Culture',
    description: 'มุ่งเน้นคน คุณภาพชีวิต ความก้าวหน้า',
  },
];

export default function SuggestionPaperPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!formRef.current) return;

    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(formRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5',
      });

      const pageWidth = 148;
      const pageHeight = 210;
      const margin = 4;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scale = Math.min(
        availableWidth / canvas.width,
        availableHeight / canvas.height,
      );
      const renderWidth = canvas.width * scale;
      const renderHeight = canvas.height * scale;
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;

      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        x,
        y,
        renderWidth,
        renderHeight,
      );
      pdf.save('suggestion-form-a5.pdf');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action');
    if (action === 'print') {
      window.print();
      return;
    }
    if (action === 'pdf') {
      void handleDownloadPdf();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 8mm;
          }
          .no-print {
            display: none !important;
          }
          .a5-paper {
            width: 100% !important;
            margin: 0 !important;
            padding: 1mm !important;
          }
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 print:max-w-none print:px-0">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            กลับหน้าฟอร์มออนไลน์
          </Link>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Print A5
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isDownloading ? 'กำลังสร้าง PDF...' : 'Download PDF'}
          </button>
        </div>

        <div
          ref={formRef}
          className="a5-paper mx-auto w-full max-w-[560px] bg-white p-6 text-[10px] leading-tight text-slate-900 shadow-xl print:max-w-none print:shadow-none"
        >
          <header className="border-b border-slate-800 pb-2 text-center">
            <h1 className="text-base font-bold">แบบฟอร์มข้อเสนอแนะนวัตกรรม (Hyeok-sin)</h1>
            <p className="mt-1 text-[9px]">
              Innovation Suggestion Form (สำหรับพิมพ์ลงกระดาษขนาด A5)
            </p>
          </header>

          <section className="mt-3">
            <h2 className="mb-2 border-l-4 border-blue-700 pl-2 text-[11px] font-bold">
              1) ข้อมูลผู้เสนอแนะ
            </h2>
            <div className="space-y-2">
              <div className="grid grid-cols-[90px_1fr] items-end gap-2">
                <span className="font-semibold">ชื่อ - นามสกุล</span>
                <span className="h-5 border-b border-slate-700" />
              </div>
              <div className="grid grid-cols-[90px_1fr] items-end gap-2">
                <span className="font-semibold">แผนก</span>
                <span className="h-5 border-b border-slate-700" />
              </div>
              <div className="grid grid-cols-[90px_1fr] items-end gap-2">
                <span className="font-semibold">ไลน์การผลิต</span>
                <span className="h-5 border-b border-slate-700" />
              </div>
            </div>
          </section>

          <section className="mt-4">
            <h2 className="mb-2 border-l-4 border-blue-700 pl-2 text-[11px] font-bold">
              2) ประเภทการปรับปรุง
            </h2>
            <div className="grid grid-cols-1 gap-1">
              {suggestionTypes.map((type) => (
                <div key={type.title} className="flex items-start gap-2">
                  <span className="mt-[2px] inline-block h-3 w-3 border border-slate-800" />
                  <div>
                    <div>{type.title}</div>
                    <div className="text-[9px] text-slate-700">{type.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4">
            <h2 className="mb-2 border-l-4 border-blue-700 pl-2 text-[11px] font-bold">
              3) รายละเอียดนวัตกรรม
            </h2>
            <div className="space-y-2">
              {[
                'รายละเอียด',
                'สาเหตุ',
                'ปัญหา',
                'การแก้ไข',
              ].map((label) => (
                <div key={label}>
                  <div className="mb-1 font-semibold">{label}</div>
                  <div className="h-10 border border-slate-700" />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 font-semibold">วันที่เสนอ</div>
                <div className="h-6 border-b border-slate-700" />
              </div>
              <div>
                <div className="mb-1 font-semibold">ลงชื่อผู้เสนอ</div>
                <div className="h-6 border-b border-slate-700" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
