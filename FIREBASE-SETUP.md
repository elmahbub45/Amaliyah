# Mengaktifkan Notifikasi Jarak Jauh

Satu tindakan yang harus dilakukan pemilik aplikasi adalah membuat konfigurasi Firebase, karena berkas tersebut terikat pada akun dan proyek milik Amaliyah.

1. Buka Firebase Console dan buat proyek bernama **Amaliyah**.
2. Tambahkan aplikasi **Android**.
3. Isi Android package name: `id.my.elmahbub.amaliyah`.
4. Unduh `google-services.json`.
5. Letakkan berkas itu di `app/google-services.json`.
6. Build APK final dengan Gradle/Android Studio.

## Mengirim notifikasi pertama

Setelah APK final dipasang dan dibuka setidaknya sekali:

1. Buka **Firebase Console > Messaging**.
2. Buat kampanye notifikasi baru.
3. Isi judul dan isi pesan.
4. Pilih aplikasi Android **Amaliyah** sebagai target, atau gunakan topik `amaliyah_semua` untuk pengiriman melalui FCM HTTP v1/backend.
5. Kirim tes, lalu terbitkan.

Notifikasi diterima oleh Android sebagai notifikasi milik aplikasi **Amaliyah**, bukan notifikasi situs GitHub.

## Mengirim gambar pada notifikasi

1. Unggah JPG/PNG ke lokasi publik HTTPS, misalnya Cloudflare R2.
2. Pastikan ukuran gambar tidak lebih dari 1 MB.
3. Pada bagian **Notification image** di Firebase, masukkan URL HTTPS gambar tersebut.
4. APK 1.3.0 akan menampilkan gambar besar ketika notifikasi diperluas, baik saat aplikasi terbuka maupun berada di background.

## Keamanan

- Jangan menaruh service-account JSON atau server key di APK, `admin.html`, maupun repository publik.
- Pengiriman dari halaman Admin harus melewati backend tepercaya (misalnya Cloudflare Worker) yang memanggil FCM HTTP v1.
- `google-services.json` adalah konfigurasi klien; tetap jangan mengubah isinya secara manual.
