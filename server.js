#!/usr/bin/env node
// Máy chủ LAN cho Sân Cầu Terralogic: phục vụ trang game và chuyển tin giữa người chơi qua WebSocket.
// Có 5 sân, mỗi sân là một phòng riêng: đánh đơn 2 người, đánh đôi tối đa 4 người.
// Không cần cài thư viện: chỉ cần Node 18 trở lên. Chạy: node server.js  (đổi cổng: PORT=8080 node server.js)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 7777;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(DIR, 'san-cau-so-7.html');
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const THREE_FILE = path.join(DIR, 'vendor', 'three.min.js');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const COURTS = 5;

// Lưu Three.js về máy một lần, để lần sau chơi LAN không cần Internet.
async function cacheThree() {
  if (fs.existsSync(THREE_FILE)) return;
  try {
    const res = await fetch(THREE_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.mkdirSync(path.dirname(THREE_FILE), { recursive: true });
    fs.writeFileSync(THREE_FILE, Buffer.from(await res.arrayBuffer()));
    console.log('Đã lưu Three.js vào vendor/, lần sau chơi không cần Internet.');
  } catch (e) {
    console.log(`Chưa tải được Three.js (${e.message}). Trang sẽ lấy từ CDN nên cần Internet.`);
  }
}

// Đọc lại file game mỗi lần tải trang, nên sửa game xong chỉ cần F5.
function page() {
  let body = fs.readFileSync(GAME, 'utf8');
  if (fs.existsSync(THREE_FILE)) body = body.replace(THREE_URL, '/three.min.js');
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<script>window.SAN7_LAN = true</script></head><body>' + body + '</body></html>';
}

const lanIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
  .map(i => i.address);
// Link mời bạn: trên Render (hoặc khi đặt PUBLIC_URL) dùng địa chỉ công khai; chạy LAN thì dùng IP trong mạng.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const inviteURLs = () => PUBLIC_URL ? [PUBLIC_URL] : lanIPs().map(ip => `http://${ip}:${PORT}`);

// Mỗi sân có 4 vị trí: 0 và 2 ở sân gần, 1 và 3 ở sân xa (đánh đơn chỉ dùng 0 và 1).
// Chủ sân (máy chạy trận đấu) có thể đứng ở bất kỳ vị trí nào.
const rooms = Array.from({ length: COURTS }, () => ({ fmt: 'don', seats: [null, null, null, null], host: null, started: false }));
const cap = r => r.fmt === 'doi' ? 4 : 2;
const count = r => r.seats.filter(Boolean).length;
// Kiểu nhân vật người chơi gửi lên: chỉ nhận mã màu 24-bit, một kiểu tóc hợp lệ, và quần hoặc váy (mặc định quần).
// Quần và váy có màu riêng; trang bản cũ không gửi màu váy thì dùng màu trắng.
const HAIR = ['short', 'tail', 'band', 'bald'];
// Vợt: 'plain' (một màu) hoặc 'custom' (Kumpoo K520 Pro / Yonex Astrox 100ZZ) với một trong các phiên bản màu.
// Trang bản cũ gửi 'k520' thì coi như 'custom'.
const RACKET_IDS = ['xanh', 'hong', 'vang', 'den', 'zznavy', 'zzred', 'zzva'];
function parseLook(raw) {
  try {
    const o = JSON.parse(raw || 'null'), c = v => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
    if (!o || !['shirt', 'shorts', 'skin', 'hair', 'racket'].every(k => c(o[k])) || !HAIR.includes(o.hs)) return null;
    return { shirt: o.shirt, shorts: o.shorts, skirt: c(o.skirt) ? o.skirt : 0xf2f2ee, skin: o.skin, hair: o.hair, racket: o.racket, hs: o.hs, bt: o.bt === 'skirt' ? 'skirt' : 'shorts',
      rk: o.rk === 'custom' || o.rk === 'k520' ? 'custom' : 'plain', rkv: RACKET_IDS.includes(o.rkv) ? o.rkv : 'xanh', str: c(o.str) ? o.str : 0xf4f4f2,
      hand: o.hand === 'L' ? 'L' : 'R' }; // tay cầm vợt: phải (mặc định) hoặc trái
  } catch { return null; }
}
// Người đang mở trang: mỗi trình duyệt có một mã riêng (giữ nguyên khi tải lại trang) và hỏi /rooms vài giây một lần;
// quá 8 giây không hỏi thì coi như đã thoát. Đóng tab thì trang gửi ?bye=<mã> để xoá ngay.
const seen = new Map();
function online(id, bye) {
  const now = Date.now();
  if (bye) seen.delete(bye);
  else if (id) seen.set(id, now);
  for (const [k, t] of seen) if (now - t > 8000) seen.delete(k);
  return seen.size;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page());
  } else if (url === '/three.min.js' && fs.existsSync(THREE_FILE)) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'max-age=86400' });
    fs.createReadStream(THREE_FILE).pipe(res);
  } else if (url === '/rooms') {
    const q = new URL(req.url, 'http://lan').searchParams;
    const id = (q.get('id') || '').slice(0, 32), bye = (q.get('bye') || '').slice(0, 32);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      online: online(id, bye),
      playing: rooms.reduce((n, r) => n + count(r), 0),
      rooms: rooms.map(r => ({ fmt: r.fmt, n: count(r), cap: cap(r), full: count(r) >= cap(r), started: r.started, names: r.seats.filter(Boolean).map(p => p.name) })),
    }));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Không tìm thấy');
  }
});

/* ---------- WebSocket tối giản (RFC 6455) ---------- */
function wsFrame(op, data) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}

// Trang nào mở game cũng giữ một kết nối "xem" (?watch=1): nhận bản tóm tắt trận của mọi sân
// để vẽ các trận khác lên sân bên cạnh và để xem trận.
const watchers = new Set();

function roster(r) {
  const seats = r.seats.map(p => p ? 1 : 0), names = r.seats.map(p => p ? p.name : ''), looks = r.seats.map(p => p ? p.look : null), host = r.seats.indexOf(r.host);
  for (const p of r.seats) if (p) p.json({ t: 'roster', seats, names, looks, host, you: p.seat });
}

class Peer {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.room = null; this.seat = -1; this.court = 0; this.name = ''; this.look = null;
    // Ping mỗi 25 giây để proxy (Render, Nginx…) không cắt kết nối khi đang ngồi chờ trong phòng.
    this.ping = setInterval(() => { if (this.open) this.sock.write(wsFrame(9, Buffer.alloc(0))); }, 25000);
    sock.on('data', d => this.onData(d));
    sock.on('close', () => this.onClose());
    sock.on('error', () => sock.destroy());
  }
  send(text) { if (this.open) this.sock.write(wsFrame(1, Buffer.from(text))); }
  json(o) { this.send(JSON.stringify(o)); }
  close() {
    if (!this.open) return;
    try { this.sock.write(wsFrame(8, Buffer.alloc(0))); } catch {}
    this.open = false;
    this.sock.end();
    // Proxy (Render, Nginx…) có thể giữ kết nối mở nửa chừng: sau 1 giây thì cắt hẳn.
    setTimeout(() => this.sock.destroy(), 1000).unref();
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { this.sock.destroy(); return; }
      const maskAt = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      const data = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) data[i] ^= b[maskAt + (i & 3)];
      this.buf = b.subarray(off + len);
      // Người chơi bấm Huỷ / Rời sân: trả ghế ngay, không chờ kết nối TCP đóng hẳn
      if (op === 8) { this.leave(); this.close(); return; }
      if (op === 9) { this.sock.write(wsFrame(10, data)); continue; }
      if (op === 0 || op === 1) {
        this.frag = this.frag ? Buffer.concat([this.frag, data]) : data;
        if (fin) { const text = this.frag.toString('utf8'); this.frag = null; this.relay(text); }
      }
    }
  }
  // Chủ sân gửi cho mọi người trong sân; người khác chỉ gửi cho chủ sân, kèm vị trí của mình.
  // Riêng tin đổi vị trí ({t:'seat'}) do server xử lý, chỉ được đổi trước khi trận bắt đầu.
  relay(text) {
    if (this.watch) return;
    const r = this.room;
    if (!r) return;
    if (this === r.host && text.startsWith('{"t":"meta"')) { try { r.started = !!JSON.parse(text).started; } catch {} return; }
    // Bản tóm tắt trận (~10 lần/giây): gắn số sân rồi gửi cho mọi kết nối xem. Giữ bản mới nhất
    // (kèm tên và nhân vật) để người vừa mở trang thấy ngay.
    if (this === r.host && text.startsWith('{"t":"sum"')) {
      let m;
      try { m = JSON.parse(text); } catch { return; }
      m.c = this.court;
      if (m.info) r.info = m.info;
      const out = JSON.stringify(m);
      r.last = m.info ? out : JSON.stringify({ ...m, info: r.info });
      for (const w of watchers) w.send(out);
      return;
    }
    if (text.startsWith('{"t":"seat"')) {
      let to = -1;
      try { to = JSON.parse(text).to | 0; } catch {}
      if (!r.started && to >= 0 && to < cap(r) && !r.seats[to]) {
        r.seats[this.seat] = null; r.seats[to] = this; this.seat = to; roster(r);
        console.log(`Sân ${this.court}: ${this.name} chuyển sang vị trí ${to + 1}.`);
      }
      return;
    }
    if (this === r.host) { for (const p of r.seats) if (p && p !== this) p.send(text); return; }
    if (!r.host) return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    m.from = this.seat; r.host.json(m);
  }
  onClose() {
    this.open = false;
    clearInterval(this.ping);
    if (this.watch) { watchers.delete(this); return; }
    this.leave();
  }
  // Rời sân, gọi được nhiều lần: lần đầu trả ghế, các lần sau không làm gì.
  leave() {
    const r = this.room;
    this.room = null;
    if (!r || r.seats[this.seat] !== this) return;
    r.seats[this.seat] = null;
    if (this === r.host) {
      for (let i = 0; i < 4; i++) { const p = r.seats[i]; if (p) { r.seats[i] = null; p.json({ t: 'left' }); p.close(); } }
      r.host = null; r.started = false;
      if (r.last) { r.last = r.info = null; for (const w of watchers) w.json({ t: 'sumEnd', c: this.court }); }
      console.log(`Sân ${this.court}: chủ sân ${this.name} đã rời, sân trống.`);
    } else {
      roster(r);
      console.log(`Sân ${this.court}: ${this.name} đã rời vị trí ${this.seat + 1}, máy đánh thay (${count(r)}/${cap(r)}).`);
    }
  }
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  const u = new URL(req.url, 'http://lan');
  if (u.pathname !== '/ws' || !key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const p = new Peer(sock);
  if (u.searchParams.get('watch')) {
    p.watch = true; watchers.add(p);
    for (const r of rooms) if (r.host && r.last) p.send(r.last);
    return;
  }
  const court = Math.min(COURTS, Math.max(1, parseInt(u.searchParams.get('court'), 10) || 1));
  const r = rooms[court - 1];
  // Tên hiển thị: bỏ ký tự điều khiển, tối đa 16 ký tự
  p.name = (u.searchParams.get('name') || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) || 'Người chơi';
  p.look = parseLook(u.searchParams.get('look'));
  let seat = -1;
  // Người đầu tiên vào sân trống làm chủ sân và chọn thể thức; người sau theo thể thức đó.
  if (!count(r)) { r.fmt = u.searchParams.get('fmt') === 'doi' ? 'doi' : 'don'; r.started = false; r.host = p; seat = 0; }
  else for (let i = 0; i < cap(r); i++) if (!r.seats[i]) { seat = i; break; }
  // Sân đủ người thì không cho vào
  if (seat < 0) { p.json({ t: 'full' }); p.close(); console.log(`Sân ${court}: đã đủ người, từ chối ${p.name}.`); return; }
  r.seats[seat] = p; p.room = r; p.seat = seat; p.court = court;
  const host = r.host === p;
  p.json({ t: 'role', seat, host, fmt: r.fmt, court, urls: host ? inviteURLs() : [] });
  roster(r);
  console.log(host
    ? `Sân ${court}: ${p.name} làm chủ sân, ${r.fmt === 'doi' ? 'đánh đôi' : 'đánh đơn'}, đang chờ người chơi…`
    : `Sân ${court}: ${p.name} vào vị trí ${seat + 1} (${count(r)}/${cap(r)}).`);
});

await cacheThree();
server.listen(PORT, '0.0.0.0', () => {
  if (PUBLIC_URL) { console.log(`Sân Cầu Terralogic · đang chạy · 5 sân · ${PUBLIC_URL}`); return; }
  console.log('\nSân Cầu Terralogic · máy chủ LAN đang chạy · 5 sân');
  console.log(`  Máy này:        http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Bạn cùng mạng:  http://${ip}:${PORT}`);
  console.log('Mọi người mở link, chọn cùng một sân rồi bấm CHƠI LAN. Nhấn Ctrl+C để tắt.\n');
});
