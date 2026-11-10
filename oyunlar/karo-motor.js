// =============================================================
// Robo Turnuva - Düşen Kareler: kurallar (ekran yok, sadece hesap)
// 8x8 kare zemin, her karenin üstünde bir işaret: 0 kare, 1 yuvarlak, 2 üçgen.
// Tur: duvarda bir işaret belirir (SECIM_SN) → o işaret olmayan kareler titrer (TITREME_SN)
// → düşer, üstündeki oyuncular da düşer (elenir) → düşen karelerin yarısı geri gelir → işaretler karışır.
// Oyuncular birbirini itebilir. Köşeleri değen iki kare arasından çapraz geçilebilir;
// kare olmayan yere basan düşer. Son kalan kazanır.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Tarayıcıda ve Node'da (test) çalışır.
// =============================================================

const KaroMotor = (() => {
  const N = 8, T = 1.5;                 // kare sayısı (kenar), kare boyu
  const YARI = (N * T) / 2;
  const ROBOT_R = 0.38;
  const DESTEK = 0.12;                  // merkez, bir karenin bu kadar dışına taşabilir (köşeden çapraz geçiş)
  const HIZ = 4.2;
  const SURE = { secim: 10, titreme: 1.5, dusus: 1.1, geriGel: 1.4, baslangic: 3 };
  const SEKILLER = ['kare', 'yuvarlak', 'ucgen'];

  const merkez = (i, j) => [-YARI + T * (i + 0.5), -YARI + T * (j + 0.5)];
  const karoNo = (i, j) => j * N + i;
  const hucre = (x, z) => [Math.floor((x + YARI) / T), Math.floor((z + YARI) / T)];

  // Bir nokta, ayakta duran bir karenin üstünde mi (ya da kenarından en fazla DESTEK kadar dışında mı)?
  function destekVar(d, x, z) {
    const [ci, cj] = hucre(x, z);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      if (i < 0 || j < 0 || i >= N || j >= N || !d.karolar[karoNo(i, j)].var) continue;
      const x0 = -YARI + T * i, z0 = -YARI + T * j;
      const dx = Math.max(x0 - x, 0, x - (x0 + T)), dz = Math.max(z0 - z, 0, z - (z0 + T));
      if (Math.hypot(dx, dz) <= DESTEK) return true;
    }
    return false;
  }

  // İşaretleri karıştır: her işaretten en az birkaç kare olsun
  function karistir(d, rnd = Math.random) {
    const duran = d.karolar.filter(k => k.var);
    const enAz = Math.max(2, Math.ceil(duran.length / 6));
    for (let deneme = 0; deneme < 20; deneme++) {
      duran.forEach(k => { k.sekil = Math.floor(rnd() * 3); });
      const say = [0, 1, 2].map(s => duran.filter(k => k.sekil === s).length);
      if (say.every(n => n >= Math.min(enAz, Math.floor(duran.length / 3)))) break;
    }
  }

  function yeni(oyuncular, rnd = Math.random) {
    const d = {
      t: -SURE.baslangic, tur: 0, faz: 'baslangic', fazKalan: SURE.baslangic, hedef: 0,
      karolar: Array.from({ length: N * N }, (_, k) => ({ var: true, sekil: 0, titre: false, dusuyor: false })),
      bitti: false, kazanan: null, olumSayac: 0,
    };
    karistir(d, rnd);
    const koseler = [[1, 1], [N - 2, N - 2], [N - 2, 1], [1, N - 2]];
    d.oyuncular = oyuncular.map((o, k) => {
      const [x, z] = merkez(...koseler[k % 4]);
      return { ...o, x, z, a: Math.atan2(-z, -x), vx: 0, vz: 0, canli: true, olumSirasi: 0, dusme: 0 };
    });
    return d;
  }
  const canlilar = d => d.oyuncular.filter(o => o.canli);

  function fazaGec(d, faz, olaylar, rnd) {
    d.faz = faz; d.fazKalan = SURE[faz];
    if (faz === 'secim') {
      d.tur++;
      karistir(d, rnd);
      d.karolar.forEach(k => { k.titre = false; k.dusuyor = false; });
      d.hedef = Math.floor(rnd() * 3);
      olaylar.push({ tip: 'secim', tur: d.tur, hedef: d.hedef, sekiller: d.karolar.map(k => k.sekil) });
    } else if (faz === 'titreme') {
      d.karolar.forEach(k => { k.titre = k.var && k.sekil !== d.hedef; });
      olaylar.push({ tip: 'titreme' });
    } else if (faz === 'dusus') {
      const dusen = [];
      d.karolar.forEach((k, no) => { if (k.titre) { k.var = false; k.titre = false; k.dusuyor = true; dusen.push(no); } });
      d.sonDusen = dusen;
      olaylar.push({ tip: 'dusus', karolar: dusen });
    } else if (faz === 'geriGel') {
      // Düşenlerin yarısı geri gelir
      const dusen = [...(d.sonDusen || [])].sort(() => rnd() - 0.5);
      const gelen = dusen.slice(0, Math.floor(dusen.length / 2));
      gelen.forEach(no => { d.karolar[no].var = true; });
      d.karolar.forEach(k => { k.dusuyor = false; });
      olaylar.push({ tip: 'geriGel', karolar: gelen });
    }
  }

  // girdiler: { id: { hx, hz } } yürüme yönü, ya da { x, z } (online: oyuncu kendi yerini gönderir)
  function adim(d, dt, girdiler = {}, rnd = Math.random) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    d.fazKalan -= dt;
    if (d.fazKalan <= 0) {
      const sira = { baslangic: 'secim', secim: 'titreme', titreme: 'dusus', dusus: 'geriGel', geriGel: 'secim' };
      fazaGec(d, sira[d.faz], olaylar, rnd);
    }
    const hareketli = d.faz !== 'baslangic';
    const yasayan = canlilar(d);

    yasayan.forEach(o => {
      const g = girdiler[o.id] || {};
      const ex = o.x, ez = o.z;
      if (hareketli && typeof g.x === 'number' && isFinite(g.x) && isFinite(g.z)) { o.x = g.x; o.z = g.z; }
      else {
        let hx = hareketli ? +g.hx || 0 : 0, hz = hareketli ? +g.hz || 0 : 0;
        const L = Math.hypot(hx, hz);
        if (L > 1) { hx /= L; hz /= L; }
        o.x += (hx * HIZ + o.vx) * dt; o.z += (hz * HIZ + o.vz) * dt;
      }
      // İtilme hızı yavaşça söner
      const sonum = Math.exp(-5 * dt);
      o.vx *= sonum; o.vz *= sonum;
      const mx = o.x - ex, mz = o.z - ez;
      if (Math.hypot(mx, mz) > 0.002) o.a = Math.atan2(mz, mx);
      o.hizX = mx / dt; o.hizZ = mz / dt;
    });

    // Çarpışma ve itme: birbirine doğru giden, karşısındakini iter
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j];
      const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L >= en || L < 1e-6) continue;
      const nx = dx / L, nz = dz / L;
      const it = (en - L) / 2;
      p.x -= nx * it; p.z -= nz * it; q.x += nx * it; q.z += nz * it;
      // p'nin q'ya doğru hızı, q'nun p'ye doğru hızı
      const pYaklas = Math.max(0, (p.hizX || 0) * nx + (p.hizZ || 0) * nz);
      const qYaklas = Math.max(0, -((q.hizX || 0) * nx + (q.hizZ || 0) * nz));
      const sonVurus = d.t - (p.sonIt?.[q.id] || -9);
      if (sonVurus < 0.35) continue;
      if (pYaklas > qYaklas + 0.5) {
        const g = 2.2 + pYaklas * 1.1;
        q.vx += nx * g; q.vz += nz * g;
        (p.sonIt ??= {})[q.id] = d.t;
        olaylar.push({ tip: 'it', id: q.id, kim: p.id, vx: nx * g, vz: nz * g });
      } else if (qYaklas > pYaklas + 0.5) {
        const g = 2.2 + qYaklas * 1.1;
        p.vx -= nx * g; p.vz -= nz * g;
        (p.sonIt ??= {})[q.id] = d.t;
        olaylar.push({ tip: 'it', id: p.id, kim: q.id, vx: -nx * g, vz: -nz * g });
      }
    }

    // Altında kare olmayan düşer
    if (hareketli) {
      yasayan.forEach(o => {
        if (destekVar(d, o.x, o.z)) return;
        o.canli = false; o.dusme = d.t; o.olumSirasi = ++d.olumSayac;
        olaylar.push({ tip: 'dustu', id: o.id, x: o.x, z: o.z });
      });
    }

    const kalan = canlilar(d);
    if (kalan.length <= 1 && d.oyuncular.length > 1) {
      d.bitti = true;
      d.kazanan = kalan.length ? kalan[0].id : null;
      olaylar.push({ tip: 'bitti', kazanan: d.kazanan });
    }
    return olaylar;
  }

  // ---------- Botlar ----------
  // Komşular: 8 yön (köşesi değen çapraz kareye de geçilebilir)
  function yol(d, bas, hedefMi) {
    const [si, sj] = bas;
    const onceki = new Map([[karoNo(si, sj), null]]);
    const kuyruk = [[si, sj]];
    while (kuyruk.length) {
      const [i, j] = kuyruk.shift();
      if (hedefMi(i, j)) {
        const yol = [];
        let k = karoNo(i, j);
        while (k !== null) { yol.unshift([k % N, Math.floor(k / N)]); k = onceki.get(k); }
        return yol;
      }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const no = karoNo(a, b);
        if (!d.karolar[no].var || onceki.has(no)) continue;
        onceki.set(no, karoNo(i, j));
        kuyruk.push([a, b]);
      }
    }
    return null;
  }

  // hafiza: bot başına (tepki gecikmesi, hedef kare, yol)
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (!o.canli || d.faz === 'baslangic') return { hx: 0, hz: 0 };
    hafiza.beceri ??= 0.7 + rnd() * 0.3;
    if (hafiza.tur !== d.tur) {
      // Yeni tur: duvara bakıp karar vermesi biraz sürer; bazen yanlış işarete yönelir
      hafiza.tur = d.tur;
      hafiza.bekle = d.t + 0.35 + rnd() * (2.2 - hafiza.beceri * 1.2);
      hafiza.sekil = rnd() < 0.12 * (1.6 - hafiza.beceri) ? (d.hedef + 1 + Math.floor(rnd() * 2)) % 3 : d.hedef;
      hafiza.yol = null; hafiza.yenile = 0;
    }
    // Yanlış işarete gidiyorsa süre azalınca fark eder
    if (hafiza.sekil !== d.hedef && d.faz === 'secim' && d.fazKalan < 2 + rnd() * 3) { hafiza.sekil = d.hedef; hafiza.yol = null; }
    if (d.t < hafiza.bekle) return { hx: 0, hz: 0 };
    const [ci, cj] = hucre(o.x, o.z);
    const uygun = (i, j) => { const k = d.karolar[karoNo(i, j)]; return k.var && (d.faz !== 'secim' || k.sekil === hafiza.sekil) && !k.titre; };
    if (!hafiza.yol || d.t > hafiza.yenile) {
      hafiza.yenile = d.t + 0.6;
      const icinde = ci >= 0 && cj >= 0 && ci < N && cj < N;
      hafiza.yol = icinde ? (yol(d, [ci, cj], uygun) || null) : null;
      hafiza.adim = 0;
    }
    if (!hafiza.yol) return { hx: 0, hz: 0 };
    // Sıradaki karenin merkezine yürü
    let [ti, tj] = hafiza.yol[Math.min(hafiza.adim, hafiza.yol.length - 1)];
    let [tx, tz] = merkez(ti, tj);
    if (Math.hypot(tx - o.x, tz - o.z) < 0.15 && hafiza.adim < hafiza.yol.length - 1) {
      hafiza.adim++;
      [ti, tj] = hafiza.yol[hafiza.adim];
      [tx, tz] = merkez(ti, tj);
    }
    const dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz);
    if (L < 0.08) return { hx: 0, hz: 0 };
    const h = Math.min(1, L / 0.4) * (0.75 + hafiza.beceri * 0.25);
    return { hx: dx / L * h, hz: dz / L * h };
  }

  return { N, T, YARI, ROBOT_R, DESTEK, HIZ, SURE, SEKILLER, merkez, karoNo, hucre, destekVar, yeni, adim, botGirdi, canlilar };
})();

if (typeof module !== 'undefined') module.exports = KaroMotor;
