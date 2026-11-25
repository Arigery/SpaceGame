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
 showGameDialog();
}
function dismissModal(){
 if(modalKind==='anomaly-result')return;
 hideGameDialog();modalKind=null;if(pendingDiscoveries.length)showNextDiscovery();else pumpExploration();
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
function galaxyMovePlans(){
 if(fleetMoveMode)return fleetMoveTargets();
 if(!moveMode||!activeShip)return new Map();
 const from=state.ships[activeShip],previous=new Map();
 const costs=reachable(from,state.ap[activeShip],activeShip,previous);
 return new Map([...costs].map(([to,cost])=>{
  const path=[to];
  while(path.at(-1)!==from)path.push(previous.get(path.at(-1)));
  return [to,{routes:[{cost,path:path.reverse()}]}];
 }));
}
function galaxyRouteEdges(plan){
 const edges=new Map();
 for(const {path} of plan.routes)for(let index=1;index<path.length;index++){
  const a=path[index-1],b=path[index];
  edges.set(`${Math.min(a,b)}-${Math.max(a,b)}`,[a,b]);
 }
 return edges;
}
function galaxyRouteCostLabel(plan){
 const costs=plan.routes.map(route=>route.cost),min=Math.min(...costs),max=Math.max(...costs);
 return `행동력 ${min===max?min:`${min}–${max}`}`;
}
function drawMap(){clampGalaxyCamera();let svg=$('map'),out='';
for(const s of state.stars)for(const j of s.edges)if(j>s.id&&(debugReveal||(visible(s.id)&&visible(j)))){
 const t=state.stars[j];out+=galaxyLane(s,t,s.owned&&t.owned);
}
if(!tutorial)out+=regionalWonderMarkup(state,visible);
const moving=fleetMoveMode||moveMode&&activeShip,plans=galaxyMovePlans();
const routes=new Map([...plans].map(([id,plan])=>[id,galaxyRouteEdges(plan)]));
const hinted=new Map([...routes.values()].flatMap(edges=>[...edges]));
out+='<g class="galaxy-route-hints" pointer-events="none" aria-hidden="true">';
for(const [key,[a,b]] of hinted){
 const from=state.stars[a],to=state.stars[b];
 if(!(debugReveal||visible(a)&&visible(b)))continue;
 out+=`<line data-route="${key}" class="${from.owned&&to.owned?'developed':''}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`;
}
out+='</g>';
for(let s of state.stars)if(debugReveal||visible(s.id)){
const canEnter=systemKnown(s.id);
const plan=plans.get(s.id),hoverAction=moving?!!plan:canEnter;
const anomalyWarning=canEnter&&s.anomalyDefense?.active;
const clue=s.explorationClue?.counts;
const wonder=!tutorial&&visible(s.id)?regionalWonder(s):undefined;
const hoverDetail=(anomalyWarning?' · 적대 세력':'')+(clue?' · '+Object.entries(clue).map(([id,count])=>types[id]+' '+count).join(' · '):'')+(wonder?' · '+safeText(wonder.name):'');
if(plan)out+=galaxyMoveHalo(s);
if(s.gatewaySite)out+=`<g class="galaxy-gateway"><title>관문 ${s.gateway?.remaining===0?'가동 중':'후보지'}</title><text x="${s.x-25}" y="${s.y-13}">◇</text></g>`;
if(s.blackholeTo!==null){out+=`<circle cx="${s.x}" cy="${s.y}" r="16" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'#e2d0ff':'#b991ff'}" stroke-width="2.5" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='hole'&&o.scanned)?'none':'4 3'}" fill="none"/><text x="${s.x+19}" y="${s.y-13}" class="blackhole-label">BH</text>`}if(s.ancient){out+=`<circle cx="${s.x}" cy="${s.y}" r="13" stroke="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'#ffd1a3':'#ff9b45'}" stroke-width="2" stroke-dasharray="${s.surveyed||s.objects?.some(o=>o.kind==='relic'&&o.scanned)?'none':'3 3'}" fill="none"/>`}
out+=galaxySystemSymbol(s,canEnter?s.name:'?',{...s,hostile:anomalyWarning||canEnter&&factionsHostile(state,'player',systemOwner(s))});
const action=moving?(plan?`이동 · ${galaxyRouteCostLabel(plan)}`:'이동 불가'):canEnter?'항성계 들어가기':'탐사선 도착 후 진입 가능';
const fleetCosts=plan?.routes.some(route=>route.cost!==plan.routes[0].cost)?plan.routes.map(route=>
 `${state.military.fleets.find(fleet=>fleet.id===route.fleetId).name} ${route.cost}`).join(' · '):'';
const label=safeText(`${canEnter?s.name:'미확인 성계'} · ${action}${fleetCosts?' · '+fleetCosts:''}${hoverDetail}`);
out+=`<circle class="starhit ${hoverAction?'available':''}" data-id="${s.id}" cx="${s.x}" cy="${s.y}" r="${plan?25:18}" fill="transparent" ${hoverAction?`role="button" tabindex="0" aria-label="${label}"`:''}><title>${label}</title></circle>`;
if(anomalyWarning)out+=`<text class="anomaly-danger-mark" x="${s.x+18}" y="${s.y-23}" aria-hidden="true">!</text>`;
if(explorationSignalVisible(s))out+=`<g class="galaxy-signal"><title>미확인 신호 · 도착 후 행성을 탐사하세요</title><path d="M${s.x+29} ${s.y+2}l5 6-5 6-5-6Z" fill="#eddf9a"/><path class="signal-wave" d="M${s.x+21} ${s.y+1}q-7 7 0 14m16-14q7 7 0 14" fill="none" stroke="#d4bf77" stroke-width="1.2"/></g>`;
out+=galaxyHabitableMarker(s,knownHabitatCount(s));
out+=fleetMapSymbols(s);
// 함선은 성계 심볼 위에 겹치지 않도록 개별 클릭 영역으로 표시한다.
const located=Object.keys(state.ships).filter(t=>state.ships[t]===s.id);
for(let k=0;k<located.length;k++){
const t=located[k],x=s.x+(located.length<=3?(located.length===3?(k-1)*28:located.length===2?(k===0?-18:18):18):(k%5-2)*24);
out+=galaxyCivilianShipSymbol(t,x,s.y-29-Math.floor(k/5)*22,activeShip===t);
}
}
if(!tutorial)for(const chain of playerSurveyChainTargets(state)){
 const target=state.stars[surveyChainObjective(chain)];
 out+=`<g class="chain-map-marker"><title>${safeText(chainDefinition(chain.id).title)} · 현재 목표</title>
 <path transform="translate(${target.x-22} ${target.y+24})" d="M0 -7 7 0 0 7 -7 0Z"/><circle cx="${target.x-22}" cy="${target.y+24}" r="2"/></g>`;
}
if(!tutorial&&!state.scienceProjects?.some(project=>project.completedTurn!==undefined))for(const project of state.scienceProjects??[]){
 const target=state.stars[project.systemId];
 const x=target.x+25,y=target.y+23;
 out+=`<g class="science-project-marker"><title>${safeText(project.planetName)} · 과학 프로젝트 · ${project.total-project.progress}턴 남음</title>
 <circle cx="${x}" cy="${y}" r="7"/><path d="M${x-4} ${y}h8m-4 -4v8"/></g>`;
}
svg.innerHTML=`${galaxyGlowDefs('systemGlow')}<g transform="translate(${panX} ${panY}) scale(${scale})">${out}<g class="galaxy-route-label" pointer-events="none" aria-hidden="true"></g></g>`;
const routeLines=[...svg.querySelectorAll('[data-route]')],routeLabel=svg.querySelector('.galaxy-route-label');
let hoveredTarget=null,focusedTarget=null;
const showRoute=()=>{
 const id=hoveredTarget??focusedTarget,edges=routes.get(id);
 for(const line of routeLines)line.classList.toggle('preview',edges?.has(line.dataset.route)??false);
 if(!edges){routeLabel.replaceChildren();return}
 const star=state.stars[id],label=galaxyRouteCostLabel(plans.get(id)),width=label.includes('–')?144:105;
 const minX=-panX/scale,maxX=(W-panX)/scale;
 const left=star.x+26+width<=maxX?star.x+26:Math.max(minX,star.x-26-width);
 const top=Math.max(-panY/scale,star.y-31);
 routeLabel.innerHTML=`<rect x="${left}" y="${top}" width="${width}" height="24" rx="4"/><text x="${left+9}" y="${top+16}">${label}</text>`;
};
svg.querySelectorAll('.fleethit').forEach(el=>{el.addEventListener('click',e=>{e.stopPropagation();if(!dragging)selectMapFleet(el.dataset.fleet,extendFleetSelection(e))});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectMapFleet(el.dataset.fleet,extendFleetSelection(e))}})});
svg.querySelectorAll('.shiphit').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();if(dragging)return;chooseShip(el.dataset.ship)}));
svg.querySelectorAll('.starhit').forEach(el=>{
 const id=Number(el.dataset.id);
 if(plans.has(id)){
  el.addEventListener('pointerenter',()=>{hoveredTarget=id;showRoute()});
  el.addEventListener('pointerleave',()=>{hoveredTarget=null;showRoute()});
  el.addEventListener('focus',()=>{focusedTarget=id;showRoute()});
  el.addEventListener('blur',()=>{focusedTarget=null;showRoute()});
 }
 const activate=e=>{e.stopPropagation();if(dragging||encounterUILocked)return;
if(fleetMoveMode){commandFleetMove(id);return}
selected=id;
if(moveMode&&activeShip){if(moveShip(activeShip,id)){moveMode=false;render()}else render();return}
if(systemKnown(id)){systemOpen(id)}else{clearShipSelection();render()}
 };
 el.addEventListener('click',activate);
 if(el.hasAttribute('tabindex'))el.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event)}
 });
});
}
function systemOpen(id){colonizeMode=false;scanMode=false;
 if(!systemKnown(id))return;
 if(tutorial||!activeShip||state.ships[activeShip]!==id){
  const localFleets=tutorial?[]:localFleetSelection(state,selectedFleetIds,id);
  clearShipSelection();selectedFleetIds=localFleets;
 }
 moveMode=false;sysId=id;selected=id;view='system';render();
}
function drawSystem(){
 const s=state.stars[sysId];
 const scene=$('planetList');
 drawStellarScene(scene,s,{training:!!tutorial,signalTarget:!tutorial&&systemExplored(s.id)?explorationSignalTarget(s):null,onPlanet:planetModal,
  decorateSun:sun=>{if(!tutorial&&isColonyShip(activeShip)&&state.ships[activeShip]===sysId){if(canCommandColonize(s))sun.classList.add('colonize-interactive');sun.title=s.owned?'개척 완료':systemOwner(s)?'다른 진영 소유':'우클릭으로 개척'}}});
 if(!tutorial&&s.owned)renderOrbitalShipyards(scene,s);
 if(!tutorial)renderOrbitalScienceProjects(scene,s);
 const localColony=!tutorial&&isColonyShip(activeShip)&&state.ships[activeShip]===s.id;
 if(localColony&&s.owned)renderOrbitalConstructionSites(scene,s,activeShip);
 if(!tutorial&&s.gatewaySite)renderGatewayStructure(scene,s,localColony);
 if(!tutorial)renderSurveyChainTarget(scene,s);
 if(!tutorial)renderRegionalWonder(scene,s);
 if(!tutorial&&s.anomalyDefense?.active){
  const status=document.createElement('span');status.className='anomaly-defense-status';status.textContent=s.anomalyDefense.name;scene.append(status);
 }
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
  const type=types[p.type],typeLabel=type+' 행성';
  const name=known?(p.label||s.name+' '+(i+1)):'미확인 행성';
  const status=!known?'미탐사 · 탐사선으로 우클릭':p.construction?'건설 중 · '+p.construction.remaining+'턴':p.type==='hab'?(s.owned?'행성 관리':'개척 후 관리'):p.type==='barren'?'개발 불가':'시설 Lv.'+p.level+'/'+DATA.planets[p.type].maxLevel;
  const habitatJob=p.type==='hab'?p.habData?.construction:null;
  const construction=known&&(p.construction||habitatJob);
  const constructionText=habitatJob?'건설 중 · '+habitatJob.label+' · 남은 '+Math.ceil((habitatJob.required-habitatJob.progress)/habPower(p.habData))+'턴':status;
  button.setAttribute('aria-label',known?name+' · '+typeLabel+' · '+constructionText:name+' · 미탐사');
  const sphere=document.createElement('span');sphere.className='stellar-planet-sphere';sphere.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='stellar-planet-label';
  const heading=document.createElement('strong');heading.textContent=known&&!training?typeLabel:name;
  label.append(heading);
  if(training){
   button.title=DATA.planets[p.type].description;
   const detail=document.createElement('span');detail.textContent=type+' 행성';
   const info=document.createElement('small');info.textContent=status;label.append(detail,info);
  }else if(!known){
   button.title='미탐사';
  }else{
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
function scienceOrbitalRequirements(star,ship){
 const project=scienceProjectFor(state,'player');
 return orbitalResourceRequirements(state,SCIENCE_PROJECT.cost,true)+
  orbitalRequirement('유적 조사 '+DATA.exploration.relics.scienceGoal,scienceProjectSurveyCount(state,'player')>=DATA.exploration.relics.scienceGoal)+
  orbitalRequirement('고대의 신호 해독',relicResearchComplete(state,'player',SCIENCE_PROJECT.researchId))+
  (!isColonyShip(ship)||state.ships[ship]!==star.id||colonyBuildingGateway(state,ship)?orbitalRequirement('가용 개척선',false):'')+
  (civilianOperationsBlocked(state,star.id)?orbitalRequirement('안전한 성계',false):'')+
  (project?orbitalRequirement(safeText(project.planetName)+(project.completedTurn!==undefined?' · 프로젝트 완공':' · 프로젝트 진행 중'),false):
   state.scienceProjects?.some(item=>item.completedTurn!==undefined)?orbitalRequirement('과학 승리 달성',false):'');
}
function orbitalConstructionOptions(star,index,ship){
 const yard=orbitalShipyards(star).find(item=>item.planetIndex===index);
 const project=(state.scienceProjects??[]).find(item=>item.systemId===star.id&&item.planetIndex===index);
 const yardReady=!yard&&!shipyardConstructionBlock(state,star.id,index)&&canPayMilitaryCost(state,DATA.combat.shipyards.cost);
 const scienceReady=!project&&!scienceProjectSiteBlock(state,star.id,index,ship);
 return [
  {name:'궤도 조선소',kind:'shipyard',built:!!yard,ready:yardReady,status:yard?(yard.remaining?`${yard.remaining}턴 남음`:'가동 중'):yardReady?'착공 가능':'착공 대기',
   requirements:yard?'':shipyardRequirementsMarkup(state,star),open:()=>showShipyards(star.id,'',null,index)},
  {name:'과학 프로젝트',kind:'science',built:!!project,ready:scienceReady,status:project?(project.completedTurn!==undefined?'완공':`${project.total-project.progress}턴 남음`):scienceReady?'착공 가능':'착공 대기',
   requirements:project?'':scienceOrbitalRequirements(star,ship),open:()=>showOrbitalScienceProject(star,index,ship)}
 ];
}
const ORBITAL_FACILITY_GLYPHS={
 shipyard:'<path d="M5 31V9l8-5h16l8 5v22M5 14h7m18 0h7M10 32h22M13 25l8-11 8 11-8-3zM21 22v9"/><path d="M8 5v4m26-4v4M10 36h4m14 0h4"/>',
 science:'<path d="M11 27a13 13 0 0 0 17-17zM15 31l-3 6h17m-9-6 3 6m1-18 5-5"/><path d="M29 7a9 9 0 0 1 7 7M30 2a14 14 0 0 1 11 11"/>'
};
function showOrbitalConstructionMenu(star,index,ship,{clientX,clientY,detail},trigger){
 closeSurveyMenu();
 const menu=document.createElement('div');menu.id='surveyMenu';menu.className='orbital-construction-menu';
 const name=star.planets[index].label;
 menu.tabIndex=-1;menu.setAttribute('role','group');menu.setAttribute('aria-label',name+' 궤도 시설');
 menu.innerHTML=`<div class="orbital-menu-head"><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="5"/><ellipse cx="14" cy="14" rx="12" ry="7" transform="rotate(-32 14 14)"/><circle cx="22" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg><strong>${safeText(name)}</strong><span>궤도 시설</span></div>`;
 const rows=[];
 for(const option of orbitalConstructionOptions(star,index,ship)){
  const button=document.createElement('button');button.type='button';
  button.className='orbital-command';button.dataset.facility=option.kind;
  button.setAttribute('aria-label',`${option.name} ${option.built?'보기':'건설 상세'} · ${option.status}`);
  const requirementsId='orbit-requirements-'+option.kind;
  if(option.requirements)button.setAttribute('aria-describedby',requirementsId);
  button.innerHTML=`<svg class="orbital-facility-glyph" viewBox="0 0 42 42" aria-hidden="true">${ORBITAL_FACILITY_GLYPHS[option.kind]}</svg>`+
   `<span class="orbital-command-body"><span class="orbital-option-heading"><strong>${option.name}</strong><small class="${option.ready?'ready':option.built?'installed':''}">${option.status}</small></span>`+
   (option.requirements?`<span id="${requirementsId}" class="orbital-requirements">${option.requirements}</span>`:'')+
   '</span><svg class="orbital-command-arrow" viewBox="0 0 12 16" aria-hidden="true"><path d="m4 3 5 5-5 5"/></svg>';
  button.onclick=()=>{closeSurveyMenu();trigger?.focus?.({preventScroll:true});option.open()};menu.append(button);rows.push(button);
 }
 document.body.append(menu);
 const bounds=trigger?.getBoundingClientRect?.();
 let left=clientX,top=clientY;
 if(bounds){
  const leftOfOrbit=bounds.left-menu.offsetWidth-12,rightOfOrbit=bounds.right+12;
  const useLeft=leftOfOrbit>=4&&(bounds.left<innerWidth/2||rightOfOrbit+menu.offsetWidth>innerWidth-4);
  left=useLeft?leftOfOrbit:rightOfOrbit;
  top=(bounds.top+bounds.bottom)/2-28;
  const rail=document.querySelector('.command-nav')?.getBoundingClientRect?.();
  if(useLeft&&rail&&left<rail.right+4&&top+menu.offsetHeight>rail.top)top=Math.max(top,rail.bottom+8);
 }
 menu.style.left=Math.max(4,Math.min(innerWidth-menu.offsetWidth-4,left))+'px';
 menu.style.top=Math.max(4,Math.min(innerHeight-menu.offsetHeight-4,top))+'px';
 menu.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();closeSurveyMenu();trigger?.focus?.()}};
 (detail===0?rows[0]:menu).focus({preventScroll:true});
}
function renderOrbitalConstructionSites(scene,star,ship){
 star.planets.forEach((planet,index)=>{
  if(planet.type!=='hab'||!targetSurveyed(star,planet))return;
  const options=orbitalConstructionOptions(star,index,ship),ready=options.some(option=>option.ready);
  const point=systemPoint(index),button=document.createElement('button');
  button.type='button';button.className='orbital-build-site'+(ready?' ready':'');
  button.style.setProperty('--orbital-offset',point.x<50?'-42px':'42px');
  button.setAttribute('aria-label',planet.label+' · 궤도 건설 · '+options.map(option=>option.name+' '+option.status).join(' · '));
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7Z"/>${ready?'<path d="M8 12h8m-4-4v8"/>':'<path d="M9 11V9a3 3 0 0 1 6 0v2m-7 0h8v6H8Z"/>'}</svg>`+
   `<span class="orbital-site-preview" aria-hidden="true">${options.map(option=>`<span>${option.name} <b class="${option.ready?'ready':''}">${option.status}</b></span>`).join('')}</span>`;
  placeNode(button,{x:point.x,y:point.y});
  button.onclick=event=>{
   if(motionBusy||systemViewportWasDragged())return;
   showOrbitalConstructionMenu(star,index,ship,event,button);
  };
  scene.append(button);
 });
}
function scienceProjectProgressMarkup(project){
 return '<strong>'+project.progress+' / '+project.total+'턴</strong><progress aria-label="과학 프로젝트 진행률" max="'+
  project.total+'" value="'+project.progress+'"></progress>';
}
function showOrbitalScienceProject(star,index,ship){
 if(motionBusy)return;
 const project=(state.scienceProjects??[]).find(item=>item.systemId===star.id&&item.planetIndex===index);
 const blocked=project?'':scienceProjectSiteBlock(state,star.id,index,ship);
 openDialog('과학 프로젝트',star.planets[index].label,project?
  '<div class="science-orbital-progress">'+scienceProjectProgressMarkup(project)+'</div>':
  '<div class="orbital-requirements" aria-label="과학 프로젝트 건설 조건">'+scienceOrbitalRequirements(star,ship)+'</div><p>건설 '+SCIENCE_PROJECT.turns+'턴</p>'+
  '<button id="startOrbitalScienceProject"'+(blocked?' disabled':'')+'>착공</button>');
 if(!project&&!blocked)$('startOrbitalScienceProject').onclick=()=>{
  try{startScienceProject(state,star.id,index,ship)}
  catch(error){$('modalBody').append(Object.assign(document.createElement('p'),{textContent:error.message}));return}
  rec(star.planets[index].label+' · 과학 프로젝트 착공');
  render();showOrbitalScienceProject(star,index,ship);
 };
}
function renderOrbitalScienceProjects(scene,star){
 for(const project of state.scienceProjects??[]){
  if(project.systemId!==star.id||!scienceProjectPlanet(state,project))continue;
  const point=systemPoint(project.planetIndex),node=document.createElement('button');
  node.type='button';node.className='orbital-science-project';
  node.title=project.planetName+' · 과학 프로젝트 · '+(project.completedTurn!==undefined?'완공':(project.total-project.progress)+'턴 남음');
  node.setAttribute('aria-label',node.title);
  node.innerHTML='<span aria-hidden="true">✧</span><span>과학 프로젝트</span>'+
   '<progress aria-label="건설 진행률" max="'+project.total+'" value="'+project.progress+'"></progress>';
  placeNode(node,{x:Math.max(6,Math.min(94,point.x+(point.x<50?-10:10))),y:Math.max(8,point.y-5)});
  node.onclick=()=>showOrbitalScienceProject(star,project.planetIndex);
  scene.append(node);
 }
}
function planetModal(i){let s=state.stars[sysId],p=s.planets[i];if(!tutorial&&!targetSurveyed(s,p))return;$('modalTitle').textContent=p.label;$('modalDesc').textContent=types[p.type]+' 행성';let html='';if(p.type==='barren')html='<div class="note">개발 불가</div>';
if(p.type==='hab'){if(s.owned){openHabitat(i);return}else html='<div class="note">미개척</div>'+habitableTraitsHtml(p)}
if(p.type==='mineral'||p.type==='gas'){
let facility=DATA.planets[p.type],building=facility.facility;
html=`<p><b>${building} Lv.${p.level} / ${facility.maxLevel}</b></p><p>턴당 생산량: ${resourceAmountMarkup(facility.resource,facilityProduction(p,ownedWonder(s)))}</p><p>유지비/턴: ${resourceAmountsMarkup(facility.levels[p.level]?.upkeep)}</p>`;
if(p.construction){html+=`<div class="note">건설 중: Lv.${p.construction.target} · ${p.construction.remaining}턴</div>`}
else if(p.level<DATA.planets[p.type].maxLevel){const spec=facility.levels[p.level+1];html+=`<div class="note">착공 비용: ${resourceAmountsMarkup(spec.cost)}<br>${facilityConstructionTurns(p)}턴<br>완공 후 유지비/턴: ${resourceAmountsMarkup(spec.upkeep)}</div><button id="levelUp" class="primary" ${s.owned&&canAfford(spec.cost)?'':'disabled'}>${!canAfford(spec.cost)?'자원 부족':p.level===0?'건설':'확장'}</button>`}
else html+='<div class="note">최대 레벨</div>';
if(!s.owned)html+='<div class="note">개척 필요</div>';
}
$('modalBody').innerHTML=html;showGameDialog();let b=$('levelUp');if(b)b.onclick=()=>{if(startFacilityConstruction(p)){planetModal(i);render()}}}
function renderHeader(){
 const details=resourceDetails();
 $('turn').textContent='턴 '+state.turn;
 $('notificationsBtn').classList.toggle('research-notification',state.records.some(s=>s.includes('연구 완료'))||
  (state.prosperity?.warnings??[]).some(alert=>alert.turn===state.turn)||Object.keys(state.missingScouts??{}).length>0||
  (state.scienceProjects??[]).some(project=>project.owner!=='player'&&project.startedTurn===state.turn));
 $('ownership').textContent='개척 항성계 '+state.stars.filter(s=>s.owned).length;
 $('resource').innerHTML=HAB_RESOURCES.map(k=>{
   const d=details[k],t=resourceTotals(d),net=t.net;
   const shortage=state.shortages?.[k];
   const status=shortage?.consecutive?'부족 '+shortage.consecutive+'턴':shortage?.remaining?'여파 '+shortage.remaining+'턴':'';
   const stock=state.res[k].toLocaleString('ko-KR',{maximumFractionDigits:1});
   const delta=`${net>=0?'+':''}${fmtHab(net)}`;
   const headline=`<b>${resourceIcon(k)}<span class="hud-resource-name">${resourceNames[k]}</span> <span class="hud-resource-value">${stock}</span></b><small class="${net<0?'negative':''}">${delta} /턴</small>${status?`<small class="negative">${status}</small>`:''}`;
   if(k==='research')return `<div class="res">${headline}${researchHeader(net)}</div>`;
   const hasMining=k==='energy'||k==='mineral';
   const row=(label,value,isCost=false)=>`<div class="res-tt-row"><span>${label}</span>${resourceAmountMarkup(k,(value===0?'':isCost?'-':'+')+fmtHab(value))}</div>`;
   const tooltip=`<div class="res-tooltip" role="tooltip">
     <div class="res-tt-title">${resourceNames[k]} · 턴당 내역</div>
     ${shortage?resourceShortageMarkup(k,shortage):''}
     <div class="res-tt-section produce"><span>생산</span>${resourceAmountMarkup(k,'+'+fmtHab(t.production))}</div>
     ${row('건물 생산',d.production.building)}${hasMining?row('행성 채굴기지',d.production.mining):''}
     ${d.production.wonder>0?row('우주의 경이',d.production.wonder):''}
     <div class="res-tt-section consume"><span>소모</span>${resourceAmountMarkup(k,(t.consumption?'-':'')+fmtHab(t.consumption))}</div>
     ${d.consumption.manufacturing>0?row('생산 투입',d.consumption.manufacturing,true):''}
     ${hasMining||k==='consumer'?row('건물 유지비',d.consumption.building,true):''}
     ${k==='food'||k==='consumer'?row('인구 소비',d.consumption.population,true):''}
     ${k==='energy'||k==='alloy'?row('함선 유지비',d.consumption.ship,true):''}
     ${hasMining?row('조선소 유지비',d.consumption.shipyard,true):''}
     ${d.consumption.gateway>0?row('관문 유지비',d.consumption.gateway,true):''}
   </div>`;
   return `<div class="res" tabindex="0" aria-label="${resourceNames[k]} 상세 내역 · ${stock} · 턴당 ${delta}${status?' · '+status:''}">${headline}${tooltip}</div>`;
 }).join('');
}
const SHORTAGE_EFFECT_LABELS={
 buildingProduction:['건물 생산','−'],researchProduction:['연구 생산','−'],populationGrowth:['인구 성장','−'],
 shipCombat:['함선 공격력·전술 속도·회피','−'],energyConsumption:['에너지 소모','+'],
 consumerConsumption:['소비재 소모','+'],foodConsumption:['식량 소모','+'],mineralMaintenance:['광물 유지비','+']
};
function resourceShortageMarkup(id,status){
 const rule=shortageRules().resources[id];
 if(!rule)return '';
 const describe=effects=>Object.entries(effects).filter(([,amount])=>amount>0).map(([key,amount])=>{
  const [label,sign]=SHORTAGE_EFFECT_LABELS[key];
  return label+' '+sign+Math.round(amount*100)+'%';
 }).join(' · ');
 const stage1=status.consecutive?describe(rule.stage1):'';
 const stage2=status.remaining?describe(rule.stage2):'';
 return `<div class="negative">${stage1?`<div>${stage1}</div>`:''}${stage2?`<div>${stage2} · ${status.remaining}턴</div>`:''}</div>`;
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
function render(){if(view==='habitat'&&!state.stars[sysId]?.owned)view='system';if(view!=='system'){scanMode=false;colonizeMode=false;}if(view!=='system')stopPlanetRotation();renderHeader();$('mapWrap').classList.toggle('hide',view!=='galaxy');$('systemView').classList.toggle('hide',view!=='system');$('habitatView').classList.toggle('hide',view!=='habitat');document.querySelector('.layout').classList.toggle('planet-mode',view==='habitat');$('back').classList.toggle('hide',view==='galaxy');$('back').textContent=view==='habitat'?'← 항성계로':'← 은하 지도로';for(let id of ['zoomout','zoomin','center'])$(id).classList.toggle('hide',view!=='galaxy');$('viewTitle').textContent=view==='galaxy'?'은하 지도':view==='habitat'?currentHab().label+' 행성 관리':state.stars[sysId].name+' 항성계';
$('selectedShipInfo').innerHTML=activeShip?`<b>${isColonyShip(activeShip)?'□':'△'} ${shipName(activeShip)}</b><br>위치: ${state.stars[state.ships[activeShip]].name}<br>행동력: <b>${state.ap[activeShip]} / 2</b>`:'';
$('shipPanel').querySelector('p').style.visibility=activeShip?'visible':'hidden';
let s=state.stars[selected],from=activeShip?state.ships[activeShip]:null,future=from,movePossible=!!activeShip&&reachable(from,state.ap[activeShip],activeShip).size>0;
$('moveBtn').disabled=!movePossible;$('moveBtn').textContent='이동';
$('scanBtn').textContent=tutorial?'탐사':'개별 탐사';
$('scanBtn').disabled=!activeShip||isColonyShip(activeShip)||state.ap[activeShip]<1||civilianOperationsBlocked(state,future)||state.stars[future].surveyed||!visible(future);
$('colonizeBtn').disabled=!isColonyShip(activeShip)||state.ap[activeShip]<1||civilianOperationsBlocked(state,future)||!canColonize(state.stars[future]);
let warpAvailable=!!activeShip&&!colonyBuildingGateway(state,activeShip)&&blackholeReady(state.stars[from]);
$('warpBtn').classList.toggle('hide',!warpAvailable);
$('warpBtn').disabled=!warpAvailable||state.ap[activeShip]<1||(isColonyShip(activeShip)&&!systemExplored(state.stars[from].blackholeTo));
if(warpAvailable)$('warpBtn').textContent='블랙홀 이동 → '+state.stars[state.stars[from].blackholeTo].name;
$('openBtn').disabled=!systemKnown(selected);
if(view==='system'&&!tutorial){
 const local=!!activeShip&&state.ships[activeShip]===sysId;
 if(!local){moveMode=false;scanMode=false;colonizeMode=false}
 $('colonizeBtn').disabled=!canCommandColonize(state.stars[sysId]);
 if($('colonizeBtn').disabled)colonizeMode=false;
 $('moveBtn').disabled=!local||!state.stars[sysId].edges.some(id=>reachable(sysId,state.ap[activeShip],activeShip).has(id));
 $('scanBtn').disabled=!local||!surveyTargets(state.stars[sysId]).some(target=>canCommandSurvey(state.stars[sysId],target));
}
for(const [id,pressed] of [['moveBtn',moveMode],['scanBtn',scanMode],['colonizeBtn',colonizeMode]]){
 $(id).classList.toggle('command-active',pressed);$(id).setAttribute('aria-pressed',String(pressed));
}


renderCommandUI();renderFleetSelection();renderGatewayCommand();$('log').innerHTML=state.records.map(e=>`<li>${e.replaceAll('<','&lt;')}</li>`).join('');if(view==='galaxy')drawMap();else if(view==='system')drawSystem();else habRender();if(!tutorial){if(view==='system')renderSystemShips();if(view==='habitat')renderSurface()}paintTutorial()}
function focusHome(){scale=1;panX=W/2-state.stars[0].x;panY=H/2-state.stars[0].y}
function reset(seed){debugReveal=false;previousCamera=null;state=generate(seed);initializeExploration(state);initializeResearch(state);initializeShipDesigns(state);initializeShipyards(state);createStartingMilitaryFleet(state);clearFleetSelection();dirty=false;activeShip=null;moveMode=false;selected=0;sysId=0;view='galaxy';focusHome();$('currentSeed').textContent=state.seed;state.records[0]+=' 인접 성계 '+state.stars[state.neighbor].name+'에 거주 가능 행성이 보장됩니다.';render()}
