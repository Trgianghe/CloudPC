"""Visible, authenticated Windows desktop host. Run in the user's desktop session."""
import asyncio
import argparse
import ctypes
from ctypes import wintypes
import fractions
import json
import logging
import os
from pathlib import Path
import secrets
import ssl
import sys
import time

from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer, VideoStreamTrack, RTCRtpSender
from av import VideoFrame
from av.video.reformatter import VideoReformatter
import mss
import numpy as np
import ifaddr
from streaming import LatestCapture, GamingH264Encoder, choose_encoder
from ffmpeg_stream import NativeDesktopTrack, NativePacketEncoder
from mouse_input import decode_mouse, normalize_absolute
import shutil
from native_gateway import register_native

ROOT = Path(__file__).resolve().parent
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
CFG = json.loads((ROOT / 'config.json').read_text(encoding='utf-8-sig'))
if len(CFG.get('access_code', '')) < 20 or CFG['access_code'].startswith('CHANGE-'):
    raise SystemExit('Đặt access_code riêng dài ít nhất 20 ký tự trong config.json.')
SESSIONS = {}
ATTEMPTS = {}
PEERS = set()
LOCK = asyncio.Lock()
SELF_CLIENTS = set()
ENCODER_NAME = None


def is_host_client(address):
    local = {'127.0.0.1','::1'}
    for adapter in ifaddr.get_adapters():
        for ip in adapter.ips:
            local.add(ip.ip[0] if isinstance(ip.ip,tuple) else ip.ip)
    return address in local and not CFG.get('public_origin')


class WindowsInput:
    # SendInput structures use pointer-sized fields on Windows x64.
    class MOUSE(ctypes.Structure):
        _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG), ('mouseData', wintypes.DWORD),
                    ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]
    class KEY(ctypes.Structure):
        _fields_ = [('wVk', wintypes.WORD), ('wScan', wintypes.WORD), ('dwFlags', wintypes.DWORD),
                    ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]

    def __init__(self):
        class DATA(ctypes.Union):
            _fields_ = [('mi', WindowsInput.MOUSE), ('ki', WindowsInput.KEY)]
        class INPUT(ctypes.Structure):
            _fields_ = [('type', wintypes.DWORD), ('data', DATA)]
        self.INPUT = INPUT
        self.user32 = ctypes.windll.user32
        self.user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
        self.user32.SendInput.restype = wintypes.UINT
        self.held = set()
        self.buttons = set()
        self.monitor = None
        try:
            self.user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
            self.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except Exception:
            pass

    def emit(self, kind, item):
        event = self.INPUT()
        event.type = kind
        if kind == 1:
            event.data.ki = item
        else:
            event.data.mi = item
        self.user32.SendInput(1, ctypes.byref(event), ctypes.sizeof(event))

    def key(self, vk, down):
        if not 1 <= vk <= 254:
            return
        if down:
            self.held.add(vk)
        else:
            self.held.discard(vk)
        scan = self.user32.MapVirtualKeyW(vk, 0)
        flags = 0x0008 | (0 if down else 0x0002)
        if vk in (33, 34, 35, 36, 37, 38, 39, 40, 45, 46, 91, 92, 163, 165):
            flags |= 0x0001
        self.emit(1, self.KEY(0, scan, flags, 0, 0))

    def mouse_button(self, button, down):
        flags = {'left': (2, 4), 'right': (8, 16), 'middle': (32, 64)}
        if button not in flags:
            return
        (self.buttons.add if down else self.buttons.discard)(button)
        self.emit(0, self.MOUSE(0, 0, 0, flags[button][0 if down else 1], 0, 0))

    def release(self):
        for vk in list(self.held):
            self.key(vk, False)
        for button in list(self.buttons):
            self.mouse_button(button, False)

    def receive(self, event):
        kind = event.get('type')
        if kind == 'buttons':
            for bit, button in enumerate(('left','middle','right')):
                down = bool(event['mask'] & (1 << bit))
                if down != (button in self.buttons):
                    self.mouse_button(button, down)
            return
        if kind == 'key':
            self.key(int(event['vk']), event.get('down') is True)
        elif kind == 'button':
            self.mouse_button(event.get('button'), event.get('down') is True)
        elif kind == 'move':
            dx = max(-32768, min(32767, int(event['dx'])))
            dy = max(-32768, min(32767, int(event['dy'])))
            self.emit(0, self.MOUSE(dx, dy, 0, 1, 0, 0))
        elif kind == 'absolute' and self.monitor:
            monitor = self.monitor
            virtual = tuple(self.user32.GetSystemMetrics(i) for i in (76, 77, 78, 79))
            x, y = normalize_absolute(float(event['x']), float(event['y']), monitor, virtual)
            self.emit(0, self.MOUSE(x, y, 0, 0x8000 | 0x4000 | 1, 0, 0))
        elif kind == 'wheel':
            delta = max(-32768, min(32767, int(event['delta'])))
            self.emit(0, self.MOUSE(0, 0, delta & 0xffffffff, 0x0800, 0, 0))
        elif kind == 'release':
            self.release()


class DesktopTrack(VideoStreamTrack):
    def __init__(self, inputs, fps, width):
        super().__init__()
        monitor = int(CFG.get('monitor', 1))
        self.capture = LatestCapture(monitor,fps,CFG.get('capture','auto'),int(CFG.get('dxgi_device',0)),int(CFG.get('dxgi_output',0)))
        self.fps = fps
        self.width = width
        self.start_time = time.monotonic()
        self.frame_number = 0
        self.reformatter = VideoReformatter()

    def prepare_frame(self,pixels):
        # DXcam returns an owned numpy frame; let PyAV reference it without a second copy.
        frame = VideoFrame.from_numpy_buffer(pixels, format='bgra')
        monitor=self.capture.monitor
        width = min(self.width,monitor['width']) // 2 * 2
        height = int(monitor['height'] * width / monitor['width']) // 2 * 2
        return self.reformatter.reformat(frame,width=width,height=height,format='yuv420p',threads=4)

    async def recv(self):
        target = self.start_time + self.frame_number / self.fps
        await asyncio.sleep(max(0, target - time.monotonic()))
        self.frame_number = max(self.frame_number + 1, int((time.monotonic() - self.start_time) * self.fps))
        if self.capture.error:raise self.capture.error
        pixels=self.capture.frame
        while pixels is None:
            if self.capture.error:raise self.capture.error
            await asyncio.sleep(0.002)
            pixels=self.capture.frame
        self.monitor=self.capture.monitor
        frame = await asyncio.to_thread(self.prepare_frame,pixels)
        frame.pts = int((time.monotonic() - self.start_time) * 90000)
        frame.time_base = fractions.Fraction(1, 90000)
        return frame

    def stop(self):
        super().stop()
        self.capture.stop()


def authorized(request):
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    if SESSIONS.get(token, 0) < time.monotonic():
        raise web.HTTPUnauthorized(text='Phiên hết hạn. Vui lòng kết nối lại.')
    return token


@web.middleware
async def headers(request, handler):
    try:
        response = await handler(request)
    except web.HTTPException as exc:
        response = exc
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: http:; img-src 'self' data:; media-src 'self' blob:; frame-src 'self' https:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    if request.path.startswith('/native/'):
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
    if request.path == '/' or request.path.startswith(('/assets/', '/native/')):
        response.headers['Cache-Control'] = 'no-store, max-age=0'
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


async def login(request):
    # Same-origin requests only. Hosting the UI on this host avoids exposing a credential API cross-origin.
    origin = request.headers.get('Origin')
    allowed_origins = {f'{request.scheme}://{request.host}'}
    if CFG.get('public_origin'):
        allowed_origins.add(CFG['public_origin'].rstrip('/'))
    if origin and origin not in allowed_origins:
        raise web.HTTPForbidden(text='Hãy mở trang web trên chính địa chỉ PC host.')
    now = time.monotonic()
    address = request.remote
    attempts = [t for t in ATTEMPTS.get(address, []) if now - t < 60]
    if len(attempts) >= 8:
        raise web.HTTPTooManyRequests(text='Quá nhiều lần thử. Đợi một phút.')
    attempts.append(now)
    ATTEMPTS[address] = attempts
    data = await request.json()
    if not secrets.compare_digest(str(data.get('code', '')), CFG['access_code']):
        raise web.HTTPUnauthorized(text='Mã truy cập không đúng.')
    ATTEMPTS.pop(address, None)
    for token, expiry in list(SESSIONS.items()):
        if expiry < now:
            SESSIONS.pop(token)
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = now + 8 * 3600
    self_host=is_host_client(request.remote)
    if self_host:SELF_CLIENTS.add(token)
    return web.json_response({'token': token, 'name': CFG.get('name', 'Gaming PC'),
                              'iceServers': CFG.get('ice_servers', []), 'audio': False,'selfHost':self_host,
                              'limits':{'fps':CFG.get('max_fps',120),'width':CFG.get('max_width',2560),'bitrate':CFG.get('max_bitrate_mbps',50)}})


async def offer(request):
    global ENCODER_NAME
    token = authorized(request)
    async with LOCK:
        if PEERS:
            raise web.HTTPConflict(text='PC đang có một người điều khiển. Ngắt phiên cũ trước.')
        if os.name != 'nt':
            raise web.HTTPServiceUnavailable(text='Dịch vụ điều khiển cần Windows.')
        data = await request.json()
        fps = max(15, min(int(data.get('fps', 60)), int(CFG.get('max_fps', 120)), 120))
        width = max(640, min(int(data.get('width', 1920)), int(CFG.get('max_width', 2560)),3840))
        bitrate = max(2,min(int(data.get('bitrate',20)),int(CFG.get('max_bitrate_mbps',50)),80))*1_000_000
        peer = RTCPeerConnection(RTCConfiguration(iceServers=[RTCIceServer(**s) for s in CFG.get('ice_servers', [])]))
        inputs = WindowsInput()
        track = None
        if CFG.get('native_capture','auto') in ('auto',True) and shutil.which('ffmpeg'):
            try:
                native=NativeDesktopTrack(fps,width,bitrate,int(CFG.get('monitor',1)),int(CFG.get('dxgi_output',0)))
                await asyncio.to_thread(native.ready.wait,5)
                if native.error or not native.ready.is_set():native.stop()
                else:track=native
            except Exception:
                logging.info('Native capture unavailable; using Python capture path')
        if track is None:track = DesktopTrack(inputs, fps, width)
        await asyncio.to_thread(track.capture.ready.wait,5)
        if track.capture.error or not track.capture.monitor:
            track.stop();await peer.close()
            raise web.HTTPServiceUnavailable(text='Không chụp được desktop. Hãy chạy host trong phiên Windows đang đăng nhập.')
        inputs.monitor=track.capture.monitor
        # Initialize desktop duplication before the NVIDIA probe changes adapter context
        # on hybrid laptops whose display is attached to the integrated GPU.
        if ENCODER_NAME is None and not isinstance(track,NativeDesktopTrack):
            try:
                ENCODER_NAME=await asyncio.to_thread(choose_encoder,CFG.get('encoder','auto'))
            except Exception:
                track.stop();await peer.close()
                raise web.HTTPServiceUnavailable(text='Không khởi tạo được bộ mã hóa H.264.')
        PEERS.add(peer)
        last_seen = time.monotonic()
        last_motion_sequence = -1
        last_mouse_snapshot = None
        disposed = False

        async def close():
            nonlocal disposed
            if disposed:
                return
            disposed = True
            inputs.release()
            track.stop()
            PEERS.discard(peer)
            await peer.close()

        @peer.on('datachannel')
        def datachannel(channel):
            if channel.label == 'mouse-v2':
                @channel.on('message')
                def mouse_message(raw):
                    nonlocal last_seen, last_mouse_snapshot
                    if SESSIONS.get(token, 0) < time.monotonic() or token in SELF_CLIENTS:
                        return
                    try:
                        event = decode_mouse(raw)
                        if event['type'] == 'buttons':
                            sequence = event['seq']
                            if last_mouse_snapshot is not None and not 0 < ((sequence-last_mouse_snapshot)&0xffffffff) < 0x80000000:
                                return
                            last_mouse_snapshot = sequence
                        last_seen = time.monotonic()
                        inputs.receive(event)
                    except (ValueError, TypeError, KeyError):
                        pass
                @channel.on('close')
                def mouse_close():
                    inputs.release()
                return
            @channel.on('message')
            def message(raw):
                nonlocal last_seen, last_motion_sequence
                if not isinstance(raw, str) or len(raw) > 2048:
                    return
                try:
                    event = json.loads(raw)
                    if SESSIONS.get(token, 0) < time.monotonic():
                        return
                    last_seen = time.monotonic()
                    if event.get('type') == 'ping':
                        channel.send(json.dumps({'type': 'pong', 'at': event.get('at'),'encoder':encoder.name,'capture':track.capture.name,'bitrate':round(encoder.target_bitrate/1_000_000,1)}))
                    elif token not in SELF_CLIENTS or event.get('type')=='release':
                        if event.get('type') in ('move','absolute'):
                            sequence=int(event.get('seq',last_motion_sequence+1))
                            if sequence<=last_motion_sequence:return
                            last_motion_sequence=sequence
                        inputs.receive(event)
                        if event.get('type') in ('move','absolute') and inputs.monitor:
                            point=wintypes.POINT()
                            inputs.user32.GetCursorPos(ctypes.byref(point))
                            monitor=inputs.monitor
                            channel.send(json.dumps({'type':'cursor','x':(point.x-monitor['left'])/monitor['width'],'y':(point.y-monitor['top'])/monitor['height']}))
                except (ValueError, KeyError, TypeError, AttributeError):
                    pass

        @peer.on('connectionstatechange')
        async def statechange():
            if peer.connectionState in ('failed', 'closed'):
                await close()

        async def watchdog():
            while peer in PEERS:
                await asyncio.sleep(2)
                if time.monotonic() - last_seen > 12 or SESSIONS.get(token, 0) < time.monotonic():
                    await close()
                    break

        try:
            sender=peer.addTrack(track)
            encoder=NativePacketEncoder(track) if isinstance(track,NativeDesktopTrack) else GamingH264Encoder(ENCODER_NAME,fps,bitrate)
            # aiortc 1.15.0 has no public custom encoder hook. Pin and verify this adapter.
            sender._RTCRtpSender__encoder=encoder
            transceiver=next(t for t in peer.getTransceivers() if t.sender is sender)
            transceiver.setCodecPreferences([c for c in RTCRtpSender.getCapabilities('video').codecs if c.mimeType.lower()=='video/h264'])
            await asyncio.wait_for(peer.setRemoteDescription(RTCSessionDescription(sdp=data['sdp'], type='offer')), 15)
            await asyncio.wait_for(peer.setLocalDescription(await peer.createAnswer()), 20)
            asyncio.create_task(watchdog())
            return web.json_response({'sdp': peer.localDescription.sdp, 'type': peer.localDescription.type,'encoder':encoder.name,'capture':track.capture.name,'selfHost':token in SELF_CLIENTS})
        except Exception:
            await close()
            raise web.HTTPBadRequest(text='Không thiết lập được phiên WebRTC. Kiểm tra cấu hình mạng và màn hình PC.')


async def index(request):
    return web.FileResponse(ROOT / 'web' / 'index.html')


async def health(request):
    return web.json_response({'ok': True, 'protocol': 'webrtc'})


async def shutdown(app):
    await asyncio.gather(*(p.close() for p in list(PEERS)))


app = web.Application(middlewares=[headers], client_max_size=256 * 1024)
register_native(app, ROOT, authorized, is_host_client, CFG.get('public_origin', ''))
app.router.add_get('/', index)
app.router.add_post('/api/login', login)
app.router.add_post('/api/offer', offer)
app.router.add_get('/api/health', health)
app.router.add_static('/assets/', ROOT / 'web')
app.on_shutdown.append(shutdown)
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', default=CFG.get('host', '0.0.0.0'))
    parser.add_argument('--port', type=int, default=CFG.get('port',8443))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    logging.getLogger('aioice').setLevel(logging.WARNING)
    tls = None
    if CFG.get('tls_cert') and CFG.get('tls_key'):
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(CFG['tls_cert'], CFG['tls_key'])
    print('PC CLOUD — chạy trong phiên Windows đang đăng nhập. Ctrl+C để dừng.')
    print(f"Mở {'https' if tls else 'http'}://<IP-PC>:{CFG.get('port', 8443)} trên điện thoại.")
    web.run_app(app, host=args.bind, port=args.port, ssl_context=tls)
