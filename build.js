#!/usr/bin/env node
// Ghép mã nguồn trong src/ thành trang game một file, đúng như san-cau-so-7.html trước khi chia file.
//   src/index.html  khung trang (markup), có hai chỗ đánh dấu <!-- @style --> và <!-- @game -->
//   src/style.css   toàn bộ CSS
//   src/game/*.js   mã game, ghép theo thứ tự tên file (01-, 02-, ...) vào trong một hàm (() => { ... })();
//                   nên mọi file dùng chung một phạm vi biến, như khi còn là một file. Từng file không chạy riêng được.
// server.js gọi buildPage() mỗi lần tải trang (sửa xong chỉ cần F5).
// Chạy `node build.js` để ghi ra dist/san-cau-so-7.html: bản một file, dùng cho Artifact hoặc mở thẳng trong trình duyệt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, 'src');

export function buildPage() {
  const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
  const parts = fs.readdirSync(path.join(SRC, 'game')).filter(f => f.endsWith('.js')).sort();
  const game = parts.map(f => read(path.join('game', f))).join('');
  return read('index.html')
    .replace('<!-- @style -->\n', () => '<style>\n' + read('style.css') + '</style>\n')
    .replace('<!-- @game -->\n', () => '<script>\n(() => {\n' + game + '})();\n</script>\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(DIR, 'dist', 'san-cau-so-7.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildPage());
  console.log('Đã ghi ' + path.relative(DIR, out));
}
