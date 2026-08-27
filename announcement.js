/* V2.56.0 — Pengumuman Amaliyah
   Web-only, tidak membutuhkan update APK.
*/

(()=>{
  'use strict';

  const API =
    'https://amaliyah-fcm-admin.elmahbub45.workers.dev';

  const CACHE_KEY =
    'amaliyah:announcements:v1';

  const READ_KEY =
    'amaliyah:announcements:read:v1';

  const MAX_LOCAL = 20;

  let announcements = [];
  let overlay = null;
  let headerBtn = null;
  let autoShowPending = false;


  /* ======================================================
     STYLE
     ====================================================== */

  function injectStyles(){

    if(
      document.getElementById(
        'amaliyah-announcement-style'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'amaliyah-announcement-style';


    style.textContent = `

      html.announcement-open,
      html.announcement-open body{
        overflow:hidden;
      }


      /* ===============================
         HEADER BUTTON
         =============================== */

      .announcement-header-btn{
        position:relative;
      }


      .announcement-header-btn.has-unread{
        color:#0d684f;
      }


      .announcement-badge{

        position:absolute;

        top:-4px;
        right:-5px;

        min-width:17px;
        height:17px;

        padding:0 4px;

        border:
          2px solid #fbf8f1;

        border-radius:
          999px;

        background:
          #b34034;

        color:
          #fff;

        display:grid;

        place-items:center;

        font-size:
          9px;

        font-weight:
          900;

        line-height:
          1;
      }


      .announcement-badge.hidden{
        display:none;
      }


      /* ===============================
         OVERLAY
         =============================== */

      .announcement-overlay{

        position:fixed;

        inset:0;

        z-index:
          100005;

        display:flex;

        align-items:
          flex-end;

        justify-content:
          center;

        background:
          rgba(
            24,
            34,
            30,
            .48
          );

        backdrop-filter:
          blur(5px);

        -webkit-backdrop-filter:
          blur(5px);
      }


      .announcement-overlay.hidden{
        display:none;
      }


      .announcement-panel{

        width:
          min(
            100%,
            560px
          );

        max-height:
          min(
            88dvh,
            760px
          );

        overflow:
          hidden;

        border-radius:
          26px 26px 0 0;

        background:
          #fffdf8;

        color:
          #273b34;

        box-shadow:
          0 -20px 70px
          rgba(
            0,
            0,
            0,
            .22
          );

        border:
          1px solid
          rgba(
            173,
            139,
            70,
            .18
          );

        animation:
          announcementUp
          .2s
          ease-out;
      }


      @keyframes announcementUp{

        from{
          transform:
            translateY(
              24px
            );

          opacity:
            .5;
        }

        to{
          transform:none;
          opacity:1;
        }

      }


      /* ===============================
         HEADER PANEL
         =============================== */

      .announcement-panel-head{

        position:
          sticky;

        top:
          0;

        z-index:
          2;

        display:
          grid;

        grid-template-columns:
          42px
          minmax(
            0,
            1fr
          )
          42px;

        align-items:
          center;

        gap:
          8px;

        padding:
          14px
          15px
          12px;

        background:
          rgba(
            255,
            253,
            248,
            .97
          );

        border-bottom:
          1px solid
          #ebe4d8;

        backdrop-filter:
          blur(8px);
      }


      .announcement-panel-head > div{
        text-align:center;
      }


      .announcement-panel-head small{

        display:block;

        font-size:
          9px;

        font-weight:
          900;

        letter-spacing:
          .13em;

        color:
          #a27d32;
      }


      .announcement-panel-head b{

        display:block;

        margin-top:
          2px;

        font-size:
          16px;

        color:
          #285142;
      }


      .announcement-close,
      .announcement-back{

        width:
          38px;

        height:
          38px;

        border:
          0;

        border-radius:
          13px;

        background:
          #f1eee7;

        color:
          #385147;

        font:
          700
          24px/1
          system-ui;

        cursor:
          pointer;
      }


      .announcement-back{
        font-size:
          30px;
      }


      .announcement-back.hidden{
        visibility:hidden;
      }


      .announcement-panel-body{

        max-height:
          calc(
            88dvh - 67px
          );

        overflow:
          auto;

        padding:
          16px;
      }


      /* ===============================
         INBOX INTRO
         =============================== */

      .announcement-inbox-intro{

        display:flex;

        align-items:
          center;

        gap:
          12px;

        margin-bottom:
          12px;

        padding:
          13px 14px;

        border:
          1px solid
          #dae8e0;

        border-radius:
          17px;

        background:
          #f2f8f5;
      }


      .announcement-inbox-mark{

        width:
          40px;

        height:
          40px;

        display:
          grid;

        place-items:
          center;

        border-radius:
          13px;

        background:
          #0d674f;

        color:
          #e6c56c;

        font-size:
          18px;
      }


      .announcement-inbox-intro b,
      .announcement-inbox-intro small{
        display:block;
      }


      .announcement-inbox-intro b{

        font-size:
          13px;

        color:
          #27483d;
      }


      .announcement-inbox-intro small{

        margin-top:
          3px;

        font-size:
          10px;

        color:
          #72837b;
      }


      /* ===============================
         LIST
         =============================== */

      .announcement-list{

        display:
          grid;

        gap:
          8px;
      }


      .announcement-row{

        width:
          100%;

        display:
          grid;

        grid-template-columns:
          29px
          minmax(
            0,
            1fr
          )
          18px;

        gap:
          9px;

        align-items:
          center;

        padding:
          12px;

        border:
          1px solid
          #ece7df;

        border-radius:
          16px;

        background:
          #fff;

        text-align:
          left;

        cursor:
          pointer;
      }


      .announcement-row.unread{

        border-color:
          #cfe1d8;

        background:
          #f9fcfa;
      }


      .announcement-row-dot{

        width:
          29px;

        height:
          29px;

        display:
          grid;

        place-items:
          center;

        border-radius:
          10px;

        background:
          #eef3f0;

        color:
          #73827b;

        font-weight:
          900;
      }


      .announcement-row.unread
      .announcement-row-dot{

        background:
          #e2f2ea;

        color:
          #17644d;
      }


      .announcement-row-copy{
        min-width:0;
      }


      .announcement-row-copy b,
      .announcement-row-copy small,
      .announcement-row-copy em{
        display:block;
      }


      .announcement-row-copy b{

        font-size:
          12px;

        color:
          #2c443b;
      }


      .announcement-row-copy small{

        margin-top:
          3px;

        font-size:
          10px;

        line-height:
          1.4;

        color:
          #6f7c76;

        white-space:
          nowrap;

        overflow:
          hidden;

        text-overflow:
          ellipsis;
      }


      .announcement-row-copy em{

        margin-top:
          4px;

        font-size:
          8.8px;

        color:
          #9a9f9c;

        font-style:
          normal;
      }


      .announcement-row > i{

        font:
          500
          24px/1
          system-ui;

        color:
          #a2aaa6;

        font-style:
          normal;
      }


      /* ===============================
         DETAIL
         =============================== */

      .announcement-detail{

        padding:
          2px 1px 5px;
      }


      .announcement-detail-image{

        display:
          block;

        width:
          100%;

        max-height:
          240px;

        object-fit:
          cover;

        margin-bottom:
          16px;

        border-radius:
          18px;

        background:
          #eee;
      }


      .announcement-detail-kicker{

        display:block;

        font-size:
          9px;

        font-weight:
          900;

        letter-spacing:
          .14em;

        color:
          #a27c31;
      }


      .announcement-detail h2{

        margin:
          7px 0 0;

        font-size:
          21px;

        line-height:
          1.28;

        color:
          #23463a;
      }


      .announcement-detail-meta{

        margin-top:
          7px;

        font-size:
          10px;

        color:
          #929a96;
      }


      .announcement-detail-text{

        margin-top:
          17px;

        font-size:
          14px;

        line-height:
          1.7;

        color:
          #4a5953;

        white-space:
          pre-wrap;

        word-break:
          break-word;
      }


      .announcement-detail-actions{

        display:
          flex;

        gap:
          9px;

        margin-top:
          22px;
      }


      .announcement-detail-actions button{

        flex:
          1;

        min-height:
          46px;

        border:
          0;

        border-radius:
          15px;

        font:
          800
          12px
          system-ui;

        cursor:
          pointer;
      }


      .announcement-detail-primary{

        background:
          #0d674f;

        color:
          #fff;
      }


      .announcement-detail-secondary{

        background:
          #f0ede6;

        color:
          #46564f;
      }


      /* ===============================
         EMPTY
         =============================== */

      .announcement-empty{

        padding:
          46px 20px;

        text-align:
          center;
      }


      .announcement-empty > span{

        width:
          48px;

        height:
          48px;

        display:
          grid;

        place-items:
          center;

        margin:
          0 auto 12px;

        border-radius:
          15px;

        background:
          #edf5f1;

        color:
          #17644d;

        font-size:
          20px;
      }


      .announcement-empty b{

        display:
          block;

        color:
          #314a40;

        font-size:
          14px;
      }


      .announcement-empty p{

        margin:
          6px auto 0;

        max-width:
          310px;

        color:
          #7b8781;

        font-size:
          11px;

        line-height:
          1.55;
      }


      @media(
        min-width:
          600px
      ){

        .announcement-overlay{

          align-items:
            center;

          padding:
            22px;
        }


        .announcement-panel{

          border-radius:
            26px;

          max-height:
            min(
              86dvh,
              760px
            );
        }

      }

    `;


    document.head.appendChild(
      style
    );
  }



  /* ======================================================
     STORAGE
     ====================================================== */

  const safeJson = (
    raw,
    fallback
  ) => {

    try{

      return JSON.parse(
        raw
      );

    }catch{

      return fallback;

    }

  };


  function readIds(){

    const value =
      safeJson(

        localStorage.getItem(
          READ_KEY
        ) || '[]',

        []
      );


    return new Set(

      Array.isArray(
        value
      )

        ? value.map(
            String
          )

        : []
    );
  }


  function saveReadIds(
    set
  ){

    try{

      localStorage.setItem(

        READ_KEY,

        JSON.stringify(
          [...set]
            .slice(
              -200
            )
        )
      );

    }catch{}

  }


  function markRead(
    id
  ){

    if(
      !id
    ){
      return;
    }


    const set =
      readIds();


    set.add(
      String(
        id
      )
    );


    saveReadIds(
      set
    );


    updateBadge();
  }


  function isRead(
    id
  ){

    return readIds()
      .has(
        String(
          id || ''
        )
      );
  }


  function loadCached(){

    const value =
      safeJson(

        localStorage.getItem(
          CACHE_KEY
        ) || '[]',

        []
      );


    announcements =
      Array.isArray(
        value
      )

        ? value.slice(
            0,
            MAX_LOCAL
          )

        : [];
  }


  function saveCached(){

    try{

      localStorage.setItem(

        CACHE_KEY,

        JSON.stringify(
          announcements.slice(
            0,
            MAX_LOCAL
          )
        )
      );

    }catch{}

  }



  /* ======================================================
     DATE
     ====================================================== */

  function formatDate(
    value
  ){

    const d =
      new Date(
        value
      );


    if(
      Number.isNaN(
        d.getTime()
      )
    ){

      return '';

    }


    try{

      return new Intl
        .DateTimeFormat(
          'id-ID',
          {

            day:
              'numeric',

            month:
              'long',

            year:
              'numeric',

            hour:
              '2-digit',

            minute:
              '2-digit'
          }
        )
        .format(
          d
        );

    }catch{

      return d
        .toLocaleString(
          'id-ID'
        );

    }

  }



  /* ======================================================
     HEADER BUTTON
     ====================================================== */

  function ensureHeaderButton(){

    if(
      headerBtn?.isConnected
    ){

      return headerBtn;

    }


    const tools =
      document.querySelector(
        '.home-header-tools'
      );


    const notif =
      document.querySelector(
        '#notifBtn'
      );


    if(
      !tools
    ){

      return null;

    }


    headerBtn =
      document.createElement(
        'button'
      );


    headerBtn.id =
      'announcementBtn';


    headerBtn.type =
      'button';


    headerBtn.className =
      'icon home-header-icon announcement-header-btn';


    headerBtn.setAttribute(
      'aria-label',
      'Pengumuman Amaliyah'
    );


    headerBtn.setAttribute(
      'title',
      'Pengumuman Amaliyah'
    );


    headerBtn.innerHTML = `

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >

        <path
          d="
            M5 10.2
            v3.6
            l3 1.2
            7 3
            V6
            l-7 3.1
            -3 1.1
            Z
          "
        />

        <path
          d="
            M8 15
            v3.2
            c0 .8
            .7 1.5
            1.5 1.5
            H11
            V16

            M18 8.5
            c1 .9
            1.5 2.1
            1.5 3.5
            S19 14.6
            18 15.5
          "
        />

      </svg>

      <span
        class="
          announcement-badge
          hidden
        "
        aria-label="
          Belum dibaca
        "
      >
        0
      </span>

    `;


    headerBtn
      .addEventListener(
        'click',
        openInbox
      );


    if(
      notif
    ){

      tools.insertBefore(
        headerBtn,
        notif
      );

    }else{

      tools.appendChild(
        headerBtn
      );

    }


    return headerBtn;
  }



  function updateBadge(){

    const btn =
      ensureHeaderButton();


    if(
      !btn
    ){

      return;

    }


    const unread =
      announcements.filter(
        row =>
          row?.id &&
          !isRead(
            row.id
          )
      ).length;


    const badge =
      btn.querySelector(
        '.announcement-badge'
      );


    if(
      !badge
    ){

      return;

    }


    badge.textContent =
      unread > 9
        ? '9+'
        : String(
            unread
          );


    badge.classList.toggle(
      'hidden',
      unread === 0
    );


    btn.classList.toggle(
      'has-unread',
      unread > 0
    );
  }



  /* ======================================================
     OVERLAY
     ====================================================== */

  function ensureOverlay(){

    if(
      overlay?.isConnected
    ){

      return overlay;

    }


    overlay =
      document.createElement(
        'div'
      );


    overlay.id =
      'announcementOverlay';


    overlay.className =
      'announcement-overlay hidden';


    overlay.setAttribute(
      'role',
      'presentation'
    );


    overlay.innerHTML = `

<section
  class="announcement-panel"
  role="dialog"
  aria-modal="true"
  aria-labelledby="announcementPanelTitle"
>

        <header
          class="
            announcement-panel-head
          "
        >

          <button
            class="
              announcement-back
              hidden
            "
            type="
              button
            "
            aria-label="
              Kembali
            "
          >
            ‹
          </button>


          <div>

            <small>
              AMALIYAH
            </small>

<b id="announcementPanelTitle">
  Pengumuman
</b>

          </div>


          <button
            class="
              announcement-close
            "
            type="
              button
            "
            aria-label="
              Tutup
            "
          >
            ×
          </button>

        </header>


        <div
          class="
            announcement-panel-body
          "
        ></div>

      </section>

    `;


    document.body.appendChild(
      overlay
    );


    overlay
      .querySelector(
        '.announcement-close'
      )
      .addEventListener(
        'click',
        closeOverlay
      );


    overlay
      .querySelector(
        '.announcement-back'
      )
      .addEventListener(
        'click',
        renderInbox
      );


    overlay.addEventListener(
      'click',
      event => {

        if(
          event.target ===
          overlay
        ){

          closeOverlay();

        }

      }
    );


    return overlay;
  }



  function openOverlay(){

    const el =
      ensureOverlay();


    el.classList.remove(
      'hidden'
    );


    document
      .documentElement
      .classList.add(
        'announcement-open'
      );
  }



  function closeOverlay(){

    if(
      !overlay
    ){

      return;

    }


    overlay.classList.add(
      'hidden'
    );


    document
      .documentElement
      .classList.remove(
        'announcement-open'
      );
  }



  function setPanelMode(
    detail = false
  ){

    const el =
      ensureOverlay();


    el.querySelector(
      '.announcement-back'
    )
    .classList.toggle(
      'hidden',
      !detail
    );


    el.querySelector(
      '#announcementPanelTitle'
    )
    .textContent =

      detail

        ? 'Pengumuman Amaliyah'

        : 'Pengumuman';
  }



  /* ======================================================
     EMPTY STATE
     ====================================================== */

  function renderEmpty(){

    const body =
      ensureOverlay()
        .querySelector(
          '.announcement-panel-body'
        );


    body.innerHTML =
      '';


    const empty =
      document.createElement(
        'div'
      );


    empty.className =
      'announcement-empty';


    const mark =
      document.createElement(
        'span'
      );


    mark.textContent =
      '✦';


    const title =
      document.createElement(
        'b'
      );


    title.textContent =
      'Belum ada pengumuman';


    const copy =
      document.createElement(
        'p'
      );


    copy.textContent =

      navigator.onLine

        ? 'Pengumuman dari pengelola Amaliyah akan muncul di sini.'

        : 'Sambungkan internet untuk memeriksa pengumuman terbaru.';


    empty.append(
      mark,
      title,
      copy
    );


    body.appendChild(
      empty
    );
  }



  /* ======================================================
     INBOX
     ====================================================== */

  function renderInbox(){

    setPanelMode(
      false
    );


    openOverlay();


    const body =
      overlay.querySelector(
        '.announcement-panel-body'
      );


    body.innerHTML =
      '';


    if(
      !announcements.length
    ){

      renderEmpty();

      return;
    }


    const intro =
      document.createElement(
        'div'
      );


    intro.className =
      'announcement-inbox-intro';


    const count =
      announcements.filter(
        row =>
          row?.id &&
          !isRead(
            row.id
          )
      ).length;


    intro.innerHTML = `

      <span
        class="
          announcement-inbox-mark
        "
      >
        ✦
      </span>

      <span>

        <b>
          Informasi dari Amaliyah
        </b>

        <small>

          ${
            count
              ? `${count} belum dibaca`
              : 'Semua sudah dibaca'
          }

        </small>

      </span>

    `;


    body.appendChild(
      intro
    );


    const list =
      document.createElement(
        'div'
      );


    list.className =
      'announcement-list';


    announcements.forEach(
      row => {

        if(
          !row?.id
        ){

          return;

        }


        const button =
          document.createElement(
            'button'
          );


        button.type =
          'button';


        button.className =
          'announcement-row';


        if(
          !isRead(
            row.id
          )
        ){

          button.classList.add(
            'unread'
          );

        }


        const dot =
          document.createElement(
            'span'
          );


        dot.className =
          'announcement-row-dot';


        dot.textContent =

          isRead(
            row.id
          )

            ? '✓'
            : '•';


        const copy =
          document.createElement(
            'span'
          );


        copy.className =
          'announcement-row-copy';


        const title =
          document.createElement(
            'b'
          );


        title.textContent =
          row.title ||
          'Pengumuman Amaliyah';


        const snippet =
          document.createElement(
            'small'
          );


        snippet.textContent =
          row.body || '';


        const date =
          document.createElement(
            'em'
          );


        date.textContent =
          formatDate(
            row.createdAt
          );


        copy.append(
          title,
          snippet,
          date
        );


        const arrow =
          document.createElement(
            'i'
          );


        arrow.textContent =
          '›';


        button.append(
          dot,
          copy,
          arrow
        );


        button.addEventListener(
          'click',
          () =>
            openDetail(
              row
            )
        );


        list.appendChild(
          button
        );

      }
    );


    body.appendChild(
      list
    );
  }



  function openInbox(){

    renderInbox();

    refreshAnnouncements(
      false
    );
  }



  /* ======================================================
     DETAIL
     ====================================================== */

  function validImage(
    url
  ){

    try{

      return (
        new URL(
          String(
            url || ''
          )
        ).protocol ===
        'https:'
      );

    }catch{

      return false;

    }

  }



  function openDetail(
    row,
    {
      automatic = false
    } = {}
  ){

    if(
      !row?.id
    ){

      return;

    }


    setPanelMode(
      true
    );


    openOverlay();


    markRead(
      row.id
    );


    const body =
      overlay.querySelector(
        '.announcement-panel-body'
      );


    body.innerHTML =
      '';


    const article =
      document.createElement(
        'article'
      );


    article.className =
      'announcement-detail';


    if(
      validImage(
        row.image
      )
    ){

      const img =
        document.createElement(
          'img'
        );


      img.className =
        'announcement-detail-image';


      img.alt =
        '';


      img.src =
        row.image;


      img.addEventListener(
        'error',
        () =>
          img.remove()
      );


      article.appendChild(
        img
      );
    }


    const kicker =
      document.createElement(
        'small'
      );


    kicker.className =
      'announcement-detail-kicker';


    kicker.textContent =
      'PENGUMUMAN AMALIYAH';


    const title =
      document.createElement(
        'h2'
      );


    title.textContent =
      row.title ||
      'Pengumuman Amaliyah';


    const meta =
      document.createElement(
        'div'
      );


    meta.className =
      'announcement-detail-meta';


    meta.textContent =
      formatDate(
        row.createdAt
      );


    const text =
      document.createElement(
        'div'
      );


    text.className =
      'announcement-detail-text';


    text.textContent =
      row.body || '';


    article.append(
      kicker,
      title,
      meta,
      text
    );


    const actions =
      document.createElement(
        'div'
      );


    actions.className =
      'announcement-detail-actions';


    const all =
      document.createElement(
        'button'
      );


    all.type =
      'button';


    all.className =
      'announcement-detail-secondary';


    all.textContent =
      'Lihat Pengumuman Lain';


    all.addEventListener(
      'click',
      renderInbox
    );


    const close =
      document.createElement(
        'button'
      );


    close.type =
      'button';


    close.className =
      'announcement-detail-primary';


    close.textContent =
      'Mengerti';


    close.addEventListener(
      'click',
      closeOverlay
    );


    actions.append(
      all,
      close
    );


    article.appendChild(
      actions
    );


    body.appendChild(
      article
    );


    if(
      automatic
    ){

      article.classList.add(
        'automatic'
      );

    }

  }



  /* ======================================================
     AUTO SHOW
     ====================================================== */

  function latestUnread(){

    return (
      announcements.find(
        row =>
          row?.id &&
          !isRead(
            row.id
          )
      ) || null
    );
  }



  function attemptAutoShow(){

    if(
      autoShowPending
    ){

      return;

    }


    const row =
      latestUnread();


    if(
      !row
    ){

      return;

    }


    autoShowPending =
      true;


    let tries =
      0;


    const tryShow =
      () => {

        tries++;


        /*
         * Jangan tabrakan dengan onboarding.
         */

        if(

          document.querySelector(
            '.amaliyah-onboarding-backdrop'
          )

          &&

          tries < 18

        ){

          setTimeout(
            tryShow,
            700
          );

          return;
        }


        autoShowPending =
          false;


        if(
          latestUnread()?.id ===
          row.id
        ){

          openDetail(
            row,
            {
              automatic:
                true
            }
          );

        }

      };


    setTimeout(
      tryShow,
      900
    );
  }



  /* ======================================================
     API
     ====================================================== */

  async function refreshAnnouncements(
    autoShow = true
  ){

    if(
      !navigator.onLine
    ){

      updateBadge();

      return announcements;
    }


    try{

      const response =
        await fetch(

          `${API}/announcements?limit=${MAX_LOCAL}`,

          {

            cache:
              'no-store',

            credentials:
              'omit'
          }
        );


      const payload =
        await response
          .json()
          .catch(
            () => ({})
          );


      if(

        !response.ok ||

        !payload.ok ||

        !Array.isArray(
          payload.announcements
        )

      ){

        return announcements;
      }


      announcements =
        payload
          .announcements
          .slice(
            0,
            MAX_LOCAL
          );


      saveCached();


      updateBadge();


      if(
        autoShow
      ){

        attemptAutoShow();

      }


    }catch{

      /*
       * Jika server gagal,
       * cache lokal tetap dipakai.
       */

    }


    return announcements;
  }



  /* ======================================================
     INIT
     ====================================================== */

  function init(){

    injectStyles();

    loadCached();

    ensureHeaderButton();

    ensureOverlay();

    updateBadge();


    refreshAnnouncements(
      true
    );


    window.addEventListener(

      'online',

      () =>
        refreshAnnouncements(
          true
        )

    );

  }


  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once:
          true
      }
    );

  }else{

    init();

  }

})();
