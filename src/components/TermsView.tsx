import React from 'react';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { ShieldCheck, Mail, AlertTriangle, FileText } from 'lucide-react';

interface TermsViewProps {
  currentLang: Language;
}

export const TermsView: React.FC<TermsViewProps> = ({ currentLang }) => {
  const { t } = useUiTranslation(currentLang);

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
          {t.terms.complianceBadge}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
          {t.terms.title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {t.terms.lastUpdated}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-10 border border-slate-200 dark:border-slate-800 space-y-8 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
        {/* Release of European & Greek Legal Liabilities */}
        <div className="p-6 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200 font-bold">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <h2 className="text-base font-bold">{t.terms.disclaimerTitle}</h2>
          </div>
          <p className="text-sm text-amber-950 dark:text-amber-100 font-medium leading-relaxed">
            {t.terms.disclaimerBody}
          </p>
        </div>

        {/* Restaurant & Dietary Guidance */}
        <div className="space-y-3 pt-2">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span>{t.terms.tourismDisclaimerTitle}</span>
          </h3>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.terms.tourismDisclaimerBody}
          </p>
        </div>

        {/* GDPR Privacy */}
        <div className="space-y-3 pt-2">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span>{t.terms.privacyTitle}</span>
          </h3>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.terms.privacyBody}
          </p>
        </div>

        {/* Developer Identification & Support */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
          <h3 className="font-bold text-slate-900 dark:text-white text-base">
            {t.terms.developerSectionTitle}
          </h3>
          <div className="space-y-1.5 text-slate-600 dark:text-slate-300 text-sm">
            <p>
              <strong className="text-slate-800 dark:text-white">{t.terms.developerLabel}:</strong>{' '}
              {t.developer.name}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-white">{t.terms.nationalityRow}:</strong>{' '}
              {t.developer.nationality}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-white">{t.terms.educationRow}:</strong>{' '}
              {t.developer.education}
            </p>
            <p className="flex items-center gap-2 pt-2 text-sky-800 dark:text-sky-400 font-bold">
              <Mail className="w-4 h-4 shrink-0" />
              <span>{t.terms.contactInfo}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
