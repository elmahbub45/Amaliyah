AMALIYAH V2.41.1 — MUSHAF READER COLORS

Perbaikan tampilan Reader Al-Qur'an:
- Background halaman diubah menjadi krem terang agar tulisan Arab hitam lebih jelas.
- Gambar halaman menyatu dengan background krem tanpa kotak putih mencolok.
- Kontras tulisan Mushaf ditingkatkan secara ringan tanpa mengubah isi gambar.
- Header memakai cokelat tua dengan judul putih dan metadata krem.
- Footer memakai cokelat yang lebih gelap dengan nomor halaman putih.
- Label HALAMAN memakai aksen hijau seperti contoh pengguna.
- Header dan footer diberi ornamen tulisan Arab yang sangat tipis.
- Saat kontrol terlihat, halaman ditempatkan di antara header dan footer sehingga
  ayat tidak tertutup. Saat kontrol disembunyikan, halaman kembali memenuhi layar.
- Cache aplikasi dinaikkan ke V2.41.1 agar perubahan CSS tidak tertahan versi lama.

Cara memasang:
1. Unggah semua file dalam paket ini ke root repository.
2. Timpa file lama jika diminta GitHub.
3. Pastikan quran.css, quran.html, dan sw.js ikut terganti.
4. Buka kembali quran.html. Jika browser masih menampilkan warna lama, lakukan
   refresh satu kali agar Service Worker mengambil cache V2.41.1.

Tidak mengubah:
- Isi atau nomor halaman Mushaf.
- books.json dan katalog PDF.
- Progres membaca dan bookmark Al-Qur'an.
- Admin Koleksi.
