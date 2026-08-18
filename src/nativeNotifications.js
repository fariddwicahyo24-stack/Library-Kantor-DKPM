import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createDeadlineNotificationPlan } from './deadlineNotifications.js';

const UPDATE_CHANNEL = 'dkpm-updates';
let notificationSequence = 0;

function isNative() {
  return Capacitor.isNativePlatform();
}

async function createAndroidChannels() {
  if (Capacitor.getPlatform() !== 'android') return;

  const channels = [
    {
      id: UPDATE_CHANNEL,
      name: 'Perubahan Aplikasi',
      description: 'Pemberitahuan tugas baru dan perubahan data aplikasi.',
      importance: 3,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#F97316',
    },
    {
      id: 'dkpm-deadline-normal',
      name: 'Pengingat Deadline',
      description: 'Pengingat awal untuk pekerjaan yang akan mendekati deadline.',
      importance: 3,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#F97316',
    },
    {
      id: 'dkpm-deadline-urgent',
      name: 'Deadline Mendesak',
      description: 'Pengingat berprioritas tinggi saat deadline semakin dekat.',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#F97316',
    },
  ];

  await Promise.all(channels.map(async channel => {
    try {
      await LocalNotifications.createChannel(channel);
    } catch (error) {
      // Android 7.0/7.1 belum mengenal notification channel, tetapi tetap
      // dapat menampilkan local notification tanpa channel.
      console.warn(`Kanal notifikasi ${channel.id} tidak dibuat:`, error);
    }
  }));
}

export async function initializeNativeNotifications() {
  if (!isNative()) return false;

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') return false;

  await createAndroidChannels();
  return true;
}

async function hasNotificationPermission() {
  if (!isNative()) return false;
  const permission = await LocalNotifications.checkPermissions();
  return permission.display === 'granted';
}

export async function showNativeActionNotification(title, body, extra = {}) {
  if (!await hasNotificationPermission()) return false;

  notificationSequence = (notificationSequence + 1) % 1000;
  const id = ((Date.now() % 2_000_000_000) + notificationSequence) | 0;
  await LocalNotifications.schedule({
    notifications: [{
      id,
      title,
      body,
      largeBody: body,
      channelId: UPDATE_CHANNEL,
      smallIcon: 'ic_stat_dkpm',
      iconColor: '#F97316',
      autoCancel: true,
      extra: { source: 'dkpm-update', ...extra },
    }],
  });
  return true;
}

export async function syncDeadlineNotifications(tasks) {
  if (!await hasNotificationPermission()) return 0;

  const pending = await LocalNotifications.getPending();
  const existingDeadlineNotifications = pending.notifications
    .filter(notification => notification.extra?.source === 'dkpm-deadline')
    .map(({ id }) => ({ id }));

  if (existingDeadlineNotifications.length > 0) {
    await LocalNotifications.cancel({ notifications: existingDeadlineNotifications });
  }

  const notifications = createDeadlineNotificationPlan(tasks);
  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
  return notifications.length;
}

export async function addNotificationNavigationListener(onOpenTasks) {
  if (!isNative()) return null;
  return LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const source = event.notification?.extra?.source;
    if (source === 'dkpm-deadline' || source === 'dkpm-update') onOpenTasks();
  });
}
