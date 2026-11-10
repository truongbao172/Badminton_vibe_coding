// Measure the live server: two WebSocket clients (host + guest) on one court of the live server; same clock, so arrival - send = one-way delay.
const BASE = process.argv[2] || 'wss://san-cau-terralogic.onrender.com/ws', COURT = process.argv[3] || 5, SECS = +(process.argv[4] || 30), RATE = +(process.argv[5] || 60);
const look = encodeURIComponent(JSON.stringify({ shirt: 1, shorts: 1, skin: 1, hair: 1, racket: 1, hs: 'short' }));
const mk = name => new WebSocket(`${BASE}?court=${COURT}&fmt=don&name=${name}&look=${look}&id=probe${name}${Date.now()}`);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : NaN; };
const stats = (n, a) => console.log(`${n}: n=${a.length} p50=${pct(a, .5)} p90=${pct(a, .9)} p98=${pct(a, .98)} max=${pct(a, 1)} ms`);
const t0 = Date.now();
const host = mk('H'), guest = mk('G');
const hg = [], gh = [], gaps = []; let lastArr = 0, hostOpenAt = 0, guestOpenAt = 0, roleH = 0, roleG = 0;
host.onopen = () => { hostOpenAt = Date.now() - t0; };
guest.onopen = () => { guestOpenAt = Date.now() - t0; };
host.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'role') roleH = Date.now() - t0; if (m.t === 'hb') host.send('{"t":"hb"}'); if (m.t === 'in') gh.push(Date.now() - m.tm); };
guest.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'role') roleG = Date.now() - t0; if (m.t === 'hb') guest.send('{"t":"hb"}'); if (m.t === 'st') { const now = Date.now(); hg.push(now - m.tm); if (lastArr) gaps.push(now - lastArr); lastArr = now; } };
const pad = 'x'.repeat(450); // a snapshot is ~500 bytes
setTimeout(() => {
  const iv = setInterval(() => {
    if (host.readyState === 1) host.send(JSON.stringify({ t: 'st', tm: Date.now(), pad }));
    if (guest.readyState === 1) guest.send(JSON.stringify({ t: 'in', tm: Date.now() }));
  }, 1000 / RATE);
  setTimeout(() => {
    clearInterval(iv);
    console.log(`open: host ${hostOpenAt} ms, guest ${guestOpenAt} ms; role: host ${roleH} ms, guest ${roleG} ms`);
    stats('host->server->guest', hg); stats('guest->server->host', gh); stats('arrival gap (sent every ' + Math.round(1000 / RATE) + ' ms)', gaps);
    const bursts = gaps.filter(g => g > 100).length; console.log(`gaps >100 ms: ${bursts}, >300 ms: ${gaps.filter(g => g > 300).length}, >1000 ms: ${gaps.filter(g => g > 1000).length}`);
    host.close(); guest.close(); setTimeout(() => process.exit(0), 1500);
  }, SECS * 1000);
}, 2500);
