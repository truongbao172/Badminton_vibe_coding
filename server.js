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
import { serverPage, THREE_URL, ADDONS } from './build.js';
import { Lobby } from './lobby.js';

const PORT = Number(process.env.PORT) || 7777;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const THREE_FILE = path.join(DIR, 'vendor', 'three.min.js');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ASSETS = path.join(DIR, 'assets');
// 5 sân, người chơi, chủ sân, kết nối xem: xem lobby.js (dùng chung với cloudflare/worker.js)
const lobby = new Lobby();

// Lưu Three.js và thư viện đọc model về máy một lần, để lần sau chơi LAN không cần Internet.
async function cacheThree() {
  for (const [url, file] of [[THREE_URL, 'three.min.js'], ...ADDONS]) {
    const dst = path.join(DIR, 'vendor', file);
    if (fs.existsSync(dst)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
      console.log(`Đã lưu ${file} vào vendor/, lần sau chơi không cần Internet.`);
    } catch (e) {
      console.log(`Chưa tải được ${file} (${e.message}). Trang sẽ lấy từ CDN nên cần Internet.`);
    }
  }
}

const lanIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
  .map(i => i.address);
// Link mời bạn: trên Render (hoặc khi đặt PUBLIC_URL) dùng địa chỉ công khai; chạy LAN thì dùng IP trong mạng.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const inviteURLs = () => PUBLIC_URL ? [PUBLIC_URL] : lanIPs().map(ip => `http://${ip}:${PORT}`);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(serverPage()); // ghép lại từ src/ mỗi lần tải trang, sửa game xong chỉ cần F5
  } else if (url === '/three.min.js' && fs.existsSync(THREE_FILE)) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'max-age=86400' });
    fs.createReadStream(THREE_FILE).pipe(res);
  } else if (ADDONS.some(([, f]) => url === '/vendor/' + f)) {
    const file = path.join(DIR, 'vendor', path.basename(url));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'max-age=86400' });
    fs.createReadStream(file).pipe(res);
  } else if (url.startsWith('/assets/')) {
    // Model nhân vật, texture và âm thanh. Chỉ phục vụ file nằm trong thư mục assets/, đúng các đuôi cho phép.
    const TYPES = { '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.m4a': 'audio/mp4' };
    let file;
    try { file = path.resolve(ASSETS, '.' + decodeURIComponent(url.slice('/assets'.length))); } catch { file = ''; }
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type || !file.startsWith(ASSETS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Không tìm thấy'); return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  } else if (url === '/rooms') {
    const q = new URL(req.url, 'http://lan').searchParams;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(lobby.status(q.get('id'), q.get('bye'))));
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

// Nhịp tim cho mọi người trong sân (xem Lobby.heartbeat)
setInterval(() => lobby.heartbeat(), 2000).unref();

// Một kết nối WebSocket trên TCP: tự đọc/ghi khung, phần sân và ghế giao cho lobby.
class Peer {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.p = null;
    // Ping mỗi 10 giây (cũng giữ cho proxy như Render, Nginx… không cắt kết nối khi ngồi chờ).
    // Trình duyệt tự trả pong; qua một lượt ping mà không nhận được gì thì coi như đã mất (tắt Wi‑Fi,
    // máy ngủ, tab bị trình duyệt tạm dừng…) và cắt để trả ghế, thay vì giữ ghế đến khi hệ điều hành tự đóng TCP.
    this.alive = true;
    this.ping = setInterval(() => {
      if (!this.open) return;
      if (!this.alive) { this.sock.destroy(); return; }
      this.alive = false;
      this.sock.write(wsFrame(9, Buffer.alloc(0)));
    }, 10000);
    sock.on('data', d => { this.alive = true; this.onData(d); });
    // Phía kia chỉ đóng TCP (FIN) mà không gửi khung close, ví dụ bấm Huỷ lúc đang kết nối:
    // socket sau khi nâng cấp không tự đóng, nên phải tự cắt, nếu không ghế bị giữ mãi.
    sock.on('end', () => sock.destroy());
    sock.on('close', () => this.onClose());
    sock.on('error', () => sock.destroy());
  }
  // Giao diện "conn" mà lobby dùng
  send(text) { if (this.open) this.sock.write(wsFrame(1, Buffer.from(text))); }
  close() {
    if (!this.open) return;
    try { this.sock.write(wsFrame(8, Buffer.alloc(0))); } catch {}
    this.open = false;
    this.sock.end();
    // Proxy (Render, Nginx…) có thể giữ kết nối mở nửa chừng: sau 1 giây thì cắt hẳn.
    setTimeout(() => this.sock.destroy(), 1000).unref();
  }
  kill() { this.open = false; this.sock.destroy(); }
  backlog() { return this.sock.writableLength; }
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
      if (op === 8) { if (this.p) lobby.closed(this.p); this.close(); return; }
      if (op === 9) { this.sock.write(wsFrame(10, data)); continue; }
      if (op === 0 || op === 1) {
        this.frag = this.frag ? Buffer.concat([this.frag, data]) : data;
        if (fin) { const text = this.frag.toString('utf8'); this.frag = null; if (this.p) lobby.message(this.p, text); }
      }
    }
  }
  onClose() {
    this.open = false;
    clearInterval(this.ping);
    if (this.p) lobby.closed(this.p);
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
  const c = new Peer(sock);
  c.p = lobby.join(c, u.searchParams, inviteURLs);
});

await cacheThree();
server.listen(PORT, '0.0.0.0', () => {
  if (PUBLIC_URL) { console.log(`Sân Cầu Terralogic · đang chạy · 5 sân · ${PUBLIC_URL}`); return; }
  console.log('\nSân Cầu Terralogic · máy chủ LAN đang chạy · 5 sân');
  console.log(`  Máy này:        http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Bạn cùng mạng:  http://${ip}:${PORT}`);
  console.log('Mọi người mở link, chọn cùng một sân rồi bấm CHƠI LAN. Nhấn Ctrl+C để tắt.\n');
});
