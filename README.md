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

Mọi người nhập **tên**, chọn **cùng một sân** (1 đến 5) rồi bấm **CHƠI LAN**.

- **Tên:** hiện ở đúng vị trí người đó đứng trong phòng chờ, trên đầu nhân vật lúc đánh, và trong các thông báo cú đánh. Tên được nhớ trên máy cho lần sau.
- **Số người online:** góc trên bên phải hiện số người đang mở game trên mạng LAN, cả người chưa vào sân. Menu ghi thêm có bao nhiêu người đang ở trong sân.
- **Sân đầy:** menu ghi "đầy" và nút **CHƠI LAN** bị khoá. Server cũng từ chối nếu ai đó cố vào.

- **Chủ sân:** người vào sân trống đầu tiên. Thể thức chủ sân chọn (đơn hay đôi) áp dụng cho cả sân, và chủ sân bấm **BẮT ĐẦU** khi đã có ít nhất một người vào.
- **Số người:** đánh đơn 2 người. Đánh đôi tối đa 4 người, ghế trống do máy đánh.
- **Chọn vị trí:** trong phòng chờ, bấm vào một ô còn trống (sân gần hoặc sân xa, ô phải hoặc ô trái) để chuyển vào đó. Chủ sân cũng đổi được. Người mới vào được xếp tạm vào ô trống đầu tiên. Chỉ đổi được trước khi bấm **BẮT ĐẦU**.
- **Vào, ra giữa trận:** có người vào giữa trận thì thay máy ở ghế trống. Có người rời thì máy đánh tiếp ghế đó. Chủ sân rời thì sân đóng lại.
- **5 sân là 5 phòng riêng:** 5 trận chạy cùng lúc được. Menu hiện số người đang ở mỗi sân.

Đổi cổng: `PORT=8080 node server.js`.

Lần đầu chạy, server tải Three.js về thư mục `vendor/`. Từ lần sau, chơi LAN không cần Internet.

### Máy kia không vào được?

- **Tường lửa macOS:** lần đầu chạy, macOS có thể hỏi có cho `node` nhận kết nối không. Chọn **Cho phép** (Allow).
- **Hai máy phải cùng một mạng:** Wi-Fi khách hoặc mạng công ty thường chặn các máy nói chuyện với nhau.
- **Dùng đúng link:** mở link `192.168…` mà server in ra, không dùng `localhost` trên máy kia.

## Cách hoạt động

- **Máy chủ sân chạy trận đấu:** toàn bộ luật (cả luật giao cầu và đổi ô khi đánh đôi), vật lý của quả cầu, người chơi máy và tính điểm đều chạy trên máy này.
- **Các máy khác chỉ điều khiển và hiển thị:** gửi thao tác phím lên, nhận lại trạng thái trận khoảng 60 lần mỗi giây, camera đặt ở phía sân của mình.
- **Vai trò của `server.js`:** giữ danh sách người ở 5 sân và chuyển tin giữa chủ sân với những người còn lại.

`san-cau-so-7.html` vừa là trang game, vừa là nội dung của bản Artifact trên claude.ai. Bản Artifact chỉ chơi được với máy, vì trang Artifact không được mở kết nối mạng.
# Badminton_vibe_coding
