import unittest
from types import SimpleNamespace
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from rdp_discovery import allowed_request, register_rdp_discovery

class AccessTests(unittest.TestCase):
    def request(self,remote='127.0.0.1',host='127.0.0.1:8443',origin=None):
        return SimpleNamespace(remote=remote,host=host,headers={'Origin':origin} if origin else {})
    def test_local_and_pages_allowed(self):
        self.assertTrue(allowed_request(self.request()))
        self.assertTrue(allowed_request(self.request(origin='https://trgianghe.github.io')))
        self.assertTrue(allowed_request(self.request(origin='http://127.0.0.1:8443')))
    def test_rejects_remote_lan_untrusted_origin_and_rebinding(self):
        for request in [self.request(remote='192.168.1.2'),self.request(host='attacker.example:8443'),self.request(origin='https://attacker.example'),self.request(origin='null')]:
            self.assertFalse(allowed_request(request))

class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls=0
        def collect():
            self.calls+=1
            return {'host':'192.0.2.20','port':3389,'username':'TEST\\Player','rdpSupported':False,'rdpEnabled':False}
        app=web.Application();register_rdp_discovery(app,collect)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):
        await self.client.close()
    async def test_pages_scan_and_preflight(self):
        origin={'Origin':'https://trgianghe.github.io'}
        response=await self.client.options('/api/rdp-info',headers=origin)
        self.assertEqual(response.status,204);self.assertEqual(self.calls,0)
        self.assertEqual(response.headers['Access-Control-Allow-Private-Network'],'true')
        response=await self.client.post('/api/rdp-info',headers=origin)
        self.assertEqual(response.status,200);data=await response.json()
        self.assertEqual(data['host'],'192.0.2.20');self.assertFalse(data['rdpSupported'])
        self.assertNotIn('password',data);self.assertEqual(response.headers['Cache-Control'],'no-store')
    async def test_untrusted_page_never_collects(self):
        response=await self.client.post('/api/rdp-info',headers={'Origin':'https://attacker.example'})
        self.assertEqual(response.status,403);self.assertEqual(self.calls,0)
    async def test_get_does_not_scan(self):
        response=await self.client.get('/api/rdp-info')
        self.assertEqual(response.status,405);self.assertEqual(self.calls,0)

if __name__=='__main__':unittest.main()
