AMALIYAH V2.38.4 — NO SEARCH / NO INDEX

TUJUAN
Mencegah halaman aplikasi Amaliyah, Reader, dan Admin tampil pada hasil mesin
pencarian yang mematuhi standar robots/noindex.

FILE YANG PERLU DIUPLOAD KE ROOT REPOSITORY
- index.html
- reader.html
- admin.html
- admin.css
- admin.js
- sw.js
- robots.txt
- _headers

PERLINDUNGAN YANG DITERAPKAN
- index.html memiliki robots noindex, nofollow, noarchive, dan nosnippet.
- reader.html memiliki perlindungan yang sama.
- admin.html memiliki perlindungan yang sama.
- Instruksi khusus Googlebot dan Bingbot ikut disertakan.
- robots.txt menutup perayapan file JavaScript, CSS, JSON, manifest, dan assets.
- Halaman HTML tidak diblokir robots.txt agar crawler dapat membaca noindex dan
  menghapus halaman yang mungkin sudah pernah masuk indeks.
- _headers memberi X-Robots-Tag untuk seluruh file pada hosting yang mendukungnya.
- Cache service worker diperbarui agar index.html baru segera dipakai aplikasi.

CATATAN PENTING
- Noindex mencegah tampil di mesin pencarian; noindex bukan password.
- Orang yang sudah mengetahui alamat Admin masih dapat membukanya.
- File _headers bekerja pada Cloudflare Pages/hosting yang mendukung format ini;
  GitHub Pages dapat mengabaikannya, tetapi meta noindex pada HTML tetap bekerja.
- Repository GitHub yang public tetap dapat dilihat dan isi kodenya dapat ditemukan
  melalui GitHub. Gunakan repository private bila kode tidak boleh terlihat.

FITUR SEBELUMNYA TETAP ADA
- Identitas visual Collection V2.38.3.
- Folder Baru tanpa upload PDF V2.38.2.
- Double-click dan Ctrl/Shift multiselect V2.38.1.
- Rebuild Catalog from Folder serta R2 manifest V2.38.
