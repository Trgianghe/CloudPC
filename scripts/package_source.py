"""Package only reviewed source roots, never machine credentials or runtime files."""
from pathlib import Path
import hashlib
import zipfile
from build_pages import ROOT, build

def source_files():
    names = ['.gitignore', 'README.md', 'GITHUB-DEPLOY.md', 'Caddyfile.example',
             'config.example.json', 'requirements.txt', 'server.py', 'streaming.py',
             'ffmpeg_stream.py', 'mouse_input.py', 'native_gateway.py', 'fix_rdp.bat',
             'launch_web.ps1', 'open_web.bat', 'start.ps1', 'start_native_backend.ps1']
    files = [ROOT / name for name in names]
    for directory, suffixes in [('web', {'.html','.js','.css','.svg'}),
                                ('scripts', {'.py','.ps1'}), ('tests', {'.py'}),
                                ('.github/workflows', {'.yml'})]:
        files.extend(p for p in (ROOT/directory).iterdir() if p.is_file() and p.suffix in suffixes)
    native = ROOT/'cloud-native'
    names = ['index.html','connection.js','mouse_controller.js','server.js','package.json',
             'pnpm-lock.yaml','README.md','setup.ps1','start_host.ps1','start_signaling.ps1',
             'fix_rdp.bat','server.config.example.json','host.config.example.json',
             'client.config.example.json']
    files.extend(native/name for name in names)
    for directory, suffixes in [('host',{'.go','.mod','.sum'}),('tests',{'.cjs'}),('scripts',{'.ps1'})]:
        files.extend(p for p in (native/directory).iterdir() if p.is_file() and p.suffix in suffixes)
    return sorted(set(files))

if __name__=='__main__':
    build()
    output=ROOT/'publish-dist'
    output.mkdir(exist_ok=True)
    files=source_files()
    # Compare private token values against all exported bytes without printing values.
    import json
    secrets=[]
    for private in [ROOT/'config.json',ROOT/'cloud-native/server.config.json']:
        if private.exists():
            def visit(value):
                if isinstance(value,dict):
                    for key,item in value.items():
                        if key in ('access_code','host_token','client_token','credential') and isinstance(item,str) and len(item)>=16:secrets.append(item.encode())
                        else:visit(item)
                elif isinstance(value,list):
                    for item in value:visit(item)
            visit(json.loads(private.read_text(encoding='utf-8-sig')))
    for p in files:
        if any(secret in p.read_bytes() for secret in secrets):raise RuntimeError('Private credential found in '+str(p.relative_to(ROOT)))
    with zipfile.ZipFile(output/'CloudPC-source.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for p in files:archive.write(p,p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(output/'CloudPC-pages.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for p in (ROOT/'pages-dist').rglob('*'):
            if p.is_file():archive.write(p,p.relative_to(ROOT/'pages-dist').as_posix())
    manifest='\n'.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(ROOT).as_posix()}' for p in files)
    (output/'source-manifest.txt').write_text(manifest,encoding='utf-8')
    print(f'Packaged {len(files)} source files; credential scan passed.')
