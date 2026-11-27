import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Language, SubscriptionPlan, Theme, User } from '../types';
import {
  SUPPORTED_LANGUAGES,
  getLanguageShortLabel,
  useUiTranslation,
} from '../hooks/useTranslatedContent';
import {
  getActiveApiBaseUrl,
  hasNativeApiBaseConfigured,
  isNativeAppPlatform,
  setCustomApiBaseUrl,
} from '../utils/apiBase';
import { launchNativeMobileGoogleAuth } from '../utils/mobileAuthBridge';
import { testBackendHealth } from '../utils/sessionClient';
import {
  firebaseSignOut,
  registerWithEmail,
  reloadCurrentFirebaseUser,
  resendVerificationEmail,
  resetPasswordEmail,
  signInWithEmail,
  signInWithGooglePopup,
  syncSignedInUserProfile,
} from '../firebase';
import { BrandLockup } from './BrandLogo';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  Compass,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  User as UserIcon,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface AuthGateScreenProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  theme: Theme;
  onToggleTheme: () => void;
  pendingVerificationUser: User | null;
  onAuthenticated: (user: User) => void;
  onOpenTerms: () => void;
  onSignedOutReset: () => void;
}

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  currentLang,
  onLanguageChange,
  theme,
  onToggleTheme,
  pendingVerificationUser,
  onAuthenticated,
  onOpenTerms,
  onSignedOutReset,
}) => {
  const { t, isTranslatingUi } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan>('monthly');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Native APK Render Server URL setup
  const isNative = isNativeAppPlatform();
  const [needsServerConfig, setNeedsServerConfig] = useState<boolean>(
    () => isNative && !hasNativeApiBaseConfigured()
  );
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
        throw new Error(
          isAr
            ? 'تم الحفظ لكن الخادم لم يستجب بعد. انتظر 30 ثانية وجرب مجدداً.'
            : 'Saved, but server did not respond yet. Wait ~30s for wake-up and retry.'
        );
      }
      setNeedsServerConfig(false);
      setServerMsg(isAr ? 'تم الاتصال بخادم AEGEA بنجاح!' : 'Connected to AEGEA backend successfully!');
    } catch (err: any) {
      setServerMsg(
        err?.message || (isAr ? 'الرابط غير صالح. يجب أن يبدأ بـ https://' : 'Invalid URL. Must start with https://')
      );
    } finally {
      setTestingServer(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let native = false;
      try {
        native = Capacitor.isNativePlatform();
      } catch {
        native = false;
      }

      if (native) {
        const base = getActiveApiBaseUrl();
        if (!base) {
          setNeedsServerConfig(true);
          setLoading(false);
          return;
        }
        await launchNativeMobileGoogleAuth({
          baseUrl: base,
          lang: currentLang,
          onAuthenticated: (syncedUser) => {
            onAuthenticated(syncedUser);
          },
          onError: (err: any) => {
            setErrorMsg(err?.message || t.auth.signInGenericError);
          },
        });
        setLoading(false);
        return;
      }

      const fbUser = await signInWithGooglePopup();
      const synced = await syncSignedInUserProfile(fbUser, { requestedPlan });
      onAuthenticated(synced);
    } catch (err: any) {
      const code = String(err?.code || '');
      const msgStr = String(err?.message || '');
      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg(t.auth.popupClosedError);
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(t.auth.popupBlockedError);
      } else if (code === 'auth/unauthorized-domain' || /unauthorized-domain/i.test(msgStr)) {
        setErrorMsg(
          isAr
            ? 'تعذر إتمام الدخول عبر Google حالياً. يرجى المحاولة مجدداً أو الدخول بالبريد الإلكتروني.'
            : 'Google Sign-In is temporarily unavailable. Please try again or sign in with Email.'
        );
      } else {
        setErrorMsg(err?.message || t.auth.signInGenericError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || passwordInput.length < 6) {
      setErrorMsg(
        isAr
          ? 'أدخل بريداً إلكترونياً صحيحاً وكلمة مرور من 6 أحرف على الأقل.'
          : 'Enter a valid email address and a password of at least 6 characters.'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (authMode === 'register') {
        const { firebaseUser } = await registerWithEmail({
          name: fullName.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          password: passwordInput,
        });
        const synced = await syncSignedInUserProfile(firebaseUser, { requestedPlan });
        onAuthenticated(synced);
      } else {
        const fbUser = await signInWithEmail(cleanEmail, passwordInput);
        const synced = await syncSignedInUserProfile(fbUser, { requestedPlan });
        onAuthenticated(synced);
      }
    } catch (err: any) {
      const code = String(err?.code || '');
      const msgStr = String(err?.message || '');
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          isAr
            ? 'تسجيل الدخول بالبريد الإلكتروني غير متاح حالياً. استخدم الدخول عبر Google.'
            : 'Email sign-in is currently unavailable. Please continue with Google.'
        );
      } else if (code === 'auth/unauthorized-domain' || /unauthorized-domain/i.test(msgStr)) {
        setErrorMsg(t.auth.signInGenericError);
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg(
          isAr
            ? 'هذا البريد الإلكتروني مسجل مسبقاً. انتقل لتسجيل الدخول أو اضغط "نسيت / تعيين كلمة مرور".'
            : 'This email is already registered. Switch to Sign In or click "Forgot Password".'
        );
        setAuthMode('signin');
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          isAr
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. إذا كنت دخلت عبر Google مسبقاً، اضغط "نسيت / تعيين كلمة مرور" لإعداد كلمة مرور.'
            : 'Incorrect email or password. If you previously signed in with Google, use "Forgot Password" to set one.'
        );
      } else {
        setErrorMsg(err?.message || t.auth.signInGenericError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(isAr ? 'اكتب بريدك الإلكتروني أولاً لاستعادة كلمة المرور.' : 'Enter your email address first.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await resetPasswordEmail(cleanEmail);
      setSuccessMsg(t.auth.resetSentMsg);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAfterVerify = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const freshUser = await reloadCurrentFirebaseUser();
      if (!freshUser) {
        throw new Error(isAr ? 'يرجى تسجيل الدخول مرة أخرى.' : 'Please sign in again.');
      }
      const synced = await syncSignedInUserProfile(freshUser, { requestedPlan });
      onAuthenticated(synced);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerify = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await resendVerificationEmail();
      setSuccessMsg(isAr ? 'تم إرسال رابط التأكيد إلى بريدك الإلكتروني.' : 'Verification link sent to your email.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutPending = async () => {
    setLoading(true);
    try {
      await firebaseSignOut();
      onSignedOutReset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFE] dark:bg-[#061325] text-[#082F5E] dark:text-slate-100">
      <div className="aegean-meander-border w-full" />

      {/* Minimal Header (No Dashboard, No Nav Leaks) */}
      <header className="w-full border-b border-slate-200 dark:border-[#163256] bg-white/95 dark:bg-[#061325]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <BrandLockup
            brandName={t.navbar.brandShort}
            subtitle={t.navbar.brandSubtitle || 'Your Smart Guide'}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 text-[#082F5E] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0B1D36] rounded-lg transition-colors cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#082F5E]" />
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[#082F5E] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0B1D36] rounded-lg transition-colors cursor-pointer"
              >
                {isTranslatingUi ? (
                  <Loader2 className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400" />
                )}
                <span className="uppercase">{getLanguageShortLabel(currentLang)}</span>
              </button>

              {langMenuOpen && (
                <div
                  className="absolute end-0 mt-2 w-56 bg-white dark:bg-[#0B1D36] rounded-2xl shadow-xl border border-slate-200 dark:border-[#163256] py-2 z-50"
                  onMouseLeave={() => setLangMenuOpen(false)}
                >
                  <div className="max-h-60 overflow-y-auto px-1.5 space-y-0.5">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          onLanguageChange(lang.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          currentLang.toLowerCase() === lang.code
                            ? 'bg-sky-50 dark:bg-[#082F5E] text-[#0D5EAF] dark:text-sky-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{lang.nativeName}</span>
                        {currentLang.toLowerCase() === lang.code && (
                          <Check className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Auth Gate */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-4xl space-y-5">
          {/* Native APK Server URL Setup Card when unconfigured */}
          {isNative && needsServerConfig && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3">
              <div className="flex items-start gap-3">
                <Server className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-[#082F5E] dark:text-white">
                    {isAr ? 'ربط التطبيق بالخدمة' : 'Connect App Service'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {isAr
                      ? 'أدخل رابط الخدمة لتفعيل الدخول والبحث والترجمة.'
                      : 'Enter your service URL to enable Sign-In, Search, and Translation.'}
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
                  {testingServer ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
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

          {/* Split Aegean Onboarding & Mandatory Login Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#163256] bg-white dark:bg-[#0B1D36]">
            {/* Left Aegean Editorial Showcase */}
            <div className="lg:col-span-5 bg-gradient-to-br from-[#082F5E] via-[#0D5EAF] to-[#082F5E] text-white p-7 sm:p-9 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-bold text-sky-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>AEGEA · Hellas Smart Guide</span>
                </div>

                <h1 className="font-editorial text-2xl sm:text-3xl font-bold leading-snug text-white">
                  {isAr
                    ? 'دليلك الذكي إلى اليونان يبدأ بتسجيل الدخول'
                    : 'Your Smart Guide to Greece Starts Here'}
                </h1>

                <p className="text-xs sm:text-sm text-sky-100/95 leading-relaxed">
                  {isAr
                    ? 'سجّل الدخول أو أنشئ حساباً جديداً عبر Google أو البريد الإلكتروني. تحصل على تجربتين مجانيتين، ثم يمكنك الاشتراك الشهري (€5) أو السنوي (€50) عبر واتساب.'
                    : 'Sign in or create an account with Google or Email. You receive 2 free trials, then unlock unlimited services via Monthly (€5) or Annual (€50) subscription.'}
                </p>
              </div>

              <div className="space-y-3 pt-2 text-xs text-sky-100">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/10 border border-white/15">
                  <Compass className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? 'اكتشف أفضل الحانات اليونانية، الفنادق السيكلادية، والمعالم الأثرية في كافة أنحاء اليونان.'
                      : 'Discover verified Greek tavernas, Cycladic boutique hotels & ancient sites across all Greece.'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/10 border border-white/15">
                  <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? 'حساب شخصي آمن لحفظ مفضلتك وخطط رحلاتك الصحية في اليونان.'
                      : 'Secure personal account for your saved spots and curated Greek itineraries.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Sign-In / Sign-Up Form Panel */}
            <div className="lg:col-span-7 p-6 sm:p-9 space-y-5">
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {pendingVerificationUser ? (
                <div className="space-y-4 p-5 rounded-2xl bg-sky-50 dark:bg-[#061325] border border-[#0D5EAF]/30">
                  <h2 className="font-editorial text-lg font-bold text-[#082F5E] dark:text-white">
                    {t.auth.verifyEmailTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t.auth.verifyEmailDesc} ({pendingVerificationUser.email})
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleRefreshAfterVerify}
                      className="flex-1 py-3 px-4 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span>{t.auth.refreshStatusBtn}</span>
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleResendVerify}
                      className="py-3 px-4 rounded-xl border border-[#0D5EAF] text-[#0D5EAF] dark:text-sky-300 text-xs font-bold cursor-pointer"
                    >
                      {t.auth.resendVerifyBtn}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleSignOutPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1D36] text-xs font-bold text-[#082F5E] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <BackArrow className="w-3.5 h-3.5" />
                    <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</span>
                    <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#082F5E] dark:text-white">
                      {isAr
                        ? 'تسجيل الدخول أو إنشاء حساب'
                        : 'Sign In or Create Account'}
                    </h2>
                  </div>

                  {/* Primary Hero Google Sign-In / Sign-Up Button */}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleAuth}
                    className="w-full py-3.5 px-5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-3 shadow-md shadow-[#0D5EAF]/20 transition-all cursor-pointer"
                  >
                    <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                        />
                      </svg>
                    </span>
                    <span>
                      {loading
                        ? isAr
                          ? 'جاري الاتصال بحساب Google...'
                          : 'Connecting to Google...'
                        : isAr
                        ? 'تسجيل الدخول أو إنشاء حساب عبر Google'
                        : 'Continue with Google (Sign In / Sign Up)'}
                    </span>
                  </button>

                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-slate-200 dark:border-[#163256] w-full" />
                    <span className="px-3 bg-white dark:bg-[#0B1D36] text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                      {isAr ? 'أو باستخدام البريد الإلكتروني وكلمة المرور' : 'or use Email & Password'}
                    </span>
                    <div className="border-t border-slate-200 dark:border-[#163256] w-full" />
                  </div>

                  {/* Mode Switcher: Sign In vs Create New Account */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#061325] border border-slate-200 dark:border-[#163256]">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMsg(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        authMode === 'signin'
                          ? 'bg-white dark:bg-[#0B1D36] text-[#082F5E] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isAr ? 'تسجيل الدخول' : 'Sign In'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setErrorMsg(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        authMode === 'register'
                          ? 'bg-white dark:bg-[#0B1D36] text-[#082F5E] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isAr ? 'إنشاء حساب جديد' : 'Create New Account'}
                    </button>
                  </div>

                  <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                    {authMode === 'register' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                          {t.auth.fullNameLabel}
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={isAr ? 'الاسم الكامل' : 'Your full name'}
                            className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                        {t.auth.emailLabel}
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="you@gmail.com"
                          className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200">
                          {t.auth.passwordLabel}
                        </label>
                        {authMode === 'signin' && (
                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-[11px] font-semibold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            {isAr ? 'نسيت / تعيين كلمة مرور' : t.auth.forgotPasswordBtn}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="••••••••"
                          className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs sm:text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                        />
                      </div>
                    </div>

                    {authMode === 'register' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block">
                          {t.auth.selectPlanLabel}
                        </label>
                        <select
                          value={requestedPlan}
                          onChange={(e) => setRequestedPlan(e.target.value as SubscriptionPlan)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-xs text-[#082F5E] dark:text-white cursor-pointer"
                        >
                          <option value="monthly">
                            {isAr ? 'اشتراك شهري غير محدود (€5 شهرياً)' : 'Monthly Unlimited VIP (€5/month)'}
                          </option>
                          <option value="annual">
                            {isAr ? 'اشتراك سنوي غير محدود (€50 سنوياً)' : 'Annual Unlimited VIP (€50/year)'}
                          </option>
                        </select>
                      </div>
                    )}

                    {/* Terms checkbox */}
                    <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTermsAgreed(!termsAgreed);
                          setErrorMsg(null);
                        }}
                        className="mt-0.5 text-amber-900 dark:text-amber-300 shrink-0 cursor-pointer"
                        aria-label="Agree to Terms"
                      >
                        {termsAgreed ? (
                          <CheckSquare className="w-4 h-4 text-[#0D5EAF] dark:text-sky-400" />
                        ) : (
                          <Square className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                        )}
                      </button>
                      <div className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                        <span>{t.auth.termsAgreementCheckbox} </span>
                        <button
                          type="button"
                          onClick={onOpenTerms}
                          className="font-semibold underline text-[#0D5EAF] dark:text-sky-400 inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>{t.auth.termsLinkText}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-5 rounded-xl border border-[#0D5EAF] bg-white dark:bg-[#061325] hover:bg-sky-50 dark:hover:bg-[#082F5E] disabled:opacity-60 text-[#0D5EAF] dark:text-sky-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>
                        {authMode === 'register' ? t.auth.createAccountBtn : t.auth.signInEmailBtn}
                      </span>
                    </button>

                    {authMode === 'register' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('signin');
                          setErrorMsg(null);
                        }}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <BackArrow className="w-3.5 h-3.5" />
                        <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</span>
                      </button>
                    )}
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
