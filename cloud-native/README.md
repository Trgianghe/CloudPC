# PC Cloud Native

Client web độc lập theo mẫu `test2.html`: nền đen, thanh trắng **6×50 px**, popover **320×330 px**, nội dung cuộn bên trong. Số Ping/FPS/codec/mất gói lấy từ phiên thật; không dùng số mẫu 14 ms/120 FPS/AV1 của bản HTML tham chiếu.

## Bốn phần mã nguồn

| Phần | File |
| --- | --- |
| Web Client | `index.html` + `mouse_controller.js` — CloudMouseController, Desktop/Gaming, WebSocket signaling, WebRTC video/audio, input binary và profile nút cảm ứng |
| Signaling Server | `server.js` — Node.js + ws, phòng riêng, token host/client khác nhau, offer/answer, trickle ICE, kiểm tra role và Origin |
| Host Agent | `host/main.go`, `media.go`, `input.go`, `input_windows.go`, `audio_windows.go` — Go + Pion, Win32 SendInput, ViGEmClient, FFmpeg NVENC/AMF và WASAPI |
| Fix RDP | `fix_rdp.bat`, `scripts/fix_rdp.ps1` — tìm session hiện tại, chuyển chính session đó về console; có chế độ theo dõi disconnect |

## Khởi chạy

Yêu cầu: Windows x64 đang đăng nhập desktop, Node.js, Go 1.24+ để build, FFmpeg có `ddagrab`, `scale_d3d11`, NVENC/AMF và libopus. Bản đã build có thể chạy mà không cần Go. `.tools/go` ở workspace là compiler portable phục vụ build; không cài vào hệ thống.

```powershell
cd "C:\Users\Trgianghe\Documents\ChatGPT\PC\cloud-native"
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Build
```

Script tạo ba file riêng không vào Git:

- `server.config.json`: phòng, token host và client, HTTPS/ICE.
- `host.config.json`: token host, adapter/output, codec backend, audio và quyền reboot.
- `client.config.json`: chỉ room và token client để nhập trên web. Không chia sẻ hai file còn lại.

Mở hai terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_signaling.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File .\start_host.ps1
```

Mở `http://127.0.0.1:9443/`, bấm thanh trắng, nhập `client.config.json` rồi kết nối. Cùng máy host sẽ ở chế độ xem để tránh vòng lặp SendInput. Muốn điều khiển, dùng điện thoại/PC khác. Để truy cập từ LAN, đặt bind của signaling thành IP LAN phù hợp, dùng IP đó trong link; host có thể tiếp tục kết nối signaling qua localhost. Dùng HTTPS với chứng chỉ được thiết bị tin cậy khi truy cập từ điện thoại/PC khác để có secure context và bảo vệ mã truy cập. Qua Internet thêm TURN khi cần; HTTPS không tự giải quyết đường UDP của WebRTC.

Nếu reverse proxy, khai báo `public_origin` chính xác. Token không đưa vào URL. Room chỉ nhận một host và một client cùng lúc. Không tự tin vào X-Forwarded-For. Nhận diện cùng host chỉ áp dụng khi hai socket có cùng IP riêng/loopback và không qua proxy; có thể bật `view_only` trên host khi cần kiểm thử qua proxy.

## Pipeline và giới hạn cần phân biệt

Host dùng **FFmpeg làm adapter vào DXGI và NVENC SDK**, không có binding NVENC SDK tự viết. Module WASAPI và Win32/ViGEm được gọi trực tiếp bằng ABI Windows từ Go. RTP/SRTP/DTLS/SCTP do Pion xử lý, không còn đi qua Python/aiortc.

`capture_mode: "gpu"` khởi tạo D3D11 trên `adapter`, lấy texture Desktop Duplication, scale/đổi màu bằng `scale_d3d11`, đưa surface D3D11 vào encoder. Không có `hwdownload` trong đường này. Vẫn có thể có GPU copy/format conversion; không được hiểu là không có bất kỳ copy VRAM nào. Màn hình/VDD và encoder phải tương thích trên cùng adapter. Driver VDD, GPU và FFmpeg build quyết định đường này có chạy được hay không.

`capture_mode: "copy"` dùng `hwdownload` và CPU scaling trước encoder GPU. **Đây không phải zero-copy**. Setup hiện chọn chế độ này cho laptop AMD-display/NVIDIA-encoder để chạy được. Muốn đạt đường GPU trên cloud VM, chuyển VDD sang GPU phù hợp rồi dùng chế độ `gpu`. Nếu GPU path lỗi, host báo lỗi rõ, không âm thầm quảng cáo là zero-copy.

NVENC: P1, tuning ULL, CBR 5–100 Mbps, B-frames=0, lookahead=0, zero-latency, VBV một frame và encoder delay=0, IDR mỗi nửa giây. Không bật global headers nên parameter sets được lặp trên IDR; H.264 đi từ RTP encoder loopback trực tiếp vào WebRTC, không chờ Annex-B/frame tiếp theo; giữ sequence/timestamp khi đổi chất lượng. HEVC dùng Annex-B/AUD; AV1 được đọc từ IVF. AMF dùng usage ultralowlatency/quality speed/CBR. Việc thay bitrate hoặc kích thước hiện khởi động lại encoder, có thể ngắt hình ngắn; đổi codec cần SDP mới. Không khởi động lại encoder theo mỗi PLI; RTCP được đọc để giữ đường NACK/retransmit.

Codec chỉ bật khi trình duyệt báo hỗ trợ và host FFmpeg có encoder. Có encoder trong FFmpeg chưa chứng minh GPU/driver thực sự encode được codec đó: lỗi khởi tạo sẽ trả về UI. H.264 là lựa chọn tương thích nhất; AV1/HEVC cần kiểm tra từng client. Không tự điều chỉnh bitrate theo REMB trong bản Go này: dùng thông số packet loss/RTT để chọn mức phù hợp.

WASAPI thu **render endpoint loopback**, không phải microphone. Host đọc mix format thật, chuyển qua FFmpeg thành PCM 48 kHz stereo và Opus 128 kbps, frame 10 ms; parser Ogg tách đúng từng packet bằng lacing. Mặc định thu endpoint phát âm thanh mặc định; có thể đặt `audio_endpoint` bằng endpoint ID. Không có endpoint trên headless VM thì cần driver audio ảo. Âm thanh client cần thao tác người dùng để phát; bật công tắc Stereo trong settings.

`receiver.playoutDelayHint=0` / `jitterBufferTarget=0` là gợi ý cho trình duyệt, không bảo đảm jitter buffer thực sự bằng 0. DataChannel `ordered:false,maxRetransmits:0` dùng SCTP trên DTLS; nó không phải UDP thô và ICE có thể đi qua TURN/TCP ở một số mạng.

## Chuột Desktop / Gaming đã tích hợp

`mouse_controller.js` được `index.html` tải trực tiếp, server chỉ công khai đúng file module này. `CloudMouseController` mặc định Desktop: con trỏ do máy khách render, mousemove gửi tọa độ tuyệt đối, click và wheel hoạt động ngay trên video. Chọn Gaming 360° hoặc bật Khóa chuột để yêu cầu Pointer Lock với `unadjustedMovement:true`; nếu trình duyệt không hỗ trợ raw request thì thử Pointer Lock thường. Esc trả về Desktop, thả các nút đang giữ. Desktop cũng nhận bàn phím khi video được focus. Nút cảm ứng chuột đã dùng cùng bộ điều khiển mới.

Mouse dùng DataChannel **`mouse-v2`**, `{ordered:false,maxRetransmits:0}`, ArrayBuffer little endian:

| Opcode | Bytes | Payload |
| --- | ---: | --- |
| `0x01` | 5 | absolute X/Y:uint16, 0..65535 trên output đang capture |
| `0x02` | 5 | relative dx/dy:int16 |
| `0x03` | 3 | button byte: 0 trái, 1 giữa, 2 phải; down byte: 0/1 |
| `0x04` | 3 | wheel:int16, +120 lên / -120 xuống |

Kênh riêng tránh trùng opcode với bàn phím/gamepad của bản cũ. Snapshot/watchdog trên `input` vẫn sửa trạng thái mouse-up bị mất. `host/mouse.go` parse mouse-v2; `host/mouse_windows.go` lấy đúng bounds của DXGI output và virtual desktop, đổi về tọa độ Win32 với `MOVE | ABSOLUTE | VIRTUALDESK`; wheel dùng `MOUSEEVENTF_WHEEL`. Cấu hình DPI đã đổi sang **Per Monitor Aware V2 (-4)** ngay khi host khởi tạo.

Client tính vùng `object-fit:contain`, loại dải đen ngoài video. Host gửi thêm vùng nội dung trong frame để loại cả dải đen do CPU scale/pad. Tọa độ absolute được ánh xạ từ output đang xem sang toàn virtual desktop, kể cả màn hình có tọa độ âm. Bounds cache 1 giây để không tạo DXGI factory trên mỗi mousemove. FFmpeg DXGI capture đặt **`draw_mouse=0`**, không ghép pointer shape vào video. Không đổi cursor toàn hệ thống thành trong suốt, không làm mất chuột dùng trực tiếp trên host.

Đây là local rendering + remote injection, không tạo hai con trỏ Windows độc lập trong cùng session. Không cam kết render vật lý 0 ms hoặc vận chuyển dưới 1 ms; local cursor không chờ round-trip mạng. Nếu ứng dụng/game/driver tự vẽ cursor vào desktop image, `draw_mouse=0` không xóa những pixel đã có đó. SendInput relative còn chịu cách Windows/game xử lý mouse acceleration và anti-cheat; yêu cầu unadjustedMovement trên browser không biến SendInput thành driver Raw Input. Kênh unordered có thể mất/đảo thứ tự gói; snapshot giảm kẹt nút, không bảo đảm mọi click/scroll đến đủ.

Đã kiểm tra packet layout, letterbox/pillarbox, padding trong video, pointer-lock fallback, release khi đổi mode, button nhiều nguồn, mapping nhiều màn hình và capture không ghép cursor bằng kiểm thử Node/Go. Chưa đo input-to-photon hoặc thử FPS game từ thiết bị thứ hai. Test trên chính host vẫn chặn input để tránh vòng lặp.

Nguồn: [MOUSEINPUT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput), [DPI awareness](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setprocessdpiawarenesscontext), [DXGI desktop duplication](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api), [FFmpeg ddagrab](https://ffmpeg.org/ffmpeg-filters.html#ddagrab).

## Giao thức input tương thích bàn phím/gamepad

Tất cả số đa byte là **little endian**. Input chỉ đi qua DataChannel; JSON chỉ dùng cho signaling/config.

| Type | Độ dài | Payload |
| --- | ---: | --- |
| `0x01` | 5 | dx:int16, dy:int16 |
| `0x02` | 2 | trạng thái nút: bit0 trái, bit1 phải, bit2 giữa; full mask |
| `0x03` | 4 | down:byte (0/1), VK:uint16 |
| `0x04` | 13 | buttons:uint16, LX/LY/RX/RY:int16, LT/RT:byte |
| `0x05` | 50 | seq:uint32, mouse mask:byte, key bitmap:32 bytes, gamepad report:12 bytes |
| `0x06` | 1 | release-all |
| `0x07` | 9 | ping/echo timestamp:float64 |

Client gửi snapshot mỗi 50 ms; host bỏ snapshot cũ. Snapshot sửa trạng thái khi mất key-up trên kênh unreliable. Mất mọi input/heartbeat 750 ms thì watchdog thả phím, chuột và reset gamepad. Release cũng chạy khi mở setting, vào chế độ chỉnh nút, mất focus, ẩn tab, mất Pointer Lock hoặc ngắt phiên. Bản sửa snapshot không thể làm packet input mất trước đó xuất hiện lại; mạng mất gói vẫn ảnh hưởng thao tác.

`SendInput` hoạt động trong phiên desktop đang chạy host và chịu giới hạn UIPI/UAC. Không điều khiển secure desktop, màn hình khóa hoặc mọi game anti-cheat. Không có hai con trỏ Windows độc lập trong cùng session. Parsec/Moonlight/RDP dùng giao thức và tài khoản riêng; web này không đăng nhập thay cho họ hoặc biến token web thành tài khoản Parsec. Chạy song song phần mềm được, nhưng nhiều client cùng thao tác sẽ tranh chấp cùng desktop/driver gamepad.

## Headless: driver và RDP

1. Cài GPU driver phù hợp với GPU passthrough/vGPU của VM. Đảm bảo thiết bị GPU và NVENC/AMF thực sự sẵn sàng trong VM.
2. Dùng bản driver display đã ký của [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver), hoặc build [IddSampleDriver của Microsoft](https://github.com/microsoft/Windows-driver-samples/tree/main/video/IndirectDisplay) đúng quy trình WDK/signing. IddSampleDriver là sample, không phải installer production. Không cần tắt Secure Boot/test-signing cho một bộ driver đã ký phù hợp.
3. Tạo các mode 1920×1080@120, 2560×1440@60, 3840×2160@60. Chọn GPU/VDD phù hợp; xác minh trong Windows Display Settings. `adapter` là index D3D11, `output` là index output trên adapter đó. Encoder không tự thay refresh rate của VDD chỉ vì client chọn FPS.
4. Cài [VB-CABLE](https://vb-audio.com/Cable/), reboot theo hướng dẫn hãng. Chọn **CABLE Input** làm playback endpoint của ứng dụng/Windows để WASAPI loopback lấy âm thanh. CABLE Output là phía recording. Đây là hai tên khác nhau.
5. Cài bản [ViGEmBus từ nguồn chính thức](https://github.com/nefarius/ViGEmBus/releases), đặt **ViGEmClient.dll x64** do bạn build/lấy từ [ViGEmClient chính thức](https://github.com/nefarius/ViGEmClient) trong `bin`. Driver bus và DLL client là hai phần khác nhau. ViGEm đã hết vòng đời; chỉ hỗ trợ theo yêu cầu tương thích hiện tại, không giả định có cập nhật bảo mật mới.
6. Chạy `scripts/check_headless.ps1` và `start_host.ps1 -Diagnose` để xem thiết bị/codec/audio/gamepad thật. Chạy host trong phiên người dùng, không chạy service Session 0.

Từ cửa sổ Administrator trong chính phiên RDP của bạn:

```cmd
fix_rdp.bat
```

Lệnh trả session hiện tại về console và sẽ ngắt RDP ngay. Không hardcode session ID 1.

Muốn theo dõi và trả về console **sau khi bạn ngắt RDP**:

```cmd
fix_rdp.bat -Watch
```

Giữ tiến trình này chạy trước khi đóng RDP. Script chỉ chuyển session đang sở hữu, không chiếm session khác. Không tự đăng ký scheduled task/system service. `tscon` cần quyền phù hợp. Nếu policy buộc khóa/logoff, GPU reset, UAC, driver VDD lỗi hoặc display không tồn tại, vẫn có thể đen màn hình; không có script bảo đảm “không bao giờ đen”.

## Reboot và độ trễ

Reboot mặc định tắt (`allow_reboot:false`). Chỉ bật trên VM/PC bạn muốn cho người điều khiển quyền khởi động lại. Client hỏi xác nhận, signaling chỉ cho command `reboot`, host kiểm tra quyền rồi gọi `shutdown.exe /r /t 10`; không có API chạy shell tùy ý.

Mục tiêu dưới 25 ms cần đo input-to-photon với màn hình/game thực tế. Ping/RTT và FPS không chứng minh mức đó. Bản headless/VDD, RDP handoff, gamepad vật lý, Parsec/Moonlight và mạng Internet cần kiểm thử riêng trên VM mục tiêu; không lấy kết quả localhost của bản Python trước làm kết quả cho host Go mới.

## Kết quả kiểm tra bản Go trên máy hiện tại

Ngày 2026-10-05, host Go/Pion truyền qua Node signaling tới trình duyệt localhost:

- H.264: 1920×1080, khoảng 120–122 FPS sau khi ổn định; 2560×1440 khoảng 60 FPS.
- AV1: 2560×1440 đã decode thật, quan sát khoảng 55–63 FPS; HEVC/H265 cùng độ phân giải khoảng 59 FPS.
- RTT DataChannel quan sát 2–8 ms, packet loss video 0% ở các lần đo này; WASAPI stereo 48 kHz và Opus có gói nhận thật trên client.
- Chuyển preset, đổi codec và bitrate 20 → 21 Mbps đã cập nhật phiên/encoder thật.
- Kéo nút Bắn từ giữa màn hình sang vị trí mới, lưu profile, reload tự nạp bố cục; nút tròn/vuông và chức năng chuột trái được giữ lại.
- 4 bài kiểm thử Node và bộ kiểm thử Go đã qua; kiểm thử input dùng sink giả, không tiêm thao tác vào ứng dụng người dùng.

Máy này dùng AMD cho display và NVIDIA NVENC cho encoder, nên kết quả trên là **copy mode**, không phải GPU-only. FPS ở đây là frame giải mã, không bảo đảm FPS game hoặc số frame nguồn khác nhau. Chưa đo input-to-photon, chưa thử 4K trên VM, chưa thử điều khiển thực từ điện thoại khác. Không có ViGEmClient.dll/driver gamepad sẵn sàng, nên chức năng tay cầm ảo chưa được xác nhận trên phần cứng. Driver và script RDP không được tự cài/chạy trong quá trình này.

Client hỗ trợ cảm ứng Desktop: di/kéo trên video gửi vị trí tuyệt đối, chạm nhanh gửi click trái. Gaming 360° dùng Pointer Lock trên trình duyệt hỗ trợ; điện thoại cần thử khả năng Pointer Lock của trình duyệt. Trong chỉnh nút có chức năng Phím/Chuột trái/Chuột phải/Chuột giữa, hình dạng Tròn/Vuông, kích thước và kéo vị trí. Nhiều nguồn cùng giữ một phím chỉ thả phím khi nguồn cuối cùng nhả. Profile được lưu cục bộ trong trình duyệt; không chứa token truy cập.

## Kiểm thử

```powershell
node --test tests/*.test.cjs
cd host
go test ./...
go build -o ..\bin\pccloud-host.exe .
```

Tests kiểm tra byte layout, gate khi cấu hình/self-host, snapshot sửa key-up mất, watchdog, parser Annex B, xác thực signaling, relay ICE/SDP và chặn spoof role. Các bài kiểm thử input dùng sink giả, không gửi phím vào Windows.

Nguồn kỹ thuật: [Pion](https://github.com/pion/webrtc), [NVENC Programming Guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/nvenc-video-encoder-api-prog-guide/index.html), [FFmpeg GPU adapter](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html), [WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording), [tscon](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tscon).


### Thử điều khiển ngay trên host và giao diện mới

Cloud Settings dùng kiểu trong test2.html mới: hộp 310x330, thanh trắng dọc 6x104, các lựa chọn màu xám, kéo mở theo tay. Trong menu có checkbox **Điều khiển thử trên chính host**. Bật checkbox, đợi phiên nối lại rồi đóng menu để gửi click/phím. Mặc định cùng host vẫn chỉ xem; quyền view_only cấu hình của host luôn được giữ. Chế độ thử không gửi chuyển động chuột liên tục, chỉ định vị khi bấm và tạm bỏ qua click/cuộn do chính phiên đó tiêm lại. Con trỏ Windows vẫn có thể đổi vị trí/focus khi click; đây không phải hai con trỏ Windows độc lập. Gaming 360 độ dùng thiết bị khác. Capture DXGI vẫn draw_mouse=0; không thể xóa con trỏ đã được game/driver vẽ sẵn vào hình.

Checkbox **Ẩn các nút cảm ứng** có hiệu lực ngay và lưu lựa chọn trong trình duyệt. FPS 60/120/144 là mục tiêu encode, không thay đổi tần số quét màn hình/driver. V-Sync do trình duyệt quản lý.

## Kiểm chứng độ trễ và 2K/160 FPS (2026-10-06)

- Trang chính chuyển đúng 1440p sang preset 2K, 4K sang 4K; trước đây mọi cấu hình trên 720p bị chuyển về 1080p.
- Host và web nhận 160 FPS. Đây là mục tiêu capture, không phải cam kết FPS thực nhận.
- H.264 RTP dùng timestamp capture 90 kHz, passthrough thay cho CFR: không nhân các frame cũ để đạt số FPS yêu cầu. NVENC vẫn P1/ULL, không B-frame/lookahead, VBV một frame. Gói RTP được chuyển ngay tới Pion, không đợi AUD frame tiếp theo.
- Gửi lại cùng cấu hình không còn khởi động lại encoder. Thay độ phân giải/bitrate vẫn khởi động lại FFmpeg; chưa có NVENC reconfigure trực tiếp hoặc congestion controller điều chỉnh bitrate như Parsec.
- Cloud Settings báo P2P/TURN, RTT ICE, FPS giải mã và FPS trình bày bằng requestVideoFrameCallback. Các số này không đo click-to-photon và không xác nhận màn hình vật lý đã quét hình.

Đo trên host hiện tại: DXGI -> CPU scale/pad -> NVENC, yêu cầu 2560x1440/160, 40 Mbps. Bài CFR 6 giây xuất 958 frame nhưng 917 là frame nhân; không dùng kết quả đó làm bằng chứng 160 FPS. Bài passthrough 8 giây xuất 526 frame, không nhân frame, khoảng 64 FPS trung bình gồm khởi động. Bài timestamp 90 kHz 4 giây hết lỗi DTS, 242 frame, không nhân frame. Đây là desktop benchmark, chưa phải gameplay hoặc đo điện thoại qua Internet. Máy đang dùng copy mode vì GPU scaling trên adapter màn hình chưa chạy được trong thử nghiệm trước. Chưa đạt chuẩn 2K160 của người dùng.

Để đánh giá FPS game: host phải render game và màn hình capture đủ Hz, khách phải có màn hình/decoder đủ nhanh; kiểm tra FPS trình bày, mất gói và decode/buffer khi game đang chạy. Để đo phản hồi thật, quay camera tốc độ cao đồng thời thao tác và màn hình khách, đếm frame đến phản hồi. Kiểm tra cả LAN và Internet; cần địa chỉ HTTPS host cùng cấu hình TURN nếu NAT không kết nối trực tiếp. GitHub Pages chỉ phục vụ client.

Nguồn kiến trúc: [Parsec overview](https://support.parsec.app/hc/en-us/articles/32361354307348-Overview), [NVIDIA FFmpeg SDK](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html), [Moonlight latency metrics](https://github.com/moonlight-stream/moonlight-docs/wiki/Frequently-Asked-Questions). Parsec công bố khoảng 7 ms cộng thêm trong thử nghiệm LAN của họ và sử dụng zero-copy GPU cùng bitrate thích nghi; không phải 0 ms.
