// =============================================================
// Robo Turnuva - mini oyun: ZAMAN AVCISI (süre tahmin)
// Her tur 5.00 - 15.00 sn arası rastgele bir hedef süre çıkar. 3-2-1 (dın dın dın) sonra
// saat başlar; hedefe en yakın anda DURDUR'a basan kazanır.
// Modlar sırayla, 3'er tur: 1) yelkovan görünür  2) ilk 3 sn görünür, sonra kaybolur  3) kör: hiç görünmez.
// Puan: her turda 1. → 3, 2. → 2, 3. → 1, 4. → 0. 9 tur sonunda en çok puan kazanır.
//
// Online: kurallar ve puanlar odayı açanda (kanal.evMi). Herkes kendi süresini kendi cihazında
// ölçer (gecikme kimseyi etkilemez) ve sadece süresini gönderir.
// Mesajlar: ev → herkes { t: 'tur', no, mod, hedef }  { t: 'sonuc', no, hedef, liste }  { t: 'bitti', ... }
//           oyuncu → ev { t: 'dur', no, sure }
// =============================================================

(() => {
  const MODLAR = [
    { id: 'acik', ad: '👀 Yelkovan görünür', aciklama: 'Yelkovanı izle, tam zamanında durdur!', sapma: 0.12 },
    { id: 'yari', ad: '⏳ İlk 2 saniye görünür', aciklama: 'Yelkovan 2 saniye sonra kaybolacak. Sonrasını kafandan say!', sapma: 0.32 },
    { id: 'kor', ad: '🙈 Kör mod', aciklama: 'Yelkovan hiç görünmez. 3-2-1 sonra içinden say!', sapma: 0.65 },
  ];
  const HER_MOD_SECENEK = [1, 2, 3, 4, 5];   // her moddan kaç tur (açılışta seçilir)
  const TUR_SN = 20;              // yelkovanın bir tam turu (sn)
  const GORUNUR_SN = 2;           // yarı modda yelkovan kaç saniye görünür
  const HAZIR_SN = 2.6, SAYIM = 3, EN_UZUN = 30;
  const PUAN = [3, 2, 1, 0];

  const kadranSvg = () => {
    let cizgi = '';
    for (let i = 0; i < TUR_SN * 2; i++) {
      const a = (i / (TUR_SN * 2)) * Math.PI * 2, buyuk = i % 10 === 0, orta = i % 2 === 0;
      const r1 = buyuk ? 78 : orta ? 84 : 88, r2 = 93;
      cizgi += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * r2}" y2="${100 - Math.cos(a) * r2}" class="${buyuk ? 'kalin' : orta ? 'orta' : ''}"/>`;
    }
    let sayi = '';
    for (let s = 0; s < TUR_SN; s += 5) {
      const a = (s / TUR_SN) * Math.PI * 2;
      sayi += `<text x="${100 + Math.sin(a) * 64}" y="${100 - Math.cos(a) * 64 + 6}">${s}</text>`;
    }
    return `<svg viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="97" class="kasa"/>
      <circle cx="100" cy="100" r="92" class="yuz"/>
      <g class="cizgiler">${cizgi}</g><g class="sayilar">${sayi}</g>
      <g id="zmIzler"></g>
      <g id="zmYelkovan"><line x1="100" y1="112" x2="100" y2="16" class="yelkovan"/><circle cx="100" cy="16" r="3.5" class="uc"/></g>
      <circle cx="100" cy="100" r="6" class="gobek"/>
      <text id="zmKor" x="100" y="140" class="kor">🙈</text>
    </svg>`;
  };

  Salon.oyunEkle({
    id: 'zaman',
    ad: 'Zaman Avcısı',
    ikon: '⏱️',
    ozet: 'Ekrana bir süre çıkar. Saati tam o anda durdur! Yelkovan gittikçe kaybolur.',
    kurallar: [
      'Her turda rastgele bir süre çıkar (ör. <b>6.53</b>): yelkovan görünür modda <b>1 ile 15</b>, diğer modlarda <b>5 ile 15 saniye</b> arası.',
      '3-2-1 (dın, dın, dın) sonra saat başlar. Süreye en yakın anda <b>⏹ DURDUR</b>\'a bas (bilgisayarda <b>boşluk</b> tuşu da olur).',
      'Her moddan kaç tur oynanacağını açılışta seçersin (1-5). Modlar sırayla gelir: <b>1)</b> yelkovan görünür, <b>2)</b> yelkovan ilk 2 saniye görünür sonra kaybolur, <b>3)</b> kör mod: yelkovan hiç görünmez.',
      'Her turda en yakın olan <b>3</b>, ikinci <b>2</b>, üçüncü <b>1</b> puan alır.',
      'Son turun sonunda en çok puanı toplayan kazanır.',
    ],
    ayarlar: [{ id: 'tur', ad: 'Her moddan kaç tur?', secenekler: HER_MOD_SECENEK, varsayilan: 3 }],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const HER_MOD = HER_MOD_SECENEK.includes(+b.ayar?.tur) ? +b.ayar.tur : 3;
    const TUR = MODLAR.length * HER_MOD;
    Kontrol.ac(false);   // bu oyunda joystick yok
    Cekirdek.kameraAyarla(9, 0.5);

    // ---------- Sahne: robotlar altta sıra halinde ----------
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    const R = {};
    const n = b.oyuncular.length;
    b.oyuncular.forEach((o, i) => {
      const r = Cekirdek.robotYap(o.renk, o.ad);
      r.grup.scale.setScalar(1.3);
      r.konum((i - (n - 1) / 2) * 2.2, 6.4);
      r.yon(Math.PI / 2);   // kameraya baksın
      grup.add(r.grup);
      R[o.id] = r;
    });

    // ---------- Ekran: saat, hedef, durdur düğmesi, sonuç tablosu ----------
    const kap = document.createElement('div');
    kap.id = 'zaman';
    kap.innerHTML = `
      <div class="zmUst"><span id="zmTur"></span><span id="zmMod"></span></div>
      <div class="zmHedefYazi">Hedef <b id="zmHedefSn">--.--</b> sn</div>
      <div class="zmSaat">${kadranSvg()}<div id="zmSayim"></div></div>
      <button id="zmDur" disabled>⏹ DURDUR</button>
      <div id="zmSonuc" hidden></div>`;
    document.body.appendChild(kap);
    const $ = id => document.getElementById(id);
    const puanlar = Object.fromEntries(b.oyuncular.map(o => [o.id, 0]));
    function hudOyuncular() {
      b.hud.oyuncular(b.oyuncular.map(o => ({ ...o, ben: o.id === b.benId, ek: `${puanlar[o.id]} puan` })));
    }
    hudOyuncular();

    // ---------- Herkeste: tur akışı ----------
    let durdu = false, tur = null, basla = 0, benimSure = null, sayimZaman = [];
    const zamanlayici = (sn, fn) => { const z = setTimeout(() => { if (!durdu) fn(); }, sn * 1000); sayimZaman.push(z); return z; };
    const yelkovanAci = sn => (sn / TUR_SN) * 360;
    function yelkovan(sn, gorunur) {
      $('zmYelkovan').setAttribute('transform', `rotate(${yelkovanAci(sn)} 100 100)`);
      $('zmYelkovan').style.opacity = gorunur ? 1 : 0;
    }

    function turGeldi(m) {
      tur = m; basla = 0; benimSure = null;
      sayimZaman.forEach(clearTimeout); sayimZaman = [];
      const mod = MODLAR.find(x => x.id === m.mod);
      $('zmTur').textContent = `Tur ${m.no}/${TUR}`;
      $('zmMod').textContent = mod.ad;
      $('zmHedefSn').textContent = m.hedef.toFixed(2);
      $('zmIzler').innerHTML = '';
      $('zmKor').style.opacity = m.mod === 'kor' ? 1 : 0;
      $('zmSonuc').hidden = true;
      $('zmDur').disabled = true;
      $('zmDur').textContent = '⏹ DURDUR';
      kap.className = 'mod-' + m.mod;
      yelkovan(0, m.mod !== 'kor');
      b.hud.bilgi(mod.aciklama);
      b.hud.buyuk('');
      Ses.bip();
      // Robotlar bekler (kimse basmadı)
      b.oyuncular.forEach(o => R[o.id].saydam(1));
      // 3-2-1 (dın) sonra başla
      for (let i = 0; i < SAYIM; i++) zamanlayici(HAZIR_SN + i, () => { sayimYaz(String(SAYIM - i)); Ses.din(); });
      zamanlayici(HAZIR_SN + SAYIM, () => {
        sayimYaz('');
        Ses.din(true);
        basla = performance.now();
        $('zmDur').disabled = false;
        b.hud.bilgi(m.mod === 'kor' ? '🙈 Say… Hedefe gelince DURDUR!' : 'Hedefe gelince DURDUR!');
      });
      // Çok uzun beklenirse kendiliğinden durur
      zamanlayici(HAZIR_SN + SAYIM + EN_UZUN, () => { if (benimSure === null) durdur(true); });
    }
    function sayimYaz(s) {
      const el = $('zmSayim');
      el.textContent = s;
      el.classList.remove('vur'); void el.offsetWidth; if (s) el.classList.add('vur');
    }
    function durdur(kendiliginden = false) {
      if (!tur || !basla || benimSure !== null) return;
      benimSure = Math.min(EN_UZUN, (performance.now() - basla) / 1000);
      $('zmDur').disabled = true;
      $('zmDur').textContent = kendiliginden ? '⌛ Süre doldu' : '✅ Durdurdun';
      Ses.tik();
      R[b.benId].grup.position.y = 0.4;
      Cekirdek.animasyon(0.4, t => { R[b.benId].grup.position.y = 0.4 * (1 - t); });
      b.hud.bilgi('✅ Durdurdun! Diğerleri bekleniyor…');
      kanal.evaGonder({ t: 'dur', no: tur.no, sure: benimSure });
    }
    const tus = e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); durdur(); } };
    window.addEventListener('keydown', tus);
    $('zmDur').addEventListener('pointerdown', e => { e.preventDefault(); durdur(); });

    function sonucGeldi(m) {
      sayimZaman.forEach(clearTimeout); sayimZaman = [];
      basla = 0;
      $('zmDur').disabled = true;
      // Yelkovan hedefi göstersin, herkesin durduğu yer kadranda renkli çizgi
      yelkovan(m.hedef, true);
      $('zmKor').style.opacity = 0;
      $('zmIzler').innerHTML = m.liste.filter(s => s.sure !== null).map(s => {
        const o = b.oyuncular.find(p => p.id === s.id);
        return `<line x1="100" y1="100" x2="100" y2="22" stroke="${o.renk}" stroke-width="2.5" stroke-linecap="round" transform="rotate(${yelkovanAci(s.sure)} 100 100)" opacity="0.9"/>`;
      }).join('');
      m.liste.forEach(s => { puanlar[s.id] = s.toplam; });
      hudOyuncular();
      const ilk = m.liste[0];
      $('zmSonuc').innerHTML = `<table>${m.liste.map((s, i) => {
        const o = b.oyuncular.find(p => p.id === s.id);
        const fark = s.sure === null ? '—' : `${s.fark >= 0 ? '+' : ''}${s.fark.toFixed(2)}`;
        return `<tr class="${o.id === b.benId ? 'ben' : ''}"><td>${['🥇', '🥈', '🥉', '4.'][i] || i + 1 + '.'}</td><td><span class="nokta" style="--renk:${o.renk}"></span>${o.ad}</td><td>${s.sure === null ? 'basmadı' : s.sure.toFixed(2) + ' sn'}</td><td class="fark">${fark}</td><td class="puan">+${s.puan}</td></tr>`;
      }).join('')}</table>`;
      $('zmSonuc').hidden = false;
      const benim = m.liste.find(s => s.id === b.benId);
      b.hud.bilgi(ilk.id === b.benId ? '🎯 Bu turu sen kazandın!' : benim?.sure !== null && benim ? `Sen ${benim.sure.toFixed(2)} sn'de durdurdun (${benim.fark >= 0 ? '+' : ''}${benim.fark.toFixed(2)}).` : 'Bu tur basmadın!');
      if (ilk.id === b.benId) Ses.kazanma(); else Ses.isabet();
      const k = R[ilk.id];
      Cekirdek.animasyon(0.9, t => { k.grup.position.y = Math.sin(t * Math.PI) * 0.9; k.yon(Math.PI / 2 + t * Math.PI * 2); });
    }

    // Her kare: yelkovan döner (moda göre görünür / kaybolur)
    const kaldir = Cekirdek.guncelle(() => {
      if (durdu) return false;
      if (!tur || !basla) return;
      const sn = (benimSure ?? (performance.now() - basla) / 1000);
      const gorunur = tur.mod === 'acik' || (tur.mod === 'yari' && sn < GORUNUR_SN);
      yelkovan(sn, gorunur);
    });

    kanal.dinle(m => {
      if (durdu) return;
      if (m.t === 'tur') turGeldi(m);
      else if (m.t === 'sonuc') sonucGeldi(m);
      else if (m.t === 'bitti') {
        b.hud.bilgi('');
        b.bitti({ kazanan: m.kazanan, siralama: m.siralama, aciklama: m.kazanan === b.benId ? 'Zamanı en iyi sen yakaladın!' : 'Zamanı en iyi o yakaladı.' });
      }
    });

    // ---------- Sadece ev: kurallar ve puanlar ----------
    let ev = null;
    if (kanal.evMi) {
      ev = { no: 0, sureler: {}, bekleme: null, bitti: false };
      const insanlar = () => b.oyuncular.filter(o => !o.bot);
      const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const botSuresi = (o, mod, hedef) => {
        o.beceri ??= 0.8 + Math.random() * 0.5;
        return Math.max(0.3, Math.min(EN_UZUN, hedef + gauss() * MODLAR.find(x => x.id === mod).sapma * o.beceri));
      };
      ev.botSuresi = botSuresi;
      const yeniTur = () => {
        if (durdu) return;
        ev.no++;
        const mod = MODLAR[Math.floor((ev.no - 1) / HER_MOD)].id;
        // 5.00 - 15.00 arası, iki basamak
        // Yelkovan görünür modda 1.00 - 15.00, diğerlerinde 5.00 - 15.00 (iki basamak)
        const enAz = mod === 'acik' ? 1 : 5;
        const hedef = Math.round((enAz + Math.random() * (15 - enAz)) * 100) / 100;
        ev.tur = { no: ev.no, mod, hedef };
        ev.sureler = {};
        b.oyuncular.filter(o => o.bot).forEach(o => { ev.sureler[o.id] = botSuresi(o, mod, hedef); });
        kanal.yayinla({ t: 'tur', ...ev.tur });
        clearTimeout(ev.bekleme);
        // Kimse basmasa bile tur biter (bağlantı koparsa takılmasın)
        ev.bekleme = setTimeout(turuBitir, (HAZIR_SN + SAYIM + EN_UZUN + 3) * 1000);
      };
      ev.yeniTur = yeniTur;
      const turuBitir = () => {
        if (durdu || !ev.tur || ev.tur.bitti) return;
        ev.tur.bitti = true;
        clearTimeout(ev.bekleme);
        const { hedef } = ev.tur;
        const liste = b.oyuncular.map(o => {
          const sure = typeof ev.sureler[o.id] === 'number' ? Math.round(ev.sureler[o.id] * 100) / 100 : null;
          return { id: o.id, sure, fark: sure === null ? null : Math.round((sure - hedef) * 100) / 100 };
        }).sort((a, c) => (a.sure === null) - (c.sure === null) || Math.abs(a.fark) - Math.abs(c.fark));
        // Eşit olanlar aynı puanı alır
        liste.forEach((s, i) => {
          const onceki = liste[i - 1];
          s.puan = s.sure === null ? 0 : onceki && onceki.sure !== null && Math.abs(onceki.fark) === Math.abs(s.fark) ? onceki.puan : PUAN[i] ?? 0;
          puanlarEv[s.id] += s.puan;
          s.toplam = puanlarEv[s.id];
        });
        kanal.yayinla({ t: 'sonuc', no: ev.tur.no, hedef, liste });
        setTimeout(() => {
          if (durdu) return;
          if (ev.no < TUR) return yeniTur();
          // Bitti: en çok puan; eşitse toplam sapması az olan
          const sirali = [...b.oyuncular].sort((a, c) => puanlarEv[c.id] - puanlarEv[a.id] || ev.toplamFark[a.id] - ev.toplamFark[c.id]);
          const ilk = sirali[0], ikinci = sirali[1];
          const berabere = ikinci && puanlarEv[ilk.id] === puanlarEv[ikinci.id] && ev.toplamFark[ilk.id] === ev.toplamFark[ikinci.id];
          kanal.yayinla({
            t: 'bitti', kazanan: berabere ? null : ilk.id,
            siralama: sirali.map(o => ({ id: o.id, neden: `${puanlarEv[o.id]} puan · toplam sapma ${ev.toplamFark[o.id].toFixed(2)} sn` })),
          });
        }, 5200);
        liste.forEach(s => { ev.toplamFark[s.id] += s.fark === null ? EN_UZUN : Math.abs(s.fark); });
      };
      const puanlarEv = Object.fromEntries(b.oyuncular.map(o => [o.id, 0]));
      ev.toplamFark = Object.fromEntries(b.oyuncular.map(o => [o.id, 0]));
      const hepsiGeldi = () => b.oyuncular.every(o => typeof ev.sureler[o.id] === 'number');
      kanal.evDinle((m, id) => {
        if (m.t !== 'dur' || !ev.tur || m.no !== ev.tur.no || ev.tur.bitti) return;
        if (typeof ev.sureler[id] === 'number') return;
        const s = +m.sure;
        if (!isFinite(s) || s < 0) return;
        ev.sureler[id] = Math.min(EN_UZUN, s);
        if (hepsiGeldi()) setTimeout(turuBitir, 400);
      });
      ev.koptu = id => {
        const o = b.oyuncular.find(p => p.id === id);
        if (!o || !ev.tur || ev.tur.bitti) return;
        if (typeof ev.sureler[id] !== 'number') ev.sureler[id] = botSuresi(o, ev.tur.mod, ev.tur.hedef);
        if (hepsiGeldi()) setTimeout(turuBitir, 400);
      };
      void insanlar;
      setTimeout(yeniTur, 700);
    }

    return {
      durdur() {
        durdu = true;
        kaldir();
        sayimZaman.forEach(clearTimeout);
        if (ev) clearTimeout(ev.bekleme);
        window.removeEventListener('keydown', tus);
        kap.remove();
        Object.values(R).forEach(r => r.sil());
        Cekirdek.sahne.remove(grup);
      },
      koptu(id) { ev?.koptu(id); },
    };
  }
})();
