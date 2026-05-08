export type ConsentCategory = 'analytics' | 'marketing';

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

const STORAGE_KEY = 'fixera-consent-v1';
const EVENT_NAME = 'consent-updated';

export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof parsed.decidedAt !== 'string') return null;
    return {
      necessary: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      decidedAt: parsed.decidedAt,
    };
  } catch {
    return null;
  }
}

export function setConsent(input: { analytics: boolean; marketing: boolean }): ConsentState {
  const state: ConsentState = {
    necessary: true,
    analytics: !!input.analytics,
    marketing: !!input.marketing,
    decidedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('consent: failed to persist to localStorage', err);
    }
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
    } catch {
      // ignore — listeners may not be set up yet
    }
  }
  return state;
}

export function hasConsented(category: ConsentCategory): boolean {
  const state = getConsent();
  if (!state) return false;
  return !!state[category];
}

export function clearConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('consent: failed to clear localStorage', err);
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
  } catch {
    // ignore
  }
}

export const CONSENT_EVENT = EVENT_NAME;
