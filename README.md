# Design App DKPM

Aplikasi React + Vite yang dikemas sebagai aplikasi Android menggunakan Capacitor.

## Menjalankan versi web

```bash
npm install
npm run dev
```

## Membuat APK Android

Pastikan Android Studio dan Android SDK sudah terpasang, lalu jalankan:

```bash
npm run android:apk
```

APK release bertanda tangan akan tersedia di:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Skrip build akan memakai `JAVA_HOME` jika tersedia atau otomatis mencari JDK
bawaan Android Studio pada lokasi instalasi standar Windows.

Untuk membuat APK debug khusus pengujian:

```bash
npm run android:apk:debug
```

Untuk membuat signed App Bundle (`.aab`) bagi Google Play:

```bash
npm run android:aab
```

App Bundle tersedia di `android/app/build/outputs/bundle/release/app-release.aab`.

## Notifikasi dan izin Android

Pada Android 13 ke atas, aplikasi meminta izin notifikasi setelah pengguna
berhasil login. Tugas aktif dijadwalkan untuk diingatkan pada H-7, H-3, H-1,
H-6 jam, H-2 jam, H-30 menit, dan saat deadline. Pengingat yang semakin dekat
memakai kanal Android berprioritas lebih tinggi. Jadwal otomatis diperbarui
ketika tugas ditambah, diedit, diselesaikan, atau dihapus.

Perubahan aktivitas dan tugas baru menghasilkan notifikasi lokal ketika
aplikasi sedang berjalan. Agar perubahan dari perangkat lain tetap diterima
saat aplikasi benar-benar dihentikan, tahap berikutnya memerlukan Firebase
Cloud Messaging serta backend/Cloud Function untuk mengirim push notification.

Akses dokumen/foto pada Android modern mengikuti scoped storage. Izin baca/tulis
penyimpanan hanya dideklarasikan sampai Android 10 untuk kompatibilitas perangkat
lama. Aplikasi tidak meminta izin `MANAGE_EXTERNAL_STORAGE` (akses semua file).

Dokumen PDF yang dibuat aplikasi serta file dari menu Formulir/Katalog sekarang
disimpan menggunakan API file native ke folder berikut:

```text
Dokumen/Design App DKPM
```

Setelah penyimpanan selesai, aplikasi memeriksa bahwa file benar-benar ada dan
ukurannya tidak kosong, lalu menampilkan lokasi file. Tautan berbagi Google Drive
dan Google Docs otomatis diubah menjadi tautan unduh. File Drive harus diatur
agar dapat diakses oleh pengguna aplikasi; untuk tautan lama tanpa nama file,
aplikasi menggunakan judul dokumen dan ekstensi PDF sebagai nilai awal.

## Peringatan keamanan saat instalasi

APK release sudah ditandatangani dengan kunci release. Meski demikian, APK yang
dipasang langsung dari file (sideload) masih dapat ditandai oleh Play Protect
sebagai aplikasi yang tidak dikenal. Untuk distribusi pengguna, unggah file AAB
ke Google Play Console dan gunakan Internal Testing/Closed Testing sebelum rilis
produksi. Jangan membagikan APK debug.

## Login Google pada APK release

Daftarkan SHA-1 kunci release berikut pada Firebase Console untuk aplikasi
Android `com.designdkpm.app`, kemudian unduh ulang `google-services.json`:

```text
E0:6B:4B:A4:73:09:15:18:42:93:AD:0F:47:31:01:E1:68:81:9C:3A
```

Kunci signing tersimpan secara lokal di `android/keystore` dan kredensialnya di
`android/keystore.properties`. Keduanya diabaikan Git; cadangkan dengan aman
karena diperlukan untuk menerbitkan pembaruan dengan identitas aplikasi yang sama.

Setiap kali kode web berubah, sinkronkan ulang aset ke Android dengan:

```bash
npm run android:sync
```
