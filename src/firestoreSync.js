export function getFirebaseErrorMessage(error, hostname = '') {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return `Login Google belum diizinkan untuk domain ${hostname}. Hubungi administrator untuk mendaftarkan domain ini di Firebase Authentication.`;
    case 'auth/popup-blocked':
      return 'Browser memblokir jendela login. Izinkan pop-up untuk situs ini, lalu coba kembali.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login dibatalkan. Klik Login dengan Google untuk mencoba kembali.';
    case 'auth/operation-not-allowed':
      return 'Login Google belum diaktifkan. Hubungi administrator.';
    case 'permission-denied':
      return 'Akses data ditolak. Hubungi administrator untuk memeriksa izin akun Anda.';
    case 'unauthenticated':
      return 'Sesi login tidak valid. Keluar, lalu login kembali.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'auth/network-request-failed':
      return 'Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba kembali.';
    default:
      return `Gagal mengakses server${error?.code ? ` (${error.code})` : ''}. Silakan coba kembali.`;
  }
}

// A cache snapshot or an unacknowledged write is not proof of a successful sync.
export function subscribeServerCollections(sources, {
  listen, onPending, onSynced, onError,
  timeoutMs = 15000, schedule = setTimeout, cancel = clearTimeout,
}) {
  const ready = new Set();
  const unsubscribers = [];
  let active = true;
  let failed = false;
  let timer = null;

  const clearTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const waitForServer = () => {
    if (failed || timer !== null) return;
    onPending();
    timer = schedule(() => {
      timer = null;
      if (active) onError({ code: 'deadline-exceeded' });
    }, timeoutMs);
  };
  const fail = (error) => {
    if (!active) return;
    failed = true;
    clearTimer();
    onError(error);
  };

  waitForServer();
  for (const [index, source] of sources.entries()) {
    try {
      unsubscribers.push(listen(source.ref, { includeMetadataChanges: true }, snapshot => {
        if (!active) return;
        source.onData(snapshot);
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          ready.delete(index);
          waitForServer();
          return;
        }
        ready.add(index);
        if (!failed && ready.size === sources.length) {
          clearTimer();
          onSynced();
        }
      }, fail));
    } catch (error) {
      fail(error);
    }
  }

  return () => {
    active = false;
    clearTimer();
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}
