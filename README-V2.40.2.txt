AMALIYAH V2.40.2 — CATEGORY RENAME ROUTING FIX

Perbaikan:
- Kartu kategori Beranda tidak lagi bergantung pada nama kategori lama.
- Nama, ikon, jumlah bacaan, dan tujuan kartu diambil dari kategori aktif books.json.
- Rename "Dalail" menjadi "Dalail & Istigfar" langsung mengubah kartu Beranda.
- Klik kartu membuka kategori baru dan tidak lagi menghasilkan halaman kosong.
- Admin menyimpan riwayat rename ringkas pada categoryAliases di books.json.
- Rename berulang tetap memperbarui alias lama menuju nama kategori terakhir.
- Kategori yang diganti nama sepenuhnya tetap dapat dikenali pada pembaruan berikutnya.

Cara menerapkan:
1. Unggah seluruh file paket ini ke root repository dan timpa file lama.
2. books.json yang sekarang sudah dapat dipakai; tidak perlu mengulang rename.
3. Untuk rename berikutnya, gunakan Admin versi ini agar riwayat nama ikut tersimpan.

Catatan:
- Untuk kondisi saat ini, "Dalail & Istigfar" juga dikenali otomatis meskipun
  books.json lama belum memiliki categoryAliases.
- Tidak mengubah PDF, progres membaca, bookmark, atau favorit.
