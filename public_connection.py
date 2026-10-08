"""Read an owner-created temporary HTTPS route; never credentials."""
import json
from pathlib import Path
from urllib.parse import urlsplit

def public_origin(root,configured=''):
    if configured:
        parsed=urlsplit(configured)
        if parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password and parsed.path in ('','/'):
            return 'https://'+parsed.netloc
    try:
        value=json.loads((Path(root)/'runtime_logs/public-connection.json').read_text(encoding='utf-8-sig'))
        parsed=urlsplit(value['origin'])
        if parsed.scheme=='https' and parsed.hostname.endswith('.trycloudflare.com') and not parsed.username and not parsed.password and parsed.path in ('','/') and not parsed.port:
            return 'https://'+parsed.hostname
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    return ''

def links(root,lan,username,configured=''):
    origin=public_origin(root,configured)
    from urllib.parse import urlencode
    def link(host):
        return 'https://trgianghe.github.io/CloudPC/?'+urlencode({'join':'1','host':host,'name':username})
    return {'lanJoinURL':lan.rstrip('/')+'/?'+urlencode({'join':'1','name':username}),
            'publicJoinURL':link(origin) if origin else '', 'internetOrigin':origin,
            'joinURL':link(origin) if origin else lan.rstrip('/')+'/?'+urlencode({'join':'1','name':username})}
