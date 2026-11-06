/* ---------- audio ---------- */
let actx = null, muted = false, noiseBuf = null;
// Creating the AudioContext blocks for ~100 ms (measured 120 ms in Chrome on macOS). Doing it on the start button
// froze the first frame of every match, so it is made while the page sits idle and only resumed on that click.
function makeAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.25, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
  loadClips();
}
// Recorded clips from assets/sfx/ (served by server.js): the shout on a jump smash ("Sao mà đỡ được!"), the
// fanfare when your side wins the match and "Rồi rồi, mày xong rồi" when it loses. A page without the server, such as the Artifact copy, can't load them
// and simply plays without.
const CLIPS = { shout: { file: 'sao-ma-do-duoc.m4a', gain: 0.9 }, victory: { file: 'chien-thang.m4a', gain: 0.8 },
  defeat: { file: 'thua-tran.m4a', gain: 0.65 } }; // (this one is recorded louder)
let clipsAsked = false;
function loadClips() {
  if (clipsAsked || !actx) return;
  clipsAsked = true;
  for (const c of Object.values(CLIPS)) {
    fetch('assets/sfx/' + c.file).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
      .then(b => new Promise((ok, no) => actx.decodeAudioData(b, ok, no))) // (the callback form also works in older Safari)
      .then(b => { c.buf = b; }).catch(() => {});
  }
}
// The same clip again cuts the last one short (two jump smashes in a row don't talk over each other)
function playClip(name) {
  const c = CLIPS[name];
  if (!actx || muted || !c || !c.buf) return;
  try { if (c.src) c.src.stop(); } catch (e) {}
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = c.buf; g.gain.value = c.gain;
  src.connect(g).connect(actx.destination); src.start(); c.src = src;
}
const shout = () => playClip('shout');
function ensureAudio() {
  makeAudio();
  try { if (actx && actx.state === 'suspended') actx.resume(); } catch (e) {}
}
(window.requestIdleCallback || (f => setTimeout(f, 500)))(makeAudio);
function noise(freq, type, gain, dur) {
  const t = actx.currentTime, src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = 1.1;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(actx.destination); src.start(t); src.stop(t + dur + 0.02);
}
function tone(freq, start, dur, gain) {
  const t = actx.currentTime + start, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sfx(kind) {
  if (!actx || muted) return;
  if (kind === 'smash') { noise(1500, 'bandpass', 0.9, 0.09); tone(1300, 0, 0.05, 0.08); }
  else if (kind === 'hit') { noise(2600, 'bandpass', 0.5, 0.06); tone(1900, 0, 0.04, 0.05); }
  else if (kind === 'land') noise(420, 'lowpass', 0.25, 0.08);
  else if (kind === 'jump') noise(260, 'lowpass', 0.2, 0.07);
  else if (kind === 'fall') { noise(170, 'lowpass', 0.6, 0.18); noise(900, 'bandpass', 0.18, 0.05); }
  else if (kind === 'net') noise(700, 'lowpass', 0.35, 0.15);
  else if (kind === 'win') { tone(660, 0, 0.14, 0.1); tone(880, 0.12, 0.2, 0.1); }
  else if (kind === 'lose') { tone(440, 0, 0.14, 0.08); tone(330, 0.12, 0.22, 0.08); }
}

