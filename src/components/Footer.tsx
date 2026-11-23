import React from 'react';
import { Language, ActiveTab } from '../types';
import { SUPPORTED_LANGUAGES, useUiTranslation } from '../hooks/useTranslatedContent';
import { BrandLockup } from './BrandLogo';
import { Mail, Shield, User, Building2 } from 'lucide-react';

interface FooterProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  onTabChange: (tab: ActiveTab) => void;
}

export const Footer: React.FC<FooterProps> = ({
  currentLang,
  onLanguageChange,
  onTabChange,
}) => {
  const { t } = useUiTranslation(currentLang);

  const goToSecureContact = () => {
    onTabChange('about');
    window.setTimeout(() => {
      const formEl = document.getElementById('direct-contact-form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 120);
  };

  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800">
          {/* Logo & Tagline */}
          <div className="flex flex-col items-center lg:items-start gap-2">
            <BrandLockup
              brandName={t.navbar.brandShort}
              subtitle={t.navbar.brandSubtitle || 'Your Smart Guide'}
              darkSurface
            />
            <p className="text-[11px] text-slate-400 font-medium text-center lg:text-start">
              {t.footer.brandTagline}
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onTabChange('about')}
              className="hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.footer.aboutLink}</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('about')}
              className="hover:text-white transition-colors flex items-center gap-1.5 text-amber-400 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{t.footer.partnerLink}</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('terms')}
              className="hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.footer.legalLink}</span>
            </button>

            <button
              type="button"
              onClick={goToSecureContact}
              className="hover:text-white transition-colors flex items-center gap-1.5 text-sky-400 font-bold cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{t.footer.contactEmail}</span>
            </button>
          </div>

          {/* Language Switcher */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {SUPPORTED_LANGUAGES.slice(0, 7).map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLanguageChange(l.code)}
                className={`px-2 py-1 rounded-lg uppercase tracking-wider text-[11px] font-bold transition-colors cursor-pointer ${
                  currentLang.toLowerCase() === l.code
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title={l.nativeName}
              >
                {l.code}
              </button>
            ))}
          </div>
        </div>

        {/* Developer Attribution & Legal Disclaimer notice */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start text-[11px] text-slate-400">
          <div>
            <p className="font-semibold text-slate-300">{t.footer.developedBy}</p>
            <p className="mt-1">
              {t.footer.officialContactLabel}:{' '}
              <button
                type="button"
                onClick={goToSecureContact}
                className="text-sky-400 hover:underline font-semibold cursor-pointer"
              >
                {t.footer.contactEmail}
              </button>
            </p>
          </div>

          <p className="text-slate-400">{t.footer.allRightsReserved}</p>
        </div>
      </div>
    </footer>
  );
};
