import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from broadcast_service import Broadcast, register_broadcast


class BroadcastHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory=tempfile.TemporaryDirectory();root=Path(self.directory.name)
        (root/'cloud-native').mkdir();(root/'cloud-native/host.config.json').write_text(json.dumps({'room':'qa-room'}))
        self.manager=Broadcast();self.manager.configure({'custom':True,'prefix':'qa','username':'qa-session','password':'qa-test-password-only'})
        await self.manager.transition('start')
        self.collect=patch('broadcast_service.collect_info',return_value={'name':'QA PC','host':'192.0.2.15','port':3390,'username':'QA\\player','rdpSupported':True,'rdpEnabled':True,'message':'Test metadata'})
        self.collect.start();app=web.Application();register_broadcast(app,root,self.manager)
        self.client=TestClient(TestServer(app));await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close();self.collect.stop();self.directory.cleanup()

    async def post(self,path,value):
        return await self.client.post(path,json=value)

    async def test_login_metadata_and_saved_access_lifecycle(self):
        response=await self.post('/api/broadcast/login',{'username':'qa-session','password':'qa-test-password-only'})
        self.assertEqual(response.status,200);data=await response.json()
        self.assertEqual(data['apps']['rdp']['port'],3390)
        self.assertEqual(data['apps']['rdp']['username'],'QA\\player')
        self.assertNotIn('qa-test-password-only',json.dumps(data));access=data['access']
        downloaded=await self.client.get(data['rdpDownload']);self.assertEqual(downloaded.status,200)
        self.assertIn('attachment',downloaded.headers['Content-Disposition'])
        content=(await downloaded.read()).decode('utf-16');self.assertIn('full address:s:192.0.2.15:3390',content);self.assertIn('username:s:QA\\player',content)
        repeated=await self.client.get(data['rdpDownload']);self.assertEqual(repeated.status,410)
        await self.manager.transition('pause')
        response=await self.post('/api/broadcast/session',{'access':access});paused=await response.json();self.assertEqual(paused['state'],'paused')
        paused_file=await self.client.get(paused['rdpDownload']);self.assertEqual(paused_file.status,200)
        response=await self.post('/api/broadcast/session',{'access':access,'action':'connect'});self.assertEqual(response.status,400)
        await self.manager.transition('resume')
        response=await self.post('/api/broadcast/session',{'access':access,'action':'connect'});self.assertIn('ticket',await response.json())
        await self.manager.transition('stop')
        response=await self.post('/api/broadcast/session',{'access':access});self.assertEqual((await response.json())['state'],'off')
        await self.manager.transition('start')
        response=await self.post('/api/broadcast/session',{'access':access});self.assertEqual(response.status,401)

    async def test_bad_credentials_reveal_no_app_metadata(self):
        response=await self.post('/api/broadcast/login',{'username':'qa-session','password':'wrong'})
        self.assertEqual(response.status,401);self.assertNotIn('apps',await response.json());self.assertFalse(self.manager.grants)
        response=await self.post('/api/broadcast/session',{'access':'invalid'})
        self.assertEqual(response.status,401);self.assertEqual((await response.json())['state'],'expired')


if __name__=='__main__':unittest.main()
