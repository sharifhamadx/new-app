import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ApprovalStatus,
  FirestoreUserRecord,
  Language,
  SubscriptionPlan,
  User,
} from '../types';
import {
  adminApproveSubscriber,
  adminListSubscribers,
  adminRejectSubscriber,
  adminSetPendingSubscriber,
  isAdminEmail,
} from '../firebase';
import {
  X,
  Users,
  CheckCircle2,
  Clock,
  Ban,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Calendar,
  Mail,
  RotateCcw,
} from 'lucide-react';

interface SubscriberControlCenterProps {
  currentLang: Language;
  currentUser: User | null;
  onPendingCountChange?: (count: number) => void;
}

export const SubscriberControlCenter: React.FC<SubscriberControlCenterProps> = ({
  currentLang,
  currentUser,
  onPendingCountChange,
}) => {
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const [subscribers, setSubscribers] = useState<FirestoreUserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | ApprovalStatus>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, SubscriptionPlan>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const isVerifiedAdmin = Boolean(
    currentUser &&
      !currentUser.isGuest &&
      currentUser.isAdmin &&
      currentUser.emailVerified !== false &&
      isAdminEmail(currentUser.email)
  );

  const loadSubscribers = useCallback(async () => {
    if (!isVerifiedAdmin) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await adminListSubscribers();
      const nonAdminList = list.filter((u) => !isAdminEmail(u.email));
      setSubscribers(nonAdminList);
      if (onPendingCountChange) {
        onPendingCountChange(nonAdminList.filter((u) => u.approvalStatus === 'pending').length);
      }
      setPlanDrafts((prev) => {
        const next = { ...prev };
        for (const item of nonAdminList) {
          if (!next[item.uid]) {
            const p =
              item.subscriptionPlan !== 'free'
                ? item.subscriptionPlan
                : item.requestedPlan !== 'free'
                ? item.requestedPlan
                : 'monthly';
            next[item.uid] = p;
          }
        }
        return next;
      });
      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const item of nonAdminList) {
          if (next[item.uid] === undefined) {
            next[item.uid] = item.paymentNote || '';
          }
        }
        return next;
      });
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isAr
            ? 'تعذر تحميل قائمة المشتركين. تأكد من تسجيل الدخول ببريد المدير.'
            : 'Could not load subscribers. Ensure you are signed in with your Admin email.')
      );
    } finally {
      setLoading(false);
    }
  }, [isVerifiedAdmin, isAr, onPendingCountChange]);

  useEffect(() => {
    void loadSubscribers();
  }, [loadSubscribers]);

  const counts = useMemo(() => {
    const pending = subscribers.filter((s) => s.approvalStatus === 'pending').length;
    const approved = subscribers.filter((s) => s.approvalStatus === 'approved').length;
    const rejected = subscribers.filter((s) => s.approvalStatus === 'rejected').length;
    return {
      total: subscribers.length,
      pending,
      approved,
      rejected,
    };
  }, [subscribers]);

  const filteredSubscribers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subscribers.filter((s) => {
      const matchesTab = filterStatus === 'all' || s.approvalStatus === filterStatus;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        s.email.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.paymentNote.toLowerCase().includes(q)
      );
    });
  }, [subscribers, filterStatus, searchQuery]);

  const handleApprove = async (sub: FirestoreUserRecord) => {
    const chosenPlan: SubscriptionPlan = planDrafts[sub.uid] || 'monthly';
    const durationDays = chosenPlan === 'weekly_pass' ? 7 : chosenPlan === 'annual' ? 365 : 30;
    const note = (noteDrafts[sub.uid] ?? sub.paymentNote ?? '').trim() || (isAr ? 'تم تأكيد الدفع والتفعيل' : 'Payment verified & activated');

    setBusyUid(sub.uid);
    setErrorMsg(null);
    try {
      const updated = await adminApproveSubscriber({
        uid: sub.uid,
        plan: chosenPlan,
        durationDays,
        paymentNote: note,
      });
      setSubscribers((prev) => {
        const next = prev.map((item) => (item.uid === sub.uid ? updated : item));
        if (onPendingCountChange) {
          onPendingCountChange(next.filter((u) => u.approvalStatus === 'pending').length);
        }
        return next;
      });
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر تفعيل المشترك.' : 'Failed to activate subscriber.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = async (sub: FirestoreUserRecord) => {
    const note = (noteDrafts[sub.uid] ?? '').trim() || (isAr ? 'بانتظار تأكيد دفع الاشتراك' : 'Awaiting valid subscription payment');
    setBusyUid(sub.uid);
    setErrorMsg(null);
    try {
      const updated = await adminRejectSubscriber(sub.uid, note);
      setSubscribers((prev) => {
        const next = prev.map((item) => (item.uid === sub.uid ? updated : item));
        if (onPendingCountChange) {
          onPendingCountChange(next.filter((u) => u.approvalStatus === 'pending').length);
        }
        return next;
      });
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر إيقاف الحساب.' : 'Failed to suspend subscriber.'));
    } finally {
      setBusyUid(null);
    }
  };

  const handleSetPending = async (sub: FirestoreUserRecord) => {
    setBusyUid(sub.uid);
    setErrorMsg(null);
    try {
      const updated = await adminSetPendingSubscriber(sub.uid);
      setSubscribers((prev) => {
        const next = prev.map((item) => (item.uid === sub.uid ? updated : item));
        if (onPendingCountChange) {
          onPendingCountChange(next.filter((u) => u.approvalStatus === 'pending').length);
        }
        return next;
      });
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر تحديث الحالة.' : 'Failed to update status.'));
    } finally {
      setBusyUid(null);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPlanLabel = (plan?: string) => {
    if (plan === 'weekly_pass') return isAr ? '7 أيام (€9.99)' : '7-Day (€9.99)';
    if (plan === 'annual') return isAr ? 'سنوي (€50)' : 'Annual (€50)';
    if (plan === 'monthly') return isAr ? 'شهري (€5)' : 'Monthly (€5)';
    return isAr ? 'غير محدد' : 'Free';
  };

  if (!isVerifiedAdmin) return null;

  return (
    <div className="space-y-5">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#0D5EAF] text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-editorial text-lg sm:text-xl font-bold text-[#082F5E] dark:text-white">
              {isAr ? 'لوحة تحكم المشتركين والموافقات' : 'Subscriber Approval Control Center'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'كل مشترك جديد يسجل بالإيميل ينتظر موافقتك وتفعيلك بعد دفع الاشتراك'
                : 'Every newly registered subscriber stays pending until you approve & activate after payment.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadSubscribers()}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-[#082F5E] dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400" />}
          <span>{isAr ? 'تحديث القائمة' : 'Refresh'}</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256]">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي المسجلين' : 'Total Accounts'}
          </p>
          <p className="text-2xl font-extrabold text-[#082F5E] dark:text-white tabular-nums mt-0.5">
            {counts.total}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            {isAr ? 'بانتظار الموافقة' : 'Pending Approval'}
          </p>
          <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
            {counts.pending}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
            {isAr ? 'مشتركون مفعّلون' : 'Active Approved'}
          </p>
          <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
            {counts.approved}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
          <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300">
            {isAr ? 'موقوف / مرفوض' : 'Suspended'}
          </p>
          <p className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums mt-0.5">
            {counts.rejected}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{errorMsg}</span>
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'pending', labelAr: `بانتظار التفعيل (${counts.pending})`, labelEn: `Pending (${counts.pending})` },
              { id: 'approved', labelAr: `المفعّلون (${counts.approved})`, labelEn: `Approved (${counts.approved})` },
              { id: 'rejected', labelAr: `الموقوفون (${counts.rejected})`, labelEn: `Suspended (${counts.rejected})` },
              { id: 'all', labelAr: `الكل (${counts.total})`, labelEn: `All (${counts.total})` },
            ] as const
          ).map((tab) => {
            const active = filterStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#0D5EAF] text-white border-[#0D5EAF]'
                    : 'bg-white dark:bg-[#0B1D36] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#163256] hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالإيميل أو الاسم...' : 'Search by email or name...'}
            className="w-full ps-8 pe-3 py-2 rounded-xl border border-slate-200 dark:border-[#163256] bg-white dark:bg-[#0B1D36] text-xs text-[#082F5E] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D5EAF]"
          />
        </div>
      </div>

      {/* Subscribers List */}
      {loading && subscribers.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#0D5EAF]" />
          <span>{isAr ? 'جاري تحميل المشتركين...' : 'Loading subscribers...'}</span>
        </div>
      ) : filteredSubscribers.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] text-center space-y-1.5">
          <p className="text-sm font-bold text-[#082F5E] dark:text-white">
            {isAr ? 'لا يوجد مشتركين في هذا القسم حالياً' : 'No subscribers in this filter'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'أي مستخدم جديد يقوم بالتسجيل سيظهر هنا فوراً للمراجعة والتفعيل بعد الدفع.'
              : 'New registrants appear here immediately for payment verification and activation.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pe-1">
          {filteredSubscribers.map((sub) => {
            const isBusy = busyUid === sub.uid;
            const currentPlan = planDrafts[sub.uid] || (sub.requestedPlan !== 'free' ? sub.requestedPlan : 'monthly');
            const currentNote = noteDrafts[sub.uid] ?? sub.paymentNote ?? '';

            return (
              <div
                key={sub.uid}
                className="p-4 rounded-xl bg-white dark:bg-[#0B1D36] border border-slate-200 dark:border-[#163256] space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#0D5EAF]/10 dark:bg-sky-950/60 border border-[#0D5EAF]/25 flex items-center justify-center text-sm font-extrabold text-[#0D5EAF] dark:text-sky-300 shrink-0">
                      {(sub.displayName || sub.email || 'U').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#082F5E] dark:text-white truncate">
                        {sub.displayName}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 shrink-0 text-[#0D5EAF] dark:text-sky-400" />
                        <span className="truncate">{sub.email}</span>
                      </p>
                    </div>
                  </div>

                  {/* Explicit Status Indicator */}
                  <div className="flex flex-wrap items-center gap-2">
                    {sub.approvalStatus === 'approved' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isAr ? 'مفعّل' : 'Approved'}</span>
                      </span>
                    ) : sub.approvalStatus === 'rejected' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-bold">
                        <Ban className="w-3.5 h-3.5" />
                        <span>{isAr ? 'موقوف' : 'Suspended'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isAr ? 'بانتظار الدفع والموافقة' : 'Pending Approval'}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {isAr ? 'تاريخ التسجيل:' : 'Registered:'} {formatDate(sub.createdAt)}
                  </span>
                  <span>
                    {isAr ? 'الباقة المطلوبة:' : 'Requested:'}{' '}
                    <strong className="text-[#082F5E] dark:text-slate-200">
                      {formatPlanLabel(sub.requestedPlan)}
                    </strong>
                  </span>
                  <span>
                    {isAr ? 'التجارب المتبقية:' : 'Trials Left:'}{' '}
                    <strong className="text-[#082F5E] dark:text-slate-200">
                      {sub.approvalStatus === 'approved' ? '∞' : `${Math.max(0, Math.min(2, sub.searchesRemaining ?? 0))}/2`}
                    </strong>
                  </span>
                  {sub.subscriptionExpiresAt && (
                    <span>
                      {isAr ? 'ينتهي في:' : 'Expires:'}{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {formatDate(sub.subscriptionExpiresAt)}
                      </strong>
                    </span>
                  )}
                </div>

                {/* Admin Action Row */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-[#163256] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <select
                    value={currentPlan}
                    onChange={(e) =>
                      setPlanDrafts((prev) => ({
                        ...prev,
                        [sub.uid]: e.target.value as SubscriptionPlan,
                      }))
                    }
                    className="sm:col-span-3 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-[#082F5E] dark:text-white cursor-pointer"
                  >
                    <option value="monthly">{isAr ? 'شهري غير محدود (€5)' : 'Monthly Unlimited (€5)'}</option>
                    <option value="annual">{isAr ? 'سنوي غير محدود (€50)' : 'Annual Unlimited (€50)'}</option>
                  </select>

                  <input
                    type="text"
                    value={currentNote}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [sub.uid]: e.target.value,
                      }))
                    }
                    maxLength={250}
                    placeholder={isAr ? 'ملاحظة الدفع (مثلاً: دفع واتساب)' : 'Payment note (e.g. Paid via WhatsApp)'}
                    className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-[#082F5E] dark:text-white"
                  />

                  <div className="sm:col-span-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleApprove(sub)}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>{isAr ? 'موافقة وتفعيل' : 'Approve & Activate'}</span>
                    </button>

                    {sub.approvalStatus !== 'rejected' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleReject(sub)}
                        className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إيقاف / رفض' : 'Suspend'}</span>
                      </button>
                    )}

                    {sub.approvalStatus !== 'pending' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSetPending(sub)}
                        title={isAr ? 'إرجاع للانتظار' : 'Reset to pending'}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface SubscriberDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: Language;
  currentUser: User | null;
  onPendingCountChange?: (count: number) => void;
}

export const SubscriberDashboardModal: React.FC<SubscriberDashboardModalProps> = ({
  isOpen,
  onClose,
  currentLang,
  currentUser,
  onPendingCountChange,
}) => {
  const isVerifiedAdmin = Boolean(
    currentUser &&
      !currentUser.isGuest &&
      currentUser.isAdmin &&
      currentUser.emailVerified !== false &&
      isAdminEmail(currentUser.email)
  );
  if (!isOpen || !isVerifiedAdmin) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#061325]/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl bg-[#F7FAFE] dark:bg-[#061325] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#163256] overflow-hidden my-6">
        <div className="aegean-meander-border w-full" />
        <div className="px-6 py-4 bg-white dark:bg-[#0B1D36] border-b border-slate-200 dark:border-[#163256] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0D5EAF] dark:text-sky-300">
            <ShieldCheck className="w-4 h-4" />
            <span>AEGEA Admin Console</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-[#082F5E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <SubscriberControlCenter
            currentLang={currentLang}
            currentUser={currentUser}
            onPendingCountChange={onPendingCountChange}
          />
        </div>
      </div>
    </div>
  );
};
