#!/usr/bin/env node
// Ghép mã nguồn trong src/ thành trang game một file, đúng như san-cau-so-7.html trước khi chia file.
//   src/index.html  khung trang (markup), có hai chỗ đánh dấu <!-- @style --> và <!-- @game -->
//   src/style.css   toàn bộ CSS
//   src/game/*.js   mã game, ghép theo thứ tự tên file (01-, 02-, ...) vào trong một hàm (() => { ... })();
//                   nên mọi file dùng chung một phạm vi biến, như khi còn là một file. Từng file không chạy riêng được.
// server.js gọi buildPage() mỗi lần tải trang (sửa xong chỉ cần F5).
// Chạy `node build.js` để ghi ra dist/san-cau-so-7.html: bản một file, dùng cho Artifact hoặc mở thẳng trong trình duyệt.
// Chạy `node build.js web` để ghi ra dist/web/: trang + Three.js + assets, là file tĩnh cho Cloudflare Workers
// (wrangler.jsonc tự chạy lệnh này trước `wrangler dev` / `wrangler deploy`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, 'src');

// Three.js và thư viện đọc model nhân vật (glTF) cho r128. Trang gốc lấy từ CDN; máy chủ có bản trong vendor/
// thì trang lấy bản đó (chơi LAN không cần Internet).
export const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
export const ADDONS = [
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js', 'SkeletonUtils.js'],
];
const vendored = file => fs.existsSync(path.join(DIR, 'vendor', file));

export function buildPage() {
  const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
  const parts = fs.readdirSync(path.join(SRC, 'game')).filter(f => f.endsWith('.js')).sort();
  const game = parts.map(f => read(path.join('game', f))).join('');
  return read('index.html')
    .replace('<!-- @style -->\n', () => '<style>\n' + read('style.css') + '</style>\n')
    .replace('<!-- @game -->\n', () => '<script>\n(() => {\n' + game + '})();\n</script>\n');
}

// Trang do máy chủ phục vụ (server.js hoặc Cloudflare): bật tab chơi qua mạng (SAN7_LAN),
// Three.js lấy ở /three.min.js và /vendor/... nếu vendor/ có sẵn bản đó.
export function serverPage() {
  let body = buildPage();
  if (vendored('three.min.js')) body = body.replace(THREE_URL, '/three.min.js');
  for (const [url, file] of ADDONS) if (vendored(file)) body = body.replace(url, '/vendor/' + file);
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<script>window.SAN7_LAN = true</script></head><body>' + body + '</body></html>';
}

// dist/web/: đúng các đường dẫn mà server.js phục vụ (/, /three.min.js, /vendor/*, /assets/*).
function buildWeb() {
  const out = path.join(DIR, 'dist', 'web');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), serverPage());
  if (vendored('three.min.js')) fs.copyFileSync(path.join(DIR, 'vendor', 'three.min.js'), path.join(out, 'three.min.js'));
  for (const [, file] of ADDONS) if (vendored(file)) fs.copyFileSync(path.join(DIR, 'vendor', file), path.join(out, 'vendor', file));
  // Chỉ chép các đuôi mà server.js cũng cho phép
  const ok = /\.(gltf|bin|jpg|png|m4a)$/i;
  fs.cpSync(path.join(DIR, 'assets'), path.join(out, 'assets'), { recursive: true, filter: f => fs.statSync(f).isDirectory() || ok.test(f) });
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'web') { console.log('Đã ghi ' + path.relative(DIR, buildWeb()) + '/'); }
  else {
    const out = path.join(DIR, 'dist', 'san-cau-so-7.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buildPage());
    console.log('Đã ghi ' + path.relative(DIR, out));
  }
}
