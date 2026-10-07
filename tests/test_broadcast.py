import unittest
from broadcast_service import Broadcast, protect

class BroadcastTests(unittest.IsolatedAsyncioTestCase):
    async def test_clock_freezes_and_revokes_on_pause(self):
        now=[0.0];b=Broadcast(clock=lambda:now[0],wall=lambda:1000+now[0])
        await b.transition('start');ticket=b.login(b.username,b.password,'test');closed=[]
        async def close():closed.append(True)
        self.assertTrue(b.attach(ticket,close));b.connected(close)
        self.assertFalse(b.attach(ticket,close))
        now[0]=12;await b.transition('pause');now[0]=42
        self.assertEqual(b.durations(),(12,30));self.assertEqual(closed,[True])
        with self.assertRaises(PermissionError):b.login(b.username,b.password,'test')
        await b.transition('resume');now[0]=50;result=await b.transition('stop')
        self.assertEqual(result['summary']['activeSeconds'],20)
        self.assertEqual(result['summary']['pausedSeconds'],30)
        self.assertEqual(result['summary']['connections'],1)
        self.assertEqual(b.password,'')

    async def test_random_rotates_custom_stays_and_tickets_expire(self):
        now=[0.0];b=Broadcast(clock=lambda:now[0]);await b.transition('start')
        first=(b.username,b.password);ticket=b.login(*first,'test');now[0]=61
        async def close():pass
        self.assertFalse(b.attach(ticket,close));await b.transition('stop');await b.transition('start')
        self.assertNotEqual(first,(b.username,b.password));await b.transition('stop')
        b.configure({'custom':True,'prefix':'game','username':'chosen','password':'a-long-test-password'})
        for _ in range(2):
            await b.transition('start');self.assertEqual(b.username,'chosen');self.assertEqual(b.password,'a-long-test-password');await b.transition('stop')

    async def test_bad_password_and_rate_limit(self):
        b=Broadcast();await b.transition('start')
        for _ in range(8):
            with self.assertRaises(PermissionError):b.login(b.username,'incorrect','test')
        with self.assertRaisesRegex(PermissionError,'một phút'):b.login(b.username,b.password,'test')

    def test_dpapi_roundtrip(self):
        encrypted=protect('test-only-secret');self.assertNotIn('test-only-secret',encrypted)
        self.assertEqual(protect(encrypted,True),'test-only-secret')

    def test_custom_preferences_reload_encrypted(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        with TemporaryDirectory() as directory:
            path=Path(directory)/'preferences.dpapi';b=Broadcast(path)
            b.configure({'custom':True,'prefix':'game','username':'chosen','password':'a-long-test-password'})
            self.assertNotIn('a-long-test-password',path.read_text())
            self.assertEqual(Broadcast(path).preferences,b.preferences)
            b.configure({'custom':False,'prefix':'game'})
            self.assertEqual(Broadcast(path).preferences['password'],'')

    async def test_saved_access_survives_pause_but_not_new_session(self):
        now=[0.0];b=Broadcast(clock=lambda:now[0]);await b.transition('start')
        b.login(b.username,b.password,'test');access=b.issue_access()
        first=b.guest_state(access,True)['ticket']
        await b.transition('pause')
        self.assertEqual(b.guest_state(access)['state'],'paused')
        self.assertNotIn(first,b.tickets)
        with self.assertRaises(ValueError):b.guest_state(access,True)
        await b.transition('resume');self.assertIn('ticket',b.guest_state(access,True))
        await b.transition('stop');self.assertEqual(b.guest_state(access)['state'],'off')
        with self.assertRaises(ValueError):b.guest_state(access,True)
        await b.transition('start')
        with self.assertRaises(PermissionError):b.guest_state(access)

    async def test_access_expiry_and_invalid_token(self):
        now=[0.0];b=Broadcast(clock=lambda:now[0]);await b.transition('start');access=b.issue_access()
        with self.assertRaises(PermissionError):b.guest_state('not-a-session')
        now[0]=43201
        with self.assertRaises(PermissionError):b.guest_state(access,True)

if __name__=='__main__':unittest.main()
