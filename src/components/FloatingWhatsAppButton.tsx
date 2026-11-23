import React from 'react';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';

interface FloatingWhatsAppButtonProps {
  currentLang: Language;
}

export const FloatingWhatsAppButton: React.FC<FloatingWhatsAppButtonProps> = ({ currentLang }) => {
  const { t } = useUiTranslation(currentLang);
  const href = apiUrl(`/api/subscribe-whatsapp?lang=${encodeURIComponent(currentLang)}`);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.auth.floatingWhatsappLabel || 'Subscribe VIP via WhatsApp'}
      title={t.auth.floatingWhatsappTooltip || 'Subscribe via WhatsApp to receive your VIP code'}
      className="fixed bottom-5 end-5 z-40 print:hidden group inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-lg shadow-emerald-950/25 border border-emerald-400/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <span className="relative flex items-center justify-center w-5 h-5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-35 animate-ping" />
        <svg
          viewBox="0 0 32 32"
          className="relative w-5 h-5 fill-current text-white"
          aria-hidden="true"
        >
          <path d="M16.002 3.2C8.943 3.2 3.2 8.943 3.2 16.002c0 2.507.727 4.94 2.1 7.032L3.568 28.8l5.915-1.7a12.75 12.75 0 0 0 6.519 1.787h.005c7.057 0 12.793-5.743 12.793-12.885C28.8 8.943 23.06 3.2 16.002 3.2Zm7.454 18.187c-.317.893-1.841 1.707-2.55 1.811-.676.098-1.534.14-2.476-.16-.57-.182-1.304-.425-2.244-.831-3.949-1.706-6.526-5.688-6.723-5.95-.196-.262-1.605-2.137-1.605-4.078 0-1.94 1.016-2.893 1.376-3.287.36-.395.786-.493 1.048-.493.262 0 .524.003.753.014.241.012.565-.092.884.674.327.786 1.114 2.714 1.212 2.911.098.197.163.427.032.689-.13.262-.196.427-.392.656-.197.23-.414.513-.59.689-.197.197-.402.411-.173.805.23.394 1.022 1.686 2.195 2.732 1.509 1.345 2.78 1.763 3.173 1.96.394.197.624.164.853-.099.23-.262.984-1.148 1.246-1.542.262-.394.524-.328.885-.197.361.131 2.295 1.082 2.688 1.279.393.197.656.295.754.459.098.164.098.95-.219 1.842Z" />
        </svg>
      </span>
      <span className="text-xs font-bold tracking-tight whitespace-nowrap">
        {t.auth.floatingWhatsappLabel || 'VIP WhatsApp'}
      </span>
    </a>
  );
};
