AMALIYAH V2.41.0 — MUSHAF AL-QUR'AN

Pembaruan utama:
- Menambahkan ruang Mushaf Al-Qur'an khusus di Beranda.
- Mushaf terpisah sepenuhnya dari PDF, books.json, dan Admin Koleksi.
- Tampilan halaman mengikuti Mushaf Madinah 604 halaman.
- Daftar 114 surah, 30 juz, pencarian surah, dan lompat halaman.
- Menyimpan halaman terakhir dibaca secara otomatis.
- Bookmark halaman Al-Qur'an tersimpan terpisah dari bookmark PDF.
- Halaman Bookmark utama memiliki tab Bacaan dan Al-Qur'an.
- Reader menempatkan halaman tepat di tengah pada layar tegak maupun mendatar.
- Navigasi geser, sisi layar, tombol, dan keyboard.
- Kontrol Reader bersembunyi otomatis agar halaman lebih lapang.

Cara memasang:
1. Unggah seluruh isi paket ke root repository dan timpa file lama.
2. Pastikan quran.html, quran.css, quran.js, dan quran-config.js ikut terunggah.
3. Jangan menghapus books.json lama; katalog PDF tetap bekerja seperti biasa.
4. Buka aplikasi dan pilih kartu MUSHAF AL-QUR'AN di Beranda.

Penyimpanan halaman Mushaf:
- Versi awal memakai sumber halaman daring yang ditetapkan di quran-config.js.
- Untuk kontrol penuh dan kecepatan stabil, unggah halaman ke R2 dengan nama
  quran/madani/page001.png sampai quran/madani/page604.png.
- Setelah itu, ubah pageBase di quran-config.js menjadi URL publik folder R2,
  contoh: https://cdn.domain-anda.id/quran/madani/
- r2-quran-upload-manifest.json berisi pasangan nama lokal dan object key R2.
- r2-quran-cleanup-manifest.txt berisi seluruh object key yang boleh dibersihkan.

Catatan hak pakai:
- Amaliyah dinyatakan sebagai aplikasi nonkomersial/tidak diperjualbelikan.
- Jangan mengubah teks Arab pada gambar halaman Mushaf.
- Pertahankan keterangan sumber Mushaf pada aplikasi dan dokumentasi.

Data lokal yang dipakai:
- amaliyah:quran:last-page
- amaliyah:quran:last-meta
- amaliyah:quran:bookmarks
- amaliyah:quran:page-meta
