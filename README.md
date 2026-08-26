# Amaliyah Android 1.3

APK native pembungkus Amaliyah dengan notifikasi Android tanpa label asal GitHub.

Versi preview 1.0.1 menambahkan izin lokasi native agar jadwal sholat dapat mendeteksi lokasi di dalam WebView.
Versi 1.1.0 mengaktifkan Firebase Cloud Messaging untuk notifikasi jarak jauh.
Versi 1.2.0 menambahkan gambar notifikasi native untuk keadaan foreground dan background.
Versi 1.3.0 mencegah Service Worker PWA mengganti mode notifikasi native, menyimpan status toggle di Android, dan menampilkan status sambungan Firebase.

## Status

- WebView memuat aplikasi Amaliyah yang selalu mengikuti pembaruan situs.
- Pengingat sholat dari JavaScript dialihkan ke notifikasi native Android.
- Firebase Messaging Service sudah tersedia dan telah lolos build final untuk notifikasi jarak jauh.
- Semua perangkat otomatis mengikuti topik broadcast `amaliyah_semua`.
- APK final 1.3.0 telah dibangun dengan konfigurasi Firebase Amaliyah.
- Paket sumber sengaja tidak menyertakan `google-services.json` dan signing key; masukkan kembali berkas milik Anda ketika melakukan build ulang.

## Firebase

1. Buat proyek di Firebase Console.
2. Tambahkan aplikasi Android dengan package `id.my.elmahbub.amaliyah`.
3. Unduh `google-services.json` dan letakkan di folder `app/`.
4. Build dengan `./gradlew assembleRelease` setelah signing release dikonfigurasi.

Untuk percobaan, kirim pesan melalui Firebase Console > Messaging ke aplikasi Android Amaliyah.

APK `preview` hanya untuk menguji WebView dan notifikasi lokal native. FCM baru ikut dalam APK final setelah `google-services.json` tersedia.
