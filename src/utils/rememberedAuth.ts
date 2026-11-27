const REMEMBERED_EMAIL_KEY = 'aegea_remembered_email_v1';
const REMEMBER_EMAIL_PREF_KEY = 'aegea_remember_email_pref_v1';

export function getRememberEmailPreference(): boolean {
  try {
    const raw = localStorage.getItem(REMEMBER_EMAIL_PREF_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setRememberEmailPreference(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_EMAIL_PREF_KEY, remember ? 'true' : 'false');
    if (!remember) {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getRememberedEmail(): string {
  try {
    if (!getRememberEmailPreference()) return '';
    return (localStorage.getItem(REMEMBERED_EMAIL_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

export function saveRememberedEmail(email: string, remember = true): void {
  const clean = email.trim().toLowerCase();
  try {
    localStorage.setItem(REMEMBER_EMAIL_PREF_KEY, remember ? 'true' : 'false');
    if (remember && clean && clean.includes('@')) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, clean);
    } else if (!remember) {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearRememberedEmail(): void {
  try {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // ignore storage errors
  }
}
