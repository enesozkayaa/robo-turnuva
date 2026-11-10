// =============================================================
// Robo Turnuva - Görünmez Lazer: kurallar (ekran yok, sadece hesap)
// Altıgen kafes, her tur: herkes 5 sn görünmez → yerini ve lazerinin yönünü seçer
// → görünür olunca lazer kime değerse o elenir. Her 2 turda dış halka düşer.
// Son kalan kazanır. Bu dosya hem tarayıcıda hem Node'da (test) çalışır.
// Koordinat: zemin x-z düzlemi, yön açısı a → (cos a, sin a).
// =============================================================

const LazerMotor = (() => {
  // Platform halkaları: köşeye olan uzaklık (dıştan içe). Her küçülmede en dıştaki düşer.
  const HALKALAR = [9, 7, 5, 3.2];
  const KAFES = HALKALAR[0] + 0.35;   // tel örgü: platform küçülse de yerinde kalır
  const ROBOT_R = 0.45;               // robot gövde yarıçapı
  const ISIN_R = 0.08;                // lazer kalınlığı
  const HIZ = 3.6;                    // birim / saniye
  const KUCULME_ARALIGI = 2;          // kaç turda bir halka düşer
  const SURE = { hazir: 2.2, gizli: 5, atis: 2.4, dusus: 2.4 };

  const KOK3 = Math.sqrt(3) / 2;
  // Düz kenarlı altıgen (köşeler 0°, 60°, ...): kenar normalleri 30° + k·60°
  const NORMALLER = [0, 1, 2, 3, 4, 5].map(k => {
    const a = Math.PI / 6 + k * Math.PI / 3;
    return [Math.cos(a), Math.sin(a)];
  });
  const icYaricap = r => r * KOK3;

  function icindeMi(r, x, z, pay = 0) {
    const ic = icYaricap(r) - pay;
    return NORMALLER.every(([nx, nz]) => x * nx + z * nz <= ic);
  }
  // Noktayı altıgenin içine çeker (kenardan "pay" kadar içeride)
  function sinirla(r, x, z, pay = ROBOT_R) {
    const ic = icYaricap(r) - pay;
    for (let tekrar = 0; tekrar < 3; tekrar++) {
      for (const [nx, nz] of NORMALLER) {
        const d = x * nx + z * nz;
        if (d > ic) { x -= nx * (d - ic); z -= nz * (d - ic); }
      }
    }
    return [x, z];
  }
  // Işının altıgen kenarına kadar olan uzunluğu
  function duvaraKadar(r, x, z, dx, dz) {
    const ic = icYaricap(r);
    let en = Infinity;
    for (const [nx, nz] of NORMALLER) {
      const yon = dx * nx + dz * nz;
      if (yon > 1e-9) en = Math.min(en, (ic - (x * nx + z * nz)) / yon);
    }
    return Math.max(0, en);
  }

  function yeni(oyuncular) {
    const n = oyuncular.length;
    const r0 = HALKALAR[0] * 0.62;
    const kaydir = Math.random() * Math.PI * 2;
    return {
      tur: 1, seviye: 0, bitti: false, kazanan: null,
      oyuncular: oyuncular.map((o, i) => {
        const aci = kaydir + (i / n) * Math.PI * 2;
        const x = Math.cos(aci) * r0, z = Math.sin(aci) * r0;
        return { ...o, canli: true, x, z, a: Math.atan2(-z, -x), olumTuru: 0 };
      }),
    };
  }

  const platform = d => HALKALAR[d.seviye];
  const canlilar = d => d.oyuncular.filter(o => o.canli);
  // Bu turun sonunda halka düşecek mi?
  const dusecekMi = d => d.tur % KUCULME_ARALIGI === 0 && d.seviye < HALKALAR.length - 1;
  // Güvenli bölge: halka düşecekse bir içteki
  const guvenli = d => HALKALAR[dusecekMi(d) ? d.seviye + 1 : d.seviye];
  // Halka son saniyede yanıp sönünce kaçılacak en yakın güvenli nokta (zaten güvendeyse null)
  function kacisNoktasi(d, x, z) {
    if (!dusecekMi(d) || icindeMi(guvenli(d), x, z, ROBOT_R * 0.5)) return null;
    return sinirla(guvenli(d), x, z, ROBOT_R + 0.35);
  }

  // Tur sonu: pozlar = { id: {x, z, a} }. Herkes aynı anda ateş eder.
  function turuBitir(d, pozlar) {
    const yasayan = canlilar(d);
    yasayan.forEach(o => {
      const p = pozlar[o.id];
      if (!p) return;
      const [x, z] = sinirla(platform(d), +p.x || 0, +p.z || 0);
      o.x = x; o.z = z; o.a = +p.a || 0;
    });

    const isinlar = [], vurulan = new Set();
    yasayan.forEach(o => {
      const dx = Math.cos(o.a), dz = Math.sin(o.a);
      let son = duvaraKadar(KAFES, o.x, o.z, dx, dz), hedef = null;
      yasayan.forEach(h => {
        if (h === o) return;
        const vx = h.x - o.x, vz = h.z - o.z;
        const t = vx * dx + vz * dz;
        if (t <= 0) return;
        const dik = Math.hypot(vx - dx * t, vz - dz * t);
        if (dik > ROBOT_R + ISIN_R) return;
        const giris = t - Math.sqrt(Math.max(0, (ROBOT_R + ISIN_R) ** 2 - dik * dik));
        if (giris < son) { son = Math.max(0, giris); hedef = h.id; }
      });
      if (hedef !== null) vurulan.add(hedef);
      isinlar.push({ id: o.id, x1: o.x, z1: o.z, x2: o.x + dx * son, z2: o.z + dz * son, hedef });
    });
    vurulan.forEach(id => { const o = d.oyuncular.find(p => p.id === id); o.canli = false; o.olumTuru = d.tur; o.neden = 'lazer'; });

    let dusenler = [], kucul = false;
    if (dusecekMi(d)) {
      kucul = true;
      d.seviye++;
      canlilar(d).forEach(o => {
        if (!icindeMi(platform(d), o.x, o.z)) { o.canli = false; o.olumTuru = d.tur; o.neden = 'dustu'; dusenler.push(o.id); }
      });
    }

    const kalan = canlilar(d);
    if (kalan.length <= 1) {
      d.bitti = true;
      d.kazanan = kalan.length ? kalan[0].id : null;   // null: son kalanlar aynı anda gitti, berabere
    }
    const sonuc = { tur: d.tur, isinlar, vurulanlar: [...vurulan], dusenler, kucul, seviye: d.seviye, bitti: d.bitti, kazanan: d.kazanan };
    if (!d.bitti) d.tur++;
    return sonuc;
  }

  // ---------- Botlar ----------
  // Turun başında karar verir: gideceği yer ve nişan açısı.
  // Rakiplerin tur başındaki yerini bilir (herkes görünmez olmadan önce görür).
  // Hangi halkanın düşeceğini bilmez: son saniyede yanıp sönünce kaçmaya çalışır (lazer.js).
  function botKarari(d, id, rnd = Math.random) {
    const ben = d.oyuncular.find(o => o.id === id);
    const r = platform(d);
    const menzil = HIZ * SURE.gizli * 0.85;
    // Gideceği yer: güvenli bölgede rastgele, ama en az biraz yer değiştirsin
    let hx = ben.x, hz = ben.z;
    for (let i = 0; i < 12; i++) {
      const aci = rnd() * Math.PI * 2, uz = Math.sqrt(rnd()) * icYaricap(r) * 0.85;
      const x = Math.cos(aci) * uz, z = Math.sin(aci) * uz;
      const mesafe = Math.hypot(x - ben.x, z - ben.z);
      if (mesafe > 1.6 && mesafe < menzil) { hx = x; hz = z; break; }
    }
    [hx, hz] = sinirla(r, hx, hz, ROBOT_R + 0.2);
    // Nişan: bir rakibin tahmini yerine
    const rakipler = canlilar(d).filter(o => o.id !== id);
    let a = rnd() * Math.PI * 2;
    if (rakipler.length) {
      const h = rakipler[Math.floor(rnd() * rakipler.length)];
      let tx = h.x, tz = h.z;
      if (rnd() < 0.65) {
        // "kaçacak" diye tahmin: merkeze doğru ya da rastgele biraz kaydır
        const kac = 1 + rnd() * 4;
        const yon = rnd() < 0.5 ? Math.atan2(-h.z, -h.x) + (rnd() - 0.5) * 1.6 : rnd() * Math.PI * 2;
        tx += Math.cos(yon) * kac; tz += Math.sin(yon) * kac;
        [tx, tz] = sinirla(r, tx, tz);
      }
      a = Math.atan2(tz - hz, tx - hx);
    }
    return { x: hx, z: hz, a };
  }

  return {
    HALKALAR, KAFES, ROBOT_R, ISIN_R, HIZ, SURE, KUCULME_ARALIGI,
    yeni, turuBitir, botKarari, kacisNoktasi, sinirla, icindeMi, duvaraKadar, platform, canlilar, dusecekMi, guvenli,
  };
})();

if (typeof module !== 'undefined') module.exports = LazerMotor;
