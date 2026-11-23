function knownHabitatCount(system){
 const observed=system.surveyed||system.owned||system.planetsObserved||
  (system.nameRevealed&&!system.starScanned)||
  Object.entries(state.ships).some(([ship,pos])=>civilianShipRole(ship)==='scout'&&pos===system.id);
 return observed?system.planets.filter(planet=>planet.type==='hab').length:0;
}
let pendingDiscoveries=[];
function showDiscoveryQueue(events){pendingDiscoveries.push(...events);showNextDiscovery()}
function showNextDiscovery(){
 if(!pendingDiscoveries.length||!$('overlay').classList.contains('hide'))return;
 let ev=pendingDiscoveries.shift();$('modalTitle').textContent=ev.title;
 $('modalDesc').textContent=ev.desc;$('modalBody').innerHTML='<div class="note"></div>';
 $('modalBody').querySelector('.note').textContent=ev.body;
 $('overlay').classList.remove('hide');
}
function dismissModal(){
 $('overlay').classList.add('hide');modalKind=null;if(pendingDiscoveries.length)showNextDiscovery();else pumpExploration();
}
function chooseShip(t){clearFleetSelection();colonizeMode=false;scanMode=false;activeShip=activeShip===t?null:t;moveMode=false;if(activeShip)selected=state.ships[activeShip];moveMode=false;render()}
function galaxyCameraBounds(){
 const xs=state.stars.map(s=>s.x),ys=state.stars.map(s=>s.y);
 const left=Math.min(...xs)-40,right=Math.max(...xs)+40;
 const top=Math.min(...ys)-40,bottom=Math.max(...ys)+40;
 const width=(right-left)*2,height=(bottom-top)*2;
 return {cx:(left+right)/2,cy:(top+bottom)/2,width,height};
}
function clampGalaxyCamera(){
 const bounds=galaxyCameraBounds();
 // Fit the viewport inside the finite world even at the widest zoom.
 const minimum=Math.max(.4,W/bounds.width,H/bounds.height);
 if(scale<minimum){
  const old=scale;scale=minimum;
  panX=W/2-(W/2-panX)*scale/old;panY=H/2-(H/2-panY)*scale/old;
 }
 const rangeX=Math.max(0,(bounds.width-W/scale)/2);
 const rangeY=Math.max(0,(bounds.height-H/scale)/2);
 const clamp=(v,r)=>Math.max(-r,Math.min(r,v));
 const dx=clamp((W/2-panX)/scale-bounds.cx,rangeX);
 const dy=clamp((H/2-panY)/scale-bounds.cy,rangeY);
 panX=W/2-(bounds.cx+dx)*scale;panY=H/2-(bounds.cy+dy)*scale;
}
function drawMap(){clampGalaxyCamera();let svg=$('map'),out='';
for(const s of state.stars)for(const j of s.edges)if(j>s.id&&(debugReveal||(visible(s.id)&&visible(j)))){
 const t=state.stars[j];out+=galaxyLane(s,t,s.owned&&t.owned);
}
let possibilities=fleetMoveMode?fleetMoveTargets():(!moveMode||!activeShip)?new Map():reachable(state.ships[activeShip],state.ap[activeShip],activeShip);
for(let s of state.stars)if(debugReveal||visible(s.id)){
const canEnter=systemKnown(s.id);
const hoverAction=(fleetMoveMode||moveMode&&activeShip)?possibilities.has(s.id):canEnter;
if(possibilities.has(s.id))out+=galaxyMoveHalo(s);
if(s.blackholeTo!==null){out+=`<circle cx="${s.x}" cy="${s.y}" r="16" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'#e2d0ff':'#b991ff'}" stroke-width="2.5" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'none':'4 3'}" fill="none"/><text x="${s.x+19}" y="${s.y-13}" class="blackhole-label">BH</text>`}if(s.ancient){out+=`<circle cx="${s.x}" cy="${s.y}" r="13" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'#ffd1a3':'#ff9b45'}" stroke-width="2" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'none':'3 3'}" fill="none"/>`}
out+=galaxySystemSymbol(s,canEnter?s.name:'?',{...s,hostile:canEnter&&factionsHostile(state,'player',systemOwner(s))});
out+=`<circle class="starhit ${hoverAction?'available':''}" data-id="${s.id}" cx="${s.x}" cy="${s.y}" r="18" fill="transparent"><title>${(fleetMoveMode||moveMode&&activeShip)?(possibilities.has(s.id)?'이동하기':'이동 불가'):canEnter?'항성계 들어가기':'탐사선 도착 후 진입 가능'}</title></circle>`;
if(explorationSignalVisible(s))out+=`<g class="galaxy-signal"><title>미확인 신호 · 도착 후 행성을 탐사하세요</title><path d="M${s.x+29} ${s.y+2}l5 6-5 6-5-6Z" fill="#eddf9a"/><path class="signal-wave" d="M${s.x+21} ${s.y+1}q-7 7 0 14m16-14q7 7 0 14" fill="none" stroke="#d4bf77" stroke-width="1.2"/></g>`;
out+=galaxyHabitableMarker(s,knownHabitatCount(s));
out+=fleetMapSymbols(s);
// 함선은 성계 심볼 위에 겹치지 않도록 개별 클릭 영역으로 표시한다.
const located=['explorer','explorer2','colony'].filter(t=>state.ships[t]===s.id);
for(let k=0;k<located.length;k++){
const t=located[k],x=s.x+(located.length===3?(k-1)*28:located.length===2?(k===0?-18:18):18);
out+=galaxyCivilianShipSymbol(t,x,s.y-29,activeShip===t);
}
}
svg.innerHTML=`${galaxyGlowDefs('systemGlow')}<g transform="translate(${panX} ${panY}) scale(${scale})">${out}</g>`;
svg.querySelectorAll('.fleethit').forEach(el=>{el.addEventListener('click',e=>{e.stopPropagation();if(!dragging)selectMapFleet(el.dataset.fleet,extendFleetSelection(e))});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectMapFleet(el.dataset.fleet,extendFleetSelection(e))}})});
svg.querySelectorAll('.shiphit').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();if(dragging)return;chooseShip(el.dataset.ship)}));
svg.querySelectorAll('.starhit').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();if(dragging||encounterUILocked)return;let id=+el.dataset.id;
if(fleetMoveMode){commandFleetMove(id);return}
selected=id;
if(moveMode&&activeShip){if(moveShip(activeShip,id)){moveMode=false;render()}else render();return}
if(systemKnown(id)){systemOpen(id)}else{clearShipSelection();render()}
}));
}
function systemOpen(id){colonizeMode=false;scanMode=false;
 if(!systemKnown(id))return;
 if(tutorial||!activeShip||state.ships[activeShip]!==id)clearShipSelection();
 moveMode=false;sysId=id;selected=id;view='system';render();
}
function drawSystem(){
 const s=state.stars[sysId];
 $('systemIntro').textContent=`${s.name} · 행성 ${s.planets.length}개 · ${s.owned?'개척 완료':systemOwner(s)?'다른 진영 소유':'미개척'}${s.blackholeTo!==null?' · 블랙홀 존재':''}${s.ancient?' · '+s.ancient+' 발견':''} · 행성을 선택하세요.`;
 const scene=$('planetList');
 drawStellarScene(scene,s,{training:!!tutorial,signalTarget:!tutorial&&systemExplored(s.id)?explorationSignalTarget(s):null,onPlanet:planetModal,
  decorateSun:sun=>{if(!tutorial&&activeShip==='colony'&&state.ships.colony===sysId){if(canCommandColonize(s))sun.classList.add('colonize-interactive');sun.title=s.owned?'개척 완료':systemOwner(s)?'다른 진영 소유':'우클릭으로 개척'}}});
 if(!tutorial&&s.owned)renderOrbitalShipyards(scene,s);
}
function drawStellarScene(scene,s,{training=false,signalTarget=null,onPlanet,decorateSun}={}){
 scene.className='stellar-scene';scene.replaceChildren();if(training)scene.style.transform='';
 const sky=document.createElement('div');sky.className='stellar-sky';sky.setAttribute('aria-hidden','true');
 // Decorative, deterministic coordinates never consume the game's seeded RNG.
 for(let i=0;i<75;i++){
  const dot=document.createElement('i');dot.style.left=((i*137+23)%997)/10+'%';dot.style.top=((i*83+17)%631)/6.4+'%';
  dot.style.opacity=String(.15+(i%5)*.12);sky.append(dot);
 }
 scene.append(sky);
 const ns='http://www.w3.org/2000/svg',orbits=document.createElementNS(ns,'svg');
 orbits.classList.add('stellar-orbits');orbits.setAttribute('viewBox','0 0 1000 640');orbits.setAttribute('preserveAspectRatio','none');orbits.setAttribute('aria-hidden','true');
 s.planets.forEach((p,i)=>{
  const radius=260+i*35,orbit=document.createElementNS(ns,'ellipse');
  orbit.setAttribute('cx','500');orbit.setAttribute('cy','310');orbit.setAttribute('rx',String(radius));orbit.setAttribute('ry',String(radius*.57));orbits.append(orbit);
 });
 scene.append(orbits);
 const sun=document.createElement('div');sun.className='stellar-sun';
 decorateSun?.(sun);
 const sunSphere=document.createElement('span');sunSphere.className='stellar-sun-sphere';sunSphere.setAttribute('aria-hidden','true');
 const sunLabel=document.createElement('span');sunLabel.className='stellar-sun-label';sunLabel.textContent=s.name+' · 항성';sun.append(sunSphere,sunLabel);scene.append(sun);
 s.planets.forEach((p,i)=>{
  const known=training||targetSurveyed(s,p);
  const button=document.createElement('button');button.type='button';button.className='stellar-planet '+p.type;button.dataset.planetIndex=String(i);
  placeNode(button,systemPoint(i));
  const name=known?(p.label||s.name+' '+(i+1)):'미확인 행성',type=types[p.type];
  const status=!known?'미탐사 · 탐사선으로 우클릭':p.construction?'건설 중 · '+p.construction.remaining+'턴':p.type==='hab'?(s.owned?'행성 관리':'개척 후 관리'):p.type==='barren'?'개발 불가':'시설 Lv.'+p.level+'/'+DATA.planets[p.type].maxLevel;
  const habitatJob=p.type==='hab'?p.habData?.construction:null;
  const construction=known&&(p.construction||habitatJob);
  const constructionText=habitatJob?'건설 중 · '+habitatJob.label+' · 남은 '+Math.ceil((habitatJob.required-habitatJob.progress)/habPower(p.habData))+'턴':status;
  button.setAttribute('aria-label',known?name+' · '+type+' 행성 · '+constructionText:name);
  const sphere=document.createElement('span');sphere.className='stellar-planet-sphere';sphere.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='stellar-planet-label';
  const heading=document.createElement('strong');heading.textContent=known&&!training?type+' 행성':name;
  label.append(heading);
  if(training){
   button.title=DATA.planets[p.type].description;
   const detail=document.createElement('span');detail.textContent=type+' 행성';
   const info=document.createElement('small');info.textContent=status;label.append(detail,info);
  }else if(known){
   if(construction){
    const badge=document.createElement('span');badge.className='planet-construction-mark';badge.textContent=' ⚒';badge.setAttribute('aria-label','건설 중');heading.append(badge);
   }
   const tooltip=document.createElement('span');tooltip.className='planet-hover-details';tooltip.setAttribute('role','tooltip');
   tooltip.id=scene.id+'-planet-tooltip-'+s.id+'-'+i;button.setAttribute('aria-describedby',tooltip.id);
   const planetName=document.createElement('span');planetName.textContent=name;
   const info=document.createElement('small');info.textContent=constructionText;
   tooltip.append(planetName,info);label.append(tooltip);
  }
  if(signalTarget===p){
   const signal=document.createElement('span');signal.className='planet-signal';signal.textContent='◇ 미확인 신호';
   label.append(signal);button.classList.add('signal-source');button.title='신호 감지 · 탐사선으로 우클릭하거나 개별 탐사 선택 후 클릭';
   button.setAttribute('aria-label',name+' · 미확인 신호 · 탐사 필요');
  }
  button.append(sphere,label);button.onclick=()=>{if(known)onPlanet?.(i)};scene.append(button);
 });
}
function renderOrbitalShipyards(scene,star,onOpen=anchor=>{if(!motionBusy)showShipyards(star.id,'',null,anchor)}){
 for(const yard of orbitalShipyards(star)){
  const point=yard.planetIndex===null?{x:61,y:44}:systemPoint(yard.planetIndex);
  const node=document.createElement('button');
  node.type='button';node.className='orbital-shipyard'+(yard.remaining?' under-construction':'');
  node.innerHTML='<span class="orbital-shipyard-glyph" aria-hidden="true"></span><span>조선소</span>';
  const anchor=star.planets[yard.planetIndex]?.label??star.name;
  node.title=anchor+' · 궤도 조선소'+(yard.remaining?' · 남은 '+yard.remaining+'턴':'');
  node.setAttribute('aria-label',node.title);
  placeNode(node,{x:Math.max(5,Math.min(95,point.x+(point.x<50?6:-6))),y:Math.max(5,point.y-6)});
  node.onclick=()=>onOpen(yard.planetIndex);
  scene.append(node);
 }
}
function planetModal(i){let s=state.stars[sysId],p=s.planets[i];if(!tutorial&&!targetSurveyed(s,p))return;$('modalTitle').textContent=p.label;$('modalDesc').textContent=types[p.type]+' 행성';let html='';if(p.type==='barren')html='<div class="note">개발과 채굴이 불가능한 행성입니다.</div>';
if(p.type==='hab'){if(s.owned){openHabitat(i);return}else html='<div class="note">개척 후 인구 성장 및 건물 건설을 이용할 수 있습니다.</div>'+habitableTraitsHtml(p)}
if(p.type==='mineral'||p.type==='gas'){
let facility=DATA.planets[p.type],building=facility.facility;
html=`<p><b>${building} Lv.${p.level} / ${facility.maxLevel}</b></p><p>턴당 생산량: ${resourceAmountMarkup(facility.resource,facilityProduction(p))}</p><p>유지비/턴: ${resourceAmountsMarkup(facility.levels[p.level]?.upkeep)}</p>`;
if(p.construction){html+=`<div class="note">건설 중: Lv.${p.construction.target} · 남은 시간 ${p.construction.remaining}턴</div><button disabled>건설 진행 중</button>`}
else if(p.level<DATA.planets[p.type].maxLevel){const spec=facility.levels[p.level+1];html+=`<div class="note">착공 비용: ${resourceAmountsMarkup(spec.cost)}<br>고정 ${facilityConstructionTurns(p)}턴 · 행성 생산력 불필요<br>완공 후 유지비/턴: ${resourceAmountsMarkup(spec.upkeep)}</div><button id="levelUp" class="primary" ${s.owned&&canAfford(spec.cost)?'':'disabled'}>${!canAfford(spec.cost)?'자원 부족':p.level===0?'시설 건설 시작':'시설 업그레이드 시작'}</button>`}
else html+='<div class="note">최대 레벨에 도달했습니다.</div>';
if(!s.owned)html+='<div class="note">먼저 이 항성계를 개척해야 합니다.</div>';
}
$('modalBody').innerHTML=html;$('overlay').classList.remove('hide');let b=$('levelUp');if(b)b.onclick=()=>{if(startFacilityConstruction(p)){planetModal(i);render()}}}
function renderHeader(){
 const details=resourceDetails();
 $('turn').textContent='턴 '+state.turn;
 $('notificationsBtn').classList.toggle('research-notification',state.records.some(s=>s.includes('연구 완료')));
 $('ownership').textContent='개척 항성계 '+state.stars.filter(s=>s.owned).length;
 $('resource').innerHTML=HAB_RESOURCES.map(k=>{
   const d=details[k],t=resourceTotals(d),net=t.net;
   const headline=`<b>${resourceIcon(k)}<span>${resourceNames[k]} ${state.res[k].toLocaleString('ko-KR',{maximumFractionDigits:1})}</span></b><small class="${net<0?'negative':''}">${net>=0?'+':''}${fmtHab(net)} /턴</small>`;
   if(k==='research')return `<div class="res">${headline}${researchHeader(net)}</div>`;
   const hasMining=k==='energy'||k==='mineral';
   const row=(label,value,isCost=false)=>`<div class="res-tt-row"><span>${label}</span>${resourceAmountMarkup(k,(value===0?'':isCost?'-':'+')+fmtHab(value))}</div>`;
   const tooltip=`<div class="res-tooltip" role="tooltip">
     <div class="res-tt-title">${resourceNames[k]} · 턴당 내역</div>
     <div class="res-tt-section produce"><span>생산</span>${resourceAmountMarkup(k,'+'+fmtHab(t.production))}</div>
     ${row('건물 생산',d.production.building)}${hasMining?row('행성 채굴기지',d.production.mining):''}
     <div class="res-tt-section consume"><span>소모</span>${resourceAmountMarkup(k,(t.consumption?'-':'')+fmtHab(t.consumption))}</div>
     ${d.consumption.manufacturing>0?row('생산 투입',d.consumption.manufacturing,true):''}
     ${hasMining||k==='consumer'?row('건물 유지비',d.consumption.building,true):''}
     ${k==='food'||k==='consumer'?row('인구 소비',d.consumption.population,true):''}
     ${k==='energy'||k==='alloy'?row('함선 유지비',d.consumption.ship,true):''}
     ${hasMining?row('조선소 유지비',d.consumption.shipyard,true):''}
   </div>`;
   return `<div class="res" tabindex="0" aria-label="${resourceNames[k]} 상세 내역">${headline}${tooltip}</div>`;
 }).join('');
}
// 터치 환경에서는 자원 칸을 눌러 상세 내역을 열 수 있다.
$('resource').addEventListener('click',e=>{
 const item=e.target.closest('.res');if(!item)return;
 const openDetail=item.hasAttribute('tabindex')&&!item.classList.contains('open');
 $('resource').querySelectorAll('.res.open').forEach(el=>el.classList.remove('open'));
 if(openDetail)item.classList.add('open');
});
document.addEventListener('click',e=>{
 if(!e.target.closest('.resources'))$('resource').querySelectorAll('.res.open').forEach(el=>el.classList.remove('open'));
});
function render(){if(view==='habitat'&&!state.stars[sysId]?.owned)view='system';if(view!=='system'){scanMode=false;colonizeMode=false;}if(view!=='system')stopPlanetRotation();renderHeader();$('mapWrap').classList.toggle('hide',view!=='galaxy');$('systemView').classList.toggle('hide',view!=='system');$('habitatView').classList.toggle('hide',view!=='habitat');document.querySelector('.layout').classList.toggle('planet-mode',view==='habitat');$('back').classList.toggle('hide',view==='galaxy');$('back').textContent=view==='habitat'?'← 항성계로':'← 은하 지도로';for(let id of ['zoomout','zoomin','center'])$(id).classList.toggle('hide',view!=='galaxy');$('viewTitle').textContent=view==='galaxy'?'은하 지도':view==='habitat'?currentHab().label+' 행성 관리':state.stars[sysId].name+' 항성계';$('viewSubtitle').textContent=view==='galaxy'?'함선 도형 클릭 → 이동 버튼 → 녹색 항성계 클릭 / 탐사 완료 성계 클릭 → 내부 화면':view==='habitat'?'인구 배치 · 공용 건물 · 특화 건물':'행성 클릭 → 상세 화면';
$('selectedShipInfo').innerHTML=activeShip?`<b>${activeShip==='colony'?'□':'△'} ${shipName(activeShip)}</b><br>위치: ${state.stars[state.ships[activeShip]].name}<br>행동력: <b>${state.ap[activeShip]} / 2</b>`:'';
$('shipPanel').querySelector('p').style.visibility=activeShip?'visible':'hidden';
let s=state.stars[selected],from=activeShip?state.ships[activeShip]:null,future=from,movePossible=!!activeShip&&reachable(from,state.ap[activeShip],activeShip).size>0;
$('moveBtn').disabled=!movePossible;$('moveBtn').textContent='이동';
$('scanBtn').textContent=tutorial?'탐사':'개별 탐사';
$('scanBtn').disabled=!activeShip||activeShip==='colony'||state.ap[activeShip]<1||civilianOperationsBlocked(state,future)||state.stars[future].surveyed||!visible(future);
$('colonizeBtn').disabled=activeShip!=='colony'||state.ap.colony<1||civilianOperationsBlocked(state,future)||!canColonize(state.stars[future]);
let warpAvailable=!!activeShip&&blackholeReady(state.stars[from]);
$('warpBtn').classList.toggle('hide',!warpAvailable);
$('warpBtn').disabled=!warpAvailable||state.ap[activeShip]<1||(activeShip==='colony'&&!systemExplored(state.stars[from].blackholeTo));
if(warpAvailable)$('warpBtn').textContent='블랙홀 이동 → '+state.stars[state.stars[from].blackholeTo].name;
$('openBtn').disabled=!systemKnown(selected);
if(view==='system'&&!tutorial){
 const local=!!activeShip&&state.ships[activeShip]===sysId;
 if(!local){moveMode=false;scanMode=false;colonizeMode=false}
 $('colonizeBtn').disabled=!canCommandColonize(state.stars[sysId]);
 if($('colonizeBtn').disabled)colonizeMode=false;
 $('moveBtn').disabled=!local||!state.stars[sysId].edges.some(id=>reachable(sysId,state.ap[activeShip],activeShip).has(id));
 $('scanBtn').disabled=!local||!canSurveyFromShip(state,activeShip,sysId)||!surveyTargets(state.stars[sysId]).some(t=>!targetSurveyed(state.stars[sysId],t));
}
for(const [id,pressed] of [['moveBtn',moveMode],['scanBtn',scanMode],['colonizeBtn',colonizeMode]]){
 $(id).classList.toggle('command-active',pressed);$(id).setAttribute('aria-pressed',String(pressed));
}


renderCommandUI();renderFleetSelection();$('log').innerHTML=state.records.map(e=>`<li>${e.replaceAll('<','&lt;')}</li>`).join('');if(view==='galaxy')drawMap();else if(view==='system')drawSystem();else habRender();if(!tutorial){if(view==='system')renderSystemShips();if(view==='habitat')renderSurface()}paintTutorial()}
function focusHome(){scale=1;panX=W/2-state.stars[0].x;panY=H/2-state.stars[0].y}
function reset(seed){debugReveal=false;previousCamera=null;state=generate(seed);initializeExploration(state);initializeResearch(state);initializeShipDesigns(state);initializeFleets(state);initializeShipyards(state);clearFleetSelection();dirty=false;activeShip=null;moveMode=false;selected=0;sysId=0;view='galaxy';focusHome();$('currentSeed').textContent=state.seed;state.records[0]+=' 인접 성계 '+state.stars[state.neighbor].name+'에 거주 가능 행성이 보장됩니다.';render()}
