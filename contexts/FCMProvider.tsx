'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { getFirebaseMessaging } from '@/lib/firebase';
import { getAuthToken } from '@/lib/utils';

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------

interface FCMContextValue {
  /** Whether the browser has granted notification permission */
  permissionGranted: boolean;
  /** The current FCM registration token (if obtained) */
  fcmToken: string | null;
  /** Manually request notification permission */
  requestPermission: () => Promise<boolean>;
  /** Number of unread push notifications (resets on page focus) */
  unreadPushCount: number;
}

const FCMContext = createContext<FCMContextValue>({
  permissionGranted: false,
  fcmToken: null,
  requestPermission: async () => false,
  unreadPushCount: 0,
});

export const useFCM = () => useContext(FCMContext);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

async function saveTokenToServer(token: string): Promise<void> {
  try {
    const authToken = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    await fetch(`${BACKEND_URL}/api/user/fcm/token`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ token }),
    });
  } catch {
    // Non-critical — swallow silently
  }
}

async function removeTokenFromServer(token: string): Promise<void> {
  try {
    const authToken = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    await fetch(`${BACKEND_URL}/api/user/fcm/token`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
      body: JSON.stringify({ token }),
    });
  } catch {
    // Non-critical
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    return reg;
  } catch (err) {
    console.warn('[FCM] Service worker registration failed:', err);
    return null;
  }
}

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------

interface FCMProviderProps {
  /** Set to true only when the user is authenticated */
  isAuthenticated: boolean;
  children: React.ReactNode;
}

export const FCMProvider: React.FC<FCMProviderProps> = ({ isAuthenticated, children }) => {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [unreadPushCount, setUnreadPushCount] = useState(0);
  const initialised = useRef(false);
  const currentToken = useRef<string | null>(null);

  // ------------------------------------------------------------------
  // Obtain FCM token
  // ------------------------------------------------------------------
  const obtainToken = useCallback(async (swReg: ServiceWorkerRegistration) => {
    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    try {
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (token && token !== currentToken.current) {
        currentToken.current = token;
        setFcmToken(token);
        await saveTokenToServer(token);
      }
    } catch (err) {
      console.warn('[FCM] Failed to obtain token:', err);
    }
  }, []);

  // ------------------------------------------------------------------
  // Request permission imperatively (called by UI prompt)
  // ------------------------------------------------------------------
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
      setPermissionGranted(true);
      return true;
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setPermissionGranted(true);

      const swReg = await registerServiceWorker();
      if (swReg) await obtainToken(swReg);

      return true;
    }

    return false;
  }, [obtainToken]);

  // ------------------------------------------------------------------
  // Initialise on first mount (when user is authenticated)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;
    if (initialised.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    initialised.current = true;

    const init = async () => {
      const permission = Notification.permission;
      if (permission === 'granted') {
        setPermissionGranted(true);
        const swReg = await registerServiceWorker();
        if (swReg) await obtainToken(swReg);
      }
    };

    init();
  }, [isAuthenticated, obtainToken]);

  // ------------------------------------------------------------------
  // Foreground message listener
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!permissionGranted) return;

    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      const { title = 'Fixera', body = '' } = payload.notification ?? {};
      const data = (payload.data ?? {}) as Record<string, string>;
      const url = data.clickUrl || '/';

      setUnreadPushCount((n) => n + 1);

      // Show an in-app toast that acts as the foreground notification
      toast(title, {
        description: body,
        duration: 6000,
        action: {
          label: 'View',
          onClick: () => { window.location.href = url; },
        },
      });
    });

    return unsubscribe;
  }, [permissionGranted]);

  // Reset badge count when window is focused
  useEffect(() => {
    const onFocus = () => setUnreadPushCount(0);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Remove token when user logs out
  useEffect(() => {
    if (!isAuthenticated && currentToken.current) {
      removeTokenFromServer(currentToken.current);
      currentToken.current = null;
      setFcmToken(null);
      setPermissionGranted(false);
      initialised.current = false;
    }
  }, [isAuthenticated]);

  return (
    <FCMContext.Provider value={{ permissionGranted, fcmToken, requestPermission, unreadPushCount }}>
      {children}
    </FCMContext.Provider>
  );
};
