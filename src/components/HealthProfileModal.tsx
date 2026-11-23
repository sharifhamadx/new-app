import React, { useState, useEffect } from 'react';
import { HealthConditionId, HealthProfile, Language, User } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { saveHealthProfileSession } from '../utils/sessionClient';
import {
  X,
  HeartPulse,
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

interface HealthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: Language;
  healthProfile: HealthProfile;
  onSaveHealthProfile: (next: HealthProfile, updatedUser?: User) => void;
}

const CONDITION_IDS: HealthConditionId[] = [
  'diabetes',
  'hypertension',
  'heart_healthy',
  'celiac_gluten_free',
  'lactose_free',
  'nut_allergy',
  'seafood_allergy',
  'vegetarian',
  'halal',
  'mobility_accessible',
  'low_impact',
];

export const HealthProfileModal: React.FC<HealthProfileModalProps> = ({
  isOpen,
  onClose,
  currentLang,
  healthProfile,
  onSaveHealthProfile,
}) => {
  const { t } = useUiTranslation(currentLang);
  const hpLabels = t.healthProfile || {};
  const condLabels = (hpLabels.conditions || {}) as Record<string, string>;

  const [selectedConditions, setSelectedConditions] = useState<HealthConditionId[]>(
    healthProfile.conditions || []
  );
  const [notes, setNotes] = useState(healthProfile.allergiesOrNotes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedConditions(healthProfile.conditions || []);
      setNotes(healthProfile.allergiesOrNotes || '');
      setErrorMsg(null);
      setSaving(false);
    }
  }, [isOpen, healthProfile]);

  if (!isOpen) return null;

  const toggleCondition = (id: HealthConditionId) => {
    setSelectedConditions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const nextProfile: HealthProfile = {
      conditions: selectedConditions,
      allergiesOrNotes: notes.trim().slice(0, 280),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await saveHealthProfileSession(nextProfile);
      onSaveHealthProfile(res.healthProfile, res.user);
      onClose();
    } catch (err: any) {
      // Persist locally even if server sync fails momentarily, but report error if needed
      onSaveHealthProfile(nextProfile);
      if (err?.message) {
        setErrorMsg(err.message);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setErrorMsg(null);
    const cleared: HealthProfile = {
      conditions: [],
      allergiesOrNotes: '',
      updatedAt: new Date().toISOString(),
    };
    try {
      const res = await saveHealthProfileSession(cleared);
      onSaveHealthProfile(res.healthProfile, res.user);
      onClose();
    } catch {
      onSaveHealthProfile(cleared);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {hpLabels.title || 'Personal Health & Wellness Profile'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {hpLabels.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Conditions Checklist */}
          <div className="space-y-2.5">
            <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 block">
              {hpLabels.conditionsLabel || 'Health, Dietary & Mobility Focus'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CONDITION_IDS.map((cid) => {
                const active = selectedConditions.includes(cid);
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => toggleCondition(cid)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-start transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    <span className="leading-snug">{condLabels[cid] || cid}</span>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        active
                          ? 'bg-white text-emerald-700 border-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Notes / Allergies */}
          <div className="space-y-1.5">
            <label
              htmlFor="health-notes-input"
              className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 block"
            >
              {hpLabels.notesLabel || 'Additional Allergies or Personal Health Notes'}
            </label>
            <textarea
              id="health-notes-input"
              rows={2}
              maxLength={280}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={hpLabels.notesPlaceholder}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Privacy & Medical Notice */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{hpLabels.privacyNote}</span>
            </p>
            <p className="leading-relaxed text-slate-500 dark:text-slate-400">
              {hpLabels.medicalDisclaimer}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={handleClear}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{hpLabels.clearBtn || 'Clear Settings'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{hpLabels.savingBtn || 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{hpLabels.saveBtn || 'Save & Update AI Suggestions'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
