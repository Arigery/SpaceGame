function knownHabitatCount(system){
 const observed=system.surveyed||system.owned||system.planetsObserved||
  (system.nameRevealed&&!system.starScanned)||
  Object.entries(state.ships).some(([ship,pos])=>ship!=='colony'&&pos===system.id);
 return observed?system.planets.filter(planet=>planet.type==='hab').length:0;
}
let pendingDiscoveries=[];
function showDiscoveryQueue(events){pendingDiscoveries.push(...events);showNextDiscovery()}
function showNextDiscovery(){
 if(!pendingDiscoveries.length)return;
 let ev=pendingDiscoveries.shift();$('modalTitle').textContent=ev.title;
 $('modalDesc').textContent=ev.desc;$('modalBody').innerHTML='<div class="note"></div>';
 $('modalBody').querySelector('.note').textContent=ev.body;
 $('overlay').classList.remove('hide');
}
function dismissModal(){
 $('overlay').classList.add('hide');if(pendingDiscoveries.length)showNextDiscovery();
}
function chooseShip(t){activeShip=activeShip===t?null:t;moveMode=false;if(activeShip)selected=state.ships[activeShip];moveMode=false;render()}
function drawMap(){let svg=$('map'),out=`<rect width="${W}" height="${H}" fill="#081120"/>`;
for(let i=0;i<85;i++){let x=(i*167+51)%W,y=(i*79+31)%H;out+=`<circle cx="${x}" cy="${y}" r="${i%5===0?1.1:.6}" fill="#7e9dc4" opacity=".38"/>`}
for(let s of state.stars)for(let j of s.edges)if(j>s.id&&(debugReveal||(visible(s.id)&&visible(j)))){let t=state.stars[j];out+=`<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="${s.owned&&t.owned?'#6cc8b1':'#425975'}" stroke-width="${s.owned&&t.owned?2.5:1.5}" opacity=".8"/>`}
let possibilities=(!moveMode||!activeShip)?new Map():reachable(state.ships[activeShip],state.ap[activeShip]);
for(let s of state.stars)if(debugReveal||visible(s.id)){
const canEnter=systemKnown(s.id);
const hoverAction=moveMode&&activeShip?possibilities.has(s.id):canEnter;
let fill=s.owned?'#6ce3b6':s.surveyed?'#f5cf83':'#7a8fa9';let r=s.id===0?11:7;
if(possibilities.has(s.id))out+=`<circle cx="${s.x}" cy="${s.y}" r="25" fill="#50c6b91a" stroke="#65eab0" stroke-width="2" stroke-dasharray="5 3"/>`;
if(s.blackholeTo!==null){out+=`<circle cx="${s.x}" cy="${s.y}" r="16" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'#e2d0ff':'#b991ff'}" stroke-width="2.5" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'none':'4 3'}" fill="none"/><text x="${s.x+19}" y="${s.y-13}" class="blackhole-label">BH</text>`}if(s.ancient){out+=`<circle cx="${s.x}" cy="${s.y}" r="13" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'#ffd1a3':'#ff9b45'}" stroke-width="2" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'none':'3 3'}" fill="none"/>`}
if(s.owned)out+=`<rect x="${s.x-9}" y="${s.y-9}" width="18" height="18" rx="3" fill="${fill}" transform="rotate(45 ${s.x} ${s.y})"/>`;
else out+=`<circle cx="${s.x}" cy="${s.y}" r="${r}" fill="${fill}"/>`;
out+=`<text x="${s.x}" y="${s.y+27}" fill="#c5d4ea" font-size="11" text-anchor="middle">${systemKnown(s.id)?s.name:'?'}</text><circle class="starhit ${hoverAction?'available':''}" data-id="${s.id}" cx="${s.x}" cy="${s.y}" r="18" fill="transparent"><title>${moveMode&&activeShip?(possibilities.has(s.id)?'이동하기':'이동 불가'):canEnter?'항성계 들어가기':'탐사선 도착 후 진입 가능'}</title></circle>`;
const habitatCount=knownHabitatCount(s);
if(habitatCount>0)out+=`<g class="habitable-marker"><title>거주 가능 행성 ${habitatCount}개</title><circle cx="${s.x-25}" cy="${s.y+4}" r="6" fill="#287ac4" stroke="#9be5ff" stroke-width="1.3"/><path d="M${s.x-29} ${s.y+2} l4 -2 3 3 -4 4" fill="#6cdeb1"/>${habitatCount>1?`<text x="${s.x-34}" y="${s.y+17}" fill="#9be5ff" font-size="9">${habitatCount}</text>`:''}</g>`;
// 함선은 성계 심볼 위에 겹치지 않도록 개별 클릭 영역으로 표시한다.
const located=['explorer','explorer2','colony'].filter(t=>state.ships[t]===s.id);
for(let k=0;k<located.length;k++){
let t=located[k],x=s.x+(located.length===3?(k-1)*28:located.length===2?(k===0?-18:18):18),y=s.y-29,selectedShip=activeShip===t;
out+=`<g class="shiphit ${selectedShip?'selected':''}" data-ship="${t}" transform="translate(${x} ${y}) scale(0.55) translate(${-x} ${-y})" role="button" aria-label="${shipName(t)} 선택"><circle cx="${x}" cy="${y}" r="15" fill="${selectedShip?'#385b69':'#192d45'}" stroke="${selectedShip?'#ffdf8c':'#537b9f'}" stroke-width="1.5"/>`;
if(t!=='colony')out+=`<path class="shipbody" d="M${x} ${y-9} L${x-8} ${y+7} L${x+8} ${y+7} Z" fill="#91d7ff" stroke="#1b3d57" stroke-width="1"/>`;
else out+=`<rect class="shipbody" x="${x-7}" y="${y-7}" width="14" height="14" fill="#b9a7ff" stroke="#3f316f" stroke-width="1"/>`;
out+=`</g>`;
}
}
svg.innerHTML=`<g transform="translate(${panX} ${panY}) scale(${scale})">${out}</g>`;
svg.querySelectorAll('.shiphit').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();if(dragging)return;chooseShip(el.dataset.ship)}));
svg.querySelectorAll('.starhit').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();if(dragging)return;let id=+el.dataset.id;selected=id;
if(moveMode&&activeShip){if(moveShip(activeShip,id)){moveMode=false;render()}else render();return}
clearShipSelection();if(systemKnown(id)){systemOpen(id)}else render();
}));
}
function systemOpen(id){if(!systemKnown(id))return;clearShipSelection();sysId=id;selected=id;view='system';render()}
function drawSystem(){
 const s=state.stars[sysId];
 $('systemIntro').textContent=`${s.name} · 행성 ${s.planets.length}개 · ${s.owned?'개척 완료':'미개척'}${s.blackholeTo!==null?' · 블랙홀 존재':''}${s.ancient?' · '+s.ancient+' 발견':''} · 행성을 선택하세요.`;
 const scene=$('planetList');scene.className='stellar-scene';scene.replaceChildren();if(tutorial)scene.style.transform='';
 const sky=document.createElement('div');sky.className='stellar-sky';sky.setAttribute('aria-hidden','true');
 // Decorative, deterministic coordinates never consume the game's seeded RNG.
 for(let i=0;i<75;i++){
  const dot=document.createElement('i');dot.style.left=((i*137+23)%997)/10+'%';dot.style.top=((i*83+17)%631)/6.4+'%';
  dot.style.opacity=String(.15+(i%5)*.12);sky.append(dot);
 }
 scene.append(sky);
 const ns='http://www.w3.org/2000/svg',orbits=document.createElementNS(ns,'svg');
 orbits.classList.add('stellar-orbits');orbits.setAttribute('viewBox','0 0 1000 640');orbits.setAttribute('preserveAspectRatio','none');orbits.setAttribute('aria-hidden','true');
 const angles=[-145,-38,65,145,-88];
 s.planets.forEach((p,i)=>{
  const radius=260+i*35,orbit=document.createElementNS(ns,'ellipse');
  orbit.setAttribute('cx','500');orbit.setAttribute('cy','310');orbit.setAttribute('rx',String(radius));orbit.setAttribute('ry',String(radius*.57));orbits.append(orbit);
 });
 scene.append(orbits);
 const sun=document.createElement('div');sun.className='stellar-sun';
 const sunSphere=document.createElement('span');sunSphere.className='stellar-sun-sphere';sunSphere.setAttribute('aria-hidden','true');
 const sunLabel=document.createElement('span');sunLabel.className='stellar-sun-label';sunLabel.textContent=s.name+' · 항성';sun.append(sunSphere,sunLabel);scene.append(sun);
 s.planets.forEach((p,i)=>{
  const angle=(angles[i%angles.length])*Math.PI/180,radius=260+i*35;
  const known=tutorial||targetSurveyed(s,p);
  const button=document.createElement('button');button.type='button';button.className='stellar-planet '+p.type;button.dataset.planetIndex=String(i);
  button.style.left=(500+Math.cos(angle)*radius)/10+'%';button.style.top=(310+Math.sin(angle)*radius*.57)/6.4+'%';
  const name=known?(p.label||s.name+' '+(i+1)):'미확인 행성',type=types[p.type];
  const status=!tutorial&&!targetSurveyed(s,p)?'미탐사 · 탐사선으로 우클릭':p.construction?'건설 중 · '+p.construction.remaining+'턴':p.type==='hab'?(s.owned?'행성 관리':'개척 후 관리'):p.type==='barren'?'개발 불가':'시설 Lv.'+p.level+'/'+DATA.planets[p.type].maxLevel;
  const habitatJob=p.type==='hab'?p.habData?.construction:null;
  const construction=known&&(p.construction||habitatJob);
  const constructionText=habitatJob?'건설 중 · '+habitatJob.label+' · 남은 '+Math.ceil((habitatJob.required-habitatJob.progress)/habPower(p.habData))+'턴':status;
  button.setAttribute('aria-label',known?name+' · '+type+' 행성 · '+constructionText:name);
  const sphere=document.createElement('span');sphere.className='stellar-planet-sphere';sphere.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='stellar-planet-label';
  const heading=document.createElement('strong');heading.textContent=known&&!tutorial?type+' 행성':name;
  label.append(heading);
  if(tutorial){
   button.title=DATA.planets[p.type].description;
   const detail=document.createElement('span');detail.textContent=type+' 행성';
   const info=document.createElement('small');info.textContent=status;label.append(detail,info);
  }else if(known){
   if(construction){
    const badge=document.createElement('span');badge.className='planet-construction-mark';badge.textContent=' ⚒';badge.setAttribute('aria-label','건설 중');heading.append(badge);
   }
   const tooltip=document.createElement('span');tooltip.className='planet-hover-details';tooltip.setAttribute('role','tooltip');
   tooltip.id='planet-tooltip-'+sysId+'-'+i;button.setAttribute('aria-describedby',tooltip.id);
   const planetName=document.createElement('span');planetName.textContent=name;
   const info=document.createElement('small');info.textContent=constructionText;
   tooltip.append(planetName,info);label.append(tooltip);
  }
  button.append(sphere,label);button.onclick=()=>{if(tutorial||targetSurveyed(s,p))planetModal(i)};scene.append(button);
 });
}
function planetModal(i){let s=state.stars[sysId],p=s.planets[i];if(!tutorial&&!targetSurveyed(s,p))return;$('modalTitle').textContent=p.label;$('modalDesc').textContent=types[p.type]+' 행성';let html='';if(p.type==='barren')html='<div class="note">개발과 채굴이 불가능한 행성입니다.</div>';
if(p.type==='hab'){if(s.owned){openHabitat(i);return}else html='<div class="note">개척 후 인구 성장 및 건물 건설을 이용할 수 있습니다.</div>'}
if(p.type==='mineral'||p.type==='gas'){
let facility=DATA.planets[p.type],building=facility.facility,resource=resourceNames[facility.resource];
html=`<p><b>${building} Lv.${p.level} / ${facility.maxLevel}</b></p><p>턴당 생산량: ${p.level*facility.productionPerLevel} ${resource}</p><p>유지비/턴: ${upkeepText(facility.levels[p.level]?.upkeep)}</p>`;
if(p.construction){html+=`<div class="note">건설 중: Lv.${p.construction.target} · 남은 시간 ${p.construction.remaining}턴</div><button disabled>건설 진행 중</button>`}
else if(p.level<DATA.planets[p.type].maxLevel){const spec=facility.levels[p.level+1];html+=`<div class="note">착공 비용: ${costText(spec.cost)}<br>고정 ${spec.constructionTurns}턴 · 행성 생산력 불필요<br>완공 후 유지비/턴: ${upkeepText(spec.upkeep)}</div><button id="levelUp" class="primary" ${s.owned&&canAfford(spec.cost)?'':'disabled'}>${!canAfford(spec.cost)?'자원 부족':p.level===0?'시설 건설 시작':'시설 업그레이드 시작'}</button>`}
else html+='<div class="note">최대 레벨에 도달했습니다.</div>';
if(!s.owned)html+='<div class="note">먼저 이 항성계를 개척해야 합니다.</div>';
}
$('modalBody').innerHTML=html;$('overlay').classList.remove('hide');let b=$('levelUp');if(b)b.onclick=()=>{if(startFacilityConstruction(p)){planetModal(i);render()}}}
function renderHeader(){
 const details=resourceDetails();
 $('turn').textContent='턴 '+state.turn;
 $('ownership').textContent='개척 항성계 '+state.stars.filter(s=>s.owned).length;
 const row=(label,value,isCost=false)=>`<div class="res-tt-row"><span>${label}</span><span>${value===0?'':isCost?'-':'+'}${fmtHab(value)}</span></div>`;
 $('resource').innerHTML=HAB_RESOURCES.map(k=>{
   const d=details[k],t=resourceTotals(d),net=t.net;
   const tooltip=`<div class="res-tooltip" role="tooltip">
     <div class="res-tt-title">${resourceNames[k]} · 턴당 내역</div>
     <div class="res-tt-section produce"><span>생산</span><span>+${fmtHab(t.production)}</span></div>
     ${row('건물 생산',d.production.building)}${row('행성 채굴기지',d.production.mining)}
     <div class="res-tt-section consume"><span>소모</span><span>${t.consumption?'-':''}${fmtHab(t.consumption)}</span></div>
     ${row('건물 유지비',d.consumption.building,true)}${row('인구 소비',d.consumption.population,true)}${row('함선 유지비',d.consumption.ship,true)}
     <div class="res-tt-note">건물 유지비는 확정된 테스트 수치만 적용합니다. 미정 금액·함선 유지비는 제외됩니다.</div>
   </div>`;
   return `<div class="res" tabindex="0" aria-label="${resourceNames[k]} 상세 내역"><b>${resourceNames[k]} ${state.res[k].toLocaleString('ko-KR',{maximumFractionDigits:1})}</b><small class="${net<0?'negative':''}">${net>=0?'+':''}${fmtHab(net)} /턴</small>${tooltip}</div>`;
 }).join('');
}
// 터치 환경에서는 자원 칸을 눌러 상세 내역을 열 수 있다.
$('resource').addEventListener('click',e=>{
 const item=e.target.closest('.res');if(!item)return;
 const wasOpen=item.classList.contains('open');
 $('resource').querySelectorAll('.res.open').forEach(el=>el.classList.remove('open'));
 if(!wasOpen)item.classList.add('open');
});
document.addEventListener('click',e=>{
 if(!e.target.closest('.resources'))$('resource').querySelectorAll('.res.open').forEach(el=>el.classList.remove('open'));
});
function render(){renderHeader();$('mapWrap').classList.toggle('hide',view!=='galaxy');$('systemView').classList.toggle('hide',view!=='system');$('habitatView').classList.toggle('hide',view!=='habitat');document.querySelector('.layout').classList.toggle('planet-mode',view==='habitat');$('back').classList.toggle('hide',view==='galaxy');$('back').textContent=view==='habitat'?'← 항성계로':'← 은하 지도로';for(let id of ['zoomout','zoomin','center'])$(id).classList.toggle('hide',view!=='galaxy');$('viewTitle').textContent=view==='galaxy'?'은하 지도':view==='habitat'?currentHab().label+' 행성 관리':state.stars[sysId].name+' 항성계';$('viewSubtitle').textContent=view==='galaxy'?'함선 도형 클릭 → 이동 버튼 → 녹색 항성계 클릭 / 탐사 완료 성계 클릭 → 내부 화면':view==='habitat'?'인구 배치 · 공용 건물 · 특화 건물':'행성 클릭 → 상세 화면';
$('selectedShipInfo').innerHTML=activeShip?`<b>${activeShip==='colony'?'□':'△'} ${shipName(activeShip)}</b><br>위치: ${state.stars[state.ships[activeShip]].name}<br>행동력: <b>${state.ap[activeShip]} / 2</b>`:'';
$('shipPanel').querySelector('p').style.visibility=activeShip?'visible':'hidden';
let s=state.stars[selected],from=activeShip?state.ships[activeShip]:null,future=from,movePossible=!!activeShip&&reachable(from,state.ap[activeShip]).size>0;
$('moveBtn').disabled=!movePossible;$('moveBtn').textContent=moveMode?'이동 선택 취소':'이동 위치 선택';
$('scanBtn').textContent=tutorial?'탐사':'개별 탐사';
$('scanBtn').disabled=!activeShip||activeShip==='colony'||state.ap[activeShip]<1||state.stars[future].surveyed||!visible(future);
$('colonizeBtn').disabled=activeShip!=='colony'||state.ap.colony<1||state.stars[future].owned||!state.stars[future].surveyed;
let warpAvailable=!!activeShip&&blackholeReady(state.stars[from]);
$('warpBtn').classList.toggle('hide',!warpAvailable);
$('warpBtn').disabled=!warpAvailable||state.ap[activeShip]<1;
if(warpAvailable)$('warpBtn').textContent='블랙홀 이동 → '+state.stars[state.stars[from].blackholeTo].name;
$('openBtn').disabled=!systemKnown(selected);

$('log').innerHTML=state.records.map(e=>`<li>${e.replaceAll('<','&lt;')}</li>`).join('');if(view==='galaxy')drawMap();else if(view==='system')drawSystem();else habRender();if(!tutorial){if(view==='system')renderSystemShips();if(view==='habitat')renderSurface()}paintTutorial()}
function focusHome(){scale=1;panX=W/2-state.stars[0].x;panY=H/2-state.stars[0].y}
function reset(seed){debugReveal=false;previousCamera=null;state=generate(seed);dirty=false;activeShip=null;moveMode=false;selected=0;sysId=0;view='galaxy';focusHome();$('currentSeed').textContent=state.seed;state.records[0]+=' 인접 성계 '+state.stars[state.neighbor].name+'에 거주 가능 행성이 보장됩니다.';render()}
