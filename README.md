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

- **Đánh với máy:** trang chạy qua máy chủ chỉ còn tab **Chơi với người**. Muốn đánh với máy (một mình, hoặc thiếu người), vào một sân trống rồi thêm máy vào ghế trống. Trình độ của máy chọn ngay trong tab này. Bản một file `dist/san-cau-so-7.html` (không có máy chủ) vẫn chỉ có phần đánh với máy như cũ.

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

- **Siêu anh hùng:** các lựa chọn dưới đây đều là thiết kế riêng của game, không lấy theo nhân vật có bản quyền nào.
  - **Thân hình cơ bắp:** vai, tay, ngực và đùi to ra.
  - **Trang phục:** chọn **Áo quần** thường, hoặc một bộ đồ bó liền thân có hoa văn **Chữ V**, **Tia chớp**, **Sọc hông** hay **Ngôi sao**.
    - Bộ đồ lấy màu ở hàng **Màu bộ đồ**.
    - Hoa văn, găng tay, ủng và quần ngắn bên ngoài lấy **Màu phụ**.
  - **Mặt nạ:** **Bịt mắt** hoặc **Trùm đầu** (che cả tóc, có hai mắt kính trắng).
  - **Áo choàng:** bay ra sau khi chạy, phồng lên khi rơi xuống sau cú nhảy.
  - **Da xanh lá, xanh dương, tím** và kiểu tóc **Dựng**.
  - Trang không tải được model (bản Artifact) chỉ hiện được áo choàng.
- Game vẫn tính tư thế bằng bộ khung đơn giản như trước (vung vợt, chạy, nhảy), rồi chép tư thế đó sang khung xương của model mỗi khung hình.
- Model nằm trong `assets/characters/` (khoảng 3 MB) và do `server.js` phục vụ. Trang không có server, ví dụ bản Artifact trên claude.ai, không tải được model nên dùng nhân vật đơn giản như cũ.
- **Tiếng hô khi nhảy đập:** mỗi cú nhảy đập (của người hay của máy) phát câu "Sao mà đỡ được!" (`assets/sfx/sao-ma-do-duoc.m4a`), trên mọi máy trong sân, đúng lúc cú đập hiện trên màn hình máy đó. Nút tắt tiếng cũng tắt câu này. Trang không có server thì không có tiếng hô.
- **Âm thanh cuối trận:** khi bảng kết quả hiện ra, máy của đội thắng phát nhạc chúc mừng khoảng 3 giây (`assets/sfx/chien-thang.m4a`), máy của đội thua phát câu "Rồi rồi, mày xong rồi" (`assets/sfx/thua-tran.m4a`). Nút tắt tiếng cũng tắt hai đoạn này.
- **Hình phạt cho đội thua:** hết trận, bảng kết quả của đội thắng hiện ba hình phạt: **Quỳ gối gọi cha**, **Làm con bò**, **Quỳ lạy xin tha**. Đội thua thấy dòng "đang chọn hình phạt…" và chờ. Ai bên đội thắng bấm trước thì tính. Đội thua ra giữa sân của mình diễn hình phạt khoảng 8 giây, có bóng thoại, camera mọi máy quay lại gần để xem; xong thì bảng kết quả hiện lại. Nếu bên thắng chỉ có máy thì máy tự chọn.

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

## Chơi qua Internet

Đưa máy chủ lên Render bằng `render.yaml`: Render chạy `server.js` như khi chơi LAN. Gói miễn phí ngủ sau 15 phút không ai vào, lần mở đầu tiên chờ khoảng 1 phút.

## Cách hoạt động

- **Máy chủ sân chạy trận đấu:** toàn bộ luật (cả luật giao cầu và đổi ô khi đánh đôi), vật lý của quả cầu, người chơi máy và tính điểm đều chạy trên máy này.
- **Các máy khác chỉ điều khiển và hiển thị:** gửi thao tác phím lên, nhận lại trạng thái trận khoảng 60 lần mỗi giây, camera đặt ở phía sân của mình. Nhân vật của chính mình chạy ngay trên máy mình, không chờ mạng.
- **Hình mượt dù mạng chập chờn:** qua Internet, tin đến không đều, có lúc dồn cả cụm. Mỗi máy giữ lại các bản trạng thái vừa nhận và vẽ người chơi khác cùng quả cầu lùi lại một chút (qua Render thường 100 đến 400 ms, tự chỉnh theo mạng sao cho gần như mọi bản đều đến kịp), nội suy giữa hai bản đã có thay vì đoán trước. Chủ sân cũng vẽ người chơi khách theo cách này. Bấm **F3** để xem độ trễ vẽ hiện tại.
- **Đánh trúng là trúng:** máy khách tự xét cú đánh của mình theo đúng những gì màn hình mình đang thấy, rồi gửi lên kèm thời điểm. Máy chủ sân kiểm tra lại, đưa quả cầu về đúng thời điểm đó, áp cú đánh rồi cho trận chạy tiếp tới hiện tại. Cầu rơi bên phía người chơi khách mà người đó còn kịp chạy tới đánh trên màn hình của mình, thì máy chủ sân chờ màn hình người đó thấy cầu chạm đất (tối đa 1 giây) rồi mới tính điểm. Người đứng xa quá thì điểm được tính ngay.
- **Xem sân và các sân bên cạnh:** chủ sân gửi bản tóm tắt trận khoảng 10 lần mỗi giây, kèm thời điểm và cú đánh gần nhất. Người xem vẽ trận lùi lại khoảng 0,15 đến 0,2 giây, nội suy giữa hai bản tóm tắt, và vẽ quả cầu bay đúng từ chỗ cú đánh xảy ra.
- **Mọi màn hình cùng thấy một khoảnh khắc:** khi có người chơi qua mạng, máy chủ sân cũng vẽ quả cầu, người chơi máy, điểm và âm thanh lùi lại đúng bằng độ trễ của máy khách (khách tự đo và báo lên, F3 hiện con số này). Nhờ vậy cầu chạm đất cùng lúc trên mọi máy. Nhân vật của chính chủ sân vẫn chạy ngay; cú đánh và cú giao cầu của chủ sân được xét theo những gì màn hình chủ sân thấy, rồi đưa về đúng thời điểm đó như cú đánh của khách.
- **Điểm hiện đúng lúc cầu chạm đất:** máy khách đổi điểm, phát âm thanh và hiện thông báo khi quả cầu trên màn hình mình chạm đất, không phải lúc tin từ chủ sân vừa đến.
- **Vai trò của `server.js` (logic sân trong `lobby.js`):** giữ danh sách người ở 5 sân và chuyển tin giữa chủ sân với những người còn lại. Người nào kết nối đang nghẽn thì bỏ qua bản trạng thái cũ, chỉ gửi bản mới nhất.
- **Rớt mạng giữa trận:** server gửi nhịp tim 2 giây một lần. Máy khách 6 giây không nghe thấy gì (Wi‑Fi chập chờn, trình duyệt tạm dừng tab, máy ngủ) thì tự kết nối lại, tối đa 8 lần, và về đúng ghế cũ. Trong lúc đó máy đánh thay ghế ấy. Chủ sân rớt mạng thì sân vẫn đóng như trước.

## Mã nguồn

Trang game được chia thành nhiều file nhỏ trong `src/` (xem bản đồ file trong `CLAUDE.md`):

- `src/index.html`: khung trang (menu, HUD).
- `src/style.css`: toàn bộ CSS.
- `src/game/01-core.js` … `17-loop.js`: mã game, mỗi file một phần (vật lý cầu, sân, nhân vật, AI, điều khiển, menu, LAN, vòng lặp…).

`build.js` ghép các file này lại theo thứ tự tên, bọc mã game trong một hàm `(() => { ... })()`, nên mọi file dùng chung biến với nhau như khi còn là một file. `server.js` ghép lại mỗi lần tải trang, nên sửa xong chỉ cần F5.

Cần bản một file (cho Artifact trên claude.ai, hoặc mở thẳng trong trình duyệt): chạy `node build.js` (hoặc `npm run build`), kết quả ở `dist/san-cau-so-7.html`. Bản Artifact chỉ chơi được với máy, vì trang Artifact không được mở kết nối mạng.
# Badminton_vibe_coding
# Badminton_vibe_coding
