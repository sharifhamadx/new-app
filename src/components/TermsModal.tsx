import React from 'react';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { X, ShieldCheck, Mail, AlertTriangle, FileText } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcceptAndClose?: () => void;
  currentLang: Language;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  isOpen,
  onClose,
  onAcceptAndClose,
  currentLang,
}) => {
  const { t } = useUiTranslation(currentLang);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{t.terms.title}</h2>
              <p className="text-xs text-slate-300">{t.terms.lastUpdated}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
          {/* Section 1: Explicit Legal Liability Release */}
          <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-900/50">
            <div className="flex items-center gap-2 mb-2 text-amber-900 dark:text-amber-200 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold">{t.terms.disclaimerTitle}</h3>
            </div>
            <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-100 font-medium leading-relaxed">
              {t.terms.disclaimerBody}
            </p>
          </div>

          {/* Section 2: Restaurant & Dietary Guidance */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>{t.terms.tourismDisclaimerTitle}</span>
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.terms.tourismDisclaimerBody}
            </p>
          </div>

          {/* Section 3: Privacy & GDPR */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>{t.terms.privacyTitle}</span>
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.terms.privacyBody}
            </p>
          </div>

          {/* Section 4: Developer Credentials & Contact */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white">
              {t.terms.developerSectionTitle}
            </h4>
            <div className="space-y-1 text-slate-600 dark:text-slate-300">
              <p>
                <span className="font-semibold text-slate-800 dark:text-white">
                  {t.terms.developerLabel}:
                </span>{' '}
                {t.developer.name}
              </p>
              <p>
                <span className="font-semibold text-slate-800 dark:text-white">
                  {t.terms.nationalityRow}:
                </span>{' '}
                {t.developer.nationality}
              </p>
              <p>
                <span className="font-semibold text-slate-800 dark:text-white">
                  {t.terms.educationRow}:
                </span>{' '}
                {t.developer.education}
              </p>
              <p className="flex items-center gap-1.5 pt-1 text-sky-800 dark:text-sky-400 font-semibold">
                <Mail className="w-4 h-4 shrink-0" />
                <span>{t.terms.contactInfo}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.terms.mandatoryDisclaimer}
          </p>
          <button
            type="button"
            onClick={() => {
              if (onAcceptAndClose) onAcceptAndClose();
              onClose();
            }}
            className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            {t.terms.acceptAgreement}
          </button>
        </div>
      </div>
    </div>
  );
};
