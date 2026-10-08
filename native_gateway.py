"""Same-origin gateway for the native player. Never serves host credentials."""
import asyncio
import hashlib
import hmac
import json
import secrets
import time
from aiohttp import ClientSession, ClientTimeout, WSMsgType, web
from public_connection import public_origin as current_public_origin
from urllib.parse import urlsplit


def register_native(app, root, authorized, is_host_client, public_origin='', broadcast=None):
    native = root / 'cloud-native'

    def config():
        return json.loads((native / 'server.config.json').read_text(encoding='utf-8-sig'))

    def endpoint(cfg):
        # Backend is local; no arbitrary URL proxying.
        return f"{'https' if cfg.get('tls_cert') else 'http'}://127.0.0.1:{int(cfg.get('port', 9443))}"

    async def session(request):
        authorized(request)
        try:
            cfg = config()
            host = json.loads((native / 'host.config.json').read_text(encoding='utf-8-sig'))
            room = host['room']
            async with ClientSession(timeout=ClientTimeout(total=3)) as client:
                async with client.get(endpoint(cfg) + '/health') as response:
                    if response.status != 200:
                        raise RuntimeError('Signaling unavailable')
            return web.json_response({'room': room, 'client_token': cfg['rooms'][room]['client_token']})
        except Exception:
            raise web.HTTPServiceUnavailable(text='Engine chưa chạy. Mở open_web.bat để khởi động đầy đủ.')

    async def player(request):
        return web.FileResponse(native / 'index.html')

    async def original_settings(request):
        return web.FileResponse(native / 'settings-original.html')

    async def connection_script(request):
        return web.FileResponse(native / 'connection.js')

    async def mouse(request):
        return web.FileResponse(native / 'mouse_controller.js')

    async def signal(request):
        cfg = config()
        allowed = {f'{request.scheme}://{request.host}', public_origin.rstrip('/')}
        if broadcast is not None:allowed.add('https://trgianghe.github.io')
        allowed.update(cfg.get('client_origins', []))
        active_public=current_public_origin(root,public_origin)
        if active_public:allowed.add(active_public)
        if request.headers.get('Origin') not in allowed:
            raise web.HTTPForbidden(text='Open the player on this host.')
        address = endpoint(cfg)
        browser = web.WebSocketResponse(heartbeat=20, max_msg_size=256*1024)
        async with ClientSession(timeout=ClientTimeout(total=None, sock_connect=5)) as client:
            try:
                backend = await client.ws_connect(address + '/signal', headers={'Origin': address}, max_msg_size=256*1024)
            except Exception:
                raise web.HTTPServiceUnavailable(text='Signaling offline')
            await browser.prepare(request)
            guest_attached=False
            async def close_guest():
                await backend.close()
                await browser.close(code=4001,message=b'Broadcast paused or ended')

            async def upstream():
                nonlocal guest_attached
                async for message in browser:
                    if message.type != WSMsgType.TEXT:
                        if message.type == WSMsgType.BINARY:
                            await browser.close(code=1003)
                        break
                    raw = message.data
                    try:
                        data = json.loads(raw)
                        if isinstance(data, dict) and data.get('type') == 'join' and data.get('role') == 'client':
                            room = data.get('room')
                            setting = cfg.get('rooms', {}).get(room)
                            if setting:
                                token=data.get('token','')
                                if isinstance(token,str) and token.startswith('bc_'):
                                    host_room=json.loads((root/'cloud-native/host.config.json').read_text(encoding='utf-8-sig')).get('room')
                                    if room!=host_room or not broadcast or guest_attached or not broadcast.attach(token,close_guest):
                                        await browser.close(code=4003,message=b'Broadcast credentials expired');break
                                    guest_attached=True
                                    data['token']=setting['client_token']
                                stamp = int(time.time())
                                nonce = secrets.token_hex(16)
                                guard = is_host_client(request.remote) and request.host != urlsplit(active_public).netloc
                                payload = f'{room}|{int(guard)}|{stamp}|{nonce}'
                                signature = hmac.new(setting['host_token'].encode(), payload.encode(), hashlib.sha256).hexdigest()
                                data.update(proxySelfHost=guard, proxyTime=stamp, proxyNonce=nonce, proxySignature=signature)
                                raw = json.dumps(data)
                    except (ValueError, TypeError):
                        pass
                    await backend.send_str(raw)

            async def downstream():
                async for message in backend:
                    if message.type == WSMsgType.TEXT:
                        if guest_attached:
                            try:
                                reply=json.loads(message.data)
                                if reply.get('type')=='joined':broadcast.connected(close_guest)
                            except (ValueError,TypeError):pass
                        await browser.send_str(message.data)
                    else:
                        break
                await browser.close(code=backend.close_code or 1000)

            tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream())]
            try:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                if guest_attached:broadcast.detach(close_guest)
                await backend.close()
                await browser.close()
        return browser

    app.router.add_get('/native/', player)
    app.router.add_get('/native/settings-original.html', original_settings)
    app.router.add_get('/native/mouse_controller.js', mouse)
    app.router.add_get('/native/connection.js', connection_script)
    app.router.add_post('/api/native-session', session)
    app.router.add_get('/signal', signal)
