import React, { useState } from 'react';
import { Language, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import {
  apiUrl,
  getActiveApiBaseUrl,
  hasNativeApiBaseConfigured,
  isNativeAppPlatform,
  setCustomApiBaseUrl,
} from '../utils/apiBase';
import { testBackendHealth } from '../utils/sessionClient';
import {
  Clock,
  ShieldAlert,
  MessageCircle,
  RefreshCw,
  MailCheck,
  KeyRound,
  LogIn,
  Server,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AccountStatusBannerProps {
  currentLang: Language;
  user: User | null;
  authReady: boolean;
  onOpenSignIn: () => void;
  onRefreshStatus: () => Promise<void>;
  onResendVerification: () => Promise<void>;
}

export const AccountStatusBanner: React.FC<AccountStatusBannerProps> = ({
  currentLang,
  user,
  authReady,
  onOpenSignIn,
  onRefreshStatus,
  onResendVerification,
}) => {
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const [refreshing, setRefreshing] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Native APK runtime server configuration helper (only shown on Capacitor APK if VITE_API_BASE_URL wasn't configured at build time)
  const isNative = isNativeAppPlatform();
  const [needsServerConfig, setNeedsServerConfig] = useState<boolean>(() => !hasNativeApiBaseConfigured());
  const [serverInput, setServerInput] = useState<string>(() => getActiveApiBaseUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  const handleSaveServerUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingServer(true);
    setServerMsg(null);
    try {
      const saved = setCustomApiBaseUrl(serverInput);
      const ok = await testBackendHealth(saved);
      if (!ok) {
        throw new Error(isAr ? 'تم الحفظ لكن الخادم لم يستجب بعد. انتظر 30 ثانية وجرب مجدداً.' : 'Saved, but server did not respond yet. Wait ~30s for wake-up and retry.');
      }
      setNeedsServerConfig(false);
      setServerMsg(isAr ? 'تم الاتصال بخادم AEGEA بنجاح!' : 'Connected to AEGEA backend successfully!');
    } catch (err: any) {
      setServerMsg(err?.message || (isAr ? 'الرابط غير صالح. يجب أن يبدأ بـ https://' : 'Invalid URL. Must start with https://'));
    } finally {
      setTestingServer(false);
    }
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    setResendMessage(null);
    try {
      await onRefreshStatus();
    } finally {
      setRefreshing(false);
    }
  };

  const handleResendClick = async () => {
    setRefreshing(true);
    setResendMessage(null);
    try {
      await onResendVerification();
      setResendMessage(isAr ? 'تم إرسال رابط التأكيد إلى بريدك الإلكتروني.' : 'Verification email sent to your inbox.');
    } catch (err: any) {
      setResendMessage(err?.message || (isAr ? 'تعذر إرسال الرابط الآن.' : 'Could not resend verification email.'));
    } finally {
      setRefreshing(false);
    }
  };

  if (!authReady) return null;

  const whatsappPayUrl = apiUrl(
    `/api/subscribe-whatsapp?plan=${encodeURIComponent(user?.requestedPlan || 'monthly')}&lang=${encodeURIComponent(currentLang)}${user?.email ? `&email=${encodeURIComponent(user.email)}` : ''}`
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-3 print:hidden">
      {/* Native APK Server URL Setup Card when missing */}
      {isNative && needsServerConfig && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3">
          <div className="flex items-start gap-3">
            <Server className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                {isAr
                  ? 'ربط تطبيق الأندرويد بخادم Render الخاص بك'
                  : 'Connect Android App to Your Render Backend'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {isAr
                  ? 'أدخل رابط Render الخاص بك (مثل https://your-app.onrender.com) لتشغيل البحث والترجمة الفورية داخل الجوال.'
                  : 'Paste your live Render URL (e.g. https://your-app.onrender.com) to enable AI Search and Live Translation.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveServerUrl} className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              required
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="https://aegea-smart-guide.onrender.com"
              className="flex-1 px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs text-[#082F5E] dark:text-white"
            />
            <button
              type="submit"
              disabled={testingServer}
              className="px-4 py-2 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {testingServer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{isAr ? 'حفظ والاتصال' : 'Save & Connect'}</span>
            </button>
          </form>

          {serverMsg && (
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{serverMsg}</span>
            </p>
          )}
        </div>
      )}

      {/* Non-admin Account Gate Banners */}
      {!user?.isAdmin && (!user || user.isGuest) && (
        <div className="p-4 sm:px-6 rounded-2xl bg-white dark:bg-[#0B1D36] border border-[#0D5EAF]/25 dark:border-[#163256] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0D5EAF]/10 dark:bg-sky-950/60 flex items-center justify-center shrink-0">
              <LogIn className="w-4 h-4 text-[#0D5EAF] dark:text-sky-300" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                {t.auth.notSignedIn}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.auth.signInPrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSignIn}
            className="px-4 py-2.5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t.auth.signInWithGoogle}</span>
          </button>
        </div>
      )}

      {!user?.isAdmin && user && !user.isGuest && user.emailVerified === false && (
        <div className="p-4 sm:px-6 rounded-2xl bg-sky-50 dark:bg-[#0B1D36] border border-[#0D5EAF]/40 dark:border-sky-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <MailCheck className="w-5 h-5 text-[#0D5EAF] dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                  {t.auth.verifyEmailTitle} · {user.email}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t.auth.verifyEmailDesc}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={refreshing}
                onClick={handleResendClick}
                className="px-3.5 py-2 rounded-xl border border-[#0D5EAF] text-[#0D5EAF] dark:text-sky-300 text-xs font-bold hover:bg-[#0D5EAF]/10 cursor-pointer"
              >
                {t.auth.resendVerifyBtn}
              </button>
              <button
                type="button"
                disabled={refreshing}
                onClick={handleRefreshClick}
                className="px-3.5 py-2 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{t.auth.refreshStatusBtn}</span>
              </button>
            </div>
          </div>
          {resendMessage && (
            <p className="text-xs font-semibold text-[#0D5EAF] dark:text-sky-300">{resendMessage}</p>
          )}
        </div>
      )}

      {!user?.isAdmin && user && !user.isGuest && user.emailVerified !== false && !user.isPremium && (
        <div
          className={`p-4 sm:px-6 rounded-2xl border space-y-3 ${
            user.approvalStatus === 'rejected' || (user.searchesRemaining ?? 0) <= 0
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
              : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {user.approvalStatus === 'rejected' || (user.searchesRemaining ?? 0) <= 0 ? (
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                  {user.approvalStatus === 'rejected'
                    ? t.auth.rejectedTitle
                    : (user.searchesRemaining ?? 0) > 0
                    ? isAr
                      ? `تجربة مجانية: متبقي ${user.searchesRemaining} من أصل 2 تجربة مجانية`
                      : `Free Trial Active: ${user.searchesRemaining} of 2 Free Trials Left`
                    : t.monetization.outOfSearchesTitle}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {user.approvalStatus === 'rejected'
                    ? t.auth.rejectedDesc
                    : (user.searchesRemaining ?? 0) > 0
                    ? t.auth.pendingApprovalDesc
                    : t.monetization.outOfSearchesDesc}
                  {user.email && <span className="font-semibold"> ({user.email})</span>}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={whatsappPayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{t.auth.subscribeWhatsappBtn}</span>
              </a>
              <button
                type="button"
                disabled={refreshing}
                onClick={handleRefreshClick}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-[#082F5E] dark:text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400" />}
                <span>{isAr ? 'تحديث التفعيل' : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
