"""Time-limited guest credentials for the existing WebRTC gateway."""
import asyncio
import base64
import ctypes
import hashlib
import json
import os
import secrets
import time
from pathlib import Path
from aiohttp import web, ClientSession, ClientTimeout, ClientError
from rdp_discovery import allowed_request, collect_info


def protect(text, decrypt=False):
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]
    raw=base64.b64decode(text) if decrypt else text.encode('utf-8')
    buffer=ctypes.create_string_buffer(raw)
    source=Blob(len(raw),ctypes.cast(buffer,ctypes.POINTER(ctypes.c_ubyte)));dest=Blob()
    crypt=ctypes.windll.crypt32
    function=crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    if not function(ctypes.byref(source),None,None,None,None,1,ctypes.byref(dest)):
        raise OSError('Windows không cho lưu thông tin tùy chỉnh an toàn.')
    try:
        result=ctypes.string_at(dest.data,dest.size)
        return result.decode('utf-8') if decrypt else base64.b64encode(result).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes=[ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(dest.data)


class Broadcast:
    def __init__(self,path=None,clock=time.monotonic,wall=time.time):
        self.path=Path(path) if path else None;self.clock=clock;self.wall=wall
        self.preferences={'custom':False,'prefix':'pccloud','username':'','password':''}
        if self.path and self.path.exists():
            try:self.preferences=json.loads(protect(self.path.read_text(),True))
            except (OSError,ValueError):pass
        self.state='off';self.username='';self.password='';self.digest=b''
        self.active=0.;self.paused=0.;self.changed=self.clock();self.started=0.;self.connections=0
        self.generation=0;self.tickets={};self.clients=set();self.joined=set();self.attempts={};self.last=None
        self.session_id='';self.grants={}

    def configure(self,value):
        if self.state!='off':raise ValueError('Kết thúc phiên trước khi đổi thông tin truy cập.')
        if not isinstance(value,dict):raise ValueError('Cài đặt không hợp lệ.')
        custom=value.get('custom') is True;prefix=str(value.get('prefix','pccloud')).strip()
        if not prefix or len(prefix)>20 or not all(c.isascii() and (c.isalnum() or c in '-_') for c in prefix):raise ValueError('Mẫu tên: 1–20 chữ/số, dấu - hoặc _.')
        username=str(value.get('username','')).strip();password=str(value.get('password',''))
        if custom and (not username or len(username)>64 or any(c in username for c in '\r\n') or len(password)<12 or len(password)>128):raise ValueError('Tên tối đa 64 ký tự; mật khẩu tùy chỉnh từ 12–128 ký tự.')
        next_value={'custom':custom,'prefix':prefix,'username':username if custom else '', 'password':password if custom else ''}
        if self.path:
            self.path.parent.mkdir(exist_ok=True,parents=True)
            encrypted=protect(json.dumps(next_value));temporary=self.path.with_suffix('.tmp')
            temporary.write_text(encrypted);os.replace(temporary,self.path)
        self.preferences=next_value

    def durations(self):
        delta=max(0,self.clock()-self.changed)
        return (self.active+(delta if self.state=='running' else 0),self.paused+(delta if self.state=='paused' else 0))

    async def revoke(self):
        self.generation+=1;self.tickets.clear()
        callbacks=list(self.clients)
        await asyncio.gather(*(asyncio.wait_for(close(),3) for close in callbacks),return_exceptions=True)
        self.clients.clear();self.joined.clear()

    async def transition(self,action):
        if action=='start':
            if self.state!='off':raise ValueError('Phiên đã được bật.')
            self.generation+=1;pref=self.preferences;self.session_id=secrets.token_urlsafe(24)
            self.username=pref['username'] if pref['custom'] else pref['prefix']+'-'+secrets.token_hex(3)
            self.password=pref['password'] if pref['custom'] else secrets.token_urlsafe(18)
            self.salt=secrets.token_bytes(16);self.digest=await asyncio.to_thread(hashlib.scrypt,self.password.encode(),salt=self.salt,n=16384,r=8,p=1)
            self.active=self.paused=0.;self.connections=0;self.started=self.wall();self.changed=self.clock();self.state='running';self.last=None
        elif action=='pause' and self.state=='running':
            self.active,self.paused=self.durations();self.state='paused';self.changed=self.clock();await self.revoke()
        elif action=='resume' and self.state=='paused':
            self.active,self.paused=self.durations();self.state='running';self.changed=self.clock()
        elif action=='stop' and self.state in ('running','paused'):
            self.active,self.paused=self.durations();self.state='off';self.changed=self.clock()
            self.last={'activeSeconds':self.active,'pausedSeconds':self.paused,'elapsedSeconds':self.active+self.paused,'startedAt':self.started,'endedAt':self.wall(),'connections':self.connections,'custom':self.preferences['custom']}
            await self.revoke();self.password='';self.digest=b''
        else:raise ValueError('Thao tác không phù hợp với trạng thái phiên.')
        return self.status()

    def status(self):
        active,paused=self.durations()
        return {'state':self.state,'username':self.username,'password':self.password,'activeSeconds':active,'pausedSeconds':paused,'startedAt':self.started,'connections':self.connections,'connected':len(self.joined),'preferences':self.preferences,'summary':self.last}

    def login(self,username,password,address):
        now=self.clock();recent=[t for t in self.attempts.get(address,[]) if now-t<60]
        if len(recent)>=8:raise PermissionError('Thử lại sau một phút.')
        self.attempts[address]=recent+[now]
        if self.state!='running' or len(password)>128 or username!=self.username:raise PermissionError('Phiên chưa phát hoặc thông tin không đúng.')
        generation=self.generation;expected=self.digest;salt=self.salt
        digest=hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1)
        if self.state!='running' or generation!=self.generation or not secrets.compare_digest(expected,self.digest) or not secrets.compare_digest(digest,expected):raise PermissionError('Thông tin truy cập không đúng.')
        self.attempts.pop(address,None)
        for ticket,(expiry,_) in list(self.tickets.items()):
            if expiry<now:self.tickets.pop(ticket,None)
        if len(self.tickets)>=64:raise PermissionError('Đã có quá nhiều yêu cầu kết nối.')
        ticket='bc_'+secrets.token_urlsafe(32);self.tickets[ticket]=(now+60,generation)
        return ticket

    def attach(self,ticket,close):
        expiry,generation=self.tickets.pop(ticket,(0,-1))
        if self.state!='running' or generation!=self.generation or expiry<=self.clock():return False
        self.clients.add(close);return True

    def connected(self,close):
        if close in self.clients and close not in self.joined:self.joined.add(close);self.connections+=1

    def detach(self,close):self.clients.discard(close);self.joined.discard(close)

    def issue_access(self):
        now=self.clock()
        self.grants={key:value for key,value in self.grants.items() if value[0]>now}
        if len(self.grants)>=256:raise PermissionError('Quá nhiều hồ sơ truy cập. Thử lại sau.')
        token=secrets.token_urlsafe(32)
        self.grants[hashlib.sha256(token.encode()).digest()]=(now+43200,self.session_id)
        return token

    def guest_state(self,token,connect=False):
        expiry,session=self.grants.get(hashlib.sha256(token.encode()).digest(),(0,''))
        if expiry<=self.clock() or not session or session!=self.session_id:
            raise PermissionError('Phiên đã hết hạn. Đăng nhập phiên phát mới.')
        result={'state':self.state,'sessionId':session,'username':self.username}
        if connect:
            if self.state!='running':raise ValueError('PC đã tạm dừng.' if self.state=='paused' else 'Máy này đã tắt. Phiên đã hết hạn.')
            now=self.clock()
            self.tickets={key:value for key,value in self.tickets.items() if value[0]>now}
            if len(self.tickets)>=64:raise ValueError('Quá nhiều yêu cầu kết nối.')
            ticket='bc_'+secrets.token_urlsafe(32);self.tickets[ticket]=(now+60,self.generation)
            result['ticket']=ticket
        return result


def register_broadcast(app,root,manager):
    action_lock=asyncio.Lock()
    async def connection_info(request):
        info=await asyncio.to_thread(collect_info)
        cfg=json.loads((root/'cloud-native/host.config.json').read_text(encoding='utf-8-sig'))
        return {'room':cfg['room'],'name':info['name'],'apps':{
            'webrtc':{'label':'PC Cloud · trên web'},
            'rdp':{'label':'Remote Desktop','host':info['host'],'port':info['port'],'username':info['username'],'supported':info['rdpSupported'],'enabled':info['rdpEnabled'],'message':info['message']},
            'moonlight':{'label':'Moonlight / Sunshine','host':info['host'],'message':'Thêm địa chỉ này trong Moonlight. Cần Sunshine đang chạy trên PC; ghép đôi bằng PIN trên Sunshine. Chưa kiểm tra trạng thái Sunshine.'},
            'parsec':{'label':'Parsec','url':'https://web.parsec.app/','message':'Đăng nhập tài khoản Parsec được host cấp quyền. Tài khoản Phát PC không phải tài khoản Parsec.'}}}
    def cors(request):
        origin=request.headers.get('Origin');allowed={f'{request.scheme}://{request.host}','https://trgianghe.github.io'}
        if origin and origin not in allowed:raise web.HTTPForbidden(text='Trang này không được phép đăng nhập phiên phát.')
        headers={'Cache-Control':'no-store','Vary':'Origin'}
        if origin:headers.update({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'})
        return headers

    async def owner(request):
        if not allowed_request(request):raise web.HTTPForbidden(text='Mở mục Phát PC trên web local của chính PC host.')
        headers=cors(request)
        if request.headers.get('Origin'):headers['Access-Control-Allow-Private-Network']='true'
        if request.method=='OPTIONS':return web.Response(status=204,headers=headers)
        try:
            data=await request.json()
            if not isinstance(data,dict):raise ValueError('Yêu cầu không hợp lệ.')
            action=data.get('action','status')
            if action=='start':
                cfg=json.loads((root/'cloud-native/server.config.json').read_text(encoding='utf-8-sig'))
                url=f"{'https' if cfg.get('tls_cert') else 'http'}://127.0.0.1:{int(cfg.get('port',9443))}/health"
                try:
                    async with ClientSession(timeout=ClientTimeout(total=3)) as client:
                        async with client.get(url) as response:health=await response.json()
                    if not health.get('hostOnline'):raise ValueError('PC host chưa online. Chạy open_web.bat bản mới trước khi phát.')
                except (OSError,asyncio.TimeoutError,ClientError):raise ValueError('Engine chưa chạy. Chạy open_web.bat trên PC.')
            async with action_lock:
                if action=='configure':manager.configure(data.get('preferences',{}))
                elif action!='status':await manager.transition(action)
            result=manager.status()
            try:
                info=await asyncio.to_thread(collect_info);cfg=json.loads((root/'config.json').read_text(encoding='utf-8-sig'))
                origin=cfg.get('public_origin') or f'{request.scheme}://{info["host"]}:{request.url.port or 8443}'
                result.update(hostName=info['name'],joinURL=origin.rstrip('/')+'/?join=1',rdpSupported=info['rdpSupported'])
            except (OSError,RuntimeError,ValueError):result.update(hostName='PC host',joinURL='')
            return web.json_response(result,headers=headers)
        except (ValueError,TypeError,OSError) as error:return web.json_response({'error':str(error)},status=400,headers=headers)

    async def guest(request):
        headers=cors(request)
        if request.method=='OPTIONS':return web.Response(status=204,headers=headers)
        try:
            data=await request.json()
            if not isinstance(data,dict):raise ValueError('Yêu cầu không hợp lệ.')
            ticket=await asyncio.to_thread(manager.login,str(data.get('username','')),str(data.get('password','')),request.remote)
            # Metadata is returned only after authentication. No Windows passwords.
            details=await connection_info(request)
            if ticket not in manager.tickets or manager.state!='running':raise PermissionError('Phiên đã thay đổi. Đăng nhập lại.')
            access=manager.issue_access()
            return web.json_response({**details,'ticket':ticket,'access':access,'sessionId':manager.session_id,'state':manager.state},headers=headers)
        except PermissionError as error:return web.json_response({'error':str(error)},status=401,headers=headers)
        except (ValueError,TypeError,OSError):return web.json_response({'error':'Không đăng nhập được. Kiểm tra host đã bật.'},status=400,headers=headers)

    async def session(request):
        headers=cors(request)
        if request.method=='OPTIONS':return web.Response(status=204,headers=headers)
        try:
            data=await request.json()
            if not isinstance(data,dict) or not isinstance(data.get('access'),str) or len(data['access'])>128:raise PermissionError('Phiên đã hết hạn.')
            result=manager.guest_state(data['access'],data.get('action')=='connect')
            if 'ticket' in result:
                cfg=json.loads((root/'cloud-native/host.config.json').read_text(encoding='utf-8-sig'));result['room']=cfg['room']
            return web.json_response(result,headers=headers)
        except PermissionError as error:return web.json_response({'error':str(error),'state':'expired'},status=401,headers=headers)
        except (ValueError,TypeError,OSError) as error:return web.json_response({'error':str(error)},status=400,headers=headers)

    app.router.add_post('/api/broadcast',owner);app.router.add_options('/api/broadcast',owner)
    app.router.add_post('/api/broadcast/login',guest);app.router.add_options('/api/broadcast/login',guest)
    app.router.add_post('/api/broadcast/session',session);app.router.add_options('/api/broadcast/session',session)
