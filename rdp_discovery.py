"""Read local Windows RDP metadata; never enable RDP or expose passwords."""
import asyncio
import ctypes
import getpass
import ipaddress
import os
import socket
from urllib.parse import urlsplit
from aiohttp import web


def loopback(value):
    try:
        address = ipaddress.ip_address(value)
        return address.is_loopback or bool(getattr(address, 'ipv4_mapped', None) and address.ipv4_mapped.is_loopback)
    except ValueError:
        return value == 'localhost'


def allowed_request(request):
    # Do not trust forwarded headers, LAN clients, or DNS-rebinding Host names.
    try:
        host = urlsplit('http://' + request.host).hostname
    except ValueError:
        return False
    if not loopback(request.remote or '') or not loopback(host or ''):
        return False
    origin = request.headers.get('Origin')
    if not origin:
        return True
    if origin == 'https://trgianghe.github.io':
        return True
    try:
        parsed = urlsplit(origin)
    except ValueError:
        return False
    return parsed.scheme in ('http', 'https') and loopback(parsed.hostname or '') and parsed.netloc == request.host and parsed.path == ''


def console_account():
    try:
        from ctypes import wintypes
        session = ctypes.windll.kernel32.WTSGetActiveConsoleSessionId()
        wts = ctypes.windll.wtsapi32
        wts.WTSQuerySessionInformationW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.DWORD)]
        wts.WTSFreeMemory.argtypes = [ctypes.c_void_p]
        values = []
        for field in (7, 5):  # DomainName, UserName
            pointer, length = ctypes.c_void_p(), wintypes.DWORD()
            if not wts.WTSQuerySessionInformationW(None, session, field, ctypes.byref(pointer), ctypes.byref(length)):
                raise OSError('No console account')
            try:
                values.append(ctypes.wstring_at(pointer) if pointer.value else '')
            finally:
                wts.WTSFreeMemory(pointer)
        if values[1]:
            return '\\'.join(value for value in values if value)
    except (AttributeError, OSError):
        pass
    username = getpass.getuser()
    if username.upper() in ('SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE'):
        return ''
    return os.environ.get('USERDOMAIN', socket.gethostname()) + '\\' + username


def collect_info():
    if os.name != 'nt':
        raise RuntimeError('Chỉ quét được Windows PC chạy dịch vụ CloudPC.')
    import winreg
    def registry(path, key):
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as handle:
            return winreg.QueryValueEx(handle, key)[0]
    edition = registry(r'SOFTWARE\Microsoft\Windows NT\CurrentVersion', 'EditionID')
    enabled = registry(r'SYSTEM\CurrentControlSet\Control\Terminal Server', 'fDenyTSConnections') == 0
    port = registry(r'SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp', 'PortNumber')
    hostname = socket.gethostname()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        try:
            # UDP connect chooses a route without transmitting any packet.
            route.connect(('8.8.8.8', 80))
            address = route.getsockname()[0]
        except OSError:
            address = hostname
    supported = not edition.lower().startswith(('core', 'home'))
    listening=False
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.25):listening=True
    except OSError:pass
    return {'name': hostname, 'host': address, 'port': port, 'username': console_account(),
            'edition': edition, 'rdpSupported': supported, 'rdpEnabled': enabled, 'rdpListening': listening,
            'message': ('Windows Home không hỗ trợ nhận kết nối RDP. Vẫn lưu được thông tin; dùng PC Cloud hoặc Windows Pro để kết nối.' if not supported else
                        'RDP đang tắt. Bật Settings → System → Remote Desktop trước khi kết nối.' if not enabled else
                        'RDP đã bật nhưng cổng chưa lắng nghe. Kiểm tra dịch vụ Remote Desktop Services trên PC host.' if not listening else
                        'RDP đã bật. Dùng địa chỉ này từ máy khác cùng mạng; kết nối ngoài mạng cần VPN hoặc RD Gateway.')}


def register_rdp_discovery(app, collector=collect_info):
    async def handle(request):
        if not allowed_request(request):
            raise web.HTTPForbidden(text='Chỉ quét từ trình duyệt trên chính PC host và trang CloudPC được phép.')
        cors = {'Cache-Control': 'no-store', 'Vary': 'Origin'}
        if request.headers.get('Origin'):
            cors['Access-Control-Allow-Origin'] = request.headers['Origin']
            cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
            cors['Access-Control-Allow-Private-Network'] = 'true'
        if request.method == 'OPTIONS':
            return web.Response(status=204, headers=cors)
        try:
            info = await asyncio.to_thread(collector)
        except (OSError, RuntimeError) as error:
            return web.json_response({'error': str(error)}, status=503, headers=cors)
        return web.json_response(info, headers=cors)
    app.router.add_post('/api/rdp-info', handle)
    app.router.add_options('/api/rdp-info', handle)
