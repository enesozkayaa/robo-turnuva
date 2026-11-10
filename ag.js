// =============================================================
// Robo Turnuva - online oda (PeerJS: cihazlar doğrudan bağlanır)
// Odayı açan ("ev") oyunu yönetir; misafirler sadece kendi hamlelerini gönderir.
// En fazla 4 kişi; boş yerleri oda sahibi robotlarla doldurabilir.
// Bu dosya oyun kurallarını bilmez: mini oyunlara ortak bir "kanal" verir (salon.js'te).
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, kimlik, surum }  { tip: 'oyun', v }  { tip: 'nabiz' }
//   ev → misafir: { tip: 'kabul' }  { tip: 'red', neden }  { tip: 'lobi', oyuncular, bot, oyunda }
//                 { tip: 'basla', oyun, oyuncular, benId }  { tip: 'oyun', v }  { tip: 'salon' }  { tip: 'nabiz' }
// =============================================================

const Ag = (() => {
  const SURUM = 1;
  const ODA_ONEKI = 'robo-turnuva-oda-';
  const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const NABIZ_ARALIGI = 2500, NABIZ_ZAMAN_ASIMI = 12000;
  const EN_COK = 4;

  const ag = { mod: 'yerel', peer: null, baglanti: null, kod: '', sonMesaj: 0, nabiz: null, oyunda: false, bot: 0 };
  // Evde: oyuncular = [{ kimlik, ad, misafir: { baglanti, sonMesaj } | null, oyunId }]
  // Misafirde: lobiden gelen liste [{ ad, bagli }]
  let oyuncular = [];
  let olay = () => {};   // salon.js dinler: olay(tip, veri)

  let kimlik = '';
  try {
    kimlik = sessionStorage.getItem('roboTurnuva.kimlik') || '';
    if (!kimlik) sessionStorage.setItem('roboTurnuva.kimlik', (kimlik = Math.random().toString(36).slice(2, 12)));
  } catch (e) { kimlik = Math.random().toString(36).slice(2, 12); }

  const misafirler = () => oyuncular.filter(p => p.misafir);
  const gonder = (m, mesaj) => { try { if (m?.baglanti.open) m.baglanti.send(mesaj); } catch (e) { /* kopmuş */ } };

  function nabziBaslat() {
    ag.sonMesaj = Date.now();
    clearInterval(ag.nabiz);
    ag.nabiz = setInterval(() => {
      if (ag.mod === 'ev') {
        misafirler().forEach(p => {
          gonder(p.misafir, { tip: 'nabiz' });
          if (Date.now() - p.misafir.sonMesaj > NABIZ_ZAMAN_ASIMI) { try { p.misafir.baglanti.close(); } catch (e) { /* */ } koptu(p); }
        });
      } else if (ag.mod === 'misafir' && ag.baglanti) {
        if (ag.baglanti.open) ag.baglanti.send({ tip: 'nabiz' });
        if (Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) evKapandi('Oda sahibiyle bağlantı koptu.');
      }
    }, NABIZ_ARALIGI);
  }
  function sunucuyaYenidenBaglan(peer) {
    peer.on('disconnected', () => setTimeout(() => {
      if (peer.destroyed || !peer.disconnected) return;
      try { peer.reconnect(); } catch (e) { /* tekrar denenir */ }
    }, 2000));
  }
  const peerVar = () => typeof Peer !== 'undefined';

  // ---------- Ev ----------
  function odaKur(ad) {
    if (!peerVar()) return olay('hata', 'Online bağlantı kütüphanesi yüklenemedi. İnterneti kontrol et.');
    kapat();
    const kod = [...Array(5)].map(() => KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)]).join('');
    olay('durum', '⏳ Oda açılıyor…');
    const peer = new Peer(ODA_ONEKI + kod);
    ag.peer = peer;
    peer.on('open', () => {
      if (ag.peer !== peer) return;
      ag.mod = 'ev'; ag.kod = kod; ag.oyunda = false;
      oyuncular = [{ kimlik, ad, misafir: null }];
      nabziBaslat();
      lobiyiYay();
    });
    sunucuyaYenidenBaglan(peer);
    peer.on('connection', baglanti => {
      const misafir = { baglanti, sonMesaj: Date.now() };
      baglanti.on('data', m => {
        misafir.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') evMesaji(misafir, m);
      });
      const kapandi = () => { const p = oyuncular.find(x => x.misafir === misafir); if (p) koptu(p); };
      baglanti.on('close', kapandi);
      baglanti.on('error', kapandi);
    });
    peer.on('error', e => {
      if (ag.peer !== peer) return;
      if (e.type === 'unavailable-id') return odaKur(ad);
      if (ag.mod !== 'ev') { kapat(); olay('hata', `Oda açılamadı (${e.type}). İnterneti kontrol et.`); }
    });
  }

  function evMesaji(misafir, m) {
    if (m?.tip === 'katil') return katilanGeldi(misafir, m);
    const p = oyuncular.find(x => x.misafir === misafir);
    if (!p) return;
    if (m?.tip === 'oyun' && ag.oyunda && p.oyunId !== undefined) olay('evMesaj', { v: m.v, id: p.oyunId });
  }

  function katilanGeldi(misafir, m) {
    const reddet = neden => { gonder(misafir, { tip: 'red', neden }); setTimeout(() => { try { misafir.baglanti.close(); } catch (e) { /* */ } }, 500); };
    if (m.surum !== SURUM) return reddet('Uygulaman eski sürümde kalmış. Sayfayı yenile (ya da uygulamayı kapatıp aç), sonra tekrar katıl.');
    const ad = String(m.ad ?? '').trim().slice(0, 10) || 'Oyuncu';
    // Aynı kişi geri geldiyse (sayfayı yeniledi) yerini ver
    let p = oyuncular.find(x => x.kimlik === m.kimlik && x.kimlik !== kimlik);
    if (!p) {
      if (oyuncular.length >= EN_COK) return reddet(`Oda dolu (en fazla ${EN_COK} kişi).`);
      p = { kimlik: String(m.kimlik || Math.random()).slice(0, 20), ad };
      oyuncular.push(p);
    }
    p.ad = ad;
    p.misafir = misafir;
    gonder(misafir, { tip: 'kabul' });
    if (ag.oyunda) gonder(misafir, { tip: 'durum', metin: '⏳ Odada bir oyun oynanıyor. Bitince sen de katılacaksın.' });
    lobiyiYay();
  }

  function koptu(p) {
    if (!p.misafir) return;
    p.misafir = null;
    if (ag.oyunda && p.oyunId !== undefined) olay('koptu', p.oyunId);
    // Oyunda değilse listeden çıkar
    if (!ag.oyunda) oyuncular = oyuncular.filter(x => x !== p);
    lobiyiYay();
  }

  const lobiListesi = () => oyuncular.filter(p => p.kimlik === kimlik || p.misafir).map(p => ({ ad: p.ad }));
  function lobiyiYay() {
    if (ag.mod !== 'ev') return;
    ag.bot = Math.min(ag.bot, EN_COK - lobiListesi().length);
    const veri = { oyuncular: lobiListesi(), bot: ag.bot, oyunda: ag.oyunda, kod: ag.kod, ev: true };
    misafirler().forEach(p => gonder(p.misafir, { tip: 'lobi', ...veri, ev: false }));
    olay('lobi', veri);
  }
  function botAyarla(n) { ag.bot = Math.max(0, Math.min(EN_COK - lobiListesi().length, n)); lobiyiYay(); }

  // Ev oyunu başlatır: oyuncular = [{ id, ad, renk, bot }] (insanlar önce). Her misafire kendi id'si gider.
  function oyunuBaslat(oyunId, liste) {
    ag.oyunda = true;
    misafirler().forEach(p => gonder(p.misafir, { tip: 'basla', oyun: oyunId, oyuncular: liste, benId: p.oyunId }));
    lobiyiYay();
  }
  // Ev: oyuna girecek insanlar (bağlı olanlar), oyun id'leri atanır
  function insanlar() {
    const bagli = oyuncular.filter(p => p.kimlik === kimlik || p.misafir);
    oyuncular = bagli;
    bagli.forEach((p, i) => { p.oyunId = i; });
    return bagli.map(p => ({ id: p.oyunId, ad: p.ad }));
  }
  function salonaDon() {
    ag.oyunda = false;
    oyuncular = oyuncular.filter(p => p.kimlik === kimlik || p.misafir);
    misafirler().forEach(p => gonder(p.misafir, { tip: 'salon' }));
    lobiyiYay();
  }
  const herkese = v => misafirler().forEach(p => gonder(p.misafir, { tip: 'oyun', v }));

  // ---------- Misafir ----------
  function katil(ad, kod) {
    if (!peerVar()) return olay('hata', 'Online bağlantı kütüphanesi yüklenemedi. İnterneti kontrol et.');
    kapat();
    kod = kod.trim().toUpperCase();
    olay('durum', '⏳ Odaya bağlanılıyor…');
    const peer = new Peer();
    ag.peer = peer;
    let zaman = setTimeout(() => { if (ag.mod !== 'misafir') { kapat(); olay('hata', 'Odaya bağlanılamadı. Kodu kontrol et; oda sahibinin uygulaması açık olmalı.'); } }, 25000);
    peer.on('open', () => {
      if (ag.peer !== peer) return;
      const b = peer.connect(ODA_ONEKI + kod, { reliable: true });
      ag.baglanti = b;
      b.on('open', () => b.send({ tip: 'katil', ad, kimlik, surum: SURUM }));
      b.on('data', m => {
        ag.sonMesaj = Date.now();
        if (m?.tip === 'nabiz') return;
        if (m?.tip === 'kabul') { clearTimeout(zaman); ag.mod = 'misafir'; ag.kod = kod; nabziBaslat(); }
        else if (m?.tip === 'red') { clearTimeout(zaman); kapat(); olay('hata', m.neden); }
        else if (m?.tip === 'lobi') { ag.oyunda = m.oyunda; oyuncular = m.oyuncular; olay('lobi', { ...m, kod }); }
        else if (m?.tip === 'basla') { ag.oyunda = true; olay('basla', m); }
        else if (m?.tip === 'oyun') olay('mesaj', m.v);
        else if (m?.tip === 'salon') { ag.oyunda = false; olay('salon'); }
        else if (m?.tip === 'durum') olay('durum', m.metin);
      });
      b.on('close', () => { if (ag.baglanti === b) evKapandi('Oda kapandı.'); });
      b.on('error', () => { if (ag.baglanti === b) evKapandi('Oda sahibiyle bağlantı koptu.'); });
    });
    sunucuyaYenidenBaglan(peer);
    peer.on('error', e => {
      if (ag.peer !== peer) return;
      if (e.type === 'peer-unavailable') { clearTimeout(zaman); kapat(); olay('hata', `"${kod}" kodlu oda bulunamadı. Kodu kontrol et.`); }
    });
  }
  const evaGonder = v => { try { if (ag.baglanti?.open) ag.baglanti.send({ tip: 'oyun', v }); } catch (e) { /* */ } };
  function evKapandi(neden) {
    if (ag.mod !== 'misafir') return;
    kapat();
    olay('kapandi', neden);
  }

  function kapat() {
    clearInterval(ag.nabiz);
    if (ag.mod === 'ev') misafirler().forEach(p => { try { p.misafir.baglanti.close(); } catch (e) { /* */ } });
    try { ag.baglanti?.close(); } catch (e) { /* */ }
    try { ag.peer?.destroy(); } catch (e) { /* */ }
    Object.assign(ag, { mod: 'yerel', peer: null, baglanti: null, kod: '', oyunda: false });
    oyuncular = [];
  }

  return {
    odaKur, katil, kapat, botAyarla, oyunuBaslat, insanlar, salonaDon, herkese, evaGonder, EN_COK,
    set olay(fn) { olay = fn; },
    get mod() { return ag.mod; }, get kod() { return ag.kod; }, get bot() { return ag.bot; }, get oyunda() { return ag.oyunda; },
    get kisiSayisi() { return ag.mod === 'ev' ? lobiListesi().length : oyuncular.length; },
  };
})();
