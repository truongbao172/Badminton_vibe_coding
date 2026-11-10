// TCP delay proxy: listen on `from`, forward to `to`, delaying each direction by a recorded series (one ordered queue per direction)
import net from 'node:net';
export function startProxy(from, to, series, scale = 1, burst = null) {
  let lastBurst = performance.now();
  const ordered = s => { let i = 0, due = 0; return fn => { let d = (s.length ? s[i++ % s.length] : 0) * scale; if (burst && performance.now() - lastBurst > burst.every * 1000) { lastBurst = performance.now(); d += burst.ms; } const at = Math.max(performance.now() + d, due); due = at; setTimeout(fn, Math.max(0, at - performance.now())); }; };
  const srv = net.createServer(c => {
    const u = net.connect(to, '127.0.0.1'), down = ordered(series.hg), up = ordered(series.gh);
    c.setNoDelay(true); u.setNoDelay(true);
    c.on('data', d => up(() => { if (!u.destroyed) u.write(d); }));
    u.on('data', d => down(() => { if (!c.destroyed) c.write(d); }));
    c.on('close', () => setTimeout(() => u.destroy(), 1500)); u.on('close', () => setTimeout(() => c.destroy(), 1500));
    c.on('error', () => {}); u.on('error', () => {});
  });
  srv.listen(from, '127.0.0.1');
  return srv;
}
