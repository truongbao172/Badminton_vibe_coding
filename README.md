# Sân Cầu Terralogic

Game cầu lông 3D, đánh đơn hoặc đánh đôi, trong nhà thi đấu có 5 sân. Chơi với máy ngay trên trình duyệt (đánh đôi thì có một đồng đội máy), hoặc đấu với bạn bè dùng chung mạng Wi-Fi / LAN.

## Chơi LAN

Cần Node 18 trở lên. Không phải cài thêm thư viện nào.

```bash
cd san-cau-so-7
node server.js        # hoặc: npm start
```

Lệnh này in ra hai loại link:

- **Máy này:** `http://localhost:7777`. Máy chạy server mở link này.
- **Bạn cùng mạng:** `http://192.168.x.x:7777`. Máy kia mở link này.

Mở tab **Chơi với người** trong menu. Tab này liệt kê 5 sân: sân nào trống, sân nào đang chờ người hay đang đấu, có mấy người và tên từng người. Mọi người nhập **tên**, bấm chọn **cùng một sân** rồi bấm **VÀO SÂN**.

- **Tên:** hiện ở đúng vị trí người đó đứng trong phòng chờ, trên đầu nhân vật lúc đánh, và trong các thông báo cú đánh. Tên được nhớ trên máy cho lần sau.
- **Nhân vật:** bảng bên trái menu cho đổi màu áo, quần, da, tóc, vợt và kiểu tóc (trên điện thoại bấm nút **Nhân vật**). Lựa chọn được nhớ trên máy. Khi chơi LAN, mọi người trong sân thấy đúng nhân vật bạn chọn, ghế do máy đánh mặc màu mặc định.
- **Xem các sân khác:** lúc đang đánh, các sân bên cạnh hiện trận thật của người khác (có bảng tên). Trong tab **Chơi với người**, chọn một sân đang đấu rồi bấm **XEM SÂN n** để xem như khán giả. Phím ◀ ▶ (hoặc A / D) để chuyển sân, Esc để thoát.
- **Số người online:** góc trên bên phải hiện số người đang mở game trên mạng LAN, cả người chưa vào sân. Tab **Chơi với người** có số người đang ở trong sân.
- **Sân đầy:** danh sách sân ghi "đã đầy" và nút vào sân bị khoá. Server cũng từ chối nếu ai đó cố vào.

- **Chủ sân:** người vào sân trống đầu tiên. Thể thức chủ sân chọn (đơn hay đôi) áp dụng cho cả sân, và chủ sân bấm **BẮT ĐẦU** khi mọi ghế đã có người hoặc máy.
- **Va vào đồng đội:** khi đánh đôi, hai người cùng đội chạy vào cùng một chỗ (sát nhau) thì cả hai té. Té rồi đứng dậy mất 0,5 giây, trong lúc đó không chạy, không nhảy, không đánh được. Áp dụng cho cả người và máy.
- **Số người:** đánh đơn 2 người, đánh đôi tối đa 4 người. Thiếu người thì chủ sân bấm **+ Thêm máy** ở ghế trống, hoặc **+ THÊM MÁY VÀO GHẾ TRỐNG** để điền hết một lần. Chỉ có một mình chủ sân cũng chơi được. Trận chỉ bắt đầu khi mọi ghế đã có người hoặc máy.
- **Chọn vị trí:** trong phòng chờ, bấm vào một ô còn trống (sân gần hoặc sân xa, ô phải hoặc ô trái) để chuyển vào đó. Chủ sân cũng đổi được. Người mới vào được xếp tạm vào ô trống đầu tiên. Chỉ đổi được trước khi bấm **BẮT ĐẦU**.
- **Vào, ra giữa trận:** có người vào giữa trận thì thay máy ở ghế trống. Có người rời thì máy đánh tiếp ghế đó. Chủ sân rời thì sân đóng lại.
- **5 sân là 5 phòng riêng:** 5 trận chạy cùng lúc được. Menu hiện số người đang ở mỗi sân.

Đổi cổng: `PORT=8080 node server.js`.

## Nhân vật

Nhân vật dùng model người thật trong bộ **Universal Base Characters** của [Quaternius](https://quaternius.com) (giấy phép CC0, xem `assets/characters/LICENSE.txt`). Bảng **Nhân vật** cho chọn dáng nam hoặc nữ. Áo, quần, tất được tô lên người theo màu bạn chọn, giày được dựng riêng.

- Game vẫn tính tư thế bằng bộ khung đơn giản như trước (vung vợt, chạy, nhảy), rồi chép tư thế đó sang khung xương của model mỗi khung hình.
- Model nằm trong `assets/characters/` (khoảng 3 MB) và do `server.js` phục vụ. Trang không có server, ví dụ bản Artifact trên claude.ai, không tải được model nên dùng nhân vật đơn giản như cũ.

## Đồ hoạ

Nút **Đồ hoạ** ở đầu menu (và trong màn tạm dừng) đổi lần lượt giữa các mức sau. Lựa chọn được nhớ trên máy.

- **Tự động** (mặc định): bắt đầu ở độ nét cao nhất. Nếu game chạy dưới khoảng 50 FPS, độ nét tự hạ từng bậc, thấp nhất là ×1.
- **Cao**: độ nét ×2, bóng đổ mềm.
- **Vừa**: độ nét ×1,5.
- **Thấp**: độ nét ×1, bóng đổ nhẹ hơn. Dành cho máy yếu.

Bấm **F3** để hiện số FPS ở góc dưới bên trái.

Lần đầu chạy, server tải Three.js về thư mục `vendor/`. Từ lần sau, chơi LAN không cần Internet.

### Máy kia không vào được?

- **Tường lửa macOS:** lần đầu chạy, macOS có thể hỏi có cho `node` nhận kết nối không. Chọn **Cho phép** (Allow).
- **Hai máy phải cùng một mạng:** Wi-Fi khách hoặc mạng công ty thường chặn các máy nói chuyện với nhau.
- **Dùng đúng link:** mở link `192.168…` mà server in ra, không dùng `localhost` trên máy kia.

## Cách hoạt động

- **Máy chủ sân chạy trận đấu:** toàn bộ luật (cả luật giao cầu và đổi ô khi đánh đôi), vật lý của quả cầu, người chơi máy và tính điểm đều chạy trên máy này.
- **Các máy khác chỉ điều khiển và hiển thị:** gửi thao tác phím lên, nhận lại trạng thái trận khoảng 60 lần mỗi giây, camera đặt ở phía sân của mình. Nhân vật của chính mình chạy ngay trên máy mình, không chờ mạng.
- **Hình mượt dù mạng chập chờn:** qua Internet, tin đến không đều, có lúc dồn cả cụm. Mỗi máy giữ lại các bản trạng thái vừa nhận và vẽ người chơi khác cùng quả cầu lùi lại một chút (thường 40 đến 100 ms, tự chỉnh theo mạng), nội suy giữa hai bản đã có thay vì đoán trước. Chủ sân cũng vẽ người chơi khách theo cách này. Bấm **F3** để xem độ trễ vẽ hiện tại.
- **Đánh trúng là trúng:** máy khách tự xét cú đánh của mình theo đúng những gì màn hình mình đang thấy, rồi gửi lên kèm thời điểm. Máy chủ sân kiểm tra lại, đưa quả cầu về đúng thời điểm đó, áp cú đánh rồi cho trận chạy tiếp tới hiện tại. Cầu rơi bên phía có người chơi khách thì máy chủ sân chờ màn hình người đó cũng thấy cầu chạm đất (tối đa 0,6 giây) rồi mới tính điểm.
- **Vai trò của `server.js`:** giữ danh sách người ở 5 sân và chuyển tin giữa chủ sân với những người còn lại. Người nào kết nối đang nghẽn thì bỏ qua bản trạng thái cũ, chỉ gửi bản mới nhất.
- **Rớt mạng giữa trận:** server gửi nhịp tim 2 giây một lần. Máy khách 6 giây không nghe thấy gì (Wi‑Fi chập chờn, trình duyệt tạm dừng tab, máy ngủ) thì tự kết nối lại, tối đa 8 lần, và về đúng ghế cũ. Trong lúc đó máy đánh thay ghế ấy. Chủ sân rớt mạng thì sân vẫn đóng như trước.

`san-cau-so-7.html` vừa là trang game, vừa là nội dung của bản Artifact trên claude.ai. Bản Artifact chỉ chơi được với máy, vì trang Artifact không được mở kết nối mạng.
# Badminton_vibe_coding
# Badminton_vibe_coding
