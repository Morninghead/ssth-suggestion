'use client';

import { useLanguage } from '../contexts/LanguageContext';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex bg-slate-900/10 backdrop-blur-md p-1 rounded-full border border-slate-400/20 shadow-sm">
        <button 
          type="button"
          onClick={(e) => { e.preventDefault(); setLang('th'); }}
          className={`px-3 py-1 rounded-full text-xs font-bold transition ${lang === 'th' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          TH
        </button>
        <button 
          type="button"
          onClick={(e) => { e.preventDefault(); setLang('en'); }}
          className={`px-3 py-1 rounded-full text-xs font-bold transition ${lang === 'en' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          EN
        </button>
      </div>
    </div>
  );
}
