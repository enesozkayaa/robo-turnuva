// =============================================================
// Robo Turnuva - oyun salonu
// Mini oyunların listesi, oyuncular (sen + robotlar, online'da arkadaşlar), ekran bilgileri (Hud),
// online oda (ag.js) ve oyun sonu ekranı.
//
// Yeni mini oyun eklemek için:
//   Salon.oyunEkle({ id, ad, ikon, ozet, kurallar: [...], baslat(b) { ...; return { durdur(), koptu?(id) } } })
// b = { oyuncular: [{ id, ad, renk, bot }], benId, hud, kanal, ayar, bitti({ kazanan, siralama: [{ id, neden }], aciklama? }) }
// Oyunun açılışta seçilen ayarları olabilir: ayarlar: [{ id, ad, secenekler: [..], varsayilan }] → b.ayar[id]
//
// kanal: her mini oyun hem tek başına hem online aynı kodla çalışsın diye.
//   kanal.evMi      → oyunun kurallarını bu cihaz mı yürütüyor? (tek başına ya da oda sahibi)
//   kanal.yayinla(m) → (sadece ev) mesajı herkese gönderir, kendisi de alır
//   kanal.dinle(fn)  → yayınlanan mesajları al (herkes)
//   kanal.evaGonder(m) → hamleni oyunu yürütene gönder (ev kendine gönderir)
//   kanal.evDinle(fn(m, id)) → (ev) oyuncuların gönderdiği hamleler
// =============================================================

const Salon = (() => {
  const SURUM = '2.0';
  const RENKLER = ['#2ee6ff', '#ff3b8d', '#ffd23b', '#7dff4a', '#b46bff', '#ff8a2a', '#ff6bf0', '#f2f5ff'];
  const BOT_ADLARI = ['Bipbop', 'Tıkır', 'Vızır', 'Cızbız', 'Pırpır', 'Zıpzıp', 'Dıtdıt', 'Fırfır'];
  const ANAHTAR = 'roboTurnuva.ayar';
  const oyunlar = [];
  const EN_COK_BOT = 3;   // sen + 3 robot = en fazla 4 kişi
  let ayar = { ad: '', bot: 3 };
  try { Object.assign(ayar, JSON.parse(localStorage.getItem(ANAHTAR) || '{}')); } catch (e) { /* varsayılan */ }
  ayar.bot = Math.min(EN_COK_BOT, Math.max(1, +ayar.bot || 3));
  let calisan = null, kanal = null, sonOyun = null, lobi = null;
  const $ = id => document.getElementById(id);

  function oyunEkle(o) { oyunlar.push(o); }
  // Oyunun seçili ayarları (kayıtlı değilse varsayılan)
  function oyunAyari(o) {
    const kayitli = ayar.oyun?.[o.id] || {};
    return Object.fromEntries((o.ayarlar || []).map(a => [a.id, a.secenekler.includes(kayitli[a.id]) ? kayitli[a.id] : a.varsayilan]));
  }
  function kaydet() { try { localStorage.setItem(ANAHTAR, JSON.stringify(ayar)); } catch (e) { /* */ } }
  const online = () => Ag.mod !== 'yerel';

  function baslat() {
    Cekirdek.baslat($('sahne'));
    Kontrol.kur();
    Cekirdek.kameraAyarla(10, 1.0);
    $('surumNotu').textContent = `Sürüm ${SURUM}`;
    $('adim').value = ayar.ad;
    $('adim').addEventListener('input', e => { ayar.ad = e.target.value.trim(); kaydet(); });
    $('botSayisi').addEventListener('click', e => {
      const n = e.target.dataset.n;
      if (n === undefined) return;
      if (Ag.mod === 'ev') Ag.botAyarla(+n);
      else { ayar.bot = +n; kaydet(); menuCiz(); }
    });
    $('oyunListesi').addEventListener('click', e => {
      const s = e.target.closest('[data-oayar]');
      if (s) {
        const [oyunId, anahtar] = s.dataset.oayar.split('.');
        ayar.oyun ??= {};
        ayar.oyun[oyunId] = { ...(ayar.oyun[oyunId] || {}), [anahtar]: +s.dataset.deger };
        kaydet(); menuCiz();
        return;
      }
      const b = e.target.closest('[data-oyna]');
      if (b) oyunBaslat(b.dataset.oyna);
    });
    $('sesBtn').addEventListener('click', () => { Ses.ac(!Ses.acik); $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇'; });
    $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇';
    $('menuBtn').addEventListener('click', () => {
      $('cikisMetni').textContent = Ag.mod === 'misafir' ? 'Odadan çıkacaksın. Emin misin?' : Ag.mod === 'ev' ? 'Oyun herkes için bitecek ve odaya dönülecek. Emin misin?' : 'Bu oyun bitecek. Emin misin?';
      $('cikisEkrani').hidden = false;
    });
    $('cikisHayir').addEventListener('click', () => { $('cikisEkrani').hidden = true; });
    $('cikisEvet').addEventListener('click', () => {
      $('cikisEkrani').hidden = true;
      if (Ag.mod === 'misafir') { Ag.kapat(); salonaDon(); onlineCiz(); }
      else salonaDonHerkes();
    });
    $('tekrarBtn').addEventListener('click', () => oyunBaslat(sonOyun));
    $('salonaBtn').addEventListener('click', () => (Ag.mod === 'misafir' ? salonaDon() : salonaDonHerkes()));

    // Online
    $('odaAcBtn').addEventListener('click', () => { const ad = adAl(); if (ad) { Ses.motor(); Ag.odaKur(ad); } });
    $('katilBtn').addEventListener('click', () => {
      const ad = adAl();
      if (!ad) return;
      const kod = $('odaKodu').value.trim();
      if (kod.length < 4) { sars('odaKodu'); return; }
      Ses.motor();
      Ag.katil(ad, kod);
    });
    $('odaKodu').addEventListener('keydown', e => { if (e.key === 'Enter') $('katilBtn').click(); });
    $('odadanCikBtn').addEventListener('click', () => { Ag.kapat(); lobi = null; onlineCiz(); menuCiz(); tabloCiz(); });
    Ag.olay = agOlayi;

    menuCiz();
    onlineCiz();
    tabloCiz();
    vitrin();
    // Kısayol: adres sonuna #oyna=kursun yazılırsa o oyun doğrudan açılır
    const kisayol = location.hash.match(/oyna=(\w+)/);
    if (kisayol) oyunBaslat(kisayol[1]);
  }

  function sars(id) { $(id).classList.add('eksik'); setTimeout(() => $(id).classList.remove('eksik'), 600); $(id).focus(); }
  function adAl() {
    const ad = $('adim').value.trim().slice(0, 10);
    if (!ad) { sars('adim'); $('adim').placeholder = 'Önce adını yaz 👈'; return null; }
    return ad;
  }

  // ---------- Menü ----------
  function menuCiz() {
    const ev = Ag.mod === 'ev', misafir = Ag.mod === 'misafir';
    // Robot sayısı: tek başına 1-3 rakip; online'da boş yerler (0 - kalan)
    const enCok = online() ? Ag.EN_COK - (lobi?.oyuncular.length || 1) : EN_COK_BOT;
    const enAz = online() ? 0 : 1;
    const secili = online() ? (lobi?.bot ?? 0) : ayar.bot;
    $('botBaslik').textContent = online() ? '🤖 Boş yerlere robot' : '👾 Rakip robot sayısı';
    $('botSayisi').innerHTML = Array.from({ length: enCok - enAz + 1 }, (_, i) => i + enAz)
      .map(n => `<button data-n="${n}" class="${n === secili ? 'secili' : ''}" ${misafir ? 'disabled' : ''}>${n}</button>`).join('');
    const oyunda = misafir && lobi?.oyunda;
    $('oyunListesi').innerHTML = oyunlar.map(o => `
      <div class="miniOyun">
        <div class="ikon">${o.ikon}</div>
        <div><b>${o.ad}</b><p>${o.ozet}</p></div>
        ${misafir ? `<span class="bekle">${oyunda ? 'Oynanıyor…' : 'Oda sahibi seçer'}</span>` : `<button data-oyna="${o.id}">▶ Oyna</button>`}
        ${misafir ? '' : (o.ayarlar || []).map(a => `<div class="oyunAyar"><span>${a.ad}</span>${a.secenekler.map(v => `<button data-oayar="${o.id}.${a.id}" data-deger="${v}" class="${oyunAyari(o)[a.id] === v ? 'secili' : ''}">${v}</button>`).join('')}</div>`).join('')}
        <details><summary>Nasıl oynanır?</summary><ol>${o.kurallar.map(k => `<li>${k}</li>`).join('')}</ol></details>
      </div>`).join('') + `
      <div class="miniOyun yakinda"><div class="ikon">❔</div><div><b>Yeni mini oyunlar</b><p>Yakında bu salona eklenecek.</p></div><span></span></div>`;
    void ev;
  }

  function onlineCiz() {
    const odada = online() && lobi;
    $('odaGiris').hidden = !!odada;
    $('odaKutu').hidden = !odada;
    if (!odada) return;
    $('odaKodYazi').textContent = lobi.kod || Ag.kod;
    $('odaKisiler').innerHTML = lobi.oyuncular.map((o, i) =>
      `<li><span class="nokta" style="--renk:${RENKLER[i]}"></span>${o.ad}${i === 0 ? ' 👑' : ''}</li>`).join('') +
      Array.from({ length: lobi.bot }, (_, i) => `<li class="botSatir"><span class="nokta" style="--renk:${RENKLER[lobi.oyuncular.length + i]}"></span>🤖 Robot</li>`).join('');
    $('odaNot').textContent = Ag.mod === 'ev'
      ? `Kodu arkadaşlarına söyle. Herkes gelince aşağıdan bir oyun seç (en fazla ${Ag.EN_COK} kişi).`
      : lobi.oyunda ? '⏳ Odada oyun oynanıyor, bitince katılacaksın.' : '⏳ Oda sahibinin oyun seçmesi bekleniyor…';
  }

  function agOlayi(tip, veri) {
    if (tip === 'durum') { $('onlineDurum').textContent = veri; return; }
    if (tip === 'hata') { $('onlineDurum').textContent = '❌ ' + veri; lobi = null; onlineCiz(); menuCiz(); return; }
    if (tip === 'lobi' && Ag.mod === 'ev' && veri.tablo !== tablo) { Ag.tabloAyarla(tablo); return; }
    if (tip === 'lobi') { lobi = veri; if (Ag.mod === 'misafir') gorunenTablo = veri.tablo || {}; $('onlineDurum').textContent = ''; onlineCiz(); menuCiz(); tabloCiz(); return; }
    if (tip === 'kapandi') {
      lobi = null;
      if (calisan) salonaDon();
      $('onlineDurum').textContent = '📴 ' + veri;
      onlineCiz(); menuCiz(); tabloCiz();
      return;
    }
    if (tip === 'basla') { oyunuAc(veri.oyun, veri.oyuncular, veri.benId, 'misafir', veri.ayar || {}); return; }
    if (tip === 'salon') { if (calisan || !$('sonuc').hidden) salonaDon(); return; }
    if (tip === 'mesaj') { kanal?._gelen(veri); return; }
    if (tip === 'evMesaj') { kanal?._evGelen(veri.v, veri.id); return; }
    if (tip === 'koptu') {
      const o = calisanOyuncular?.find(p => p.id === veri);
      if (o) { Hud.bilgi(`📴 ${o.ad} bağlantısı koptu, yerine robot oynuyor.`); o.bot = true; }
      calisan?.koptu?.(veri);
    }
  }

  // Salondayken arkada robotlar boşlukta süzülsün
  let vitrinRobotlari = [];
  function vitrin() {
    vitrinRobotlari.forEach(r => r.sil());
    vitrinRobotlari = RENKLER.slice(0, 5).map((renk, i) => {
      const r = Cekirdek.robotYap(renk, BOT_ADLARI[i]);
      r.etiket.visible = false;
      Cekirdek.sahne.add(r.grup);
      const faz = (i / 5) * Math.PI * 2;
      Cekirdek.guncelle((dt, t) => {
        if (!r.grup.parent) return false;
        const a = faz + t * 0.15;
        r.konum(Math.cos(a) * 6, Math.sin(a) * 4);
        r.grup.position.y = Math.sin(t + i) * 0.6;
        r.yon(a + Math.PI / 2);
      });
      return r;
    });
  }

  // ---------- Oyun başlatma ----------
  function oyunBaslat(id) {
    if (Ag.mod === 'misafir') return;
    const oyun = oyunlar.find(o => o.id === id);
    if (!oyun) return;
    Ses.motor();
    const adlar = [...BOT_ADLARI].sort(() => Math.random() - 0.5);
    let oyuncular;
    if (Ag.mod === 'ev') {
      oyuncular = Ag.insanlar().map((p, i) => ({ id: i, ad: p.ad, renk: RENKLER[i], bot: false }));
      for (let i = 0; i < Ag.bot && oyuncular.length < Ag.EN_COK; i++) {
        const n = oyuncular.length;
        oyuncular.push({ id: n, ad: adlar[i], renk: RENKLER[n], bot: true });
      }
      if (oyuncular.length < 2) { $('onlineDurum').textContent = '❗ Oynamak için en az 2 kişi lazım: arkadaşını bekle ya da robot ekle.'; return; }
      Ag.oyunuBaslat(id, oyuncular, oyunAyari(oyun));
    } else {
      if (!ayar.ad) sars('adim');
      oyuncular = [{ id: 0, ad: ayar.ad || 'Sen', renk: RENKLER[0], bot: false }];
      for (let i = 0; i < ayar.bot; i++) oyuncular.push({ id: i + 1, ad: adlar[i], renk: RENKLER[i + 1], bot: true });
    }
    oyunuAc(id, oyuncular, 0, Ag.mod, oyunAyari(oyun));
  }

  let calisanOyuncular = null;
  function oyunuAc(id, oyuncular, benId, mod, oyunAyar = {}) {
    const oyun = oyunlar.find(o => o.id === id);
    if (!oyun) return;
    durdur();
    vitrinRobotlari.forEach(r => r.sil()); vitrinRobotlari = [];
    sonOyun = id;
    calisanOyuncular = oyuncular;
    ['salon', 'sonuc', 'cikisEkrani'].forEach(e => { $(e).hidden = true; });
    ['oyuncular', 'menuBtn'].forEach(e => { $(e).hidden = false; });
    $('odaBilgisi').hidden = mod === 'yerel';
    $('odaBilgisi').innerHTML = `🌐 Oda <b>${Ag.kod}</b>`;
    Ses.ortam(true);
    Kontrol.ac(true);
    kanal = kanalYap(mod, benId);
    calisan = oyun.baslat({ oyuncular, benId, hud: Hud, kanal, ayar: { ...oyunAyari(oyun), ...oyunAyar }, bitti: sonuc => oyunBitti(oyuncular, benId, sonuc) });
  }

  function kanalYap(mod, benId) {
    const dinleyen = [], evDinleyen = [];
    const evMi = mod !== 'misafir';
    let acik = true;
    return {
      evMi, online: mod !== 'yerel',
      yayinla(m) {
        if (!evMi || !acik) return;
        if (mod === 'ev') Ag.herkese(m);
        queueMicrotask(() => { if (acik) dinleyen.forEach(f => f(m)); });
      },
      evaGonder(m) {
        if (!acik) return;
        if (evMi) queueMicrotask(() => { if (acik) evDinleyen.forEach(f => f(m, benId)); });
        else Ag.evaGonder(m);
      },
      dinle(f) { dinleyen.push(f); },
      evDinle(f) { evDinleyen.push(f); },
      _gelen(m) { if (acik) dinleyen.forEach(f => f(m)); },
      _evGelen(m, id) { if (acik && evMi) evDinleyen.forEach(f => f(m, id)); },
      _kapat() { acik = false; },
    };
  }

  function durdur() {
    if (calisan) { calisan.durdur(); calisan = null; }
    kanal?._kapat(); kanal = null;
    Kontrol.ac(false);
    Hud.temizle();
  }

  function oyunBitti(oyuncular, benId, { kazanan, siralama, aciklama }) {
    Kontrol.ac(false);
    tabloyaEkle(oyuncular, siralama);
    const kazandim = kazanan === benId;
    if (kazandim) Ses.kazanma(); else Ses.kaybetme();
    const k = oyuncular.find(o => o.id === kazanan);
    $('sonucBaslik').textContent = kazandim ? '🏆 Kazandın!' : k ? `🏆 ${k.ad} kazandı` : '🤝 Berabere!';
    $('sonucAciklama').textContent = aciklama || (k ? (kazandim ? 'Ayakta kalan son robot sensin!' : 'Bir dahakine sen kazanırsın!') : 'Son robotlar aynı anda elendi.');
    $('siralama').innerHTML = siralama.map(s => {
      const o = oyuncular.find(p => p.id === s.id);
      return `<li><span class="nokta" style="--renk:${o.renk}"></span><b>${o.ad}</b>${o.id === benId ? ' (sen)' : ''} <span class="neden">${s.neden || ''}</span></li>`;
    }).join('');
    const misafir = Ag.mod === 'misafir';
    $('tekrarBtn').hidden = misafir;
    $('salonaBtn').textContent = misafir ? '🏠 Odaya dön' : online() ? '🏠 Odaya dön' : '🏠 Salon';
    $('sonucNot').hidden = !misafir;
    setTimeout(() => { if (calisan) $('sonuc').hidden = false; }, 1400);
  }

  // Oda sahibi ya da tek başına: oyunu bitir, (online ise herkesi) salona döndür
  function salonaDonHerkes() {
    if (Ag.mod === 'ev') Ag.salonaDon();
    salonaDon();
  }
  function salonaDon() {
    durdur();
    Ses.ortam(false);
    ['oyuncular', 'menuBtn', 'sonuc', 'odaBilgisi', 'cikisEkrani'].forEach(e => { $(e).hidden = true; });
    $('salon').hidden = false;
    Cekirdek.kameraAyarla(10, 1.0);
    vitrin();
    onlineCiz(); menuCiz();
  }

  // ---------- Genel puan tablosu (bütün mini oyunlar) ----------
  // Her oyunda sıraya göre puan: 1. → 3, 2. → 2, 3. → 1, 4. → 0. Robotlar tek satırda ("🤖 Robotlar": en iyi robotun puanı).
  // Tabloyu tek başına oynarken bu cihaz, online'da oda sahibi tutar (misafirler onunkini görür).
  const TABLO_ANAHTAR = 'roboTurnuva.tablo', SIRA_PUANI = [3, 2, 1, 0], ROBOTLAR = '🤖 Robotlar';
  let tablo = {};
  try { tablo = JSON.parse(localStorage.getItem(TABLO_ANAHTAR) || '{}') || {}; } catch (e) { tablo = {}; }
  let gorunenTablo = null;   // misafirde oda sahibinin tablosu
  function tabloKaydet() { try { localStorage.setItem(TABLO_ANAHTAR, JSON.stringify(tablo)); } catch (e) { /* */ } }
  function tabloyaEkle(oyuncular, siralama) {
    if (Ag.mod === 'misafir' || !siralama?.length) return;
    let robotPuani = null, robotBirinci = false;
    siralama.forEach((s, i) => {
      const o = oyuncular.find(p => p.id === s.id);
      if (!o) return;
      const puan = SIRA_PUANI[i] ?? 0;
      if (o.bot) { if (robotPuani === null || puan > robotPuani) robotPuani = puan; if (i === 0) robotBirinci = true; return; }
      const t = tablo[o.ad] ??= { puan: 0, birinci: 0, oyun: 0 };
      t.puan += puan; t.oyun++; if (i === 0) t.birinci++;
    });
    if (robotPuani !== null) {
      const t = tablo[ROBOTLAR] ??= { puan: 0, birinci: 0, oyun: 0 };
      t.puan += robotPuani; t.oyun++; if (robotBirinci) t.birinci++;
    }
    tabloKaydet();
    if (Ag.mod === 'ev') Ag.tabloAyarla(tablo);
    tabloCiz();
  }
  function tabloCiz() {
    const t = Ag.mod === 'misafir' ? (gorunenTablo || {}) : tablo;
    const satirlar = Object.entries(t).sort((a, c) => c[1].puan - a[1].puan || c[1].birinci - a[1].birinci);
    $('genelTablo').innerHTML = !satirlar.length
      ? '<p class="not">Henüz oyun oynanmadı. Her oyunda 1. → 3, 2. → 2, 3. → 1 puan.</p>'
      : `<table class="tablo"><tr><th></th><th>Oyuncu</th><th>Oyun</th><th>🥇</th><th>Puan</th></tr>${satirlar.map(([ad, v], i) =>
          `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${ad.replace(/</g, '&lt;')}</td><td>${v.oyun}</td><td>${v.birinci}</td><td><b>${v.puan}</b></td></tr>`).join('')}</table>
        ${Ag.mod === 'misafir' ? '<p class="not">Oda sahibinin tablosu</p>' : '<button id="tabloSifirBtn" class="ikinci">🗑️ Tabloyu sıfırla</button>'}`;
    $('tabloSifirBtn')?.addEventListener('click', () => {
      if (!confirm('Genel puan tablosu silinsin mi?')) return;
      tablo = {}; tabloKaydet();
      if (Ag.mod === 'ev') Ag.tabloAyarla(tablo);
      tabloCiz();
    });
  }

  // ---------- Ekran bilgileri (mini oyunlar kullanır) ----------
  const Hud = {
    // liste: [{ id, ad, renk, canli, ben, ek }]  (ek: adın yanında küçük yazı, ör. canlar)
    oyuncular(liste) {
      $('oyuncular').innerHTML = liste.map(o =>
        `<div class="oyuncu ${o.ben ? 'ben' : ''} ${o.canli === false ? 'elendi' : ''}" style="--renk:${o.renk}"><span class="nokta"></span>${o.ad}${o.ek ? ` <span class="ek">${o.ek}</span>` : ''}</div>`).join('');
    },
    // Büyük ortadaki yazı. sinif: '' | 'gizli' | 'ates'
    buyuk(yazi, sayac = '', sinif = '', zipla = true) {
      const el = $('buyuk');
      if (!yazi && !sayac) { el.hidden = true; return; }
      const yeni = $('buyukYazi').textContent !== yazi;
      el.hidden = false;
      el.className = sinif;
      $('buyukYazi').textContent = yazi;
      $('sayac').textContent = sayac;
      if (yeni && zipla) { void el.offsetWidth; el.classList.add('zipla'); }
    },
    bilgi(yazi, uyari = false) {
      $('bilgi').hidden = !yazi;
      $('bilgi').textContent = yazi || '';
      $('bilgi').classList.toggle('uyari', uyari);
    },
    ipucu(yazi) { $('ipucu').hidden = !yazi; $('ipucu').textContent = yazi || ''; },
    perde(durum) {   // 'gizli' | 'flas' | ''
      const p = $('perdeRenk');
      p.classList.remove('flas');
      p.classList.toggle('acik', durum === 'gizli');
      if (durum === 'flas') { void p.offsetWidth; p.classList.add('flas'); }
    },
    temizle() { Hud.buyuk(''); Hud.bilgi(''); Hud.ipucu(''); Hud.perde(''); $('oyuncular').innerHTML = ''; },
  };

  return { baslat, oyunEkle, Hud, RENKLER, get oyunda() { return !!calisan || Ag.mod !== 'yerel'; } };
})();
