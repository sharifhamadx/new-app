import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Language, SubscriptionPlan, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl, getActiveApiBaseUrl } from '../utils/apiBase';
import { launchNativeMobileGoogleAuth } from '../utils/mobileAuthBridge';
import {
  registerWithEmail,
  reloadCurrentFirebaseUser,
  resendVerificationEmail,
  resetPasswordEmail,
  signInWithEmail,
  signInWithGooglePopup,
  syncSignedInUserProfile,
} from '../firebase';
import {
  X,
  CheckSquare,
  Square,
  ExternalLink,
  AlertCircle,
  Loader2,
  MessageCircle,
  CheckCircle2,
  Mail,
  Lock,
  User as UserIcon,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  currentLang: Language;
  adminSetupRequired?: boolean;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  currentLang,
  adminSetupRequired = false,
  onSessionUpdated,
}) => {
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [termsAgreed, setTermsAgreed] = useState(true);

  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan>('monthly');
  const [needsVerificationUser, setNeedsVerificationUser] = useState<User | null>(null);
  const [pendingApprovalUser, setPendingApprovalUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setLoading(false);
      setNeedsVerificationUser(null);
      setPendingApprovalUser(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const finalizeSignedInUser = (syncedUser: User) => {
    if (onSessionUpdated) {
      onSessionUpdated(syncedUser, adminSetupRequired);
    }

    if (syncedUser.isAdmin || syncedUser.isPremium) {
      setSuccessMsg(
        syncedUser.isAdmin
          ? t.auth.adminBadge
          : isAr
          ? 'تم تسجيل الدخول واشتراكك مفعّل!'
          : 'Signed in & Subscription Active!'
      );
      setTimeout(() => {
        onClose();
      }, 750);
      return;
    }

    if (syncedUser.emailVerified === false) {
      setNeedsVerificationUser(syncedUser);
      setPendingApprovalUser(null);
      return;
    }

    setNeedsVerificationUser(null);
    setPendingApprovalUser(syncedUser);
  };

  const handleGoogleSignIn = async () => {
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let isNative = false;
      try {
        isNative = Capacitor.isNativePlatform();
      } catch {
        isNative = false;
      }

      if (isNative) {
        const base = getActiveApiBaseUrl();
        if (!base) {
          throw new Error(t.auth.signInGenericError);
        }
        await launchNativeMobileGoogleAuth({
          baseUrl: base,
          lang: currentLang,
          onAuthenticated: (syncedUser) => {
            finalizeSignedInUser(syncedUser);
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
      finalizeSignedInUser(synced);
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
        finalizeSignedInUser(synced);
      } else {
        const fbUser = await signInWithEmail(cleanEmail, passwordInput);
        const synced = await syncSignedInUserProfile(fbUser, { requestedPlan });
        finalizeSignedInUser(synced);
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
            ? 'هذا البريد الإلكتروني مسجل مسبقاً. سجّل الدخول أو اضغط "نسيت / تعيين كلمة مرور".'
            : 'This email is already registered. Sign in or click "Forgot Password".'
        );
        setAuthMode('signin');
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          isAr
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. إذا كنت دخلت سابقاً بـ Google، اضغط "نسيت / تعيين كلمة مرور" لإعداد كلمة مرور.'
            : 'Incorrect email or password. If you previously used Google Sign-In, click "Forgot Password".'
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
      setErrorMsg(isAr ? 'اكتب بريدك الإلكتروني أولاً لاستعادة كلمة المرور.' : 'Enter your email address above first.');
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
    try {
      const freshUser = await reloadCurrentFirebaseUser();
      if (!freshUser) {
        throw new Error(isAr ? 'يرجى تسجيل الدخول مرة أخرى.' : 'Please sign in again.');
      }
      const synced = await syncSignedInUserProfile(freshUser, { requestedPlan });
      finalizeSignedInUser(synced);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await resendVerificationEmail();
      setSuccessMsg(isAr ? 'تم إرسال رابط التفعيل لبريدك.' : 'Verification link re-sent to your email.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#061325]/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#0B1D36] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#163256] overflow-hidden my-6">
        <div className="aegean-meander-border w-full" />

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-[#163256] flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-[#082F5E] dark:text-white tracking-tight">
              {t.auth.chooseAccount}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.auth.googleAccount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-[#082F5E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
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

          {needsVerificationUser ? (
            <div className="space-y-4 p-4 rounded-xl bg-sky-50 dark:bg-[#061325] border border-[#0D5EAF]/30">
              <h3 className="text-sm font-bold text-[#082F5E] dark:text-white">
                {t.auth.verifyEmailTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.auth.verifyEmailDesc} ({needsVerificationUser.email})
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefreshAfterVerify}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>{t.auth.refreshStatusBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResendLink}
                  className="w-full py-2 px-4 rounded-xl border border-[#0D5EAF] text-[#0D5EAF] dark:text-sky-300 text-xs font-bold cursor-pointer"
                >
                  {t.auth.resendVerifyBtn}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsVerificationUser(null);
                    setErrorMsg(null);
                  }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BackArrow className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رجوع للسابق' : 'Back'}</span>
                </button>
              </div>
            </div>
          ) : pendingApprovalUser ? (
            <div className="space-y-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
              <h3 className="text-sm font-bold text-[#082F5E] dark:text-white">
                {t.auth.pendingApprovalTitle}
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {t.auth.pendingApprovalDesc}
              </p>
              <p className="text-xs font-mono font-bold text-[#0D5EAF] dark:text-sky-300">
                {pendingApprovalUser.email}
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href={apiUrl(
                    `/api/subscribe-whatsapp?plan=${encodeURIComponent(
                      pendingApprovalUser.requestedPlan || requestedPlan
                    )}&lang=${encodeURIComponent(currentLang)}&email=${encodeURIComponent(
                      pendingApprovalUser.email
                    )}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t.auth.subscribeWhatsappBtn}</span>
                </a>
                <button
                  type="button"
                  onClick={handleRefreshAfterVerify}
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-[#082F5E] dark:text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isAr ? 'تحديث حالة التفعيل' : 'Refresh Approval Status'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingApprovalUser(null);
                    setErrorMsg(null);
                  }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BackArrow className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رجوع للسابق' : 'Back'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google 1-Click Sign-In */}
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
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
                <span>{t.auth.continueWithGoogle}</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 dark:border-[#163256] w-full" />
                <span className="px-3 bg-white dark:bg-[#0B1D36] text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                  {isAr ? 'أو بالبريد الإلكتروني وكلمة المرور' : 'or with Email & Password'}
                </span>
                <div className="border-t border-slate-200 dark:border-[#163256] w-full" />
              </div>

              {/* Email Sign-In / Sign-Up Form */}
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
                      placeholder="you@example.com"
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
                      <option value="monthly">{isAr ? 'اشتراك شهري غير محدود (€5 شهرياً)' : 'Monthly Unlimited VIP (€5/month)'}</option>
                      <option value="annual">{isAr ? 'اشتراك سنوي غير محدود (€50 سنوياً)' : 'Annual Unlimited VIP (€50/year)'}</option>
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
              </form>

              <div className="flex items-center justify-between gap-2 pt-1">
                {authMode === 'register' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setErrorMsg(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    <BackArrow className="w-3.5 h-3.5" />
                    <span>{isAr ? 'رجوع لتسجيل الدخول' : 'Back to Sign In'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setErrorMsg(null);
                    }}
                    className="text-xs font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer mx-auto"
                  >
                    {t.auth.switchToRegister}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
