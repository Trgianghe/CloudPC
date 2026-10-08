import json,tempfile,unittest
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from public_connection import links,public_origin

class PublicConnectionTests(unittest.TestCase):
    def test_routes_never_include_credentials_and_require_https_for_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            local=links(root,'http://192.168.1.20:8443','pc-demo')
            self.assertEqual(local['publicJoinURL'],'')
            self.assertTrue(local['lanJoinURL'].startswith('http://192.168.1.20:8443/'))
            remote=links(root,'http://192.168.1.20:8443','pc-demo','https://pc.example.com')
            query=parse_qs(urlsplit(remote['publicJoinURL']).query)
            self.assertEqual(query['host'],['https://pc.example.com'])
            self.assertEqual(query['name'],['pc-demo'])
            self.assertNotIn('password',query)
            self.assertEqual(public_origin(root,'http://pc.example.com'),'')
            self.assertEqual(public_origin(root,'https://user:pass@pc.example.com'),'')
            (root/'runtime_logs').mkdir()
            state=root/'runtime_logs/public-connection.json'
            state.write_text(json.dumps({'origin':'https://demo.trycloudflare.com'}))
            self.assertEqual(public_origin(root),'https://demo.trycloudflare.com')
            state.write_text(json.dumps({'origin':'https://evil.example.com'}))
            self.assertEqual(public_origin(root),'')
