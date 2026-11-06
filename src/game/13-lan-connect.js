/* ---------- LAN: host runs the match, guests send input and render snapshots ---------- */
let ws = null, lastSent = 0, lastIn = '', lastInAt = 0, hudKey = '';
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function showLobby(title, text, urls) {
  $('lobbyTitle').textContent = title; $('lobbyText').textContent = text; $('lobbyText').hidden = !text;
  $('lobbyEyebrow').textContent = ws && S.mode !== 'ai' ? `Chơi LAN · Sân ${S.court + 1} · ${S.n === 4 ? 'Đánh đôi' : 'Đánh đơn'}` : 'Chơi LAN';
  const box = $('lobbyLinks'); box.innerHTML = '';
  for (const u of urls) {
    const row = document.createElement('div'); row.className = 'link';
    const code = document.createElement('code'); code.textContent = u;
    const btn = document.createElement('button'); btn.className = 'ghost'; btn.textContent = 'Sao chép';
    btn.addEventListener('click', () => {
      const done = () => { btn.textContent = 'Đã chép'; setTimeout(() => { btn.textContent = 'Sao chép'; }, 1500); };
      const fallback = () => { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      try { navigator.clipboard.writeText(u).then(done, fallback); } catch (e) { fallback(); }
    });
    row.append(code, btn); box.append(row);
  }
  $('menu').hidden = true; $('lobby').hidden = false;
  renderSeats();
}
function renderSeats() {
  const box = $('lobbySeats'); box.innerHTML = '';
  const host = S.mode === 'host';
  $('btnLobbyStart').hidden = !host;
  if (S.mode === 'ai') { $('btnLobbyFill').hidden = true; return; }
  // Each spot holds a player, a computer the host added, or nobody. Anyone can move into a spot
  // without a player; the host adds or removes computers.
  const order = S.n === 4 ? [0, 1, 2, 3] : [0, 1];
  for (const i of order) {
    const on = !!S.roster[i], bot = !on && S.bots[i], el = document.createElement('div');
    el.className = 'seat' + (i === me ? ' me' : '') + (on ? '' : bot ? ' ai' : ' empty');
    const lb = document.createElement('span');
    lb.textContent = (team(i) ? 'Sân xa' : 'Sân gần') + (S.n === 4 ? (i < 2 ? ' · ô phải' : ' · ô trái') : '') + (on && i === S.hostSeat ? ' · chủ sân' : '');
    const nm = document.createElement('b');
    nm.textContent = on ? (S.names[i] || 'Người chơi') + (i === me ? ' (bạn)' : '') : bot ? 'Máy' : 'Trống';
    el.append(lb, nm);
    if (!on) {
      const acts = document.createElement('div'); acts.className = 'seat-acts';
      const btn = (text, fn, cls) => { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.addEventListener('click', fn); acts.append(b); };
      btn('Chuyển vào đây', () => send({ t: 'seat', to: i }));
      if (host) bot ? btn('Bỏ máy', () => setBot(i, false), 'rm') : btn('+ Thêm máy', () => setBot(i, true));
      el.append(acts);
    }
    box.append(el);
  }
  const free = order.filter(i => !S.roster[i] && !S.bots[i]);
  $('btnLobbyFill').hidden = !host || !free.length;
  // Start once every spot has a player or a computer, even if you are the only person
  $('btnLobbyStart').disabled = free.length > 0;
  $('btnLobbyStart').textContent = free.length ? `CÒN ${free.length} GHẾ TRỐNG` : 'BẮT ĐẦU';
}
// Host: computers in empty spots, shared with everyone in the court so their lobby shows the same
function setBot(i, on) {
  if (S.mode !== 'host') return;
  S.bots[i] = on; send({ t: 'bots', b: S.bots.map(Number) }); renderSeats();
}
$('btnLobbyFill').addEventListener('click', () => {
  if (S.mode !== 'host') return;
  for (let i = 0; i < S.n; i++) if (!S.roster[i]) S.bots[i] = true;
  send({ t: 'bots', b: S.bots.map(Number) }); renderSeats();
});
// This page's id for the server (a new one each time the page loads). After a dropped connection the page
// reconnects with the same id and its old seat, and the server hands that seat straight back.
const pageId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
// A guest that loses its connection mid-match (Wi-Fi blip, the browser pausing a background tab, the laptop
// dozing) reconnects on its own instead of being thrown back to the menu. rejoin holds the attempt count.
let rejoin = null, netHeard = 0;
const REJOIN_TRIES = 8, NET_SILENT_MS = 6000;
function lanJoin(again = false) {
  if (ws) return; // already joining or in a court: a double click must not open a second seat
  if (!again) {
    readMenu(); setFormat(document.querySelector('input[name="lfmt"]:checked').value); ensureAudio();
    if (rooms[S.court] && rooms[S.court].full) { $('menuNote').textContent = `Sân ${S.court + 1} đã đủ người. Chọn sân khác.`; $('menuNote').hidden = false; return; }
    try { localStorage.setItem(NAME_KEY, myName()); } catch (e) {}
    $('menuNote').hidden = true;
    showLobby('Đang kết nối…', '', []);
  }
  let sock;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = `court=${S.court + 1}&fmt=${S.fmt}&name=${encodeURIComponent(myName())}&look=${encodeURIComponent(JSON.stringify(myLook))}&id=${pageId}` + (again ? `&seat=${me}` : '');
  try { sock = new WebSocket(`${proto}://${location.host}/ws?${q}`); } catch (e) { if (again) lanRetry(); else lanEnd('Không kết nối được máy chủ LAN.'); return; }
  ws = sock; netHeard = performance.now();
  sock.onmessage = e => {
    netHeard = performance.now();
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (rejoin && m.t === 'role') { rejoin = null; toast('Đã kết nối lại', '', 1.4); }
    // The server's heartbeat: answer it, so the server can tell this page is still here (lobby.js)
    if (m.t === 'hb') { if (sock.readyState === 1) sock.send('{"t":"hb"}'); } else onNet(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return; // we closed it ourselves (left the court, or replaced it)
    if (S.mode === 'guest' || rejoin) lanRetry();
    else lanEnd(S.mode === 'ai' ? 'Không kết nối được máy chủ LAN. Kiểm tra server.js còn chạy không.' : 'Mất kết nối với máy chủ.');
  };
}
function lanRetry() {
  ws = null;
  if (!rejoin) rejoin = { tries: 0, timer: 0 };
  if (++rejoin.tries > REJOIN_TRIES) { rejoin = null; lanEnd('Mất kết nối với máy chủ. Kiểm tra Wi‑Fi và server.js rồi vào sân lại.'); return; }
  toast('Mất kết nối', `Đang kết nối lại… (lần ${rejoin.tries}/${REJOIN_TRIES})`, 3);
  rejoin.timer = setTimeout(() => { if (rejoin) lanJoin(true); }, Math.min(3000, 500 * rejoin.tries));
}
// Watchdog: the server sends a heartbeat every 2 s and the host its match many times a second, so 6 s of
// silence means the connection died without either side being told. Drop it and reconnect.
setInterval(() => {
  if (!ws || ws.readyState !== 1 || document.hidden || performance.now() - netHeard < NET_SILENT_MS) return;
  const dead = ws; ws = null; dead.onclose = dead.onmessage = null;
  try { dead.close(); } catch (e) {}
  if (S.mode === 'guest') lanRetry(); else lanEnd('Mất kết nối với máy chủ.');
}, 1000);
// Back from a hidden or paused tab: anything that arrived meanwhile is old news, judge the connection afresh
document.addEventListener('visibilitychange', () => { if (!document.hidden) netHeard = Math.max(netHeard, performance.now() - NET_SILENT_MS + 2500); });
function lanEnd(msg) {
  if (rejoin) { clearTimeout(rejoin.timer); rejoin = null; }
  const sock = ws; ws = null;
  // Cancelled while still connecting: the server may already have given us a seat, but a socket that
  // never opened cannot send a close frame. Let it open, then close it properly so the seat is freed.
  if (sock && sock.readyState === 0) { sock.onmessage = null; sock.onopen = () => { try { sock.close(); } catch (_) {} }; }
  else if (sock) try { sock.close(); } catch (_) {}
  S.mode = 'ai'; me = 0; S.human = [true, false, false, false]; S.roster = [1, 0, 0, 0]; S.names = ['', '', '', '']; S.looks = []; S.bots = [false, false, false, false]; S.hostSeat = 0; updateTags(); updateLooks();
  for (const id of ['lobby', 'pause', 'result']) $(id).hidden = true;
  backToMenu();
  $('menuNote').textContent = msg; $('menuNote').hidden = !msg;
  if (msg) showTab(true);
  // The server frees the seat once it gets our close frame; fetch the courts again right after that
  setTimeout(refreshRooms, 300);
}
function onNet(m) {
  if (m.t === 'role') {
    S.mode = m.host ? 'host' : 'guest'; me = m.seat | 0;
    resetNet();
    setFormat(m.fmt); setCourt((m.court | 0) - 1);
    if (S.mode === 'host') {
      placeBackdrop();
      showLobby('Đang chờ người chơi', `Gửi link dưới đây cho bạn cùng chơi. Bạn ấy mở link, chọn sân ${S.court + 1} rồi bấm CHƠI LAN. Thiếu người thì bấm + Thêm máy ở ghế trống, hoặc thêm máy vào tất cả ghế trống một lần.`, m.urls || []);
    } else showLobby('Đã vào sân', 'Bấm Chuyển vào đây ở ghế trống để chọn vị trí muốn chơi, rồi chờ chủ sân bắt đầu trận.', []);
  } else if (m.t === 'roster') {
    const prevNames = S.names;
    S.roster = m.seats.map(Number); S.hostSeat = m.host | 0; S.names = (m.names || []).map(String); S.looks = (m.looks || []).map(cleanLook); updateLooks();
    if (me !== (m.you | 0)) { me = m.you | 0; lastIn = ''; updateHUD(); }
    if (S.mode === 'host') { syncHumans(prevNames); send({ t: 'bots', b: S.bots.map(Number) }); }
    if (!$('lobby').hidden) renderSeats();
    updateTags();
  } else if (m.t === 'full') { lanEnd(`Sân ${S.court + 1} đã đủ người. Chọn sân khác.`); refreshRooms(); }
  else if (m.t === 'left') lanEnd('Chủ sân đã rời đi.');
  else if (S.mode === 'host') {
    const i = m.from | 0;
    if (i === me || i >= S.n || !isHuman(i)) return;
    if (m.t === 'in') {
      const r = remoteIn[i], now = performance.now(); r.x = clamp(+m.x || 0, -1, 1); r.z = clamp(+m.z || 0, -1, 1); r.run = !!m.r;
      if (Number.isFinite(m.vt)) r.vt = +m.vt;
      // How far behind the present that screen is (guestLag): he echoes our latest snapshot time, for the round trip
      if (Number.isFinite(m.he) && m.he > 0 && now - m.he > 0 && now - m.he < 3000) { r.rtt.push(now - m.he); if (r.rtt.length > 300) r.rtt.shift(); }
      if (Number.isFinite(m.vt) && m.vt > 0) { r.lagS.push(now - m.vt); if (r.lagS.length > 60) r.lagS.shift(); }
      if (Number.isFinite(m.px) && Number.isFinite(m.pz)) {
        const vmax = RUN_SP * 1.2, L = r.buf[r.buf.length - 1];
        let t = clockIn(r.clk, +m.tm, now);
        if (L && t < L.t) t = L.t;
        r.buf.push({ t, d: [m.px, m.pz, clamp(+m.vx || 0, -vmax, vmax), clamp(+m.vz || 0, -vmax, vmax)] });
        while (r.buf.length > 2 && r.buf[1].t < now - 1000) r.buf.shift();
        r.pos = true;
        // How far that screen has got, and where its player was right then (mayStillHit)
        if (Number.isFinite(m.vt) && m.vt > 0) r.seen = { vt: +m.vt, x: +m.px, z: +m.pz, vx: clamp(+m.vx || 0, -vmax, vmax), vz: clamp(+m.vz || 0, -vmax, vmax) };
      }
    }
    else if (m.t === 'hit') send({ t: 'hitAck', i, id: m.id | 0, ok: takeGuestHit(i, m) ? 1 : 0 });
    else if (m.t === 'act' && ['hit', 'charge', 'release', 'jump'].includes(m.k)) action(m.k, i);
    else if (m.t === 'pause') setPaused(!!m.on);
    else if (m.t === 'again' && S.state === 'over') newMatch();
    else if (m.t === 'punish') takePunish(i, String(m.k));
  } else if (S.mode === 'guest') {
    if (m.t === 'st') applySnap(m);
    else if (m.t === 'ev') {
      // Our own jump already made its sound here when the button was pressed
      if (m.k === 'sfx' && m.kind === 'jump' && jumpHeard && performance.now() - jumpHeard < 800) { jumpHeard = 0; return; }
      // ...and our own hit its sound, sparks and shot name
      if (m.g === me && (m.k === 'sfx' || m.k === 'fx' || m.k === 'shot')) return;
      queueEv(m);
    }
    else if (m.t === 'hitAck') { if ((m.i | 0) === me && NET.hit && NET.hit.id === m.id) NET.hit.ok = !!m.ok; }
    else if (m.t === 'bots') { S.bots = (m.b || []).map(Boolean); if (!$('lobby').hidden) renderSeats(); }
  }
}
// Host: a seat with a connected player is human, an empty one is played by the computer.
// Players can join or drop out mid-match; the computer takes over or hands back that seat.
function syncHumans(prevNames = S.names) {
  const live = S.state !== 'menu' && S.state !== 'over';
  for (let i = 0; i < 4; i++) {
    const on = i === me || (i < S.n && !!S.roster[i]);
    if (on === S.human[i]) continue;
    // (a new connection, maybe a reloaded page: its clock and position reports start afresh)
    S.human[i] = on; Object.assign(remoteIn[i], { x: 0, z: 0, run: false, pos: false, vt: 0, seen: null, rtt: [], lagS: [], clk: netClock(), buf: [], prevRt: null });
    const a = ath(i); a.armed = null; a.holding = a.serveHold = false; a.plan = null;
    if (live) emit({ k: 'toast', big: on ? `${S.names[i] || 'Người chơi'} vào sân` : `${prevNames[i] || 'Một người'} đã rời sân`, small: on ? '' : 'Máy đánh thay vị trí đó', dur: 1.6 });
    if (live && !on && S.state === 'serve' && S.server === i) S.timer = 1.1;
  }
}
const r3 = v => Math.round(v * 1000) / 1000;
const MODES = ['held', 'fly', 'rest'];
function snapshot() {
  const p = shuttle.p, v = shuttle.v, as = a => [r3(a.x), r3(a.z), r3(a.vx), r3(a.vz), r3(a.swingT),
    r3(a.y), r3(a.vy), SWK.indexOf(a.swingK), a.armed ? 1 : 0, r3(a.sta), a.run ? 1 : 0, r3(a.fallT), r3(a.fdx), r3(a.fdz)];
  return { t: 'st', tm: Math.round(last), s: S.state, pa: S.paused, sc: S.score, g: S.games, sv: S.server, gn: S.gameNo, ra: S.rally,
    n: S.n, hu: S.human.map(Number), a: ATH.slice(0, S.n).map(as),
    sh: [r3(p.x), r3(p.y), r3(p.z), r3(v.x), r3(v.y), r3(v.z), MODES.indexOf(shuttle.mode)],
    rg: [RD.vis ? 1 : 0, r3(RD.x), r3(RD.z), RD.out ? 1 : 0, RD.to],
    // For a guest judging its own hits: last team to hit, serve or not, the receiver, net fault, hit count
    hx: [S.lastTeam ?? -1, S.isServe ? 1 : 0, S.receiver, S.netFault ? 1 : 0, S.hits],
    hs: stopT > 0 ? 1 : 0 }; // hit-stop: the match is running at a quarter speed
}
