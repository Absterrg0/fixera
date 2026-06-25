// firebase-messaging-sw.js
// This service worker handles background (and terminated) push notifications from FCM.
// It must live at the root of the domain, so it belongs in /public/.
// NOTE: Hardcode only non-sensitive config values here (messagingSenderId, projectId, appId).
// These values are already public in the browser and safe to embed in a service worker.

importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

// Will be replaced by the runtime config injected by the FCMProvider on first load.
// Falls back to placeholder values so the SW can still register without crashing.
const config = self.__FIREBASE_CONFIG__ || {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

firebase.initializeApp(config);

const messaging = firebase.messaging();

// Background message handler – shown when the app is in background or closed.
messaging.onBackgroundMessage((payload) => {
  const { title = 'Fixera', body = '' } = payload.notification || {};
  const data = payload.data || {};
  const clickUrl = data.clickUrl || '/';

  self.registration.showNotification(title, {
    body,
    icon: '/fixera-logo.png',
    badge: '/fixera-logo.png',
    data: { url: clickUrl, ...data },
    tag: data.type || 'fixera-notification',   // collapses same-type notifications
    renotify: true,
  });
});

// Open / focus the app when the user clicks the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
