// =============================================================
// Robo Turnuva - Karanlık Ev: kurallar (ekran yok, sadece hesap)
// Kuş bakışı bir ev: 5x5 oda ızgarası (birkaçı birleşik, ortası salon), kapılar, dolap/masa/sandık.
// Tur:
//   baslangic (3 sn) → herkes salonda
//   arama            → ışıklar açık, bir odada lazer silahı parlar; ilk dokunan AVCI olur
//   karanlik (30 sn) → ışıklar söner. Saklananların feneri var (aç/kapa), avcının feneri çok sönük.
//                      Avcı lazerle ateş eder: duvar ve eşyadan geçmez, kapılardan geçer.
//   aydinlik (10 sn) → ışıklar açılır, kovalamaca
//   son (3 sn)       → puanlar: kalan her saklanan +3, avcı vurduğu her kişi için +2
// Birkaç tur oynanır, en çok puanı olan kazanır.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Harita tohumdan üretilir (herkeste aynı).
// =============================================================

const EvMotor = (() => {
  const N = 5, C = 4.2, YARI = (N * C) / 2;          // oda ızgarası, oda boyu
  const DUVAR = 0.22, KAPI = 1.35;
  const ROBOT_R = 0.34, HIZ = 3.9;
  const SURE = { baslangic: 3, arama: 40, karanlik: 30, aydinlik: 10, son: 3.5 };
  const FENER = { menzil: 4.2, aci: 0.5 }, AVCI_FENER = { menzil: 2, aci: 0.75 };
  const ATES_ARA = 0.8, LAZER_MENZIL = 30;
  const PUAN = { kalan: 3, vurus: 2 };

  // Tohumlu rastgele (herkes aynı evi kursun)
  function tohumlu(t) {
    return () => { t |= 0; t = (t + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  const hucreMerkez = (i, j) => [-YARI + C * (i + 0.5), -YARI + C * (j + 0.5)];
  const hucre = (x, z) => [Math.max(0, Math.min(N - 1, Math.floor((x + YARI) / C))), Math.max(0, Math.min(N - 1, Math.floor((z + YARI) / C)))];
  // Noktanın bulunduğu oda (birleşik odalar tek oda)
  const odaBul = (h, x, z) => { const [i, j] = hucre(x, z); return h.odaNo[j * N + i]; };

  // ---------- Harita ----------
  function haritaYap(tohum) {
    const rnd = tohumlu(tohum);
    const ORTA = Math.floor(N / 2);
    // Kenarlar: yatay (i,j)-(i+1,j) ve dikey (i,j)-(i,j+1). durum: 'duvar' | 'kapi' | 'acik'
    const kenar = new Map();
    const anahtar = (i, j, yon) => `${i},${j},${yon}`;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i < N - 1) kenar.set(anahtar(i, j, 'x'), 'duvar');
      if (j < N - 1) kenar.set(anahtar(i, j, 'z'), 'duvar');
    }
    // Rastgele yayılan ağaç: her oda ulaşılabilir
    const gezildi = new Set([`${ORTA},${ORTA}`]);
    const yigin = [[ORTA, ORTA]];
    while (yigin.length) {
      const [i, j] = yigin[yigin.length - 1];
      const kom = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + a, j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !gezildi.has(`${a},${b}`));
      if (!kom.length) { yigin.pop(); continue; }
      const [a, b] = kom[Math.floor(rnd() * kom.length)];
      kenar.set(a !== i ? anahtar(Math.min(a, i), j, 'x') : anahtar(i, Math.min(b, j), 'z'), 'kapi');
      gezildi.add(`${a},${b}`);
      yigin.push([a, b]);
    }
    // Fazladan kapılar ve birkaç birleşik oda; salonun dört yanı kapı
    kenar.forEach((v, k) => { if (v === 'duvar' && rnd() < 0.28) kenar.set(k, 'kapi'); });
    const anahtarlar = [...kenar.keys()];
    for (let n = 0; n < 4; n++) {
      const k = anahtarlar[Math.floor(rnd() * anahtarlar.length)];
      const [i, j] = k.split(',').map(Number);
      if (Math.abs(i - ORTA) + Math.abs(j - ORTA) <= 1) continue;
      kenar.set(k, 'acik');
    }
    kenar.set(anahtar(ORTA - 1, ORTA, 'x'), 'kapi'); kenar.set(anahtar(ORTA, ORTA, 'x'), 'kapi');
    kenar.set(anahtar(ORTA, ORTA - 1, 'z'), 'kapi'); kenar.set(anahtar(ORTA, ORTA, 'z'), 'kapi');

    const kutular = [];   // { x1, z1, x2, z2, tip, h }
    const kapilar = [];   // kapı aralıkları (eşya buralara konmaz): [x, z]
    const duvarParca = (x1, z1, x2, z2) => kutular.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), tip: 'duvar' });
    const yariD = DUVAR / 2;
    // Dış duvarlar
    duvarParca(-YARI - yariD, -YARI - yariD, YARI + yariD, -YARI + yariD);
    duvarParca(-YARI - yariD, YARI - yariD, YARI + yariD, YARI + yariD);
    duvarParca(-YARI - yariD, -YARI - yariD, -YARI + yariD, YARI + yariD);
    duvarParca(YARI - yariD, -YARI - yariD, YARI + yariD, YARI + yariD);
    // İç duvarlar
    kenar.forEach((v, k) => {
      if (v === 'acik') return;
      const [i, j, yon] = k.split(',');
      const ii = +i, jj = +j;
      if (yon === 'x') {
        const x = -YARI + C * (ii + 1), z0 = -YARI + C * jj, z1 = z0 + C;
        if (v === 'duvar') duvarParca(x - yariD, z0 - yariD, x + yariD, z1 + yariD);
        else {
          const m = (z0 + z1) / 2;
          duvarParca(x - yariD, z0 - yariD, x + yariD, m - KAPI / 2);
          duvarParca(x - yariD, m + KAPI / 2, x + yariD, z1 + yariD);
          kapilar.push([x, m]);
        }
      } else {
        const z = -YARI + C * (jj + 1), x0 = -YARI + C * ii, x1 = x0 + C;
        if (v === 'duvar') duvarParca(x0 - yariD, z - yariD, x1 + yariD, z + yariD);
        else {
          const m = (x0 + x1) / 2;
          duvarParca(x0 - yariD, z - yariD, m - KAPI / 2, z + yariD);
          duvarParca(m + KAPI / 2, z - yariD, x1 + yariD, z + yariD);
          kapilar.push([m, z]);
        }
      }
    });
    // Eşyalar: salon hariç her odaya 1-3 tane (kapı önlerine ve birbirine değmesin)
    const ESYA = [
      { tip: 'dolap', w: 1.3, d: 0.6, h: 1.5 },
      { tip: 'masa', w: 1.4, d: 0.9, h: 0.7 },
      { tip: 'sandik', w: 0.8, d: 0.8, h: 0.6 },
      { tip: 'yatak', w: 1.1, d: 1.8, h: 0.5 },
      { tip: 'kitaplik', w: 1.6, d: 0.45, h: 1.6 },
    ];
    const cakisir = (a, b, pay) => a.x1 - pay < b.x2 && a.x2 + pay > b.x1 && a.z1 - pay < b.z2 && a.z2 + pay > b.z1;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i === ORTA && j === ORTA) continue;
      const [cx, cz] = hucreMerkez(i, j);
      const adet = 1 + Math.floor(rnd() * 3);
      for (let n = 0, deneme = 0; n < adet && deneme < 30; deneme++) {
        const e = ESYA[Math.floor(rnd() * ESYA.length)];
        const don = rnd() < 0.5;
        const w = don ? e.d : e.w, dd = don ? e.w : e.d;
        // Eşyalar çoğunlukla duvara yaslı dursun
        const kenara = rnd() < 0.7;
        let x = cx + (rnd() - 0.5) * (C - w - 0.9), z = cz + (rnd() - 0.5) * (C - dd - 0.9);
        if (kenara) {
          const yan = Math.floor(rnd() * 4), ic = C / 2 - DUVAR / 2 - 0.05;
          if (yan === 0) x = cx - ic + w / 2; else if (yan === 1) x = cx + ic - w / 2; else if (yan === 2) z = cz - ic + dd / 2; else z = cz + ic - dd / 2;
        }
        const k = { x1: x - w / 2, z1: z - dd / 2, x2: x + w / 2, z2: z + dd / 2, tip: e.tip, h: e.h, renk: Math.floor(rnd() * 4) };
        if (kutular.some(b => b.tip !== 'duvar' && cakisir(k, b, 0.8))) continue;
        if (kutular.some(b => b.tip === 'duvar' && cakisir(k, b, -0.02))) continue;
        if (kapilar.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.4 + Math.max(w, dd) / 2)) continue;
        kutular.push(k); n++;
      }
    }
    const odalar = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) odalar.push({ i, j, renk: Math.floor(rnd() * 5), salon: i === ORTA && j === ORTA });
    // Oda numaraları: aralarındaki duvar tamamen kalkmış (birleşik) hücreler aynı odadır
    const odaNo = Array.from({ length: N * N }, (_, k) => k);
    const kok = k => (odaNo[k] === k ? k : (odaNo[k] = kok(odaNo[k])));
    kenar.forEach((v, k) => {
      if (v !== 'acik') return;
      const [i, j, yon] = k.split(',');
      const a = +j * N + +i, b = yon === 'x' ? a + 1 : a + N;
      odaNo[kok(a)] = kok(b);
    });
    const odaKutu = {};
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const id = kok(j * N + i);
      const x1 = -YARI + C * i, z1 = -YARI + C * j;
      const k = odaKutu[id] ??= { x1, z1, x2: x1 + C, z2: z1 + C };
      k.x1 = Math.min(k.x1, x1); k.z1 = Math.min(k.z1, z1); k.x2 = Math.max(k.x2, x1 + C); k.z2 = Math.max(k.z2, z1 + C);
    }
    for (let k = 0; k < N * N; k++) odaNo[k] = kok(k);
    const harita = { tohum, kutular, kapilar, odalar, ORTA, odaNo, odaKutu };
    harita.izgara = izgaraYap(harita);
    return harita;
  }

  // ---------- Yürünebilir ızgara (botların yol bulması için) ----------
  const IZ = 0.35, IZN = Math.ceil((N * C) / IZ);
  function izgaraYap(h) {
    const dolu = new Uint8Array(IZN * IZN);
    for (let a = 0; a < IZN; a++) for (let b = 0; b < IZN; b++) {
      const x = -YARI + (a + 0.5) * IZ, z = -YARI + (b + 0.5) * IZ;
      dolu[b * IZN + a] = h.kutular.some(k => x > k.x1 - ROBOT_R - 0.04 && x < k.x2 + ROBOT_R + 0.04 && z > k.z1 - ROBOT_R - 0.04 && z < k.z2 + ROBOT_R + 0.04) ? 1 : 0;
    }
    return dolu;
  }
  const izHucre = (x, z) => [Math.max(0, Math.min(IZN - 1, Math.floor((x + YARI) / IZ))), Math.max(0, Math.min(IZN - 1, Math.floor((z + YARI) / IZ)))];
  const izMerkez = (a, b) => [-YARI + (a + 0.5) * IZ, -YARI + (b + 0.5) * IZ];
  // Genişlik öncelikli arama (8 yön, köşe kesmeden). hedefMi(a, b) → true olan ilk hücreye yol.
  function yolBul(h, x, z, hedefMi, enCok = 6000) {
    const [sa, sb] = izHucre(x, z);
    const onceki = new Int32Array(IZN * IZN).fill(-2);
    const bas = sb * IZN + sa;
    onceki[bas] = -1;
    const kuyruk = [bas];
    for (let q = 0; q < kuyruk.length && q < enCok; q++) {
      const k = kuyruk[q], a = k % IZN, b = (k / IZN) | 0;
      if (hedefMi(a, b)) {
        const yol = [];
        for (let m = k; m !== -1; m = onceki[m]) yol.unshift(izMerkez(m % IZN, (m / IZN) | 0));
        return yol;
      }
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        if (!da && !db) continue;
        const na = a + da, nb = b + db;
        if (na < 0 || nb < 0 || na >= IZN || nb >= IZN) continue;
        const nk = nb * IZN + na;
        if (onceki[nk] !== -2 || h.izgara[nk]) continue;
        if (da && db && (h.izgara[b * IZN + na] || h.izgara[nb * IZN + a])) continue;
        onceki[nk] = k;
        kuyruk.push(nk);
      }
    }
    return null;
  }

  // ---------- Geometri ----------
  // Işın (x,z)+(dx,dz)t kutuya kaçıncı t'de çarpar (yoksa Infinity)
  function kutuyaIsin(k, x, z, dx, dz) {
    let t0 = 0, t1 = Infinity;
    for (const [p, dp, lo, hi] of [[x, dx, k.x1, k.x2], [z, dz, k.z1, k.z2]]) {
      if (Math.abs(dp) < 1e-9) { if (p < lo || p > hi) return Infinity; continue; }
      let a = (lo - p) / dp, b = (hi - p) / dp;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }
  function engeleKadar(h, x, z, dx, dz, enCok = LAZER_MENZIL) {
    let en = enCok;
    for (const k of h.kutular) { const t = kutuyaIsin(k, x, z, dx, dz); if (t < en) en = t; }
    return en;
  }
  // İki nokta arası görüş (duvar ve eşya keser)
  function gorus(h, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
    if (L < 1e-6) return true;
    return engeleKadar(h, x1, z1, dx / L, dz / L, L) >= L - 0.05;
  }
  function kutudanIt(h, o) {
    for (const k of h.kutular) {
      const nx = Math.max(k.x1, Math.min(o.x, k.x2)), nz = Math.max(k.z1, Math.min(o.z, k.z2));
      const dx = o.x - nx, dz = o.z - nz, L = Math.hypot(dx, dz);
      if (L >= ROBOT_R) continue;
      if (L > 1e-6) { o.x = nx + dx / L * ROBOT_R; o.z = nz + dz / L * ROBOT_R; }
      else {
        // Merkez kutunun içinde: en yakın kenardan çıkar
        const s = [[o.x - k.x1, -1, 0], [k.x2 - o.x, 1, 0], [o.z - k.z1, 0, -1], [k.z2 - o.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        o.x += s[1] * (s[0] + ROBOT_R); o.z += s[2] * (s[0] + ROBOT_R);
      }
    }
  }

  // Görünürlük: izleyen (ix,iz) hedefi görüyor mu? Işıklar açıksa ve görüş varsa evet.
  // Karanlıkta: hedef bir fenerin aydınlattığı yerdeyse ya da kendi feneri açıksa (ışığı uzaktan görünür).
  function gorunur(d, izleyen, hedef) {
    if (izleyen.id === hedef.id) return true;
    const h = d.harita;
    if (d.isikAcik) return gorus(h, izleyen.x, izleyen.z, hedef.x, hedef.z);
    if (hedef.fener && gorus(h, izleyen.x, izleyen.z, hedef.x, hedef.z)) return true;
    return canlilar(d).some(L => {
      const f = L.id === d.avci ? AVCI_FENER : L.fener ? FENER : null;
      if (!f || L.id === hedef.id) return false;
      const dx = hedef.x - L.x, dz = hedef.z - L.z, uz = Math.hypot(dx, dz);
      if (uz > f.menzil + ROBOT_R) return false;
      let fark = Math.atan2(dz, dx) - L.a; fark = Math.atan2(Math.sin(fark), Math.cos(fark));
      if (Math.abs(fark) > f.aci && uz > 0.8) return false;
      // Fener hedefi aydınlatıyor; izleyen de hedefi görebilmeli
      return gorus(h, L.x, L.z, hedef.x, hedef.z) && gorus(h, izleyen.x, izleyen.z, hedef.x, hedef.z);
    });
  }

  // ---------- Oyun ----------
  function yeni(oyuncular, tohum, turSayisi = 3) {
    const harita = haritaYap(tohum);
    const d = {
      harita, t: 0, tur: 0, turSayisi, faz: 'son', fazKalan: 0.01, isikAcik: true,
      avci: null, silah: null, puan: {}, bitti: false, kazanan: null,
      oyuncular: oyuncular.map(o => ({ ...o, x: 0, z: 0, a: 0, vx: 0, vz: 0, canli: true, fener: false, sonAtes: -9, vurus: 0 })),
    };
    d.oyuncular.forEach(o => { d.puan[o.id] = 0; });
    return d;
  }
  const canlilar = d => d.oyuncular.filter(o => o.canli);

  function fazaGec(d, faz, olaylar, rnd) {
    d.faz = faz; d.fazKalan = SURE[faz];
    if (faz === 'baslangic') {
      d.tur++;
      d.avci = null; d.isikAcik = true;
      const [sx, sz] = hucreMerkez(d.harita.ORTA, d.harita.ORTA);
      d.oyuncular.forEach((o, k) => {
        const a = k / d.oyuncular.length * Math.PI * 2;
        Object.assign(o, { x: sx + Math.cos(a) * 1.1, z: sz + Math.sin(a) * 1.1, a, vx: 0, vz: 0, canli: true, fener: false, sonAtes: -9, vurus: 0 });
      });
      // Silah: salon dışında rastgele bir odada, eşyalardan uzak bir noktada
      const h = d.harita;
      for (let deneme = 0; deneme < 50; deneme++) {
        const i = Math.floor(rnd() * 5), j = Math.floor(rnd() * 5);
        if (Math.abs(i - h.ORTA) + Math.abs(j - h.ORTA) < 2) continue;
        const [cx, cz] = hucreMerkez(i, j);
        const x = cx + (rnd() - 0.5) * 2, z = cz + (rnd() - 0.5) * 2;
        const [a, b] = izHucre(x, z);
        if (h.izgara[b * IZN + a]) continue;
        d.silah = { x, z };
        break;
      }
      d.silah ??= { x: hucreMerkez(0, 0)[0], z: hucreMerkez(0, 0)[1] };
      olaylar.push({ tip: 'tur', tur: d.tur, silah: d.silah });
    } else if (faz === 'arama') {
      olaylar.push({ tip: 'arama' });
    } else if (faz === 'karanlik') {
      d.isikAcik = false;
      olaylar.push({ tip: 'karanlik', avci: d.avci });
    } else if (faz === 'aydinlik') {
      d.isikAcik = true;
      d.oyuncular.forEach(o => { o.fener = false; });
      olaylar.push({ tip: 'aydinlik' });
    } else if (faz === 'son') {
      d.isikAcik = true;
      const kalan = canlilar(d).filter(o => o.id !== d.avci);
      kalan.forEach(o => { d.puan[o.id] += PUAN.kalan; });
      const avci = d.oyuncular.find(o => o.id === d.avci);
      if (avci) d.puan[avci.id] += avci.vurus * PUAN.vurus;
      olaylar.push({ tip: 'turSonu', kalan: kalan.map(o => o.id), avci: d.avci, vurus: avci ? avci.vurus : 0, puan: { ...d.puan } });
    }
  }

  // girdiler: { id: { hx, hz, a, fener, ates } } ya da online misafir için { x, z, a, fener, ates }
  function adim(d, dt, girdiler = {}, rnd = Math.random) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    d.fazKalan -= dt;
    if (d.fazKalan <= 0) {
      if (d.faz === 'son') {
        if (d.tur >= d.turSayisi) {
          d.bitti = true;
          const sirali = [...d.oyuncular].sort((a, c) => d.puan[c.id] - d.puan[a.id]);
          d.kazanan = sirali.length > 1 && d.puan[sirali[0].id] === d.puan[sirali[1].id] ? null : sirali[0].id;
          olaylar.push({ tip: 'bitti', kazanan: d.kazanan, puan: { ...d.puan } });
          return olaylar;
        }
        fazaGec(d, 'baslangic', olaylar, rnd);
      } else {
        const sira = { baslangic: 'arama', arama: 'karanlik', karanlik: 'aydinlik', aydinlik: 'son' };
        // Arama süresi biterse silahı en yakın oyuncu alır
        if (d.faz === 'arama' && d.avci === null) {
          const yakin = canlilar(d).sort((a, c) => Math.hypot(a.x - d.silah.x, a.z - d.silah.z) - Math.hypot(c.x - d.silah.x, c.z - d.silah.z))[0];
          d.avci = yakin.id;
          olaylar.push({ tip: 'silahAlindi', id: d.avci });
        }
        fazaGec(d, sira[d.faz], olaylar, rnd);
      }
    }
    const hareketli = d.faz !== 'baslangic' && d.faz !== 'son';
    const h = d.harita;
    canlilar(d).forEach(o => {
      const g = girdiler[o.id] || {};
      if (typeof g.a === 'number' && isFinite(g.a)) o.a = g.a;
      if (typeof g.fener === 'boolean' && !d.isikAcik && o.id !== d.avci) o.fener = g.fener;
      if (!hareketli) return;
      if (typeof g.x === 'number' && isFinite(g.x) && isFinite(g.z)) { o.x = g.x; o.z = g.z; }
      else {
        let hx = +g.hx || 0, hz = +g.hz || 0;
        const L = Math.hypot(hx, hz);
        if (L > 1) { hx /= L; hz /= L; }
        o.x += (hx * HIZ + o.vx) * dt; o.z += (hz * HIZ + o.vz) * dt;
      }
      const s = Math.exp(-6 * dt); o.vx *= s; o.vz *= s;
      kutudanIt(h, o); kutudanIt(h, o);
    });
    // Robotlar birbirinin içine girmesin
    const yasayan = canlilar(d);
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L < en && L > 1e-6) { const it = (en - L) / 2; p.x -= dx / L * it; p.z -= dz / L * it; q.x += dx / L * it; q.z += dz / L * it; kutudanIt(h, p); kutudanIt(h, q); }
    }
    // Silahı alma
    if (d.faz === 'arama' && d.avci === null) {
      const alan = yasayan.find(o => Math.hypot(o.x - d.silah.x, o.z - d.silah.z) < ROBOT_R + 0.35);
      if (alan) {
        d.avci = alan.id;
        olaylar.push({ tip: 'silahAlindi', id: alan.id });
        fazaGec(d, 'karanlik', olaylar, rnd);
      }
    }
    // Ateş
    if ((d.faz === 'karanlik' || d.faz === 'aydinlik') && d.avci !== null) {
      const avci = d.oyuncular.find(o => o.id === d.avci);
      const g = girdiler[d.avci] || {};
      if (avci?.canli && g.ates && d.t - avci.sonAtes >= ATES_ARA) {
        avci.sonAtes = d.t;
        const dx = Math.cos(avci.a), dz = Math.sin(avci.a);
        const x0 = avci.x + dx * (ROBOT_R + 0.05), z0 = avci.z + dz * (ROBOT_R + 0.05);
        let son = engeleKadar(h, x0, z0, dx, dz), hedef = null;
        yasayan.forEach(p => {
          if (p.id === avci.id) return;
          const vx = p.x - x0, vz = p.z - z0, t = vx * dx + vz * dz;
          if (t <= 0 || t > son) return;
          if (Math.hypot(vx - dx * t, vz - dz * t) < ROBOT_R + 0.06) { son = t; hedef = p.id; }
        });
        olaylar.push({ tip: 'ates', id: avci.id, x1: x0, z1: z0, x2: x0 + dx * son, z2: z0 + dz * son, hedef });
        if (hedef !== null) {
          const p = d.oyuncular.find(q => q.id === hedef);
          p.canli = false; p.fener = false;
          avci.vurus++;
          olaylar.push({ tip: 'vuruldu', id: hedef, kim: avci.id });
          // Saklanan kalmadıysa tur biter
          if (!canlilar(d).some(o => o.id !== d.avci)) fazaGec(d, 'son', olaylar, rnd);
        }
      }
    }
    return olaylar;
  }

  // ---------- Botlar ----------
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (!o.canli || d.faz === 'baslangic' || d.faz === 'son') return {};
    const h = d.harita;
    hafiza.cesaret ??= rnd();
    const yuru = (tx, tz, hiz = 1) => {
      // Yol: hedefe ızgara üstünden; yolu ara sıra yenile
      if (!hafiza.yol || d.t > hafiza.yenile || hafiza.hedefX !== tx || hafiza.hedefZ !== tz) {
        hafiza.yenile = d.t + 0.7; hafiza.hedefX = tx; hafiza.hedefZ = tz;
        const [ta, tb] = izHucre(tx, tz);
        hafiza.yol = yolBul(h, o.x, o.z, (a, b) => Math.abs(a - ta) <= 1 && Math.abs(b - tb) <= 1) || null;
        hafiza.adim = 0;
      }
      const yol = hafiza.yol;
      if (!yol || !yol.length) return { hx: 0, hz: 0 };
      while (hafiza.adim < yol.length - 1 && Math.hypot(yol[hafiza.adim][0] - o.x, yol[hafiza.adim][1] - o.z) < 0.3) hafiza.adim++;
      // Görüş varsa ileriki noktaya kestirme
      let k = hafiza.adim;
      while (k + 1 < yol.length && k < hafiza.adim + 6 && gorus(h, o.x, o.z, yol[k + 1][0], yol[k + 1][1])) k++;
      const [px, pz] = yol[k];
      const dx = px - o.x, dz = pz - o.z, L = Math.hypot(dx, dz);
      if (L < 0.05) return { hx: 0, hz: 0 };
      return { hx: dx / L * hiz, hz: dz / L * hiz };
    };
    const yonu = g => (Math.hypot(g.hx || 0, g.hz || 0) > 0.1 ? Math.atan2(g.hz, g.hx) : o.a);

    // Arama: silahın yerini bilmez; odaları gezer, silahla aynı odaya girince ona koşar
    if (d.faz === 'arama') {
      hafiza.gecikme ??= d.t + rnd() * 1.2;
      if (d.t < hafiza.gecikme) return {};
      if (hafiza.aramaTur !== d.tur) { hafiza.aramaTur = d.tur; hafiza.gezilen = new Set(); hafiza.aramaHedef = null; }
      const benimOda = odaBul(h, o.x, o.z);
      hafiza.gezilen.add(benimOda);
      if (benimOda === odaBul(h, d.silah.x, d.silah.z)) {
        const g = yuru(d.silah.x, d.silah.z, 0.85 + hafiza.cesaret * 0.15);
        return { ...g, a: yonu(g) };
      }
      if (hafiza.aramaHedef === null || hafiza.gezilen.has(odaBul(h, ...hafiza.aramaHedef))) {
        // Gezilmemiş odalardan yakın olanlardan birine git
        const adaylar = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const id = h.odaNo[j * N + i];
          if (!hafiza.gezilen.has(id)) adaylar.push(hucreMerkez(i, j));
        }
        adaylar.sort((p, q) => Math.hypot(p[0] - o.x, p[1] - o.z) - Math.hypot(q[0] - o.x, q[1] - o.z));
        hafiza.aramaHedef = adaylar.length ? adaylar[Math.floor(rnd() * Math.min(3, adaylar.length))] : [d.silah.x, d.silah.z];
      }
      const g = yuru(...hafiza.aramaHedef, 0.85 + hafiza.cesaret * 0.15);
      return { ...g, a: yonu(g) };
    }
    hafiza.gecikme = undefined;
    const avci = d.oyuncular.find(p => p.id === d.avci);
    if (id === d.avci) {
      // AVCI: gördüğü en yakın kişiye nişan alıp ateş eder; görmüyorsa odaları dolaşır
      const gorulen = canlilar(d).filter(p => p.id !== id && gorunur(d, o, p)).sort((a, c) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(c.x - o.x, c.z - o.z))[0];
      if (gorulen) {
        hafiza.sonGorulen = [gorulen.x, gorulen.z];
        const hedefA = Math.atan2(gorulen.z - o.z, gorulen.x - o.x) + (rnd() - 0.5) * 0.2;
        hafiza.nisanSure = (hafiza.nisanId === gorulen.id ? hafiza.nisanSure : 0) + 1 / 60;
        hafiza.nisanId = gorulen.id;
        const g = Math.hypot(gorulen.x - o.x, gorulen.z - o.z) > 3 ? yuru(gorulen.x, gorulen.z) : { hx: 0, hz: 0 };
        return { ...g, a: hedefA, ates: hafiza.nisanSure > 0.5 && gorus(h, o.x, o.z, gorulen.x, gorulen.z) };
      }
      hafiza.nisanSure = 0;
      if (hafiza.sonGorulen) {
        const [sx, sz] = hafiza.sonGorulen;
        if (Math.hypot(sx - o.x, sz - o.z) < 0.6) hafiza.sonGorulen = null;
        else { const g = yuru(sx, sz); return { ...g, a: yonu(g) }; }
      }
      if (!hafiza.gezinti || Math.hypot(hafiza.gezinti[0] - o.x, hafiza.gezinti[1] - o.z) < 0.8) {
        const i = Math.floor(rnd() * 5), j = Math.floor(rnd() * 5);
        hafiza.gezinti = hucreMerkez(i, j);
      }
      const g = yuru(...hafiza.gezinti, 0.8);
      // Karanlıkta ara sıra rastgele ateş eder (sese doğru)
      return { ...g, a: yonu(g), ates: !d.isikAcik && rnd() < 0.004 };
    }
    // SAKLANAN: avcıdan uzak, eşyanın yanında bir köşe seç; ışıklar açılınca avcıdan kaç
    const avciUzak = p => (avci ? Math.hypot(p[0] - avci.x, p[1] - avci.z) : 10);
    if (!hafiza.saklanma || hafiza.saklanmaTur !== d.tur || (d.isikAcik && avci && avciUzak([o.x, o.z]) < 5 && d.t > (hafiza.kacis || 0))) {
      hafiza.saklanmaTur = d.tur;
      hafiza.kacis = d.t + 1.5;
      const adaylar = h.kutular.filter(k => k.tip !== 'duvar').map(k => {
        const yan = Math.floor(rnd() * 4), cx = (k.x1 + k.x2) / 2, cz = (k.z1 + k.z2) / 2;
        const p = yan === 0 ? [k.x1 - 0.45, cz] : yan === 1 ? [k.x2 + 0.45, cz] : yan === 2 ? [cx, k.z1 - 0.45] : [cx, k.z2 + 0.45];
        return p;
      }).filter(p => { const [a, b] = izHucre(...p); return !h.izgara[b * IZN + a]; });
      adaylar.sort((p, q) => avciUzak(q) - avciUzak(p));
      hafiza.saklanma = adaylar[Math.floor(rnd() * Math.min(5, adaylar.length))] || [o.x, o.z];
    }
    const g = yuru(...hafiza.saklanma, d.isikAcik ? 1 : 0.7);
    const hareket = Math.hypot(g.hx || 0, g.hz || 0) > 0.1;
    // Karanlıkta yürürken bazen feneri açar (risk), dururken kapatır
    if (hareket && d.t > (hafiza.fenerZaman || 0)) { hafiza.fenerZaman = d.t + 1 + rnd() * 2; hafiza.fener = rnd() < 0.25 + (1 - hafiza.cesaret) * 0.2; }
    if (!hareket) hafiza.fener = false;
    return { ...g, a: yonu(g), fener: !d.isikAcik && !!hafiza.fener };
  }

  return {
    N, C, YARI, DUVAR, KAPI, ROBOT_R, HIZ, SURE, FENER, AVCI_FENER, ATES_ARA, PUAN,
    haritaYap, hucreMerkez, hucre, odaBul, yolBul, yeni, adim, botGirdi, canlilar, gorunur, gorus, kutudanIt, engeleKadar,
  };
})();

if (typeof module !== 'undefined') module.exports = EvMotor;
