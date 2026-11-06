function visible(id){let s=state.stars[id];return s.surveyed||!!s.discoveredByBlackhole||state.stars.some(t=>t.surveyed&&t.edges.includes(id))}
function rec(msg){dirty=true;state.records.unshift('턴 '+state.turn+' · '+msg);state.records=state.records.slice(0,18)}
// 자원 내역은 실제 턴 정산과 같은 계산식을 공유한다.
// 미결정 유지비(null)는 합산하지 않는다. 함선 유지비는 미결정이다.
function resourceDetails(){
 const details={};
 for(const k of HAB_RESOURCES)details[k]={production:{building:0,mining:0},consumption:{building:0,population:0,ship:0}};
 for(const s of state.stars)if(s.owned)for(const p of s.planets){
   const facility=DATA.planets[p.type];
   if(facility.resource)details[facility.resource].production.mining+=p.level*facility.productionPerLevel;
   if(facility.levels&&p.level>0)for(const [r,n] of Object.entries(facility.levels[p.level]?.upkeep||{}))if(Number.isFinite(n))details[r].consumption.building+=n;
   if(p.type==='hab'){
     const h=habitat(p),prod=habProduce(h),cons=habConsume(h),upkeep=habUpkeep(h);
     for(const k of HAB_RESOURCES){
       details[k].production.building+=prod[k];
       details[k].consumption.population+=cons[k];
       details[k].consumption.building+=upkeep[k];
     }
   }
 }
 return details;
}
function resourceTotals(d){
 const production=Object.values(d.production).reduce((a,n)=>a+n,0);
 const consumption=Object.values(d.consumption).reduce((a,n)=>a+n,0);
 return {production,consumption,net:production-consumption};
}
function incomes(){const details=resourceDetails(),totals={};for(const k of HAB_RESOURCES)totals[k]=resourceTotals(details[k]).net;return totals}

function shipName(t){return t==='explorer'?'탐사선 1':t==='explorer2'?'탐사선 2':t==='colony'?'개척선':'선택 없음'}
function prospective(t){return state.ships[t]}
function reachable(from,ap){
 const rates=DATA.balance.ships;
 const result=new Map([[from,0]]),pending=new Set([from]);
 while(pending.size){
  let current;
  for(const id of pending){
   if(current===undefined||result.get(id)<result.get(current))current=id;
  }
  pending.delete(current);
  const star=state.stars[current];
  for(const dest of star.edges){
   if(!visible(dest))continue;
   const rate=star.owned&&state.stars[dest].owned?rates.ownedMovementCostPerEdge:rates.movementCostPerEdge;
   const cost=Math.round((result.get(current)+rate)*10000)/10000;
   if(cost>ap||cost>=(result.get(dest)??Infinity))continue;
   result.set(dest,cost);
   pending.add(dest);
  }
 }
 result.delete(from);
 return result;
}
function clearShipSelection(){activeShip=null;moveMode=false}
function blackholeJump(t){
 if(!t||state.ap[t]<1)return false;
 let from=state.ships[t],s=state.stars[from];
 if(s.blackholeTo===null||!s.surveyed)return false;
 let target=state.stars[s.blackholeTo];
 dirty=true;state.ships[t]=target.id;state.ap[t]--;selected=target.id;
 // 이동으로 도착 성계의 위치가 공개되지만 상세 정보는 탐사 이후에 공개된다.
 target.discoveredByBlackhole=true;
 rec(`${shipName(t)} 블랙홀 이동: ${s.name} → ${target.name}`);
 return true;
}
function moveShip(t,to){
  if(!t)return false;
  const cost=reachable(state.ships[t],state.ap[t]).get(to);
  if(cost===undefined)return false;
  dirty=true;state.ships[t]=to;
  state.ap[t]=Math.round((state.ap[t]-cost)*10000)/10000;
  selected=to;
  rec(`${shipName(t)} → ${state.stars[to].name} (행동력 ${cost} 소모)`);
  return true;
}
function performAction(t){
 if(!t||state.ap[t]<1)return false;
 const pos=state.ships[t],s=state.stars[pos];
 if(t==='colony'){
   if(s.owned||!s.surveyed)return false;
   state.ap[t]--;s.owned=true;for(const p of s.planets)if(p.type==='hab')habitat(p);
   rec(s.name+' 개척 완료');
 }else{
   if(s.surveyed||!visible(pos))return false;
   state.ap[t]--;s.surveyed=true;
   rec(s.name+' 탐사 완료 · 인접 항로 공개');
   const discoveries=[];
   if(s.ancient)discoveries.push({title:s.ancient+' 발견',desc:s.name+'에서 '+s.ancient+'가 발견되었습니다.',body:'고대 문명의 흔적이 확인되었습니다. 현재 프로토타입에서는 추가 자원이나 연구력 보상이 없습니다.'});
   if(s.blackholeTo!==null)discoveries.push({title:'블랙홀 발견',desc:s.name+'에서 쌍을 이루는 블랙홀이 발견되었습니다.',body:'해당 항성계에 있는 함선은 「블랙홀 이동」으로 연결된 다른 항성계로 이동할 수 있습니다. 이동은 행동력 1을 소모합니다.'});
   if(discoveries.length)showDiscoveryQueue(discoveries);
 }
 moveMode=false;selected=pos;render();return true;
}
function nextTurn(){dirty=true;let messages=[],completed=[];
 // Charge the turn's displayed production/upkeep before activating completed work.
 const inc=incomes();
 for(const s of state.stars)if(s.owned)for(const p of s.planets){
  if(p.type==='hab'){
   const h=habitat(p),job=h.construction;
   if(job){job.progress=Math.min(job.required,job.progress+habPower(h));if(job.progress>=job.required)completed.push(()=>{finishHabConstruction(h,job);messages.push(p.label+' · '+job.label+' 완공')})}
   h.pop=Math.min(habCap(h),h.pop+habGrowth(h));
  }else if(p.construction){
   p.construction.remaining--;if(p.construction.remaining<=0)completed.push(()=>{p.level=p.construction.target;p.construction=null;messages.push(p.label+' 시설 Lv.'+p.level+' 완공')});
  }
 }
 for(const k of HAB_RESOURCES)state.res[k]=Math.max(0,Math.round(((Number(state.res[k])||0)+inc[k])*10000)/10000);
 for(const finish of completed)finish();state.turn++;
 state.ap=Object.fromEntries(Object.keys(state.ships).map(ship=>[ship,2]));
 if(!messages.length)messages.push('대기');for(let m of messages)rec(m);
 clearShipSelection();render();
}
