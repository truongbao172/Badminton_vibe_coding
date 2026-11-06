// Logic 5 sân của server.js: ghế, chủ sân, chuyển tin, kết nối xem. Phần WebSocket nằm ở server.js,
// mỗi kết nối được đưa cho Lobby dưới dạng một "conn":
//   conn.send(text)   gửi một tin chữ
//   conn.close()      đóng nhẹ nhàng (gửi khung close)
//   conn.kill()       cắt ngay
//   conn.backlog()    số byte đang chờ gửi (không biết thì trả 0)
// Có 5 sân, mỗi sân là một phòng riêng: đánh đơn 2 người, đánh đôi tối đa 4 người.
export const COURTS = 5;

// Kiểu nhân vật người chơi gửi lên: chỉ nhận mã màu 24-bit, một kiểu tóc hợp lệ, và quần hoặc váy (mặc định quần).
// Quần và váy có màu riêng; trang bản cũ không gửi màu váy thì dùng màu trắng.
const HAIR = ['short', 'tail', 'band', 'bald', 'spiky'];
// Đồ siêu anh hùng: bộ đồ bó (hoặc áo quần thường), màu phụ, mặt nạ, áo choàng, thân hình cơ bắp
const SUITS = ['none', 'v', 'bolt', 'side', 'star'], MASKS = ['none', 'eye', 'full'];
// Vợt: 'plain' (một màu) hoặc 'custom' (Kumpoo K520 Pro / Yonex Astrox 100ZZ) với một trong các phiên bản màu.
// Trang bản cũ gửi 'k520' thì coi như 'custom'.
const RACKET_IDS = ['xanh', 'hong', 'vang', 'den', 'zznavy', 'zzred', 'zzva'];
function parseLook(raw) {
  try {
    const o = JSON.parse(raw || 'null'), c = v => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
    if (!o || !['shirt', 'shorts', 'skin', 'hair', 'racket'].every(k => c(o[k])) || !HAIR.includes(o.hs)) return null;
    return { shirt: o.shirt, shorts: o.shorts, skirt: c(o.skirt) ? o.skirt : 0xf2f2ee, skin: o.skin, hair: o.hair, racket: o.racket, hs: o.hs, bt: o.bt === 'skirt' ? 'skirt' : 'shorts',
      rk: o.rk === 'custom' || o.rk === 'k520' ? 'custom' : 'plain', rkv: RACKET_IDS.includes(o.rkv) ? o.rkv : 'xanh', str: c(o.str) ? o.str : 0xf4f4f2,
      hand: o.hand === 'L' ? 'L' : 'R', // tay cầm vợt: phải (mặc định) hoặc trái
      body: o.body === 'f' ? 'f' : 'm', // dáng người: nam (mặc định) hoặc nữ
      suit: SUITS.includes(o.suit) ? o.suit : 'none', acc: c(o.acc) ? o.acc : 0xffb547, mask: MASKS.includes(o.mask) ? o.mask : 'none',
      cape: o.cape === 'y' ? 'y' : 'n', build: o.build === 'b' ? 'b' : 'n' };
  } catch { return null; }
}

const cap = r => r.fmt === 'doi' ? 4 : 2;
const count = r => r.seats.filter(Boolean).length;
const HB = '{"t":"hb"}';

// Một kết nối: người chơi trong sân, hoặc kết nối "xem" (watch).
class Peer {
  constructor(conn) { this.conn = conn; this.open = true; this.room = null; this.seat = -1; this.court = 0; this.name = ''; this.look = null; this.id = ''; this.watch = false; this.heard = Date.now(); this.beats = false; }
  send(text) { if (this.open) this.conn.send(text); }
  json(o) { this.send(JSON.stringify(o)); }
  close() { if (!this.open) return; this.open = false; this.conn.close(); }
  kill() { this.open = false; this.conn.kill(); }
}

export class Lobby {
  constructor() {
    // Mỗi sân có 4 vị trí: 0 và 2 ở sân gần, 1 và 3 ở sân xa (đánh đơn chỉ dùng 0 và 1).
    // Chủ sân (máy chạy trận đấu) có thể đứng ở bất kỳ vị trí nào.
    this.rooms = Array.from({ length: COURTS }, () => ({ fmt: 'don', seats: [null, null, null, null], host: null, started: false }));
    // Trang nào mở game cũng giữ một kết nối "xem" (?watch=1): nhận bản tóm tắt trận của mọi sân
    // để vẽ các trận khác lên sân bên cạnh và để xem trận.
    this.watchers = new Set();
    this.peers = new Set();
    // Người đang mở trang: mỗi trình duyệt có một mã riêng (giữ nguyên khi tải lại trang) và hỏi /rooms vài giây một lần;
    // quá 8 giây không hỏi thì coi như đã thoát. Đóng tab thì trang gửi ?bye=<mã> để xoá ngay.
    this.seen = new Map();
  }

  // Trả lời /rooms (đối tượng, máy chủ tự JSON.stringify)
  status(id, bye) {
    id = (id || '').slice(0, 32); bye = (bye || '').slice(0, 32);
    const now = Date.now();
    if (bye) this.seen.delete(bye);
    else if (id) this.seen.set(id, now);
    for (const [k, t] of this.seen) if (now - t > 8000) this.seen.delete(k);
    return {
      online: this.seen.size,
      playing: this.rooms.reduce((n, r) => n + count(r), 0),
      rooms: this.rooms.map(r => ({ fmt: r.fmt, n: count(r), cap: cap(r), full: count(r) >= cap(r), started: r.started, names: r.seats.filter(Boolean).map(p => p.name) })),
    };
  }

  // Nhịp tim: máy chủ gọi 2 giây một lần, gửi {"t":"hb"} cho mọi kết nối (người trong sân và kết nối xem). Trang game không nhận được gì
  // trong 6 giây thì biết kết nối đã chết (Wi‑Fi chập chờn thường làm TCP chết lặng lẽ, không bên nào hay)
  // và tự kết nối lại, thay vì đứng hình chờ mãi.
  //
  // Trang trả lời mỗi nhịp tim bằng chính {"t":"hb"}. Không dựa vào ping/pong của WebSocket được: proxy của Render tự trả
  // pong thay cho trình duyệt, nên một trang đã mất (điện thoại khoá màn hình, đổi mạng, tab bị tắt ngang) vẫn giữ ghế
  // và vẫn được gửi tin mãi, ăn CPU của máy chủ. Trang đã từng trả lời mà im quá 20 giây thì cắt.
  // (Trang bản cũ không trả lời thì không bị cắt, như trước.)
  heartbeat() {
    const now = Date.now();
    for (const p of [...this.peers]) {
      if (p.beats && now - p.heard > 20000) { console.log(`Cắt kết nối im lặng: ${p.watch ? 'xem' : 'sân ' + p.court + ', ' + p.name}.`); p.kill(); this.closed(p); }
      else if (p.open) p.send(HB);
    }
  }

  roster(r) {
    const seats = r.seats.map(p => p ? 1 : 0), names = r.seats.map(p => p ? p.name : ''), looks = r.seats.map(p => p ? p.look : null), host = r.seats.indexOf(r.host);
    for (const p of r.seats) if (p) p.json({ t: 'roster', seats, names, looks, host, you: p.seat });
  }

  // Kết nối WebSocket mới tới /ws. q: URLSearchParams của địa chỉ; invite(): các link mời bạn cho chủ sân.
  // Trả về Peer để máy chủ chuyển tin tới message() và báo closed() khi kết nối đóng.
  join(conn, q, invite) {
    const p = new Peer(conn);
    this.peers.add(p);
    if (q.get('watch')) {
      p.watch = true; this.watchers.add(p);
      for (const r of this.rooms) if (r.host && r.last) p.send(r.last);
      return p;
    }
    const court = Math.min(COURTS, Math.max(1, parseInt(q.get('court'), 10) || 1));
    const r = this.rooms[court - 1];
    // Tên hiển thị: bỏ ký tự điều khiển, tối đa 16 ký tự
    p.name = (q.get('name') || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) || 'Người chơi';
    p.look = parseLook(q.get('look'));
    // Mã của trang (mỗi lần mở trang một mã). Trang kết nối lại sau khi rớt mạng gửi lại đúng mã này, kèm ghế cũ.
    p.id = (q.get('id') || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
    const want = parseInt(q.get('seat'), 10);
    // Kết nối cũ của chính trang này có thể vẫn đang giữ ghế (TCP chết lặng lẽ, server chưa hay biết):
    // cắt nó và trả ghế cho kết nối mới ngay, không bắt chờ hết lượt ping rồi báo sân đầy.
    const stale = p.id && r.seats.find(s => s && s.id === p.id);
    let reclaim = -1;
    if (stale) {
      if (stale === r.host) this.leave(stale); // chủ sân rời thì sân đóng như cũ
      else { reclaim = stale.seat; r.seats[stale.seat] = null; stale.room = null; }
      stale.kill(); this.peers.delete(stale);
      console.log(`Sân ${court}: ${p.name} kết nối lại, bỏ kết nối cũ.`);
    }
    let seat = -1;
    // Người đầu tiên vào sân trống làm chủ sân và chọn thể thức; người sau theo thể thức đó.
    if (!count(r)) { r.fmt = q.get('fmt') === 'doi' ? 'doi' : 'don'; r.started = false; r.host = p; seat = 0; }
    else {
      // Kết nối lại: về đúng ghế cũ nếu ghế đó còn trống
      for (const s of [reclaim, want]) if (seat < 0 && s >= 0 && s < cap(r) && !r.seats[s]) seat = s;
      for (let i = 0; seat < 0 && i < cap(r); i++) if (!r.seats[i]) seat = i;
    }
    // Sân đủ người thì không cho vào
    if (seat < 0) { p.json({ t: 'full' }); p.close(); console.log(`Sân ${court}: đã đủ người, từ chối ${p.name}.`); return p; }
    r.seats[seat] = p; p.room = r; p.seat = seat; p.court = court;
    const host = r.host === p;
    p.json({ t: 'role', seat, host, fmt: r.fmt, court, urls: host ? invite() : [] });
    this.roster(r);
    console.log(host
      ? `Sân ${court}: ${p.name} làm chủ sân, ${r.fmt === 'doi' ? 'đánh đôi' : 'đánh đơn'}, đang chờ người chơi…`
      : `Sân ${court}: ${p.name} vào vị trí ${seat + 1} (${count(r)}/${cap(r)}).`);
    return p;
  }

  // Chủ sân gửi cho mọi người trong sân; người khác chỉ gửi cho chủ sân, kèm vị trí của mình.
  // Riêng tin đổi vị trí ({t:'seat'}) do server xử lý, chỉ được đổi trước khi trận bắt đầu.
  message(p, text) {
    p.heard = Date.now();
    if (text === HB) { p.beats = true; return; }
    if (p.watch) return;
    const r = p.room;
    if (!r) return;
    if (p === r.host && text.startsWith('{"t":"meta"')) { try { r.started = !!JSON.parse(text).started; } catch {} return; }
    // Bản tóm tắt trận (~10 lần/giây): gắn số sân rồi gửi cho mọi kết nối xem. Giữ bản mới nhất
    // (kèm tên và nhân vật) để người vừa mở trang thấy ngay.
    if (p === r.host && text.startsWith('{"t":"sum"')) {
      let m;
      try { m = JSON.parse(text); } catch { return; }
      m.c = p.court;
      if (m.info) r.info = m.info;
      const out = JSON.stringify(m);
      r.last = m.info ? out : JSON.stringify({ ...m, info: r.info });
      for (const w of this.watchers) if (w.conn.backlog() < 65536) w.send(out);
      return;
    }
    if (text.startsWith('{"t":"seat"')) {
      let to = -1;
      try { to = JSON.parse(text).to | 0; } catch {}
      if (!r.started && to >= 0 && to < cap(r) && !r.seats[to]) {
        r.seats[p.seat] = null; r.seats[to] = p; p.seat = to; this.roster(r);
        console.log(`Sân ${p.court}: ${p.name} chuyển sang vị trí ${to + 1}.`);
      }
      return;
    }
    // Trạng thái trận (~60 lần/giây): người nào kết nối đang nghẽn (Wi‑Fi chập chờn…) thì bỏ qua bản này
    // thay vì xếp hàng thêm, vì bản mới hơn tới ngay sau 16 ms; dồn bản cũ chỉ làm họ trễ thêm khi mạng thông lại.
    if (p === r.host) {
      const st = text.startsWith('{"t":"st"');
      for (const s of r.seats) if (s && s !== p && !(st && s.conn.backlog() > 32768)) s.send(text);
      return;
    }
    if (!r.host) return;
    // Gắn vị trí người gửi mà không phải giải mã cả tin: thêm "from" vào cuối, nên nếu người gửi tự ghi
    // "from" thì giá trị của server vẫn thắng (JSON lấy khoá viết sau cùng).
    if (text[0] !== '{' || text[text.length - 1] !== '}') return;
    r.host.send(text.length > 2 ? text.slice(0, -1) + ',"from":' + p.seat + '}' : '{"from":' + p.seat + '}');
  }

  // Kết nối đã đóng (hoặc người chơi bấm Huỷ / Rời sân): trả ghế ngay. Gọi được nhiều lần.
  closed(p) {
    p.open = false;
    this.peers.delete(p);
    if (p.watch) { this.watchers.delete(p); return; }
    this.leave(p);
  }

  // Rời sân, gọi được nhiều lần: lần đầu trả ghế, các lần sau không làm gì.
  leave(p) {
    const r = p.room;
    p.room = null;
    if (!r || r.seats[p.seat] !== p) return;
    r.seats[p.seat] = null;
    if (p === r.host) {
      for (let i = 0; i < 4; i++) { const s = r.seats[i]; if (s) { r.seats[i] = null; s.json({ t: 'left' }); s.close(); } }
      r.host = null; r.started = false;
      if (r.last) { r.last = r.info = null; for (const w of this.watchers) w.json({ t: 'sumEnd', c: p.court }); }
      console.log(`Sân ${p.court}: chủ sân ${p.name} đã rời, sân trống.`);
    } else {
      this.roster(r);
      console.log(`Sân ${p.court}: ${p.name} đã rời vị trí ${p.seat + 1}, máy đánh thay (${count(r)}/${cap(r)}).`);
    }
  }
}
