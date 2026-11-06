// Cloudflare Workers server for Sân Cầu Terralogic (config: wrangler.jsonc at the repo root).
// Static files (the page, Three.js, assets/) come from dist/web/, built by `node build.js web`.
// This script only handles /rooms and /ws, and hands both to a single Durable Object (Hall) so every
// player shares the same 5 courts, exactly like server.js does in one Node process.
import { DurableObject } from 'cloudflare:workers';
import { Lobby } from '../lobby.js';

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/rooms' || pathname === '/ws') {
      // One hall for everyone. The hint places it in Asia-Pacific on first creation (players are in Vietnam).
      return env.HALL.get(env.HALL.idFromName('hall'), { locationHint: 'apac' }).fetch(req);
    }
    return new Response('Không tìm thấy', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

export class Hall extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lobby = new Lobby();
    this.beat = 0;
  }

  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/rooms') {
      return Response.json(this.lobby.status(url.searchParams.get('id'), url.searchParams.get('bye')), { headers: { 'cache-control': 'no-store' } });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Cần kết nối WebSocket', { status: 426 });

    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    // The "conn" interface Lobby expects. Workers expose no send-buffer size, so backlog() is always 0.
    const shut = () => { try { ws.close(1000); } catch {} };
    const conn = { send: t => { try { ws.send(t); } catch {} }, close: shut, kill: shut, backlog: () => 0 };
    const p = this.lobby.join(conn, url.searchParams, () => [url.origin]);
    ws.addEventListener('message', e => { if (typeof e.data === 'string') this.lobby.message(p, e.data); });
    ws.addEventListener('close', () => { this.lobby.closed(p); shut(); this.heartbeat(); });
    ws.addEventListener('error', () => { this.lobby.closed(p); this.heartbeat(); });
    this.heartbeat();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // 2 s heartbeat while anyone is connected (see Lobby.heartbeat); stopped when the hall is empty.
  heartbeat() {
    if (this.lobby.peers.size && !this.beat) this.beat = setInterval(() => this.lobby.heartbeat(), 2000);
    else if (!this.lobby.peers.size && this.beat) { clearInterval(this.beat); this.beat = 0; }
  }
}
