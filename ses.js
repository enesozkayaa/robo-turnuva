// =============================================================
// Robo Turnuva - sesler. Ses dosyası yok: hepsi tarayıcıda (Web Audio) üretilir.
// Yeni ses: aşağıya fonksiyon yaz, return listesine ekle, oyunda Ses.adi() diye çağır.
// =============================================================

const Ses = (() => {
  const ANAHTAR = 'roboTurnuva.ses';
  let ctx = null, ana = null, tampon = null, ugultu = null;
  let acik = true;
  try { acik = localStorage.getItem(ANAHTAR) !== 'kapali'; } catch (e) { /* açık */ }

  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.8 : 0;
      const sik = ctx.createDynamicsCompressor();
      ana.connect(sik); sik.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function zarf(t, atak, seviye, sure) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + atak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    g.connect(ana);
    return g;
  }
  function ton(f, { gecikme = 0, sure = 0.2, tip = 'sine', seviye = 0.2, bitis, atak = 0.005 } = {}) {
    const c = motor(), t = c.currentTime + gecikme;
    const o = c.createOscillator();
    o.type = tip; o.frequency.setValueAtTime(f, t);
    if (bitis) o.frequency.exponentialRampToValueAtTime(bitis, t + sure);
    o.connect(zarf(t, atak, seviye, sure));
    o.start(t); o.stop(t + sure + 0.05);
  }
  function gurultu({ gecikme = 0, sure = 0.3, seviye = 0.2, tip = 'lowpass', frekans = 800, bitisFrekans, q = 1, atak = 0.005 } = {}) {
    const c = motor(), t = c.currentTime + gecikme;
    if (!tampon) {
      tampon = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const v = tampon.getChannelData(0);
      for (let i = 0; i < v.length; i++) v[i] = Math.random() * 2 - 1;
    }
    const k = c.createBufferSource(); k.buffer = tampon; k.loop = true;
    const f = c.createBiquadFilter(); f.type = tip; f.Q.value = q;
    f.frequency.setValueAtTime(frekans, t);
    if (bitisFrekans) f.frequency.exponentialRampToValueAtTime(bitisFrekans, t + sure);
    k.connect(f); f.connect(zarf(t, atak, seviye, sure));
    k.start(t); k.stop(t + sure + 0.05);
  }

  const bip = (ince = false) => ton(ince ? 1320 : 660, { sure: ince ? 0.35 : 0.12, tip: 'square', seviye: 0.08 });
  const gizlen = () => { ton(900, { sure: 0.6, bitis: 120, tip: 'sine', seviye: 0.18 }); gurultu({ sure: 0.6, frekans: 4000, bitisFrekans: 300, tip: 'bandpass', seviye: 0.15 }); };
  const belir = () => { ton(150, { sure: 0.35, bitis: 1100, tip: 'triangle', seviye: 0.18 }); gurultu({ sure: 0.35, frekans: 300, bitisFrekans: 5000, tip: 'bandpass', seviye: 0.12 }); };
  const lazer = () => { ton(1800, { sure: 0.45, bitis: 220, tip: 'sawtooth', seviye: 0.09 }); ton(2400, { sure: 0.3, bitis: 400, tip: 'square', seviye: 0.04, gecikme: 0.02 }); };
  const patlama = () => { gurultu({ sure: 0.9, frekans: 1800, bitisFrekans: 80, seviye: 0.5, atak: 0.002 }); ton(110, { sure: 0.6, bitis: 35, tip: 'sine', seviye: 0.45 }); };
  const dusus = () => { gurultu({ sure: 2, frekans: 400, bitisFrekans: 60, seviye: 0.35, atak: 0.2 }); ton(70, { sure: 2, bitis: 30, tip: 'sawtooth', seviye: 0.12, atak: 0.2 }); };
  const uyari = () => { ton(520, { sure: 0.18, tip: 'square', seviye: 0.06 }); ton(390, { sure: 0.18, tip: 'square', seviye: 0.06, gecikme: 0.2 }); };
  // Ağır çekim ateş: kalın, yavaşlayan "vuuum"
  const agirAtes = () => { ton(320, { sure: 0.5, bitis: 90, tip: 'sawtooth', seviye: 0.05 }); gurultu({ sure: 0.45, frekans: 1200, bitisFrekans: 200, tip: 'bandpass', seviye: 0.08 }); };
  const isabet = () => { ton(880, { sure: 0.12, bitis: 220, tip: 'square', seviye: 0.1 }); gurultu({ sure: 0.25, frekans: 2500, bitisFrekans: 300, seviye: 0.25 }); };
  // "Dın": çan sesi (son sayımda daha ince ve uzun)
  const din = (son = false) => { const f = son ? 1320 : 880; ton(f, { sure: son ? 1.1 : 0.7, seviye: 0.22 }); ton(f * 2.01, { sure: son ? 0.8 : 0.45, seviye: 0.07 }); ton(f * 3.02, { sure: 0.25, seviye: 0.03 }); };
  const tik = () => ton(1500, { sure: 0.04, tip: 'square', seviye: 0.04 });
  const kazanma = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => ton(f, { gecikme: i * 0.12, sure: 0.22, tip: 'triangle', seviye: 0.16 }));
  const kaybetme = () => [392, 330, 262, 196].forEach((f, i) => ton(f, { gecikme: i * 0.18, sure: 0.3, tip: 'triangle', seviye: 0.14 }));

  // Arkada hafif uzay uğultusu
  function ortam(ac) {
    if (!ac) { if (ugultu) { ugultu.forEach(o => { try { o.stop(); } catch (e) { /* */ } }); ugultu = null; } return; }
    if (ugultu) return;
    const c = motor();
    const g = c.createGain(); g.gain.value = 0.035; g.connect(ana);
    ugultu = [55, 82.5, 110.3].map(f => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o; });
  }

  function ac(v) {
    acik = v;
    try { localStorage.setItem(ANAHTAR, v ? 'acik' : 'kapali'); } catch (e) { /* */ }
    if (ana) ana.gain.value = v ? 0.8 : 0;
  }

  return { din, agirAtes, isabet, bip, gizlen, belir, lazer, patlama, dusus, uyari, tik, kazanma, kaybetme, ortam, ac, motor, get acik() { return acik; } };
})();
