# PC Cloud

Nếu trình duyệt báo `ERR_CONNECTION_REFUSED` tại `127.0.0.1:8443`, host chưa chạy hoặc đã dừng. Nhấp đúp **`open_web.bat`** để mở web local: script kiểm tra host, khởi chạy nền trong phiên người dùng nếu cần, chờ `/api/health` rồi mở trình duyệt. Host tiếp tục chạy khi đóng cửa sổ launcher/trình duyệt; lỗi khởi động nằm trong `runtime_logs`. Launcher chỉ mở localhost, không tự chạy khi bật Windows. Dùng `start.ps1` như bên dưới để chạy theo cấu hình LAN/cloud và giữ cửa sổ host để xem log.

Web chính ở cổng **8443** đã tích hợp chuột Desktop/Gaming: `web/mouse_controller.js` + `web/stream-controls.js`. Mở cài đặt trong phiên để chọn Desktop (chuột local, tọa độ tuyệt đối và wheel) hoặc Gaming 360° (Pointer Lock, relative; Esc về Desktop). `server.py` nhận kênh binary `mouse-v2`, dùng `mouse_input.py` để kiểm tra packet và map đúng màn hình/virtual desktop; DPI Per Monitor V2, capture NVENC không ghép cursor (`draw_mouse=0`). Bàn phím và profile cảm ứng vẫn dùng giao diện chính. Khi xem trên chính host, input tiếp tục bị chặn để tránh vòng lặp.

Chuột dùng bốn opcode theo đặc tả, little endian; thêm snapshot `0x05` (6 bytes: sequence:uint32, mask:byte với bit0 trái/bit1 giữa/bit2 phải) mỗi 50 ms để sửa mouse-up bị mất. Snapshot cũ bị bỏ. Local cursor không chờ mạng; chưa xác nhận độ trễ input dưới 1 ms hoặc input-to-photon dưới 25 ms. Cursor do game/driver tự vẽ vào frame vẫn có thể hiện; Windows vẫn chỉ có một cursor trong mỗi desktop session. Các giới hạn này giống bản Go được mô tả trong `cloud-native/README.md`.

Bản mới theo yêu cầu **Go/Pion + Node signaling + client HTML độc lập**, cùng bảng Cloud Settings theo `test2.html`, nằm trong [`cloud-native/`](cloud-native/README.md). Chạy `cloud-native\setup.ps1 -Build`, sau đó `start_signaling.ps1` và `start_host.ps1` trong thư mục đó. Bản Python bên dưới vẫn được giữ riêng.

Web quản lý và điều khiển **toàn bộ desktop Windows** từ điện thoại. Giao diện tiếng Việt lấy cảm hứng từ nền tảng cloud của [EzyCloudX](https://www.ezycloudx.com/), sử dụng thương hiệu và giao diện riêng.

## Khởi chạy trên PC cần điều khiển

Yêu cầu Windows 10/11, Python 3.11–3.13 64-bit, PC đang đăng nhập vào desktop. Không chạy dịch vụ này trong Windows Session 0. Không cần cài ứng dụng trên điện thoại.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Setup
```

Script tạo `.venv`, cài thư viện, tạo `config.json` với mã truy cập ngẫu nhiên rồi chạy host. Lần sau chỉ chạy `start.ps1`. Giữ cửa sổ host mở; Ctrl+C để dừng. Cấu hình thực và mã truy cập không đưa vào Git.

1. Xem IP PC qua `ipconfig`.
2. Cùng Wi-Fi, mở `http://IP-PC:8443` trên điện thoại. Nếu Windows hỏi quyền tường lửa, cho phép trên mạng bạn dùng.
3. Chọn **Kết nối PC**, nhập mã `access_code` trong `config.json` và chọn chất lượng.
4. Khi kết nối thành công, video là màn hình thật và các nút gửi bàn phím/chuột thật vào Windows.
5. Có thể lưu cả mã truy cập trong hồ sơ PC bằng lựa chọn lưu cấu hình. Nếu bỏ chọn, mã chỉ dùng cho phiên hiện tại. Hồ sơ PC và bố cục nút lưu riêng trên từng trình duyệt.

Trong hộp **Kết nối máy tính**, nhấn **Chọn file config.json** để tự điền tên PC, địa chỉ host, mã truy cập, độ phân giải và FPS. File được đọc tại trình duyệt, không tải lên máy chủ và không ghi đè cấu hình host. File hỗ trợ UTF-8 có BOM do Windows PowerShell tạo. Nếu `host` là `0.0.0.0` hoặc địa chỉ loopback, web dùng địa chỉ trang đang mở; `url` hoặc `public_origin` được ưu tiên nếu có. Sau khi kiểm tra thông tin, nhấn **Kết nối ngay**. File sai hoặc quá 64 KB sẽ báo lỗi mà không thay đổi các ô đang nhập.

Địa chỉ host khác với trang hiện tại sẽ đưa người dùng sang web chạy trên host đó và yêu cầu nhập mã tại đó. Không đặt mã hay mật khẩu trong link chia sẻ. Một PC chỉ có một phiên điều khiển cùng lúc.

## Qua Internet

Đặt host sau tên miền HTTPS / reverse proxy có chứng chỉ hợp lệ, hoặc cấu hình `tls_cert` và `tls_key` trong `config.json`. Dùng mạng riêng như Tailscale hoặc cấu hình router phù hợp nếu PC không có địa chỉ truy cập trực tiếp. Không gửi mã qua HTTP trên mạng công cộng.

HTTPS cho trang web chưa đủ để đảm bảo WebRTC đi qua mọi mạng. Video dùng ICE/UDP, không đi qua proxy HTTP thông thường. Máy và điện thoại cần đường truyền trực tiếp hoặc TURN. Khai báo TURN do bạn quản lý trong `ice_servers`:

```json
[
  {"urls":"stun:stun.l.google.com:19302"},
  {"urls":"turn:turn.example.com:3478","username":"user","credential":"password"}
]
```

Khởi động lại host sau khi sửa cấu hình. Thông tin TURN được cung cấp cho trình duyệt sau khi xác thực; nên dùng tài khoản ngắn hạn ở môi trường sản xuất. Mạng doanh nghiệp/4G có thể chặn UDP hoặc NAT không tương thích; TURN cần địa chỉ và cổng truy cập được. Xem [ICE của aiortc](https://aiortc.readthedocs.io/en/latest/api.html).

`Caddyfile.example` có cấu hình proxy HTTPS tối thiểu. Dùng tên miền thật, chứng chỉ hợp lệ và cổng 80/443 truy cập được. Khi dùng proxy, đặt `host` trong `config.json` thành `127.0.0.1`. Proxy cần giữ Host header và chuyển tiếp địa chỉ HTTPS; API nhận Origin HTTPS thông qua cấu hình `public_origin` bên dưới.

Nếu chạy sau proxy HTTPS, thêm `"public_origin": "https://pc.tenmien.com"` trong `config.json`. Host chỉ chấp nhận Origin đó hoặc origin trực tiếp của host. Không tự tin vào X-Forwarded headers từ nguồn bất kỳ.

## Điều khiển trên điện thoại

### Cài đặt nút ngay trong phiên chơi

Thanh ngang **Cài đặt** nằm ở góc trên bên phải vùng game. Kéo nhẹ sang trái hoặc chạm để mở menu; kéo sang phải/nhấn X để thu lại.

1. Chọn **Chỉnh vị trí và hình dạng nút**. Kéo nút trên màn hình đến vị trí bạn muốn. Có thể thu menu để nhìn toàn bộ màn hình; chế độ chỉnh vẫn được giữ.
2. Chạm một nút để chọn. Menu cho phép đổi **hình tròn / hình vuông**, kích thước 36–100 px, độ trong suốt, phím hoặc thao tác chuột. Có thể thêm và xóa nút ngay trong phiên.
3. Nhấn **Lưu**, nhập tên profile rồi chọn **Lưu profile & dùng bố cục này**. Dùng lại tên đã có sẽ cập nhật profile đó; tên mới tạo một profile khác.
4. Chạm profile trong danh sách để nạp toàn bộ bố cục. Profile được chọn gần nhất tự nạp sau khi tải lại trang. Nút **Hủy** khôi phục bố cục trước khi sửa.

Trong lúc menu mở hoặc đang chỉnh nút, bàn phím, chuột, cảm ứng và cuộn đều không được chuyển tiếp vào PC. Phím đang giữ được thả khi vào cài đặt. Video và heartbeat vẫn tiếp tục; game trên PC vẫn chạy, không được tự động tạm dừng. Đóng menu sau khi lưu hoặc hủy để tiếp tục điều khiển.

Profile lưu trong localStorage của trình duyệt đang dùng, không đồng bộ giữa điện thoại và máy tính. Thay đổi chưa lưu không ghi đè profile; ngắt phiên đang chỉnh sẽ hủy bản nháp.

- Bộ FPS, đua xe và desktop; thêm tối đa 40 nút, tổ hợp phím, chuột trái/phải/giữa, giữ hoặc chạm.
- Trong phiên, chọn **Bố cục**, kéo từng nút đến vị trí mong muốn rồi lưu. Xuất/nhập JSON ở trang Bộ điều khiển.
- Vuốt vùng màn hình để di chuyển chuột, chạm nhanh để click trái. Nút chuột có thể giữ để kéo hoặc bắn/ngắm.
- Bàn phím trên màn hình gồm chữ, số, F1–F12, phím điều hướng và phím chức năng. Bàn phím/chuột vật lý cũng được chuyển tiếp khi phiên đang mở.
- Phím đang giữ được thả khi mất focus, ẩn trang, pointer cancel hoặc ngắt kết nối; host có watchdog đóng phiên sau 12 giây mất heartbeat.

Một số phím hệ thống và tổ hợp như Ctrl+Alt+Delete không thể truyền như thao tác thông thường. Ứng dụng chạy quyền quản trị/UAC có thể không nhận input từ host chạy quyền thường. Game có anti-cheat hoặc yêu cầu raw input đặc thù có thể hạn chế thao tác mô phỏng.

## RDP và dịch vụ khác

Tab Remote Desktop tạo file `.rdp` từ IP, cổng và tài khoản. Mật khẩu nhập trong ứng dụng Remote Desktop. Tính năng này cần RDP đã bật trên Windows và mạng truy cập được.

Trình duyệt không nói giao thức RDP trực tiếp. Muốn dùng RDP/VNC/SSH trong web, thiết lập [Apache Guacamole](https://guacamole.apache.org/doc/gug/guacamole-architecture.html) và thêm URL của gateway trong tab **Web / App khác**. Web mở gateway trong tab mới; tài khoản được xử lý tại gateway. Link HTTPS các dịch vụ khác cũng được mở theo cách đó. Không giả định một mật khẩu có thể dùng chung cho mọi giao thức.

## Phạm vi bản hiện tại

Đã có host WebRTC, xác thực bằng mã riêng, screen capture, input Windows, bộ nút cảm ứng và cấu hình RDP. Trang **Khám phá giao diện** là preview được ghi rõ; không phải PC đang kết nối. Trạng thái card là loại kết nối, không phải trạng thái online được suy đoán.

Trên máy có FFmpeg hỗ trợ `ddagrab` và NVIDIA NVENC, host ưu tiên đường native: FFmpeg chụp DXGI và mã hóa H.264; Python chỉ đóng gói packet vào WebRTC. Máy này đã có FFmpeg trong PATH. Máy khác cần cài FFmpeg có NVENC/DDAGRAB để dùng đường này; nếu không có/khởi tạo lỗi, host tự dùng đường Python bên dưới. Đặt `native_capture: false` để tắt đường native khi cần chẩn đoán. Không tự tải hoặc cài FFmpeg lúc khởi chạy.

Đường native có hàng đợi giới hạn và bỏ frame cũ khi nghẽn; sau bỏ frame sẽ chờ IDR để không giải mã sai. Mạng yếu có thể giật ngắn khi giảm bitrate; host tái khởi tạo encoder tối đa một lần mỗi 4 giây. Keyframe cách nhau khoảng 0.5 giây để phục hồi khi mất gói. Capture native ẩn con trỏ Windows; web vẽ con trỏ remote riêng.

Host ưu tiên **DXGI capture + H.264 GPU NVENC/AMF/Quick Sync**, fallback MSS/CPU nếu phần cứng không hỗ trợ. Truyền frame mới nhất, không xếp hàng frame cũ. Chọn độ phân giải, 30/60/90/120 FPS và bitrate 12/20/35/50 Mbps; host giới hạn mặc định 2560 px, 120 FPS, 50 Mbps. Hình ảnh không được phóng lớn vượt độ phân giải màn hình host. Con số chọn là yêu cầu; FPS trên thanh phiên được đo từ frame giải mã thực tế. RTT đo khứ hồi data channel, không phải tổng độ trễ từ thao tác đến hình ảnh.

Host chưa truyền âm thanh hệ thống và chưa có driver tay cầm Xbox ảo. Chưa đo tổng độ trễ khi chơi game hoặc mạng Internet; không cam kết mọi thiết bị đạt 120 FPS.

## Parsec và chuột

Tab **Parsec** mở [trang đăng nhập Parsec chính thức](https://web.parsec.app/) trong tab mới. Cài/bật Parsec Host trên PC cần truy cập và đăng nhập tài khoản tại Parsec. Đây là chuyển sang dịch vụ Parsec, chưa tích hợp SDK hoặc phiên Parsec vào video/bộ nút của PC Cloud. Có thể dùng ứng dụng Parsec desktop để tận dụng khả năng của client native.

Trong phiên WebRTC, **Bắt chuột** khóa chuột bên điều khiển vào vùng chơi; Esc để thả. Khi chưa bắt chuột, nhấn giữ và kéo để di chuyển; rê chuột thông thường không chuyển tiếp. Vị trí chuột host được hiển thị bằng con trỏ riêng trong video. Vị trí click được gửi trước thao tác click trên kênh tin cậy; chuyển động liên tục dùng kênh không truyền lại để tránh tích lũy độ trễ.

Khi đăng nhập từ localhost hoặc IP của chính host và không cấu hình proxy public_origin, web chuyển sang **Xem thử cùng PC**, chặn input cả client và server để tránh vòng lặp. Dùng điện thoại hoặc máy khác để điều khiển thật. Với proxy public_origin, việc nhận diện cùng PC không tự động áp dụng do proxy có thể chuyển mọi kết nối thành địa chỉ localhost.

Windows có một con trỏ hệ thống trong mỗi phiên desktop. Vẽ con trỏ riêng bên client không tạo hai con trỏ Windows hoạt động độc lập trong cùng phiên. Muốn dùng chuột local và remote đồng thời trên hai desktop độc lập cần VM hoặc phiên desktop riêng; bản này chưa triển khai việc đó.

Dự án không tự thuê/cấp phát GPU hay tạo VM, chưa có tài khoản đa người dùng, thanh toán, phân quyền và gateway RDP tự vận hành. Bạn cần PC sẵn có hoặc cloud PC được cấp quyền cài host. Không thể tạo một PC cloud thật chỉ từ giao diện web.

## Kiểm tra đã thực hiện ở môi trường phát triển

- Python và JavaScript qua kiểm tra cú pháp.
- `/api/health` trả thành công, đăng nhập sai mã và offer không có phiên đều bị từ chối.
- WebRTC native trong trình duyệt localhost: 1920×1200, quan sát 114–123 FPS khi yêu cầu 120 FPS, RTT 4–7 ms, NVENC native / FFmpeg DXGI, bitrate 20 Mbps. Đây là thử màn hình desktop, chưa thử game hoặc thiết bị khác. RTT không phải độ trễ hình ảnh. Client Python đo FPS thấp hơn do khác bộ giải mã; không dùng số đó thay cho kết quả trình duyệt.
- Giao diện điện thoại rộng 390 px: không tràn ngang; thêm và xóa nút Shift+Space qua danh sách phím.
- Menu cài đặt trong phiên: kéo thanh ngang mở menu, kéo nút, lưu/nạp profile, khôi phục đúng vị trí sau tải lại và hủy sửa hình dạng. Kênh gửi input được kiểm tra bằng `check_session_input.cjs`: chặn phím, chuột, di chuyển và cuộn khi cấu hình; vẫn gửi heartbeat/thả phím và khôi phục điều khiển sau cấu hình.
- Chưa đo độ trễ tổng hoặc thử chơi game, chưa thử điện thoại thật/4G/TURN/RDP gateway.

Host chạy trong sandbox không chụp được màn hình Windows (BitBlt timeout); chạy trong phiên desktop với quyền truy cập phù hợp thì kiểm tra nhận video thành công. Host thử riêng chỉ bind localhost; host bạn chạy theo config.json dùng địa chỉ cấu hình.

Có thể chạy kiểm tra local bằng `.\.venv\Scripts\python.exe check_connection.py` trong khi host đang chạy HTTP trên localhost. Script không dùng được cho host chỉ bật TLS và không cần thiết để sử dụng web.

## Player native da tich hop vao web chinh (8443)

Chay `open_web.bat`: launcher khoi dong web Python, signaling Node noi bo va host Go. Dashboard van o cong 8443; ket noi PC tu dashboard se mo player native ngay trong trang, qua `/native/` va WebSocket `/signal`. Khong can mo mot web rieng o cong 9443 hay nhap lai client token.

Nhap config.json cua PC o form ket noi nhu truoc. Ma truy cap chi dung de xac thuc phien; gateway chi tra client token, khong tra host token. Config rieng cua native nam trong cloud-native va khong duoc phuc vu qua HTTP. Neu engine chua chay, web bao loi va huong dan mo open_web.bat.

Player co nen den, thanh trang 6x50, menu 320x330, bitrate 5-100 Mbps, presets 1080p120/2K60/4K60, codec H.264/AV1/HEVC theo kha nang thiet bi, WASAPI/Opus, Desktop local cursor va Gaming Pointer Lock. Profile cu duoc nap vao player, giu to hop phim; profile luu/chon trong player dong bo ve bo profile dashboard. Chinh nut khong gui input. Cac nut co vi tri, tron/vuong, kich thuoc, do trong suot va to hop VK.

Cung-host van chi xem de tranh vong lap; gateway ky thong tin cung-host bang HMAC, khong chap nhan ghi de tu browser. Mot con tro Windows trong cung session khong the tach thanh hai con tro vat ly doc lap. Dung thiet bi khac de kiem tra dieu khien that.

`fix_rdp.bat` va `scripts/check_headless.ps1` da co ngay o thu muc goc. Huong dan driver va pipeline chi tiet: cloud-native/README.md. Script RDP, driver, reboot khong tu chay khi mo web. Gamepad can ViGEmClient/ViGEmBus; Parsec/Moonlight dung ung dung va tai khoan rieng. Khong cam ket do tre thao tac <25ms; ping trong menu la RTT, FPS la so khung nhan/giai ma do tu WebRTC.


### Lưu cấu hình và Cloud Settings

Cloud Settings tự mở khi vào phiên PC. Đóng menu bằng Esc hoặc nút ×; mở lại bằng thanh trắng ở góc trên bên phải. Trang và tài nguyên giao diện dùng no-store cùng URL có phiên bản để tránh Chrome giữ player cũ.

Form kết nối có lựa chọn “Lưu cấu hình và mã truy cập trên trình duyệt này”. Khi bật rồi lưu, nút Kết nối trên thẻ PC dùng mã đã lưu trực tiếp, kể cả sau khi tải lại trang. Mã lưu trong bộ nhớ localStorage của trình duyệt này; không nằm trong link chia sẻ. Bỏ chọn rồi lưu để xóa mã khỏi hồ sơ. Nút ⚙ mở lại cấu hình PC. Hồ sơ tạo trước thay đổi này chưa có mã nên cần nhập config/mã và lưu một lần.


### Thử điều khiển ngay trên host và giao diện mới

Cloud Settings dùng kiểu trong test2.html mới: hộp 310x330, thanh trắng dọc 6x104, các lựa chọn màu xám, kéo mở theo tay. Trong menu có checkbox **Điều khiển thử trên chính host**. Bật checkbox, đợi phiên nối lại rồi đóng menu để gửi click/phím. Mặc định cùng host vẫn chỉ xem; quyền view_only cấu hình của host luôn được giữ. Chế độ thử không gửi chuyển động chuột liên tục, chỉ định vị khi bấm và tạm bỏ qua click/cuộn do chính phiên đó tiêm lại. Con trỏ Windows vẫn có thể đổi vị trí/focus khi click; đây không phải hai con trỏ Windows độc lập. Gaming 360 độ dùng thiết bị khác. Capture DXGI vẫn draw_mouse=0; không thể xóa con trỏ đã được game/driver vẽ sẵn vào hình.

Checkbox **Ẩn các nút cảm ứng** có hiệu lực ngay và lưu lựa chọn trong trình duyệt. FPS 60/120/144 là mục tiêu encode, không thay đổi tần số quét màn hình/driver. V-Sync do trình duyệt quản lý.

### Remote Desktop đã lưu

Trên thẻ PC RDP, bấm **Thông tin kết nối** để hiện IP/hostname, cổng và tài khoản, sao chép hoặc tải `.rdp`. Chỉ dùng **Sửa thông tin** khi cần đổi cấu hình. Trong tab Remote Desktop có danh sách PC RDP đã lưu. Có thể nhập JSON dạng `{"mode":"rdp","name":"Remote PC","host":"192.168.1.20","port":3389,"username":"Player"}`; mật khẩu không được nhập/lưu qua config này. File `.rdp` điền địa chỉ và tài khoản; mật khẩu do ứng dụng Remote Desktop quản lý. WebRTC host không tự cấp tài khoản Windows hoặc bật RDP.

Trong tab Remote Desktop, nút **Nhập file .rdp / JSON** đọc file ngay trên thiết bị, tự điền IP/cổng/tài khoản; hỗ trợ file Windows UTF-16 và JSON. Kiểm tra rồi bấm **Lưu máy tính**. File thiếu tài khoản thì điền tài khoản Windows đã được cấp; mật khẩu vẫn nhập trong ứng dụng Remote Desktop.

### Quét PC để tạo file Remote Desktop

Tab Remote Desktop dùng **Quét máy này** thay cho nhập JSON: chạy `open_web.bat` trên Windows PC, mở web local và bấm Quét. Dịch vụ đọc IP theo tuyến mạng hiện tại, cổng RDP trong Registry, tài khoản phiên console và trạng thái hỗ trợ/bật RDP; không đọc mật khẩu và không tự bật RDP hay firewall. **Lưu file .rdp** xuất file Windows UTF-16, không chứa mật khẩu. Quét từ Pages cần host local cổng 8443 và trình duyệt cho phép kết nối localhost; nếu không được, mở `http://127.0.0.1:8443/` trên PC. Điện thoại dùng file/hồ sơ đã lưu từ PC, không quét Windows qua trình duyệt điện thoại. Endpoint chỉ nhận yêu cầu loopback và Origin local hoặc `https://trgianghe.github.io`; từ LAN/Origin khác bị từ chối. Windows Home vẫn hiện cảnh báo không nhận RDP.

Kiểm thử quét: endpoint và UI local tự điền được thông tin, kiểm thử quyền truy cập và xuất/đọc lại UTF-16 đã qua. Sự kiện download trong trình duyệt Codex chưa được xác nhận; cần thử tải `.rdp` bằng Chrome.

Trình duyệt trong ứng dụng đã chặn fetch localhost từ Pages trong kiểm thử. Bảng sẽ hiện **Mở web local để quét**; liên kết `/?rdp=scan` mở đúng tab RDP và quét trên host local.

### Moonlight trên điện thoại

Tab **Moonlight** lưu IP/hostname PC chạy Sunshine, quét địa chỉ bằng host local, hiển thị hướng dẫn ghép đôi PIN, link Android/iOS, sao chép IP và link hồ sơ cho điện thoại. Link chỉ chứa tên PC và địa chỉ, không chứa mật khẩu/token/RDP username. Profile mở từ link chưa lưu vào trình duyệt cho đến khi người dùng chọn lưu PC. Hồ sơ không chứng minh Sunshine đang chạy; chưa kiểm thử stream Moonlight với điện thoại thật. Web không cài Sunshine, bật firewall, nhập PIN thay người dùng hay nhúng native Moonlight. Sunshine/Moonlight dùng được mà không cần RDP Pro; thiết lập theo tài liệu chính thức: https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide .


## Phát PC và tài khoản khách

Chạy `open_web.bat` trên PC host, mở **Phát PC** trên web local rồi bật phiên. Link phiên tự xác định host; thiết bị khách mở link và nhập tên/mật khẩu, không cần config/phòng. Tạm dừng thu hồi ticket và ngắt signaling của khách; thời gian tạm dừng không tính vào thời gian phát. Kết thúc hiện thống kê. Bật phiên mới tạo tài khoản ngẫu nhiên theo tiền tố; chọn và lưu tài khoản tùy chỉnh để giữ lại. Thông tin tùy chỉnh được Windows DPAPI mã hóa trong `runtime_logs/broadcast-preferences.dpapi`, không xuất lên GitHub. Phiên đang phát không tồn tại sau khi server khởi động lại.

Đây là tài khoản khách của **PC Cloud WebRTC**. RDP vẫn dùng tài khoản Windows; Moonlight ghép PIN với Sunshine; Parsec sử dụng tài khoản và quyền của Parsec. Không tự tạo tài khoản Windows hay bỏ qua xác thực các ứng dụng này. GitHub Pages chỉ chứa giao diện: host phải đang chạy và có địa chỉ HTTPS/WSS hợp lệ khi kết nối từ Pages. Link LAN cần cùng mạng và cổng web được cho phép; launcher không tự mở firewall/router. Không chia sẻ thông tin truy cập qua HTTP trên mạng không tin cậy.

Trong Cloud Setting → Điều khiển → Tùy chỉnh nút, chọn Phím/combo, joystick Di chuyển hoặc Nhìn quanh. Joystick Di chuyển cho chọn riêng bốn phím hướng; Nhìn quanh gửi delta chuột liên tục với vùng chết ở tâm. Nút chọn có tay nắm góc để tăng/giảm kích thước, lưu cùng profile và JSON. Chỉnh bố cục ngừng input vào host; hủy/tắt kết nối nhả các phím đang giữ.


### Thiết bị đầu vào và trang Phát PC

Phát PC là một view trong workspace (khung bo tròn), không phải dialog. Chỉ kết thúc phiên mới mở dialog thống kê. Thời gian/trạng thái tiếp tục chạy khi chuyển sang view khác.

Nút cảm ứng, editor và profile bố cục chỉ hiện trên điện thoại/iPad, kể cả iPad dùng user-agent desktop hoặc gắn chuột. Máy tính có màn hình cảm ứng vẫn dùng UI desktop. Bàn phím/chuột Bluetooth đã ghép đôi qua hệ điều hành gửi sự kiện bàn phím/chuột thông thường trên cả hai nhóm thiết bị. Tay cầm dùng [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads), cần trình duyệt hỗ trợ, HTTPS/localhost và nhấn một nút để trang nhận controller. Host cần ViGEmBus/ViGEmClient. Phần web không tự ghép đôi Bluetooth và không xác định thiết bị đang dùng Bluetooth hay USB.


### Thêm PC và chỉnh sửa hồ sơ

Đăng nhập tài khoản Phát PC nằm trong **Thêm máy tính của bạn → PC Cloud → Tài khoản Phát PC**. Link phiên mở trực tiếp form này và điền địa chỉ host. Mã truy cập/config host là lựa chọn riêng trong cùng form. Hồ sơ tài khoản phát chỉ lưu tên đăng nhập và thông tin máy, không lưu mật khẩu phiên hay ticket. Không có hộp đăng nhập Phát PC riêng nữa.

Sửa máy tính giữ nguyên ID hồ sơ kể cả đổi WebRTC/RDP/Moonlight/Parsec/Web, nhập config hay quét thông tin; thao tác lưu từ bảng Moonlight cũng cập nhật máy đang sửa. Chỉ mở form thêm mới mới tạo hồ sơ mới.


### Thêm PC bằng tài khoản phiên phát

- Thêm máy tính chỉ nhập tên đăng nhập Phát PC và mật khẩu phiên. Mở link Phát PC của chủ máy một lần để web biết địa chỉ host; GitHub Pages không có dịch vụ tra cứu tên tài khoản toàn cầu. Không gửi mật khẩu đến nhiều host để dò tìm.
- Sau đăng nhập thành công mới lưu PC. Bấm PC đã lưu để xem thông tin chỉ đọc, chọn ứng dụng, copy từng mục hoặc kết nối web. Không có form sửa IP/cổng trong luồng này.
- Hồ sơ giữ token phiên có thời hạn tối đa 12 giờ, không lưu mật khẩu. Tạm dừng chặn stream nhưng giữ hồ sơ. Kết thúc hiển thị máy đã tắt/hết hạn; phiên mới hoặc restart host vô hiệu token cũ. Có thể xóa hồ sơ hết hạn.
- Trạng thái được làm mới mỗi 5 giây khi trang đang mở. Mất mạng không bị coi là hết hạn: hiển thị máy chưa phản hồi.
- Thông tin RDP gồm địa chỉ/cổng/tài khoản Windows thật, không tiết lộ mật khẩu Windows. Moonlight vẫn cần Sunshine và PIN ghép đôi; Parsec vẫn cần tài khoản Parsec được host cấp quyền. Phát PC không tạo tài khoản Windows hay tự cấp quyền cho ứng dụng khác.
- Host phải cập nhật mã nguồn và chạy lại open_web.bat để có API /api/broadcast/session.

### Input và tải kết nối (2026-10-07)

- Nhấn/nhả gửi ngay snapshot nhị phân có số thứ tự. Host loại trạng thái cũ đến lệch thứ tự; heartbeat 20 ms sửa trạng thái mất gói. Không nhả W khi click bắn. Chuột chuyển động dùng kênh riêng, không xếp sau hàng đợi video.
- Cloud Setting → Điều khiển → Mở bàn phím & chuột ảo có chuột trái/phải/giữa và cuộn. Chọn nút cảm ứng cũng có lựa chọn chuột trong bàn phím chọn phím. Đóng, hủy chạm hoặc mất focus sẽ nhả input.
- Cloud Setting → Phiên hiển thị input round trip và thời gian xử lý host riêng với decode/buffer. Những số này không phải click-to-photon. Đặt 120/160 FPS không bảo đảm FPS thực nhận.
- Copy capture dùng fast bilinear giảm chi phí scale CPU; vẫn không phải zero-copy. GPU capture chỉ bật khi driver/FFmpeg tương thích. Không cam kết 0 ms hay 2K160 trên mọi máy/mạng.
- Tải RDP dùng attachment trực tiếp từ host với ticket chỉ dành cho file, một lần, 120 giây; không chứa mật khẩu Windows. Host cũ dùng Blob UTF-16 dự phòng. Xuất file không đòi RDP đã bật.
- Moonlight có quay lại bảng chọn ứng dụng, gồm cả Esc/đóng. Điện thoại chạy Moonlight; host PC cần Sunshine hoặc host giao thức tương thích và PIN lần đầu. WebRTC không thay thế giao thức này.
Bàn phím ảo và bộ chọn nút dùng cùng bố cục 108 phím (104 phím ANSI + 4 phím âm thanh). Opcode snapshot giữ nguyên; slot 254 dành riêng cho Enter cụm số E0 1C, host cần bản mới. Trên điện thoại có thể cuộn bảng bàn phím để tới cụm số; nút chuột nằm riêng.

### GPU pipeline trên laptop AMD + NVIDIA (2026-10-08)

Cấu hình `encoder: amf`, `capture_mode: amf` dùng `vsrc_amf → vpp_amf → h264_amf` cùng GPU AMD xuất màn hình. Giữ tỷ lệ ảnh, encoder async_depth=1, tắt preanalysis/preencode/B-frame; RTP đi thẳng đến WebRTC. Nhịp timestamp đơn điệu tránh gộp hai frame trùng timestamp; IDR và SPS/PPS lặp mỗi 0,5 giây để decoder có thể bắt lại hình. GPU AMD, driver AMF và FFmpeg có cả vsrc_amf/vpp_amf là điều kiện bắt buộc; không áp dụng cấu hình này cho host chỉ có NVIDIA. Các mode copy/gpu vẫn được giữ. Backup cấu hình riêng trước khi đổi mode.

Cloud Setting → Phiên hiển thị FPS mã hóa tại host riêng với FPS giải mã/trình bày ở client. FPS game cần đo tại game hoặc công cụ đo Present; không suy ra từ stream. Tốc độ encode benchmark không tương đương FPS game hay độ trễ click-to-photon.
AMF capture dừng qua lệnh q để giải phóng tài nguyên driver; nếu capture khởi tạo lỗi, host tự dùng DXGI copy + AMF encoder và báo fallback rõ trong Cloud Setting. Nếu hết 2 giây vẫn không thoát mới cưỡng chế dừng. Không coi benchmark capture là bằng chứng độ trễ điện thoại đã được sửa.
Trong phiên stream, host gửi yêu cầu SetThreadExecutionState giữ desktop/màn hình hoạt động; kết thúc phiên sẽ trả lại trạng thái trước. Không sửa power plan, không bỏ khóa màn hình, không ngăn thao tác Sleep/đóng nắp của người dùng. fallback_encoder có thể đặt nvenc trên laptop AMD + NVIDIA; bỏ trống dùng encoder hiện tại. Không có frame đầu trong 10 giây sẽ báo lỗi thay vì treo vô hạn.
