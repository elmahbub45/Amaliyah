(function(){
  'use strict';

  const icons=[
    {key:'quran',label:"Al-Qur'an",keywords:'quran kitab baca buku suci',svg:'<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H12v18H7.5A2.5 2.5 0 0 0 5 22z"/><path d="M19 4.5A2.5 2.5 0 0 0 16.5 2H12v18h4.5A2.5 2.5 0 0 1 19 22z"/>'},
    {key:'book',label:'Kitab',keywords:'buku kitab dalail bacaan',svg:'<path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M8 4v16M11 8h4M11 12h4"/>'},
    {key:'mosque',label:'Masjid',keywords:'masjid mushalla kubah menara islam',svg:'<path d="M3 21h18M5 21v-9h14v9M8 12V8h8v4"/><path d="M12 3c0 2-3 2.2-3 5h6c0-2.8-3-3-3-5zM7 7V4M17 7V4M10 21v-5a2 2 0 0 1 4 0v5"/>'},
    {key:'kaaba',label:"Ka'bah",keywords:'kabah kaaba makkah haji umrah kiblat',svg:'<path d="m5 7 7-4 7 4v10l-7 4-7-4z"/><path d="m5 7 7 4 7-4M12 11v10M7 9v4l5 3 5-3V9"/>'},
    {key:'doa',label:'Doa',keywords:'doa tangan ibadah',svg:'<path d="M8 12.5V8a2 2 0 0 1 4 0v3"/><path d="M12 11V7a2 2 0 0 1 4 0v5"/><path d="M16 12V9a2 2 0 0 1 4 0v5c0 4.5-3.2 7-7.5 7C8 21 5 18.5 5 14.5V12a2 2 0 0 1 3 0z"/>'},
    {key:'tasbih',label:'Tasbih',keywords:'tasbih dzikir zikir wirid manik',svg:'<circle cx="12" cy="4" r="1.5"/><circle cx="7" cy="6" r="1.5"/><circle cx="4" cy="10" r="1.5"/><circle cx="5" cy="15" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="14" cy="18" r="1.5"/><circle cx="18" cy="15" r="1.5"/><circle cx="20" cy="10" r="1.5"/><circle cx="17" cy="6" r="1.5"/><path d="M14 19.5 12 22l-2-2.5"/>'},
    {key:'wirid',label:'Wirid',keywords:'wirid dzikir zikir lingkaran',svg:'<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="18.5" cy="5.5" r="1.5"/>'},
    {key:'maulid',label:'Bulan & Bintang',keywords:'maulid bulan bintang malam islam',svg:'<path d="M16.7 4.2A7.5 7.5 0 1 0 19.8 15 6.2 6.2 0 1 1 16.7 4.2z"/><path d="m17.8 7 .7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z"/>'},
    {key:'crescent',label:'Bulan Sabit',keywords:'bulan sabit malam hijriah',svg:'<path d="M18.5 15.5A8 8 0 0 1 8.5 5.5a8 8 0 1 0 10 10z"/>'},
    {key:'star',label:'Bintang',keywords:'bintang favorit utama',svg:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'},
    {key:'dalail',label:'Kitab Berhias',keywords:'dalail kitab buku hadis',svg:'<path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M8 4v16M12 8h3M12 12h3"/><path d="m19 5 .6 1.3 1.4.2-1 .9.2 1.4-1.2-.7-1.2.7.2-1.4-1-.9 1.4-.2z"/>'},
    {key:'document',label:'Dokumen',keywords:'dokumen pdf teks lembar',svg:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>'},
    {key:'scroll',label:'Naskah',keywords:'naskah teks manuskrip syair',svg:'<path d="M7 5a3 3 0 0 1 3-3h8v16a3 3 0 0 1-3 3H6"/><path d="M6 21a3 3 0 0 0 0-6H3v3a3 3 0 0 0 3 3zM10 7h5M10 11h5"/>'},
    {key:'pen',label:'Pena',keywords:'pena tulis syair ilmu',svg:'<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.5 8 3 3M4 20l1.5-4"/>'},
    {key:'syair',label:'Syair',keywords:'syair nada musik qasidah shalawat',svg:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M9 9l10-2"/>'},
    {key:'microphone',label:'Mikrofon',keywords:'mikrofon khutbah ceramah kajian suara',svg:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8"/>'},
    {key:'khutbah',label:'Mimbar',keywords:'khutbah mimbar ceramah mikrofon',svg:'<path d="M8 21h8M12 17v4M9 4h6v7a3 3 0 0 1-6 0z"/><path d="M6 10v1a6 6 0 0 0 12 0v-1"/>'},
    {key:'speaker',label:'Pengeras Suara',keywords:'speaker suara adzan pengumuman',svg:'<path d="M4 10h4l6-5v14l-6-5H4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>'},
    {key:'sun',label:'Matahari',keywords:'matahari siang dhuha pagi',svg:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'},
    {key:'sunrise',label:'Terbit',keywords:'terbit fajar subuh pagi matahari',svg:'<path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 3v4M4.9 7.9l2.1 2.1M19.1 7.9 17 10"/>'},
    {key:'sunset',label:'Terbenam',keywords:'terbenam maghrib senja matahari',svg:'<path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 7V3M4.9 9.1 7 7M19.1 9.1 17 7M10 21h4"/>'},
    {key:'clock',label:'Waktu',keywords:'jam waktu sholat jadwal',svg:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'},
    {key:'calendar',label:'Kalender',keywords:'kalender tanggal jadwal hijriah',svg:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'},
    {key:'compass',label:'Kiblat',keywords:'kompas kiblat arah',svg:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'},
    {key:'location',label:'Lokasi',keywords:'lokasi tempat alamat peta',svg:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>'},
    {key:'home',label:'Rumah',keywords:'rumah beranda tempat',svg:'<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>'},
    {key:'people',label:'Jamaah',keywords:'jamaah orang kelompok majelis',svg:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 4.9V20"/>'},
    {key:'heart',label:'Hati',keywords:'hati cinta favorit',svg:'<path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8z"/>'},
    {key:'bookmark',label:'Penanda',keywords:'bookmark penanda simpan favorit',svg:'<path d="M6 3h12v18l-6-4-6 4z"/>'},
    {key:'lamp',label:'Pelita',keywords:'lampu pelita ilmu cahaya',svg:'<path d="M9 18h6M10 22h4M8.5 15.5a6 6 0 1 1 7 0c-1 .8-1.5 1.3-1.5 2.5h-4c0-1.2-.5-1.7-1.5-2.5z"/>'},
    {key:'leaf',label:'Daun',keywords:'daun alam tenang',svg:'<path d="M20 4C10 4 4 9 4 16c0 3 2 5 5 5 7 0 11-7 11-17z"/><path d="M5 19c3-4 7-7 12-10"/>'},
    {key:'flower',label:'Bunga',keywords:'bunga mawar hias',svg:'<circle cx="12" cy="12" r="2"/><circle cx="12" cy="6" r="3"/><circle cx="18" cy="12" r="3"/><circle cx="12" cy="18" r="3"/><circle cx="6" cy="12" r="3"/>'},
    {key:'shield',label:'Perlindungan',keywords:'perisai perlindungan ruqyah aman',svg:'<path d="M12 3 20 6v6c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>'},
    {key:'gift',label:'Hadiah',keywords:'hadiah pahala pemberian',svg:'<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M7.5 9C5 9 4 7.8 4 6.5S5 4 6.5 4C9 4 12 9 12 9M16.5 9C19 9 20 7.8 20 6.5S19 4 17.5 4C15 4 12 9 12 9"/>'},
    {key:'other',label:'Umum',keywords:'umum lainnya semua grid kategori',svg:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'}
  ];

  window.AMALIYAH_CATEGORY_ICON_OPTIONS=Object.freeze(icons.map(icon=>Object.freeze(icon)));
})();
