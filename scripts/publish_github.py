"""Publish the audited source bundle through authenticated GitHub CLI APIs."""
import argparse
import base64
import json
import subprocess
from pathlib import Path
from package_source import ROOT

REPO = 'Trgianghe/CloudPC'
GH = ROOT / '.tools/gh/bin/gh.exe'

def api(path, method='GET', payload=None):
    command=[str(GH),'api',path,'--method',method]
    raw=None
    if payload is not None:
        command+=['--input','-']
        raw=json.dumps(payload,ensure_ascii=False).encode('utf-8')
    result=subprocess.run(command,input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8',errors='replace').strip())
    return json.loads(result.stdout) if result.stdout.strip() else {}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--publish',action='store_true')
    args=parser.parse_args()
    # Package performs credential scanning first; publish only the resulting archive.
    subprocess.run([__import__('sys').executable,str(ROOT/'scripts/package_source.py')],check=True)
    import zipfile
    with zipfile.ZipFile(ROOT/'publish-dist/CloudPC-source.zip') as archive:
        entries=[{'path':name,'mode':'100644','type':'blob','content':archive.read(name).decode('utf-8-sig')} for name in archive.namelist()]
    print(f'Ready: {len(entries)} audited source files for {REPO}; no host configs.')
    if not args.publish:return
    if subprocess.run([str(GH),'auth','status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
        raise RuntimeError('Complete GitHub CLI device login first.')
    repo=api(f'repos/{REPO}')
    branch=repo['default_branch']
    try:
        ref=api(f'repos/{REPO}/git/ref/heads/{branch}')
    except RuntimeError as error:
        if not any(code in str(error) for code in ('404','409')):raise
        api(f'repos/{REPO}/contents/README.md','PUT',{'message':'Initialize CloudPC source repository','content':base64.b64encode(b'# CloudPC\n').decode(),'branch':branch})
        ref=api(f'repos/{REPO}/git/ref/heads/{branch}')
    parent=ref['object']['sha']
    commit=api(f'repos/{REPO}/git/commits/{parent}')
    tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':commit['tree']['sha'],'tree':entries})
    authored=api(f'repos/{REPO}/git/commits','POST',{'message':'Apply Liquid Glass inspired styling to the main CloudPC website and in-session settings','tree':tree['sha'],'parents':[parent]})
    api(f'repos/{REPO}/git/refs/heads/{branch}','PATCH',{'sha':authored['sha'],'force':False})
    print('Published commit:',authored['sha'])
    # Enable Pages from Actions; public static UI contains no access credentials.
    try:
        api(f'repos/{REPO}/pages')
    except RuntimeError as error:
        if '404' not in str(error):raise
        api(f'repos/{REPO}/pages','POST',{'build_type':'workflow'})
    else:
        api(f'repos/{REPO}/pages','PUT',{'build_type':'workflow'})
    api(f'repos/{REPO}/actions/workflows/pages.yml/dispatches','POST',{'ref':branch})
    print('Pages workflow dispatched. Verify deployment before sharing a live URL.')

if __name__=='__main__':
    main()
