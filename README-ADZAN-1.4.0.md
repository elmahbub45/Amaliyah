# Amaliyah Android 1.4.0 — Pengingat Sholat + Adzan

Update native Android untuk Amaliyah.

## Fitur
- Pilihan suara: Notifikasi, Pengingat Singkat (~12 detik), Adzan Lengkap.
- Adzan Subuh memakai audio khusus Subuh.
- Dzuhur, Ashar, Maghrib, dan Isya memakai adzan normal.
- Adzan lengkap selalu dijadwalkan tepat pada masuk waktu sholat (lead = 0).
- Alarm native tetap dapat dijalankan ketika halaman web/app tidak sedang terbuka.
- Jadwal sholat disimpan di Android dan diperbarui lagi setiap hari dari layanan jadwal Amaliyah.
- Setelah reboot/update aplikasi, alarm dijadwalkan ulang.
- Android 12+ menampilkan izin “Ketepatan waktu” bila akses Alarm & pengingat belum diberikan.
- app.js tidak lagi diganti oleh salinan bawaan APK; WebView memakai app.js terbaru dari aplikasi web sehingga update web tidak tertahan versi lama.

## Audio user-provided
- `res/raw/adzan_normal.mp3`
- `res/raw/adzan_subuh.mp3`
- `res/raw/adzan_pendek.mp3`

Hak distribusi audio user-provided perlu dipastikan oleh pemilik aplikasi sebelum rilis publik.

## Penandatanganan APK
APK Android 1.3.0 sebelumnya ditandatangani dengan sertifikat:
- Owner: `CN=Amaliyah Preview, O=Amaliyah, C=ID`
- SHA-256: `82:70:48:65:07:34:4C:A9:71:CA:07:BA:77:61:CA:E3:4A:2D:25:67:68:F3:DC:54:79:CC:87:68:17:2D:3E:A7`

Untuk memasang 1.4.0 sebagai update langsung di atas 1.3.0, APK 1.4.0 HARUS ditandatangani dengan private key/keystore yang sama. Keystore tersebut tidak ada di arsip source 1.3.0 yang tersedia sekarang.

`app/build.gradle` akan memakai `tools/signing/preview.keystore` bila file tersebut tersedia. Tanpa keystore itu, source masih dapat dibuka/dikompilasi, tetapi build release tidak akan menjadi update-signature yang sama dengan APK 1.3.0.

## Catatan build
Source memerlukan Android SDK 35/Build Tools 35, Gradle/Android Gradle Plugin dependencies, dan konfigurasi Firebase yang sudah ada pada project.
