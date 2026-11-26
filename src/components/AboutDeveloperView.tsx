import React, { useState } from 'react';
import { Language } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl } from '../utils/apiBase';
import { apiFetch } from '../utils/sessionClient';
import {
  GraduationCap,
  Flag,
  Mail,
  Send,
  CheckCircle2,
  Globe2,
  AlertCircle,
  Building2,
  MessageCircle,
} from 'lucide-react';

interface AboutDeveloperViewProps {
  currentLang: Language;
}

export const AboutDeveloperView: React.FC<AboutDeveloperViewProps> = ({ currentLang }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentNotice, setSentNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // B2B Partner Listing (€49/mo) form state
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<'taverna' | 'hotel' | 'tour'>('taverna');
  const [partnerCity, setPartnerCity] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [partnerNotes, setPartnerNotes] = useState('');
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);
  const [partnerSuccess, setPartnerSuccess] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);

  const { t } = useUiTranslation(currentLang);
  const whatsappUrl = apiUrl(`/api/subscribe-whatsapp?topic=support&lang=${encodeURIComponent(currentLang)}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setIsSending(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Could not send message. Please try again.');
      }

      setSentNotice(true);
      setMessage('');
      setTimeout(() => setSentNotice(false), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Could not send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !partnerCity.trim() || !partnerEmail.trim()) return;

    setIsSubmittingPartner(true);
    setPartnerError(null);

    try {
      const res = await apiFetch('/api/partner-inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessType,
          city: partnerCity.trim(),
          contactEmail: partnerEmail.trim(),
          websiteUrl: websiteUrl.trim(),
          notes: partnerNotes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Could not submit partner inquiry. Please try again.');
      }

      setPartnerSuccess(true);
      setBusinessName('');
      setPartnerCity('');
      setWebsiteUrl('');
      setPartnerNotes('');
      setTimeout(() => setPartnerSuccess(false), 6000);
    } catch (err: any) {
      console.error(err);
      setPartnerError(err?.message || 'Could not submit partner inquiry. Please try again.');
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      {/* Profile Header */}
      <div className="rounded-2xl bg-[#082F5E] text-white p-8 sm:p-10 border border-[#163256]">
        <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-start">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-[#0B1D36] border border-[#0D5EAF]/40 flex flex-col items-center justify-center shrink-0">
            <span className="font-editorial text-4xl font-bold text-amber-300">SH</span>
            <span className="text-[11px] font-medium text-sky-100 mt-1">{t.developer.name}</span>
          </div>

          <div className="space-y-4 flex-1">
            <p className="text-xs text-sky-300 font-medium">{t.developer.languagesSpoken}</p>

            <div>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white flex flex-wrap items-center justify-center md:justify-start gap-3">
                <span>{t.developer.name}</span>
                <span className="text-xl font-serif text-amber-300 font-normal">
                  ({t.developer.nameArabic})
                </span>
              </h1>
              <p className="text-slate-300 text-sm mt-1">
                {t.developer.subtitleRole}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3 text-start">
                <Flag className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] text-slate-400 font-semibold block">
                    {t.developer.nationalityLabel}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-white">
                    {t.developer.nationality}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3 text-start">
                <GraduationCap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] text-slate-400 font-semibold block">
                    {t.developer.educationLabel}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-white leading-snug">
                    {t.developer.education}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Story & Privacy-Protected Support Channels */}
      <div className="bg-white dark:bg-[#0B1D36] rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-[#163256] space-y-6">
        <h2 className="font-editorial text-2xl font-bold text-[#082F5E] dark:text-white">
          {t.developer.pageTitle}
        </h2>

        <div className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed space-y-4">
          <p>{t.developer.bioParagraph1}</p>
          <p>{t.developer.bioParagraph2}</p>
        </div>

        <div className="p-5 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0D5EAF] text-white flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                {t.developer.emailLabel}
              </p>
              <p className="text-sm sm:text-base font-bold text-[#082F5E] dark:text-white">
                {t.developer.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t.auth.subscribeWhatsappBtn}</span>
            </a>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('direct-contact-form');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 rounded-lg bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer"
            >
              {t.developer.sendDirectEmail}
            </button>
          </div>
        </div>
      </div>

      {/* Featured Partner Placement (€49/mo) B2B Inquiry */}
      <div
        id="partner-listing-section"
        className="bg-white dark:bg-[#0B1D36] rounded-2xl p-6 sm:p-10 border border-amber-300 dark:border-amber-700/70 space-y-6"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Building2 className="w-5 h-5 shrink-0" />
            <h2 className="font-editorial text-2xl font-bold text-[#082F5E] dark:text-white">
              {t.developer.partnerSectionTitle}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.developer.partnerSectionSubtitle}
          </p>
        </div>

        {partnerError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{partnerError}</span>
          </div>
        )}

        {partnerSuccess ? (
          <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{t.developer.partnerSuccessNotice}</span>
          </div>
        ) : (
          <form onSubmit={handlePartnerSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.partnerBusinessName}
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t.developer.partnerBusinessName}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.partnerBusinessType}
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as 'taverna' | 'hotel' | 'tour')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
                >
                  <option value="taverna">{t.developer.partnerTypeOptions?.taverna}</option>
                  <option value="hotel">{t.developer.partnerTypeOptions?.hotel}</option>
                  <option value="tour">{t.developer.partnerTypeOptions?.tour}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.partnerCity}
                </label>
                <input
                  type="text"
                  required
                  value={partnerCity}
                  onChange={(e) => setPartnerCity(e.target.value)}
                  placeholder="Athens, Santorini, Chania..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.partnerEmail}
                </label>
                <input
                  type="email"
                  required
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  placeholder="owner@business.gr"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                {t.developer.partnerWebsite}
              </label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                {t.developer.partnerNotes}
              </label>
              <textarea
                rows={3}
                value={partnerNotes}
                onChange={(e) => setPartnerNotes(e.target.value)}
                placeholder={t.developer.partnerNotes}
                className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-600 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingPartner}
              className="py-3 px-6 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>{isSubmittingPartner ? t.developer.sendingLabel : t.developer.partnerSubmitBtn}</span>
            </button>
          </form>
        )}
      </div>

      {/* Secure Direct Contact Form */}
      <div
        id="direct-contact-form"
        className="bg-white dark:bg-[#0B1D36] rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-[#163256] space-y-6"
      >
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#082F5E] dark:text-white flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#0D5EAF] dark:text-sky-400" />
            <span>{t.developer.sendMessage}</span>
          </h2>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {sentNotice ? (
          <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{t.developer.messageSentNotice}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.namePlaceholder}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.developer.namePlaceholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t.developer.emailPlaceholder}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                {t.developer.messagePlaceholder}
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t.developer.messagePlaceholder}
                className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="py-3 px-6 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? t.developer.sendingLabel : t.developer.sendBtn}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
