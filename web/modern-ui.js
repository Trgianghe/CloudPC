(() => {
  const density=document.getElementById('compact-ui');
  const apply=compact=>{document.body.classList.toggle('compact-ui',compact);density.setAttribute('aria-pressed',String(compact));density.textContent=compact?'Mở rộng giao diện':'Giao diện gọn';};
  let saved=false;try{saved=localStorage.getItem('pccloud.ui.compact')==='true';}catch{}
  apply(saved);
  const glass=document.getElementById('glass-mode');
  if(glass){
    const setGlass=tinted=>{document.body.classList.toggle('glass-tinted',tinted);glass.setAttribute('aria-pressed',String(tinted));glass.textContent=tinted?'Kính trong':'Kính đậm';};
    let tinted=false;try{tinted=localStorage.getItem('pccloud.ui.tinted')==='true';}catch{}
    setGlass(tinted);
    glass.addEventListener('click',()=>{const tinted=!document.body.classList.contains('glass-tinted');setGlass(tinted);try{localStorage.setItem('pccloud.ui.tinted',String(tinted));}catch{}});
  }
  density.addEventListener('click',()=>{const compact=!document.body.classList.contains('compact-ui');apply(compact);try{localStorage.setItem('pccloud.ui.compact',String(compact));}catch{}});
  document.querySelectorAll('[data-performance]').forEach(button=>button.addEventListener('click',()=>{
    const profiles={fps:[1280,120,15],balanced:[1920,60,20],sharp:[2560,60,35]};
    const values=profiles[button.dataset.performance],form=document.getElementById('connection-form');
    for(const [i,name] of ['width','fps','bitrate'].entries())form.elements[name].value=String(values[i]);
    document.querySelectorAll('[data-performance]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  }));
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&document.getElementById('session').hidden&&!document.querySelector('dialog[open]')){event.preventDefault();openConnection();}
  });
})();
