// =============================================================
// Robo Turnuva - oyun salonu
// Mini oyunların listesi, oyuncular (sen + robot rakipler), ekran bilgileri (Hud)
// ve oyun sonu ekranı. Yeni mini oyun eklemek için:
//   Salon.oyunEkle({ id, ad, ikon, ozet, kurallar: [...], baslat(b) { ...; return { durdur() {} } } })
// b = { oyuncular, benId, hud, bitti({ kazanan, siralama: [{ id, neden }] }) }
// =============================================================

const Salon = (() => {
  const SURUM = '1.0';
  const RENKLER = ['#2ee6ff', '#ff3b8d', '#ffd23b', '#7dff4a', '#b46bff', '#ff8a2a', '#ff6bf0', '#f2f5ff'];
  const BOT_ADLARI = ['Bipbop', 'Tıkır', 'Vızır', 'Cızbız', 'Pırpır', 'Zıpzıp', 'Dıtdıt', 'Fırfır'];
  const ANAHTAR = 'roboTurnuva.ayar';
  const oyunlar = [];
  const EN_COK_BOT = 4;
  let ayar = { ad: '', bot: 3 };
  try { Object.assign(ayar, JSON.parse(localStorage.getItem(ANAHTAR) || '{}')); } catch (e) { /* varsayılan */ }
  ayar.bot = Math.min(EN_COK_BOT, Math.max(1, +ayar.bot || 3));
  let calisan = null, sonOyun = null;
  const $ = id => document.getElementById(id);

  function oyunEkle(o) { oyunlar.push(o); }
  function kaydet() { try { localStorage.setItem(ANAHTAR, JSON.stringify(ayar)); } catch (e) { /* */ } }

  function baslat() {
    Cekirdek.baslat($('sahne'));
    Kontrol.kur();
    Cekirdek.kameraAyarla(10, 1.0);
    $('surumNotu').textContent = `Sürüm ${SURUM}`;
    $('adim').value = ayar.ad;
    $('adim').addEventListener('input', e => { ayar.ad = e.target.value.trim(); kaydet(); });
    $('botSayisi').innerHTML = Array.from({ length: EN_COK_BOT }, (_, i) => i + 1).map(n => `<button data-n="${n}">${n}</button>`).join('');
    $('botSayisi').addEventListener('click', e => {
      const n = +e.target.dataset.n;
      if (!n) return;
      ayar.bot = n; kaydet(); menuCiz();
    });
    $('oyunListesi').addEventListener('click', e => {
      const b = e.target.closest('[data-oyna]');
      if (b) oyunBaslat(b.dataset.oyna);
    });
    $('sesBtn').addEventListener('click', () => { Ses.ac(!Ses.acik); $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇'; });
    $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇';
    $('menuBtn').addEventListener('click', () => { $('cikisEkrani').hidden = false; });
    $('cikisHayir').addEventListener('click', () => { $('cikisEkrani').hidden = true; });
    $('cikisEvet').addEventListener('click', () => { $('cikisEkrani').hidden = true; salonaDon(); });
    $('tekrarBtn').addEventListener('click', () => oyunBaslat(sonOyun));
    $('salonaBtn').addEventListener('click', salonaDon);
    menuCiz();
    vitrin();
  }

  function menuCiz() {
    [...$('botSayisi').children].forEach(b => b.classList.toggle('secili', +b.dataset.n === ayar.bot));
    $('oyunListesi').innerHTML = oyunlar.map(o => `
      <div class="miniOyun">
        <div class="ikon">${o.ikon}</div>
        <div><b>${o.ad}</b><p>${o.ozet}</p></div>
        <button data-oyna="${o.id}">▶ Oyna</button>
        <details><summary>Nasıl oynanır?</summary><ol>${o.kurallar.map(k => `<li>${k}</li>`).join('')}</ol></details>
      </div>`).join('') + `
      <div class="miniOyun yakinda"><div class="ikon">❔</div><div><b>Yeni mini oyunlar</b><p>Yakında bu salona eklenecek.</p></div><span></span></div>`;
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

  function oyunBaslat(id) {
    const oyun = oyunlar.find(o => o.id === id);
    if (!oyun) return;
    Ses.motor();
    if (!ayar.ad) { $('adim').focus(); $('adim').classList.add('eksik'); setTimeout(() => $('adim').classList.remove('eksik'), 600); }
    durdur();
    vitrinRobotlari.forEach(r => r.sil()); vitrinRobotlari = [];
    sonOyun = id;
    const adlar = [...BOT_ADLARI].sort(() => Math.random() - 0.5);
    const oyuncular = [{ id: 0, ad: ayar.ad || 'Sen', renk: RENKLER[0], bot: false }];
    for (let i = 0; i < ayar.bot; i++) oyuncular.push({ id: i + 1, ad: adlar[i], renk: RENKLER[i + 1], bot: true });
    ['salon', 'sonuc', 'cikisEkrani'].forEach(e => { $(e).hidden = true; });
    ['oyuncular', 'menuBtn'].forEach(e => { $(e).hidden = false; });
    Ses.ortam(true);
    Kontrol.ac(true);
    calisan = oyun.baslat({ oyuncular, benId: 0, hud: Hud, bitti: sonuc => oyunBitti(oyun, oyuncular, sonuc) });
  }

  function durdur() {
    if (calisan) { calisan.durdur(); calisan = null; }
    Kontrol.ac(false);
    Hud.temizle();
  }

  function oyunBitti(oyun, oyuncular, { kazanan, siralama }) {
    Kontrol.ac(false);
    const kazandim = kazanan === 0;
    if (kazandim) Ses.kazanma(); else Ses.kaybetme();
    const k = oyuncular.find(o => o.id === kazanan);
    $('sonucBaslik').textContent = kazandim ? '🏆 Kazandın!' : k ? `🏆 ${k.ad} kazandı` : '🤝 Berabere!';
    $('sonucAciklama').textContent = k ? (kazandim ? 'Kafeste ayakta kalan son robot sensin!' : 'Bir dahakine sen kazanırsın!') : 'Son robotlar aynı anda elendi.';
    $('siralama').innerHTML = siralama.map(s => {
      const o = oyuncular.find(p => p.id === s.id);
      return `<li><span class="nokta" style="--renk:${o.renk}"></span><b>${o.ad}</b>${o.id === 0 ? ' (sen)' : ''} <span class="neden">${s.neden || ''}</span></li>`;
    }).join('');
    setTimeout(() => { if (calisan) $('sonuc').hidden = false; }, 1400);
  }

  function salonaDon() {
    durdur();
    Ses.ortam(false);
    ['oyuncular', 'menuBtn', 'sonuc'].forEach(e => { $(e).hidden = true; });
    $('salon').hidden = false;
    Cekirdek.kameraAyarla(10, 1.0);
    vitrin();
  }

  // ---------- Ekran bilgileri (mini oyunlar kullanır) ----------
  const Hud = {
    // liste: [{ id, ad, renk, canli, ben }]
    oyuncular(liste) {
      $('oyuncular').innerHTML = liste.map(o =>
        `<div class="oyuncu ${o.ben ? 'ben' : ''} ${o.canli ? '' : 'elendi'}" style="--renk:${o.renk}"><span class="nokta"></span>${o.ad}</div>`).join('');
    },
    // Büyük ortadaki yazı. sinif: '' | 'gizli' | 'ates'
    buyuk(yazi, sayac = '', sinif = '') {
      const el = $('buyuk');
      if (!yazi && !sayac) { el.hidden = true; return; }
      const yeni = $('buyukYazi').textContent !== yazi;
      el.hidden = false;
      el.className = sinif;
      $('buyukYazi').textContent = yazi;
      $('sayac').textContent = sayac;
      if (yeni) { void el.offsetWidth; el.classList.add('zipla'); }
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

  return { baslat, oyunEkle, Hud, RENKLER, get oyunda() { return !!calisan; } };
})();
