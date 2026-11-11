// =============================================================
// Robo Turnuva - Mayın Koridoru: kurallar (ekran yok, sadece hesap)
// Uzun koridor (ileri = -z). Yerde gizli mayınlar (tohumdan, herkeste aynı). Her yöne gidilir.
// Her 5 saniyede bir etrafını tarayabilirsin (yakın çember): o an çemberdeki mayınlar kısa süre görünür,
// başka oyuncular da senin taramanı görür; tarama bitince mayınlar yeniden gizlenir.
// İlk mayına basınca duman çıkar, sürünerek yavaş gidersin; ikincisinde patlarsın.
// Koridorun sonundaki uzay üssüne ilk varan kazanır. Süre biterse varamayan patlar, puan alamaz.
// Sürenin yarısı dolunca arkadan yavaşça bir uzay aracı gelir: yetiştiği robotu ezer (süre bitince üsse varır).
// Mayınlar oyun başında bir kere kurulur, sonradan eklenmez/yer değiştirmez; patlayan mayın kalkar.
// Birbirini itme var. Sabit adımlı simülasyon: adim(d, dt, girdiler).
// =============================================================

const MayinMotor = (() => {
  const L = 28, W = 3;                    // koridor uzunluğu, yarı genişliği (5 robot yan yana sığar)
  const ROBOT_R = 0.38, AYAK = 0.22;       // çarpışma yarıçapı, mayına basma yarıçapı
  const MAYIN_R = 0.26, MAYIN_SAYI = 26;
  const HIZ = 2.6, HASARLI_HIZ = 1.1;
  const TARAMA_R = 2.8, TARAMA_ARA = 5;
  const BASLANGIC = 3, BITIS_Z = -L;      // başlangıç çizgisi z=0, üs z=-L
  const BAS_X = [-1.8, -0.6, 0.6, 1.8];
  const EZ_BAS = 2.5;                       // uzay aracının ön yüzü buradan başlar (başlangıç çizgisinin arkası)
  // Uzay aracının ön yüzünün z'si (sürenin yarısından önce yok: null). Süreden hesaplanır → herkeste aynı.
  function ezenZ(d) {
    const yari = d.sure / 2;
    if (d.t < 0 || d.kalan > yari) return null;
    const p = Math.min(1, (yari - d.kalan) / yari);
    return EZ_BAS + p * (BITIS_Z + 0.6 - EZ_BAS);
  }

  function tohumlu(t) {
    return () => { t |= 0; t = (t + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function mayinlarYap(tohum) {
    const rnd = tohumlu(tohum), m = [];
    for (let deneme = 0; m.length < MAYIN_SAYI && deneme < 5000; deneme++) {
      const x = (rnd() * 2 - 1) * (W - 0.3), z = -3 - rnd() * (L - 6);
      if (m.some(p => Math.hypot(p.x - x, p.z - z) < 0.95)) continue;
      m.push({ id: m.length, x, z, durum: 'gizli' });   // gizli | patladi
    }
    return m;
  }

  function yeni(oyuncular, tohum, sure = 60) {
    return {
      tohum, t: -BASLANGIC, sure, kalan: sure, bitti: false, kazanan: null, siraSayac: 0,
      mayinlar: mayinlarYap(tohum),
      oyuncular: oyuncular.map((o, i) => ({
        ...o, x: BAS_X[i % 4], z: 0, a: -Math.PI / 2, vx: 0, vz: 0,
        durum: 'oynuyor', hasarli: false, sira: 0, sonTarama: -99,
      })),
    };
  }
  const oynayan = d => d.oyuncular.filter(o => o.durum === 'oynuyor');
  function sinirla(o) {
    o.x = Math.max(-W + ROBOT_R, Math.min(W - ROBOT_R, o.x));
    o.z = Math.min(1, Math.max(BITIS_Z - 1, o.z));
  }
  // Tek robotun yürüyüşü (misafir kendi robotunu da bununla yürütür). Geri gidilmez.
  function yuru(o, hx, hz, dt) {
    const L2 = Math.hypot(hx, hz), h = o.hasarli ? HASARLI_HIZ : HIZ;
    if (L2 > 1) { hx /= L2; hz /= L2; }
    const ex = o.x, ez = o.z;
    o.x += (hx * h + o.vx) * dt; o.z += (hz * h + o.vz) * dt;
    const s = Math.exp(-5 * dt); o.vx *= s; o.vz *= s;
    sinirla(o);
    if (Math.hypot(o.x - ex, o.z - ez) > 0.002) o.a = Math.atan2(o.z - ez, o.x - ex);
  }
  // Tarama: o noktanın etrafındaki mayınlar
  const taramaSonucu = (d, x, z) => d.mayinlar.filter(m => m.durum === 'gizli' && Math.hypot(m.x - x, m.z - z) <= TARAMA_R + MAYIN_R).map(m => m.id);

  function bitisKontrol(d, olaylar) {
    if (oynayan(d).length) return;
    d.bitti = true;
    const ilk = d.oyuncular.find(o => o.sira === 1);
    d.kazanan = ilk ? ilk.id : null;
    olaylar.push({ tip: 'bitti', kazanan: d.kazanan });
  }

  // girdiler: { id: { hx, hz } } ya da online misafir için { x, z }
  function adim(d, dt, girdiler = {}) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    if (d.t < 0) return olaylar;
    d.kalan -= dt;
    const yasayan = oynayan(d);
    yasayan.forEach(o => {
      const g = girdiler[o.id] || {};
      const ex = o.x, ez = o.z;
      if (typeof g.x === 'number' && isFinite(g.x) && isFinite(g.z)) {
        // Misafir: yerini kendisi gönderir (geri gidemez, hızı aşamaz)
        const enCok = (o.hasarli ? HASARLI_HIZ : HIZ) * dt * 4 + 0.5;
        if (Math.hypot(g.x - o.x, g.z - o.z) < enCok) { o.x = g.x; o.z = g.z; }
        if (isFinite(+g.a)) o.a = +g.a;
        const s = Math.exp(-5 * dt); o.vx *= s; o.vz *= s;
        sinirla(o);
      } else yuru(o, +g.hx || 0, +g.hz || 0, dt);
      o.hizX = (o.x - ex) / dt; o.hizZ = (o.z - ez) / dt;
    });
    // Çarpışma ve itme
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j], dx = q.x - p.x, dz = q.z - p.z, L2 = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L2 >= en || L2 < 1e-6) continue;
      const nx = dx / L2, nz = dz / L2, it = (en - L2) / 2;
      p.x -= nx * it; p.z -= nz * it; q.x += nx * it; q.z += nz * it;
      sinirla(p); sinirla(q);
      if (d.t - (p.sonIt?.[q.id] || -9) < 0.5) continue;
      // Karşısındakine doğru daha hızlı giden iter
      const pY = Math.max(0, (p.hizX || 0) * nx + (p.hizZ || 0) * nz), qY = Math.max(0, -((q.hizX || 0) * nx + (q.hizZ || 0) * nz));
      if (Math.max(pY, qY) < 0.8) continue;
      (p.sonIt ??= {})[q.id] = d.t;
      const [iten, yiyen, s, hiz] = pY > qY ? [p, q, 1, pY] : [q, p, -1, qY];
      const g = 1.8 + hiz * 0.9;
      yiyen.vx += nx * s * g; yiyen.vz += nz * s * g;
      olaylar.push({ tip: 'it', id: yiyen.id, kim: iten.id, vx: nx * s * g, vz: nz * s * g });
    }
    // Tarama: herkes görür (çember + o anki mayınlar); 5 saniyede bir
    yasayan.forEach(o => {
      const g = girdiler[o.id] || {};
      if (!g.tara || d.t - o.sonTarama < TARAMA_ARA) return;
      o.sonTarama = d.t;
      olaylar.push({ tip: 'tara', id: o.id, x: +o.x.toFixed(2), z: +o.z.toFixed(2), m: taramaSonucu(d, o.x, o.z) });
    });
    // Mayınlar
    yasayan.forEach(o => {
      if (o.durum !== 'oynuyor') return;
      const m = d.mayinlar.find(q => q.durum === 'gizli' && Math.hypot(q.x - o.x, q.z - o.z) < AYAK + MAYIN_R);
      if (!m) return;
      m.durum = 'patladi';
      if (!o.hasarli) {
        o.hasarli = true;
        olaylar.push({ tip: 'mayin', id: o.id, m: m.id, sonuc: 'duman' });
      } else {
        o.durum = 'patladi';
        olaylar.push({ tip: 'mayin', id: o.id, m: m.id, sonuc: 'patladi' });
      }
    });
    // Arkadan gelen uzay aracı: yetiştiğini ezer
    const ez = ezenZ(d);
    if (ez !== null) yasayan.forEach(o => {
      if (o.durum !== 'oynuyor' || o.z < ez - ROBOT_R) return;
      o.durum = 'patladi';
      olaylar.push({ tip: 'ezildi', id: o.id });
    });
    // Üsse varış
    yasayan.forEach(o => {
      if (o.durum !== 'oynuyor' || o.z > BITIS_Z + 0.6) return;
      o.durum = 'vardi'; o.sira = ++d.siraSayac;
      olaylar.push({ tip: 'vardi', id: o.id, sira: o.sira });
    });
    // Süre bitti: varamayanlar patlar
    if (d.kalan <= 0) {
      oynayan(d).forEach(o => { o.durum = 'patladi'; olaylar.push({ tip: 'sureBitti', id: o.id }); });
    }
    bitisKontrol(d, olaylar);
    return olaylar;
  }

  // ---------- Botlar ----------
  // hafiza.bilinen: botun taradığı mayınlar
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (o.durum !== 'oynuyor' || d.t < 0) return {};
    hafiza.bilinen ??= new Set();
    hafiza.cesaret ??= rnd();                      // 0 temkinli → 1 gözü kara
    hafiza.taramaZ ??= o.z;
    // Tarama hazırsa tara
    let tara = false;   // tarama isteği (motor 5 sn'de bir kabul eder)
    if (d.t - (hafiza.sonTarama ?? -99) >= TARAMA_ARA) {
      hafiza.sonTarama = d.t; hafiza.taramaZ = o.z; tara = true;
      taramaSonucu(d, o.x, o.z).forEach(m => hafiza.bilinen.add(m));
    }
    // Taranan alanın dışına çıkmak üzereyse temkinli bot taramayı bekler (süre yetiyorsa)
    const kalanYol = o.z - BITIS_Z;
    const yetisir = d.kalan > kalanYol / (o.hasarli ? HASARLI_HIZ : HIZ) + 4;
    const disinda = o.z < hafiza.taramaZ - TARAMA_R * 0.8;
    const ez = ezenZ(d), kovalaniyor = ez !== null && o.z > ez - 5;   // uzay aracı yakınsa beklemez, kaçar
    if (disinda && yetisir && hafiza.cesaret < 0.4 && !kovalaniyor) return { tara };
    // Önündeki bilinen mayınlardan uzak bir şerit seç
    const ileri = d.mayinlar.filter(m => hafiza.bilinen.has(m.id) && m.durum === 'gizli' && m.z < o.z + 0.3 && m.z > o.z - 2.6);
    let enIyi = o.x, enIyiPuan = -Infinity;
    for (let x = -W + 0.5; x <= W - 0.5; x += 0.25) {
      const tehlike = ileri.reduce((t, m) => Math.min(t, Math.abs(m.x - x)), 9);
      const puan = Math.min(tehlike, 1.2) * 3 - Math.abs(x - o.x) * 0.6;
      if (puan > enIyiPuan) { enIyiPuan = puan; enIyi = x; }
    }
    const dx = enIyi - o.x;
    // Hemen önünde bilinen mayın varken yana kayana kadar yavaşla
    const tamOnunde = ileri.some(m => Math.abs(m.x - o.x) < AYAK + MAYIN_R + 0.1 && m.z < o.z && m.z > o.z - 0.9);
    return { hx: Math.max(-1, Math.min(1, dx * 2.5)), hz: tamOnunde && !kovalaniyor ? -0.05 : -1, tara };
  }

  return { L, W, ROBOT_R, AYAK, MAYIN_R, HIZ, HASARLI_HIZ, TARAMA_R, TARAMA_ARA, BASLANGIC, BITIS_Z, EZ_BAS, ezenZ, mayinlarYap, yeni, adim, yuru, taramaSonucu, botGirdi, oynayan };
})();

if (typeof module !== 'undefined') module.exports = MayinMotor;
