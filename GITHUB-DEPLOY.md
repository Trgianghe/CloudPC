# Chạy Cloud PC từ GitHub Pages

GitHub Pages chỉ phục vụ web client. Windows host vẫn chạy ở máy của bạn;
video/input đi qua WebRTC giữa thiết bị và host, không đi qua máy chủ GitHub.

1. Đưa mã nguồn vào `Trgianghe/CloudPC`, nhánh `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**. Chạy workflow
   **Publish Cloud PC player**. Chỉ khi workflow xanh mới có trang
   `https://trgianghe.github.io/CloudPC/`.
3. Host cần tên miền HTTPS với chứng chỉ hợp lệ. Dùng `Caddyfile.example`,
   trỏ DNS tới máy/proxy, reverse proxy tới `127.0.0.1:8443`.
   Trong `config.json` của web chính đặt `"public_origin": "https://TEN-MIEN-HOST"`
   và khởi động lại web: nếu không, kết nối qua proxy loopback có thể bị nhận nhầm là thử cùng host.
   HTTPS/WSS chỉ là signaling: mạng WebRTC còn cần đường UDP trực tiếp hoặc TURN.
   Nếu CGNAT, dùng TURN có xác thực; điền `ice_servers` vào cấu hình signaling.
4. Trong **file riêng** `cloud-native/server.config.json`, thêm:
   `"client_origins": ["https://trgianghe.github.io"]` và khởi động lại dịch vụ.
   Không dùng wildcard. Origin không chứa `/CloudPC/`.
5. Sao chép `client.config.example.json` thành file riêng, điền địa chỉ
   `wss://TEN-MIEN-HOST/signal`, phòng và **client_token** tương ứng.
   Không đưa file chứa token lên GitHub, không dùng host_token trên điện thoại.
6. Mở trang web chính trên Pages bằng điện thoại → Thêm PC → Nhập file config
   client → Kết nối ngay. Cloud Settings nằm trong phiên PC: kéo thanh trắng sang trái.
   Web tự dùng ICE servers do signaling đã xác thực cung cấp.

Không dùng `127.0.0.1` trên điện thoại: đó là chính điện thoại.
Trang HTTPS không thể dùng signaling HTTP/WS không bảo mật.
Nếu host chưa có địa chỉ WSS công khai, Pages vẫn mở giao diện nhưng chưa kết nối PC được.

## Tối ưu và kiểm chứng độ trễ

Parsec mô tả pipeline capture → encode → mạng → decode và dùng tăng tốc phần cứng:
https://support.parsec.app/hc/en-us/articles/32361354307348-Overview
Sunshine cũng là host stream dùng hardware encoding cho Moonlight:
https://docs.lizardbyte.dev/projects/sunshine/latest/

Bản này dùng DXGI, NVENC P1/ULL, CBR, không B-frame/lookahead, VBV một frame,
RTP playout-delay được thương lượng, input nhị phân qua DataChannel.
H.264 hiện truyền RTP trực tiếp từ encoder qua socket loopback vào WebRTC;
không dùng bước gom Annex-B chờ frame kế tiếp. Timestamp/sequence được giữ liên tục
khi khởi động lại encoder do đổi chất lượng. AV1/HEVC vẫn dùng đường muxer trước đó.
Preset FPS bắt đầu ở 720p120/15 Mbps; tăng lên 1080p khi decode/buffer ổn định.
Chọn 60 FPS nếu điện thoại không duy trì 120 FPS; bitrate cao không tự giảm trễ.

Chế độ `capture_mode: gpu` chỉ nên bật khi màn hình và encoder ở GPU tương thích
và FFmpeg có `scale_d3d11`. Máy hybrid AMD/NVIDIA hiện dùng `copy` để tương thích:
vẫn có bước VRAM → RAM → GPU. Không gọi đây là zero-copy.

Để kiểm thử: host cắm Ethernet, điện thoại Wi-Fi 5/6 GHz gần router; kiểm tra
FPS nhận, decode, jitter buffer, loss và RTT. Đo phản hồi tổng bằng quay chậm
cả thao tác và hình ảnh, không cộng RTT và decode rồi gọi đó là click-to-photon.
Chế độ thử trên chính host có chặn phản hồi chuột, không dùng để chấm FPS gaming.
TURN xa host và mạng di động dao động có thể làm tăng trễ dù giao diện mượt.

GitHub Pages không làm encoding nhanh hơn. Không bảo đảm 0 ms hoặc dưới 25 ms
trên mọi thiết bị/mạng; cần đo phiên thật trên điện thoại.

Tài liệu Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
