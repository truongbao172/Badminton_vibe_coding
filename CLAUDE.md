# Sân Cầu Terralogic

Game cầu lông 3D (Three.js r128, không bundler, không npm dependency). `server.js` (Node ≥18) phục vụ trang và chuyển tin WebSocket cho chế độ LAN / Render.

## Đọc file nào

Đừng đọc hết mọi file. Dùng bản đồ dưới đây (hoặc `grep -n "function tên"` trong `src/game/`) để mở đúng file cần sửa.

- `src/index.html`: markup (menu, HUD, nút cảm ứng). Có hai chỗ đánh dấu `<!-- @style -->`, `<!-- @game -->` để build chèn vào.
- `src/style.css`: toàn bộ CSS.
- `src/game/*.js`: mã game, ghép theo thứ tự tên file:

| File | Nội dung | Hàm chính |
|---|---|---|
| 01-core | helper (`$`, clamp, lerp), kích thước sân `C`, vật lý cầu, đội hình đánh | stepShuttle, simulate, solveShot |
| 02-renderer-hall | renderer, mức đồ hoạ/FPS, nhà thi đấu 5 sân, đèn, tone mapping | applyGfx, tuneGfx, setCourt |
| 03-athletes | khung xương đơn giản, té ngã (FALL_*), vợt custom, kiểu nhân vật (look) | figure, customRacket, applyLook |
| 04-models | tải model glTF Quaternius, bảng xương, giày, tóc | loadCharacters, prepareKind |
| 05-model-kit | shader tô áo quần/đồ siêu anh hùng, tóc, áo choàng, chép tư thế sang model | kitMaterial, attachModel, driveModel, makeAthlete |
| 06-animation | tư thế, vung vợt, chạy/nhảy, va chạm đồng đội | animateAthlete, moveAthlete, doJump, checkFalls |
| 07-shuttle-fx | quả cầu, bóng, vệt bay, tia lửa, vòng sóng, rung màn hình, hit-stop | fxEvent, fxTick, shakeOn |
| 08-audio | âm thanh tổng hợp; đoạn ghi âm trong assets/sfx (tiếng hô khi nhảy đập, âm thanh thắng/thua trận) | ensureAudio, sfx, playClip |
| 09-game-state | trạng thái `S`, HUD, luật giao cầu, cú đánh | emit, updateHUD, setupServe, aimShot, doHit |
| 10-computer-players | AI, xét chạm cầu, cầu rơi, tính điểm, kết thúc trận, tạm dừng | aiShot, tryHits, physicsStep, checkLanding, awardPoint |
| 11-input | bàn phím (đổi phím), nút đánh giữ lực, cần ảo cảm ứng | readInput, hitDown, hitUp |
| 12-menu | menu, tab, bảng chỉnh nhân vật + preview, danh sách sân LAN | readMenu, buildLookOpts, renderPreview, refreshRooms |
| 13-lan-connect | kết nối WebSocket, phòng chờ, ghế, tự nối lại, snapshot của chủ sân | lanJoin, onNet, snapshot |
| 14-lan-sync | máy khách: buffer snapshot, đồng hồ, nội suy, cú đánh của khách | applySnap, netClock, netShuttleAt, guestHit, takeGuestHit |
| 15-lan-host | chủ sân: tua lại để áp cú đánh, vẽ trễ (PV), độ trễ khách, F3 | replayFrom, pvFrame, guestLag |
| 16-watch | các sân bên cạnh (tóm tắt), chế độ xem | onSum, updateGhosts, startWatch |
| 17-loop | camera, vòng lặp khung hình, warm shader, `start()` | update, syncVisuals, frame, start |
| 18-punishment | hình phạt cho đội thua sau trận: chọn, gửi qua mạng, diễn, camera (tư thế `PUNISH` nằm trong 06-animation) | punishOffer, choosePunish, startPunish, punTick |

## Quy ước quan trọng

- `build.js` ghép `src/game/*.js` vào **một** IIFE `(() => { ... })()`. Mọi file dùng chung phạm vi biến: không có import/export, biến/hàm khai báo ở file này dùng thẳng ở file khác. Từng file không chạy riêng được.
- Thứ tự file quan trọng (mã cấp ngoài cùng chạy lúc tải). Thêm file mới thì đặt tiền tố số đúng chỗ. Điểm cắt giữa hai file phải ở cấp ngoài cùng của IIFE.
- `server.js` gọi `buildPage()` mỗi lần tải trang: sửa xong chỉ cần F5, không cần build.
- `node build.js` → `dist/san-cau-so-7.html` (bản một file cho Artifact / test Playwright). `dist/` không commit.
- Chú thích trong code viết tiếng Anh; README và chữ trên giao diện viết tiếng Việt.
