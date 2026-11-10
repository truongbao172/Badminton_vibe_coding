// End-to-end smoothness test of a network match: a host page (direct) and a guest page (through a TCP delay proxy that
// replays one-way delays recorded on the live Render server, delays.json) play each other with test bots on a local
// server.js, in headless Chromium (Playwright). Each page counts "hitches": frames where an opponent (>2 cm) or the
// shuttle (>5 cm) lands off the straight line through the two frames before. Also counts guest hits the host turned down.
//   node tools/nettest/run.mjs                 45 s singles with the recorded delays
//   SECS=60 SCALE=2.5 node tools/nettest/run.mjs   delays 2.5x worse
//   BURST=8 BURST_MS=1200 ...                  a 1.2 s TCP stall every 8 s (seen through Render on bad days)
//   JIT=30 ...                                 uneven frames: 0-30 ms of busy work before each frame
//   FMT=doi ...                                doubles, the two empty seats filled with computers
//   node tools/nettest/wsprobe.mjs [wss://host/ws court secs rate]   measure the real one-way delays (two Node clients)
// Playwright is not a dependency of the game: point PLAYWRIGHT_DIR at an install (npx playwright@1.62.1 install chromium).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { startProxy } from './proxy.mjs';
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || '/Users/anhnguyen/.npm/_npx/e41f203b7505f1fb/node_modules/playwright', 'package.json'));
const { chromium } = require('playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROJ = process.env.PROJ || path.resolve(HERE, '..', '..');
const SECS = +(process.env.SECS || 45), SPORT = +(process.env.SPORT || 7791), PPORT = SPORT + 1, SCALE = +(process.env.SCALE || 1), JIT = process.env.JIT || '7';
const { serverPage } = await import(path.join(PROJ, 'build.js'));
const hook = fs.readFileSync(path.join(HERE, 'hook.js'), 'utf8');
let html = serverPage();
const cut = html.lastIndexOf('})();\n</script>');
html = html.slice(0, cut) + hook + '\n' + html.slice(cut);
const delays = JSON.parse(fs.readFileSync(path.join(HERE, process.env.DELAYS || 'delays.json'), 'utf8'));
const server = spawn('node', ['server.js'], { cwd: PROJ, env: { ...process.env, PORT: String(SPORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', d => process.env.VERBOSE && process.stdout.write('[srv] ' + d));
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${SPORT}/rooms`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const proxy = startProxy(PPORT, SPORT, delays, SCALE, process.env.BURST ? { every: +process.env.BURST, ms: +(process.env.BURST_MS || 1200) } : null);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
async function openPage(port, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`[${name} pageerror]`, e.message));
  page.on('console', m => { if ((m.type() === 'error' && process.env.VERBOSE) || m.text().startsWith('[bot')) console.log(`[${name} console]`, m.text()); });
  await page.route(u => u.origin === `http://127.0.0.1:${port}` && u.pathname === '/', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`http://127.0.0.1:${port}/?jit=${JIT}&dbg=${process.env.DBG || 0}`);
  await page.waitForFunction(() => !!window.__t, null, { timeout: 30000 });
  await page.evaluate(n => { if (!window.__t.gfx.show) window.__t.gfx.show = true; document.getElementById('c-1').checked = true; document.getElementById('optName').value = n; }, name);
  return page;
}
const host = await openPage(SPORT, 'Host');
if (process.env.FMT === 'doi') await host.evaluate(() => { document.getElementById('lf-doi').checked = true; });
await host.evaluate(() => window.__t.lanJoin());
await host.waitForFunction(() => window.__t.S.mode === 'host', null, { timeout: 15000 });
const guest = await openPage(PPORT, 'Guest');
await guest.evaluate(() => window.__t.lanJoin());
await guest.waitForFunction(() => window.__t.S.mode === 'guest', null, { timeout: 15000 });
if (process.env.FMT === 'doi') { await new Promise(r => setTimeout(r, 500)); await host.evaluate(() => document.getElementById('btnLobbyFill').click()); }
await host.waitForFunction(() => !document.getElementById('btnLobbyStart').disabled, null, { timeout: 15000 });
await new Promise(r => setTimeout(r, 1500)); // let the models load
await host.evaluate(() => document.getElementById('btnLobbyStart').click());
await guest.waitForFunction(() => window.__t.S.state !== 'menu', null, { timeout: 15000 });
console.log(`match started; playing ${SECS} s (delay scale ${SCALE}, jitter ${JIT} ms, burst ${process.env.BURST || 'none'})`);
await new Promise(r => setTimeout(r, SECS * 1000));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
for (const [name, page] of [['HOST ', host], ['GUEST', guest]]) {
  const M = await page.evaluate(() => { const M = window.__t.M; return { ...M, dts: M.dts.slice(-4000), state: window.__t.S.state, score: window.__t.S.score, gfx: `${window.__t.gfx.pr}/${window.__t.gfx.lvl}`, meter: document.getElementById('fpsMeter').textContent, hits: M.hits, mode: window.__t.S.mode }; });
  const ms = M.dts;
  console.log(`${name}: gfx pr/lvl=${M.gfx} hits=${M.hits} mine=${M.myHits}/${M.presses}press points=${M.points} score=${M.score.join(':')} state=${M.state} | opponent hitches=${M.athMiss}/${M.athN} (${(100 * M.athMiss / Math.max(1, M.athN)).toFixed(2)}%) p50err=${pct(M.athErrs, .5)}mm max=${pct(M.athErrs, 1)}mm | shuttle hitches=${M.shMiss}/${M.shN} (${(100 * M.shMiss / Math.max(1, M.shN)).toFixed(2)}%) p50=${pct(M.shErrs, .5)}mm max=${pct(M.shErrs, 1)}mm | frame ms p50=${pct(ms, .5).toFixed(1)} p99=${pct(ms, .99).toFixed(1)} max=${pct(ms, 1).toFixed(0)} stalls=${M.stalls} | draw delay ms: ${M.D.slice(-12).join(' ')} | guest hits: acks=${M.acks} rejected=${M.rejected} ackMs p50=${pct(M.ackMs, .5)} max=${pct(M.ackMs, 1)}; host took=${M.guestHits} rejected=${M.guestRejected} | meter: ${M.meter} | stalls>60ms: ${JSON.stringify(M.stallLog.slice(0, 8))}`);
}
if (process.env.SHOT) { await host.screenshot({ path: path.join(HERE, 'host.png') }); await guest.screenshot({ path: path.join(HERE, 'guest.png') }); }
await guest.evaluate(() => window.__t.leave()); await host.evaluate(() => window.__t.leave());
await new Promise(r => setTimeout(r, 500));
await browser.close(); proxy.close(); server.kill();
process.exit(0);
