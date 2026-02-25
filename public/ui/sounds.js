/*
  sounds.js — Web Audio API synthesized sound effects
  Lazy AudioContext (created on first call to satisfy browser autoplay policy).
  Usage: import sfx from "./ui/sounds.js"; sfx.join();
*/

let ctx = null;
function ac() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function noiseBuf(duration) {
  const c = ac();
  const len = c.sampleRate * duration;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const sfx = {
  // Player joins room — soft bubble pop (ascending)
  join() {
    const c = ac(), t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.15);
  },

  // Player leaves room — reverse bubble pop (descending)
  leave() {
    const c = ac(), t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.15);
  },

  // Card shuffle — table wash noise
  shuffle() {
    const c = ac(), t = c.currentTime;
    const dur = 0.8;
    const noise = c.createBufferSource(); noise.buffer = noiseBuf(dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2500, t);
    bp.frequency.setValueAtTime(4000, t + dur * 0.3);
    bp.frequency.setValueAtTime(2000, t + dur * 0.6);
    bp.frequency.setValueAtTime(3500, t + dur);
    bp.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.1);
    g.gain.setValueAtTime(0.2, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp); bp.connect(g); g.connect(c.destination);
    noise.start(t); noise.stop(t + dur);
  },

  // Game starts — bold horn blast
  gameStart() {
    const c = ac(), t = c.currentTime;
    [261.63, 329.63, 392].forEach(freq => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(800, t);
      lp.frequency.linearRampToValueAtTime(2000, t + 0.15);
      lp.frequency.linearRampToValueAtTime(1200, t + 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.05);
      g.gain.setValueAtTime(0.12, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(lp); lp.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.7);
    });
  },

  // Your turn — single soft chime
  yourTurn() {
    const c = ac(), t = c.currentTime;
    [1046.5, 2093, 3135.96].forEach((freq, i) => {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      const g = c.createGain();
      g.gain.setValueAtTime([0.2, 0.08, 0.03][i], t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.7);
    });
  },

  // Token pickup — glass gem clink
  tokenPickup() {
    const c = ac(), t = c.currentTime;
    [3800, 4500, 6000].forEach((freq, i) => {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      const g = c.createGain();
      g.gain.setValueAtTime([0.12, 0.08, 0.04][i], t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
    });
  },

  // Card buy — swish + soft thud
  cardBuy() {
    const c = ac(), t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = noiseBuf(0.15);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3000, t); bp.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    bp.Q.value = 1.5;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(bp); bp.connect(ng); ng.connect(c.destination); n.start(t); n.stop(t + 0.15);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t + 0.05); o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(c.destination); o.start(t + 0.05); o.stop(t + 0.25);
  },

  // Noble visit — royal trumpet herald
  nobleVisit() {
    const c = ac(), t = c.currentTime;
    const pattern = [
      { freq: 523.25, start: 0,    dur: 0.12 },
      { freq: 523.25, start: 0.15, dur: 0.12 },
      { freq: 783.99, start: 0.3,  dur: 0.5  },
    ];
    pattern.forEach(({ freq, start, dur }) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t + start);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1200, t + start);
      lp.frequency.linearRampToValueAtTime(2000, t + start + 0.05);
      lp.frequency.linearRampToValueAtTime(1500, t + start + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(0.1, t + start + 0.02);
      g.gain.setValueAtTime(0.1, t + start + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      o.connect(lp); lp.connect(g); g.connect(c.destination);
      o.start(t + start); o.stop(t + start + dur);
    });
  },

  // Game over (win) — ascending wah ensemble + brass swell
  gameOverWin() {
    const c = ac(), t = c.currentTime;
    const notes = [
      { freq: 261.63, start: 0,    dur: 0.25 },
      { freq: 277.18, start: 0.3,  dur: 0.25 },
      { freq: 293.66, start: 0.6,  dur: 0.25 },
      { freq: 311.13, start: 0.9,  dur: 0.8  },
    ];
    notes.forEach(({ freq, start, dur }) => {
      [freq, freq * 1.25, freq * 1.5].forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t + start);
        if (dur > 0.5) {
          const lfo = c.createOscillator(); lfo.frequency.value = 5;
          const lfoG = c.createGain(); lfoG.gain.value = 4;
          lfo.connect(lfoG); lfoG.connect(o.frequency);
          lfo.start(t + start); lfo.stop(t + start + dur);
        }
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
        const vol = [0.07, 0.05, 0.04][i];
        const g = c.createGain(); g.gain.setValueAtTime(vol, t + start);
        g.gain.setValueAtTime(vol, t + start + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        o.connect(lp); lp.connect(g); g.connect(c.destination);
        o.start(t + start); o.stop(t + start + dur);
      });
    });
    const last = notes[3];
    [last.freq, last.freq * 1.25, last.freq * 1.5, last.freq * 2].forEach(freq => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t + last.start);
      const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
      const lfoG = c.createGain(); lfoG.gain.value = 3;
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      lfo.start(t + last.start); lfo.stop(t + last.start + last.dur);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(800, t + last.start);
      lp.frequency.linearRampToValueAtTime(1800, t + last.start + 0.4);
      lp.frequency.linearRampToValueAtTime(1200, t + last.start + last.dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t + last.start);
      g.gain.linearRampToValueAtTime(0.06, t + last.start + 0.3);
      g.gain.setValueAtTime(0.06, t + last.start + last.dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + last.start + last.dur);
      o.connect(lp); lp.connect(g); g.connect(c.destination);
      o.start(t + last.start); o.stop(t + last.start + last.dur);
    });
  },

  // Game over (lose) — sad trombone
  gameOverLose() {
    const c = ac(), t = c.currentTime;
    const notes = [
      { freq: 311.13, start: 0,    dur: 0.25 },
      { freq: 293.66, start: 0.3,  dur: 0.25 },
      { freq: 277.18, start: 0.6,  dur: 0.25 },
      { freq: 261.63, start: 0.9,  dur: 0.8  },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t + start);
      if (dur > 0.5) {
        const lfo = c.createOscillator(); lfo.frequency.value = 5;
        const lfoG = c.createGain(); lfoG.gain.value = 4;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        lfo.start(t + start); lfo.stop(t + start + dur);
      }
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
      const g = c.createGain(); g.gain.setValueAtTime(0.08, t + start);
      g.gain.setValueAtTime(0.08, t + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      o.connect(lp); lp.connect(g); g.connect(c.destination);
      o.start(t + start); o.stop(t + start + dur);
    });
  },
};

export default sfx;
