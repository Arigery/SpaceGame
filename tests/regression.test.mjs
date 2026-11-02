import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {root,bundle,readData,sourceFiles} from '../tools/build.mjs';

const reference=fs.readFileSync(path.join(root,'space_exploration_v13.html'),'utf8');
const original=reference.match(/<script>([\s\S]*?)<\/script>/)[1];
const built=bundle();
function engine(source) {
  const element=()=>({classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return element()},querySelectorAll(){return []},style:{},dataset:{}});
  const nodes=new Map();
  const storage=new Map();
  const context=vm.createContext({document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},querySelector:element,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,alert(){},confirm:()=>true,setTimeout(){}});
  const expose=`
    render=()=>{};
    globalThis.api={generate,newHabitat,habCap,habGrowth,habProduce,habConsume,habPower,habFree,habPenalty,resourceDetails,incomes,reachable,moveShip,performAction,blackholeJump,nextTurn,getSlots,setSlots,
      start(seed){state=generate(seed);return state},get state(){return state},get pending(){return pendingDiscoveries}};
  `;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,expose+'})();'),context);
  return context.api;
}
const plain=value=>JSON.parse(JSON.stringify(value));
function same(a,b) { assert.deepEqual(plain(a),plain(b)); }

test('every original function and DOM control survives extraction',()=>{
  const names=s=>[...s.matchAll(/function\s+(\w+)\s*\(/g)].map(m=>m[1]).sort();
  same(names(original),names(built));
  const ids=s=>[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
  // Compare only static HTML (dynamic UI templates are covered by function tests).
  same(ids(reference.split('<script>')[0]),ids(fs.readFileSync(path.join(root,'index.html'),'utf8')));
  const css=reference.match(/<style>([\s\S]*?)<\/style>/)[1].trim();
  const split=fs.readFileSync(path.join(root,'styles/theme.css'),'utf8').replace(/\/\*.*?\*\/\s*/s,'')+fs.readFileSync(path.join(root,'styles/ui.css'),'utf8');
  assert.equal(split.trim(),css);
});
test('checked-in bundle matches JSON and source; all sources parse',()=>{
  assert.equal(fs.readFileSync(path.join(root,'game.js'),'utf8'),built);
  for(const f of sourceFiles)new vm.Script(fs.readFileSync(path.join(root,'src',f),'utf8'));
});
test('20 fixed seeds produce identical galaxies and initial state',()=>{
  const a=engine(original),b=engine(built);
  for(const seed of ['v13','테라','0','999999999',...Array.from({length:16},(_,i)=>'regression-'+i)])same(a.start(seed),b.start(seed));
});
test('population, construction, all buildings and 40 turns match v13',()=>{
  const a=engine(original),b=engine(built);
  for(const e of [a,b]) {
    e.start('economy');
    const h=e.state.stars[0].planets[0].habData;
    h.pop=15;h.baseCap=30;h.commonLevel=5;
    h.common=[{id:'center',level:5,workers:2},{id:'house',level:3,workers:1},{id:'medical',level:3,workers:1},{id:'admin_consumer',level:1,workers:1},{id:'log_mineral',level:1,workers:1},{id:'admin_food',level:1,workers:1}];
    h.special=[{id:'mineral',level:5,workers:3,subs:[true,true,true]},{id:'food',level:2,workers:2,subs:[false,true,false]},{id:'consumer',level:3,workers:3,subs:[false,false,false]}];
    e.state.stars[0].planets[1].construction={target:2,remaining:1};
    for(const s of e.state.stars.slice(1,12)){s.owned=true;for(const p of s.planets)if(p.type==='hab')p.habData=e.newHabitat()}
  }
  for(let i=0;i<40;i++){
    for(const method of ['incomes','resourceDetails','habPenalty'])same(a[method](),b[method]());
    a.nextTurn();b.nextTurn();same(a.state,b.state);
  }
  for(const def of readData().buildings.common)for(let level=1;level<=3;level++){
    const h=a.newHabitat();h.common[1]={id:def.id,level,workers:1};
    for(const method of ['habCap','habGrowth','habProduce','habConsume','habPower','habFree'])same(a[method](h),b[method](h));
  }
});
test('movement, action points, survey, colony and blackhole discovery match',()=>{
  const a=engine(original),b=engine(built);
  for(const e of [a,b]){
    e.start('exploration');
    const neighbor=e.state.neighbor;
    assert.equal(e.moveShip('explorer',neighbor),true);
    assert.equal(e.performAction('explorer'),true);
    assert.equal(e.moveShip('explorer',0),false);
    assert.equal(e.moveShip('colony',neighbor),true);
    assert.equal(e.performAction('colony'),true);
    const hole=e.state.stars.find(s=>s.blackholeTo!==null);
    e.state.ships.explorer2=hole.id;hole.surveyed=true;
    assert.equal(e.blackholeJump('explorer2'),true);
    assert.equal(e.performAction('explorer2'),true);
    e.nextTurn();
  }
  same(a.state,b.state);same(a.pending,b.pending);
  same([...a.reachable(0)],[...b.reachable(0)]);
});
test('v13 save slots round-trip with unchanged key and state shape',()=>{
  const a=engine(original),b=engine(built);a.start('saved-game');a.nextTurn();
  const slots=[{savedAt:'2026-11-03',race:'기본 종족',turn:a.state.turn,state:a.state},null,null,null,null];
  assert.equal(a.setSlots(slots),true);assert.equal(b.setSlots(a.getSlots()),true);same(a.getSlots(),b.getSlots());
  assert.ok(built.includes("const SAVE_KEY='space_civilization_slots_v5'"));
});
test('JSON production and initial resource changes are used by runtime',()=>{
  const data=readData();data.balance.initialResources.energy=987;data.buildings.center.production.food=17;
  data.buildings.special.find(b=>b.id==='mineral').productionPerWorker=9;
  const e=engine(bundle(data));e.start('data-test');assert.equal(e.state.res.energy,987);
  const h=e.newHabitat();h.special[0]={id:'mineral',workers:2,level:2,subs:[false,false,false]};
  assert.equal(e.habProduce(h).food,17);assert.equal(e.habProduce(h).mineral,18);
});
