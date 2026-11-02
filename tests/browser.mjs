import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {root} from '../tools/build.mjs';

const browserPath=process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if(!fs.existsSync(browserPath))throw Error('Set BROWSER_PATH to a Chromium browser executable.');
const profile=path.join(root,'.test-browser',String(Date.now()));
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(path.join(root,'.test-results'),{recursive:true});
const browser=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
const errors=[];
try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<150&&!fs.existsSync(portFile);i++)await pause(100);
  if(!fs.existsSync(portFile))throw Error('Browser did not start.');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  let seq=0;const pending=new Map();
  function send(method,params={}) {
    const id=++seq;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},15000);
      pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result)}}
    if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));
    if(message.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
  };
  await send('Page.enable');await send('Runtime.enable');
  async function run(expression) {
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  async function click(selector) {await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled control: '+${JSON.stringify(selector)});e.dispatchEvent(new MouseEvent('click',{bubbles:true}))})()`)}
  async function check(expression,label) {assert.equal(await run(expression),true,label);console.log('PASS '+label)}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});
  for(let i=0;i<100;i++){if(await run("document.readyState==='complete' && typeof document.getElementById('newGameMain')?.onclick==='function'"))break;await pause(100)}
  await check("!document.getElementById('mainScreen').classList.contains('hide')",'file:// main menu');
  await click('#newGameMain');await run("document.getElementById('seedInput').value='browser-v13'");await click('#startGame');
  await check("document.querySelector('#turn').textContent==='턴 1' && document.querySelectorAll('.shiphit').length===3",'seeded game and three ships');
  await click('#zoomin');await click('#zoomout');await click('#center');
  await click('#menuBtn');await click('#revealMapBtn');await check("document.querySelectorAll('.starhit').length===100",'full map toggle');
  await click('#menuBtn');await click('#revealMapBtn');
  await click('.starhit[data-id="0"]');await click('#planetList button');
  await check("!document.querySelector('#habitatView').classList.contains('hide') && document.querySelectorAll('#habCommon article').length===6 && document.querySelectorAll('#habSpecial article').length===3",'habitat screen and all slots');
  await click('[data-hadd="1"]');await click('#modalBody .slotRow');await click('[data-hcw="1"][data-delta="1"]');await click('[data-hup="1"]');
  await click('[data-hsadd="0"]');await click('#modalBody .slotRow');await click('[data-hsw="0"][data-delta="1"]');await click('[data-hsexpand="0"]');await click('[data-hsub="0"][data-subindex="0"]');await click('#habExpandCommon');
  await check("document.querySelector('#habStats').textContent.includes('6 / 12') && document.querySelector('#habSpecial').textContent.includes('부속 시설 설치됨')",'build, upgrade, workers, subfacility and common expansion');
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.test-results','habitat-desktop.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await check('document.documentElement.scrollWidth<=390','mobile layout has no horizontal overflow');
  const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.test-results','habitat-mobile.png'),Buffer.from(mobile.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click('#back');await click('#planetList button:nth-child(2)');await click('#levelUp');await click('#closeModal');await click('#nextTurn');await click('#planetList button:nth-child(2)');
  await check("document.querySelector('#modalBody').textContent.includes('Lv.2')",'mining construction completes on next turn');await click('#closeModal');
  await click('#menuBtn');await click('#gameSave');await click('[data-slot="0"]');await click('#closeModal');
  const saved=await run("JSON.parse(localStorage.getItem('space_civilization_slots_v5'))[0]");
  assert.equal(saved.turn,2);assert.equal(saved.state.stars[0].planets[0].habData.special[0].subs[0],true);
  await click('#nextTurn');await click('#menuBtn');await click('#gameLoad');await click('[data-slot="0"]');
  await check("document.querySelector('#turn').textContent==='턴 2'",'load restores saved turn and state');
  await click('#menuBtn');await click('#toMain');await click('#loadMain');await click('[data-slot="0"]');
  await check("document.querySelector('#mainScreen').classList.contains('hide') && document.querySelector('#turn').textContent==='턴 2'",'load from main menu');
  await click('.res');await check("document.querySelector('.res').classList.contains('open')",'resource detail tooltip');
  await send('Page.reload');
  for(let i=0;i<100;i++){await pause(100);if(await run("document.readyState==='complete' && typeof document.getElementById('loadMain')?.onclick==='function'"))break}
  await click('#loadMain');await click('[data-slot="0"]');
  await check("document.querySelector('#turn').textContent==='턴 2'",'save persists across reload on file://');
  assert.deepEqual(errors,[],'No browser runtime errors');console.log('PASS no browser runtime errors');
  await send('Browser.close').catch(()=>{});
} finally {socket?.close();browser.kill()}
