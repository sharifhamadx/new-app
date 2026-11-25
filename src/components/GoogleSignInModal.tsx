import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Language, SubscriptionPlan, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { apiUrl, getActiveApiBaseUrl } from '../utils/apiBase';
import {
  redeemActivationCode,
  adminSetupPasscode,
  adminLoginPasscode,
} from '../utils/sessionClient';
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
  ShieldCheck,
  CheckSquare,
  Square,
  ExternalLink,
  AlertCircle,
  KeyRound,
  Loader2,
  Shield,
  MessageCircle,
  CheckCircle2,
  Mail,
  Lock,
  User as UserIcon,
  RefreshCw,
} from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  currentLang: Language;
  initialTab?: 'account' | 'vip' | 'admin';
  adminSetupRequired?: boolean;
  onSessionUpdated?: (user: User, adminSetupRequired: boolean) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  currentLang,
  initialTab = 'account',
  adminSetupRequired = false,
  onSessionUpdated,
}) => {
  const { t } = useUiTranslation(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');

  const [activeTab, setActiveTab] = useState<'account' | 'vip' | 'admin'>(initialTab);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [termsAgreed, setTermsAgreed] = useState(true);

  // Email / Password state
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan>('monthly');
  const [needsVerificationUser, setNeedsVerificationUser] = useState<User | null>(null);
  const [pendingApprovalUser, setPendingApprovalUser] = useState<User | null>(null);

  // VIP Activation Code form
  const [activationCode, setActivationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin Passcode backup form
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminConfirmPasscode, setAdminConfirmPasscode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
      setLoading(false);
      setNeedsVerificationUser(null);
      setPendingApprovalUser(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const whatsappHref = apiUrl(
    `/api/subscribe-whatsapp?plan=${encodeURIComponent(requestedPlan)}&lang=${encodeURIComponent(currentLang)}${
      emailInput.trim() ? `&email=${encodeURIComponent(emailInput.trim())}` : ''
    }`
  );

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

    // Verified non-admin user -> show Pending Admin Approval & WhatsApp payment prompt
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
          throw new Error(
            isAr
              ? 'يرجى ربط رابط خادم Render أولاً من الشريط العلوي لتسجيل الدخول عبر Google في التطبيق، أو استخدم تسجيل الدخول بالإيميل وكلمة المرور.'
              : 'Configure your Render Server URL first or sign in with Email & Password below.'
          );
        }
        await Browser.open({
          url: `${base}/mobile-auth?lang=${encodeURIComponent(currentLang)}`,
        });
        setLoading(false);
        return;
      }

      const fbUser = await signInWithGooglePopup();
      const synced = await syncSignedInUserProfile(fbUser, { requestedPlan });
      finalizeSignedInUser(synced);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user') {
        setErrorMsg(t.auth.popupClosedError);
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(t.auth.popupBlockedError);
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
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          isAr
            ? 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل بعد في Firebase Console (Authentication → Sign-in method → Email/Password).'
            : 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password).'
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg(isAr ? 'هذا البريد الإلكتروني مسجل مسبقاً. قم بتسجيل الدخول بدلاً من ذلك.' : 'This email is already registered. Please sign in instead.');
        setAuthMode('signin');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg(isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Incorrect email or password.');
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

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      setErrorMsg(t.auth.agreementRequiredNotice);
      return;
    }
    const cleanCode = activationCode.trim();
    if (!cleanCode) {
      setErrorMsg(t.auth.signInGenericError);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await redeemActivationCode(cleanCode, true);
      setSuccessMsg(t.auth.codeActivatedSuccess || 'VIP Access Activated Successfully!');
      setActivationCode('');
      if (onSessionUpdated) {
        onSessionUpdated(result.user, result.adminSetupRequired);
      }
      setTimeout(() => {
        onClose();
      }, 850);
    } catch (err: any) {
      setErrorMsg(err?.message || t.auth.signInGenericError);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (adminSetupRequired) {
      if (adminPasscode.trim().length < 8 || adminPasscode !== adminConfirmPasscode) {
        setErrorMsg(t.auth.adminPasscodeMismatch || 'Passcodes do not match or are under 8 characters.');
        return;
      }
    } else if (!adminPasscode.trim()) {
      setErrorMsg(t.auth.signInGenericError);
      return;
    }

    setLoading(true);
    try {
      const result = adminSetupRequired
        ? await adminSetupPasscode(adminPasscode.trim())
        : await adminLoginPasscode(adminPasscode);
      setAdminPasscode('');
      setAdminConfirmPasscode('');
      setSuccessMsg(t.auth.adminBadge);
      if (onSessionUpdated) {
        onSessionUpdated(result.user, false);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Admin authentication failed.');
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

        {/* 3-Mode Switcher: Email/Google Account vs VIP Code vs Admin Backup */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#061325] border border-slate-200 dark:border-[#163256]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('account');
                setErrorMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'account'
                  ? 'bg-[#0D5EAF] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>{t.auth.accountTabLabel || 'Email / Google'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('vip');
                setErrorMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'vip'
                  ? 'bg-[#0D5EAF] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>{t.auth.vipTabLabel || 'VIP Code'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setErrorMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#082F5E] dark:hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>{t.auth.adminTabLabel || 'Admin'}</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
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

          {activeTab === 'account' ? (
            needsVerificationUser ? (
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
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Google 1-Click Sign-In */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#082F5E] dark:text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                          {t.auth.forgotPasswordBtn}
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
                        <option value="weekly_pass">{isAr ? 'بطاقة 7 أيام (€9.99)' : '7-Day Greece Trip Pass (€9.99)'}</option>
                        <option value="monthly">{isAr ? 'اشتراك شهري VIP (€5/شهرياً)' : 'Monthly VIP (€5/month)'}</option>
                        <option value="annual">{isAr ? 'اشتراك سنوي VIP (€50/سنوياً)' : 'Annual VIP (€50/year)'}</option>
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
                    className="w-full py-3 px-5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>
                      {authMode === 'register' ? t.auth.createAccountBtn : t.auth.signInEmailBtn}
                    </span>
                  </button>
                </form>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'signin' ? 'register' : 'signin');
                      setErrorMsg(null);
                    }}
                    className="text-xs font-bold text-[#0D5EAF] dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    {authMode === 'signin' ? t.auth.switchToRegister : t.auth.switchToSignIn}
                  </button>
                </div>
              </div>
            )
          ) : activeTab === 'vip' ? (
            <form onSubmit={handleRedeemCode} className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-3">
                <p className="text-xs text-emerald-950 dark:text-emerald-100 leading-relaxed">
                  {t.auth.requestCodeViaWhatsapp}
                </p>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>{t.auth.subscribeWhatsappBtn}</span>
                </a>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="vip-activation-code-input"
                  className="text-xs font-bold text-[#082F5E] dark:text-slate-200 block"
                >
                  {t.auth.enterActivationCode}
                </label>
                <input
                  id="vip-activation-code-input"
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                  placeholder={t.auth.activationCodePlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] font-mono text-sm font-bold tracking-wider text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.auth.activatingCodeLabel}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{t.auth.activateCodeBtn}</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#061325] border border-slate-200 dark:border-[#163256] space-y-1.5">
                <p className="text-xs font-bold text-[#082F5E] dark:text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{adminSetupRequired ? t.auth.adminSetupTitle : t.auth.adminLoginTitle}</span>
                </p>
                {adminSetupRequired && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t.auth.adminSetupDesc}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <input
                  type="password"
                  required
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder={t.auth.adminPasscodePlaceholder}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />

                {adminSetupRequired && (
                  <input
                    type="password"
                    required
                    value={adminConfirmPasscode}
                    onChange={(e) => setAdminConfirmPasscode(e.target.value)}
                    placeholder={t.auth.adminConfirmPasscodePlaceholder}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#061325] text-sm text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                <span>{adminSetupRequired ? t.auth.adminClaimBtn : t.auth.adminLoginBtn}</span>
              </button>
            </form>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t.auth.simulationNotice}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
