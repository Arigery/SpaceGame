// Visual commands settle gameplay once, then play their presentation.
// Input is locked during the short presentation to prevent duplicate orders.
let motionBusy=false,surfaceSelection=null;
function targetSurveyed(system,target){return !!(system.surveyed||target.scanned)}
function surveyTargets(system){
 const targets=[...system.planets];
 system.objects??=[];
 if(system.ancient&&!system.objects.some(o=>o.kind==='relic'))system.objects.push({kind:'relic',label:system.ancient});
 if(system.blackholeTo!==null&&!system.objects.some(o=>o.kind==='hole'))system.objects.push({kind:'hole',label:'블랙홀'});
 return targets.concat(system.objects);
}
function revealBlackholePair(system){
 const other=state.stars[system.blackholeTo];
 if(!other)return;
 const hole=surveyTargets(other).find(target=>target.kind==='hole');
 if(hole)hole.scanned=true;
 other.nameRevealed=true;
 other.starScanned=true;
 other.discoveredByBlackhole=true;
 // A paired hole reveals the star, never the planets or full-system survey.
}
function blackholePoint(system){
 surveyTargets(system);
 const index=system.objects.findIndex(object=>object.kind==='hole');
 return {x:16+index*68,y:18};
}
function highlightPortal(system){
 const index=system.objects.findIndex(object=>object.kind==='hole');
 $('planetList').querySelector('[data-object-index="'+index+'"]')?.classList.add('portal-active');
}
async function playBlackholeTransit(ship,from,to){
 const entry=blackholePoint(state.stars[from]),exit=blackholePoint(state.stars[to]);
 const rest={x:exit.x,y:exit.y+9};
 if($('quickMove').checked){setShipPoint(ship,rest);return}
 motionBusy=true;
 await Promise.resolve();
 try{
  view='system';sysId=from;activeShip=ship;render();highlightPortal(state.stars[from]);
  const node=makeSystemShip(ship),start=shipPoint(ship);placeNode(node,start);$('planetList').append(node);
  faceShip(node,start,entry);node.classList.add('cruising');
  await animateShip(node,[{left:start.x+'%',top:start.y+'%'},{left:entry.x+'%',top:entry.y+'%'}],{duration:1000,easing:'ease-in'});
  placeNode(node,entry);node.classList.remove('cruising');
  await animateShip(node,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-50%) scale(.02)',opacity:0}],{duration:650,easing:'ease-in'});
  node.remove();setShipPoint(ship,exit);sysId=to;selected=to;render();highlightPortal(state.stars[to]);
  const arriving=$('planetList').querySelector('[data-system-ship="'+ship+'"]');
  faceShip(arriving,exit,rest);
  await animateShip(arriving,[{transform:'translate(-50%,-50%) scale(.02)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:650,easing:'ease-out'});
  arriving.classList.add('cruising');
  await animateShip(arriving,[{left:exit.x+'%',top:exit.y+'%'},{left:rest.x+'%',top:rest.y+'%'}],{duration:800,easing:'ease-out'});
 }finally{setShipPoint(ship,rest);motionBusy=false;render()}
}
function systemPoint(index){
 const angles=[-145,-38,65,145,-88],angle=angles[index%5]*Math.PI/180,radius=260+index*35;
 return {x:50+Math.cos(angle)*radius/10,y:(310+Math.sin(angle)*radius*.57)/6.4};
}
function shipPoint(ship){
 state.shipPoints??={};
 return state.shipPoints[ship]??{x:ship==='explorer2'?58:ship==='colony'?42:50,y:65};
}
function setShipPoint(ship,point){state.shipPoints??={};state.shipPoints[ship]=point}
function placeNode(node,point){node.style.left=point.x+'%';node.style.top=point.y+'%'}
async function animateShip(node,frames,options){
 const animation=node.animate(frames,{fill:'forwards',...options});
 try{await animation.finished}finally{animation.cancel()}
}
async function playWarp(ship,from,to){
 if($('quickMove').checked){
  const a=state.stars[from],b=state.stars[to];
  state.shipHeadings??={};state.shipHeadings[ship]=Math.atan2(b.x-a.x,-(b.y-a.y)) *180/Math.PI;
  setShipPoint(ship,{x:50,y:65});return;
 }
 motionBusy=true;
 await Promise.resolve();
 try{
  view='system';sysId=from;activeShip=ship;render();
  const scene=$('planetList'),node=makeSystemShip(ship);placeNode(node,shipPoint(ship));scene.append(node);
  const origin=state.stars[from],destination=state.stars[to];
  faceShip(node,{x:0,y:0},{x:destination.x-origin.x,y:destination.y-origin.y});
  node.classList.add('warp-charge');
  await animateShip(node,[{filter:'brightness(1)',transform:'translate(-50%,-50%) scale(1)'},{filter:'brightness(5)',transform:'translate(-50%,-50%) scale(1.5)'}],{duration:850});
  node.remove();
  const a=state.stars[from],b=state.stars[to],angle=Math.atan2(a.y-b.y,a.x-b.x);
  const edge={x:50+Math.cos(angle)*43,y:50+Math.sin(angle)*40};
  setShipPoint(ship,edge);sysId=to;selected=to;render();
  const arriving=$('planetList').querySelector('[data-system-ship="'+ship+'"]');
  await animateShip(arriving,[{opacity:0,filter:'brightness(5)'},{opacity:1,filter:'brightness(1)'}],{duration:350});
  const center={x:ship==='explorer2'?58:50,y:65};
  faceShip(arriving,edge,center);arriving.classList.add('cruising');
  await animateShip(arriving,[{left:edge.x+'%',top:edge.y+'%'},{left:center.x+'%',top:center.y+'%'}],{duration:1600,easing:'ease-out'});
  setShipPoint(ship,center);
 }finally{motionBusy=false;render()}
}
function makeSystemShip(ship){
 const node=document.createElement('button');
 node.className='system-ship'+(activeShip===ship?' selected':'');
 node.dataset.systemShip=ship;
 const model=ship==='colony'?null:modelCanvas('ship',state.shipHeadings?.[ship]||0);
 if(model)node.append(model);else node.textContent=ship==='colony'?'□':'▲';
 addEngineEffects(node,state.shipHeadings?.[ship]||0);node.title=shipName(ship);node.setAttribute('aria-label',shipName(ship));
 const marker=document.createElement('span');marker.className='ship-locator';marker.setAttribute('aria-hidden','true');node.append(marker);
 const label=document.createElement('span');label.className='ship-name';label.textContent=shipName(ship);node.append(label);
 node.onclick=()=>chooseShip(ship);return node;
}
function renderSystemShips(){
 const scene=$('planetList'),system=state.stars[sysId];
 for(const ship of Object.keys(state.ships)){
  if(state.ships[ship]!==sysId)continue;
  const node=makeSystemShip(ship);placeNode(node,shipPoint(ship));scene.append(node);
 }
 updateSystemCamera();
 renderSystemModels(scene);
 renderSystemGates(scene,system);
 surveyTargets(system);
 system.objects.forEach((object,index)=>{
  const node=document.createElement('button');node.className='system-object '+object.kind+' '+(targetSurveyed(system,object)?'surveyed':'unsurveyed');
  node.dataset.objectIndex=index;node.textContent=object.kind==='hole'?'◉':'◇';
  node.title=object.label+(targetSurveyed(system,object)?' · 탐사 완료':' · 미탐사');
  node.setAttribute('aria-label',node.title);
  const status=document.createElement('small');status.className='object-survey-status';status.textContent=targetSurveyed(system,object)?'✓':'?';node.append(status);
  placeNode(node,{x:16+index*68,y:18});scene.append(node);
 });
 scene.oncontextmenu=event=>{
  if(tutorial||event.target.closest('[data-gate]'))return;
  event.preventDefault();closeSurveyMenu();
  if(!activeShip||state.ships[activeShip]!==sysId||motionBusy)return;
  const planet=event.target.closest('[data-planet-index]'),object=event.target.closest('[data-object-index]');
  const rect=scene.getBoundingClientRect();
  const point={x:Math.max(3,Math.min(97,(event.clientX-rect.left)/rect.width*100)),y:Math.max(3,Math.min(97,(event.clientY-rect.top)/rect.height*100))};
  if(!planet&&!object){if(activeShip!=='colony')moveWithinSystem(activeShip,point);return}
  const target=planet?system.planets[Number(planet.dataset.planetIndex)]:system.objects[Number(object.dataset.objectIndex)];
  const destination=planet?systemPoint(Number(planet.dataset.planetIndex)):{x:16+Number(object.dataset.objectIndex)*68,y:18};
  const canJump=target.kind==='hole'&&blackholeReady(system);
  const menu=document.createElement('button');menu.id='surveyMenu';
  menu.textContent=canJump?'블랙홀을 통해 이동 · 행동력 1':targetSurveyed(system,target)?'탐사 완료':'탐사 · 행동력 1';
  menu.disabled=state.ap[activeShip]<1||(!canJump&&(activeShip==='colony'||targetSurveyed(system,target)));
  menu.style.left=Math.max(4,Math.min(innerWidth-180,event.clientX))+'px';
  menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
  const ship=activeShip;
  menu.onclick=()=>{
   closeSurveyMenu();
   if(canJump){
    if(blackholeJump(ship)){
     if($('quickMove').checked||ship==='colony'){sysId=state.ships[ship];view='system'}
     moveMode=false;render();
    }
   }else surveyObject(ship,system,target,destination);
  };
  document.body.append(menu);
 };
}
function closeSurveyMenu(){document.getElementById('surveyMenu')?.remove()}
async function moveWithinSystem(ship,point,scan=false){
 motionBusy=true;
 try{
  const node=$('planetList').querySelector('[data-system-ship="'+ship+'"]'),from=shipPoint(ship);
  if(node){faceShip(node,from,point);node.classList.add('cruising')}
  if(node&&!$('quickMove').checked)await animateShip(node,[{left:from.x+'%',top:from.y+'%'},{left:point.x+'%',top:point.y+'%'}],{duration:1100,easing:'ease-in-out'});
  setShipPoint(ship,point);dirty=true;
  if(node){node.classList.remove('cruising');placeNode(node,point);if(scan){
   node.classList.add('scanning');
   const pulse=document.createElementNS('http://www.w3.org/2000/svg','svg');
   pulse.classList.add('scan-sonar');pulse.setAttribute('viewBox','0 0 100 100');
   pulse.setAttribute('preserveAspectRatio','none');pulse.setAttribute('aria-hidden','true');
   pulse.style.height=($('planetList').offsetHeight*.13)+'px';
   pulse.innerHTML='<path class="sonar-cone" d="M48 2 L52 2 L94 84 Q50 108 6 84 Z"/>'+
    '<ellipse class="sonar-footprint" cx="50" cy="84" rx="44" ry="12"/>'+
    [0,1,2].map(i=>'<g transform="translate(50 4)"><ellipse class="sonar-wave" style="animation-delay:-'+(i*.55)+'s" cx="0" cy="0" rx="44" ry="12"/></g>').join('');
   node.append(pulse);
   await animateShip(pulse,[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.85},{opacity:0}],{duration:2100});
   pulse.remove();node.classList.remove('scanning');
  }}
 }finally{motionBusy=false;render()}
}
async function surveyObject(ship,system,target,point){
 if(motionBusy||state.ships[ship]!==system.id||ship==='colony'||state.ap[ship]<1||targetSurveyed(system,target))return false;
 state.ap[ship]=Math.round((state.ap[ship]-1)*10000)/10000;
 target.scanned=true;
 if(target.kind==='hole')revealBlackholePair(system);
 system.surveyed=surveyTargets(system).every(item=>item.scanned);
 dirty=true;rec((target.label||'대상')+' 탐사 완료'+(system.surveyed?' · 성계 전체 탐사 완료':''));
 await moveWithinSystem(ship,{x:point.x,y:Math.max(5,point.y-13)},true);
 if(target.kind==='relic')showDiscoveryQueue([{
  title:target.label+' 발견',desc:system.name+'에서 '+target.label+'의 탐사를 완료했습니다.',
  body:'고대 문명의 흔적이 확인되었습니다. 현재 프로토타입에서는 추가 자원이나 연구력 보상이 없습니다.'
 }]);
 return true;
}
document.addEventListener('click',event=>{
 if(motionBusy){event.preventDefault();event.stopImmediatePropagation()}
 else if(!event.target.closest('#surveyMenu'))closeSurveyMenu();
},true);
document.addEventListener('contextmenu',event=>{if(motionBusy){event.preventDefault();event.stopImmediatePropagation()}},true);
let quickMove=false;
try{quickMove=localStorage.getItem('space_quick_move')==='true'}catch{}
$('quickMove').checked=quickMove;
$('quickMove').onchange=()=>{try{localStorage.setItem('space_quick_move',String($('quickMove').checked))}catch{}};

function renderSurface(){
 let scene=$('habitatView').querySelector('.planet-surface');
 if(!scene){scene=document.createElement('section');scene.className='planet-surface';scene.setAttribute('aria-label','행성 건물 배치');$('habitatView').querySelector('.hab-overview-panel').after(scene)}
 const h=habitat(currentHab());
 scene.dataset.terrain=currentHab().terrain||'temperate';
 scene.replaceChildren();
 const heading=document.createElement('h3');heading.textContent=currentHab().label+' · 지표 기지';scene.append(heading);
 for(const [kind,items] of [['common',h.common],['special',h.special]]){
  items.forEach((building,index)=>{
   const button=document.createElement('button');button.className='surface-lot '+kind+(building?' built':' empty');
   const row=kind==='common'?Math.floor(index/3):2,col=index%3;
   button.style.left=(18+col*28+(row%2)*7)+'%';button.style.top=(24+row*25)+'%';
   const definition=building?(building.id==='center'?DATA.buildings.center:kind==='common'?HAB_COMMON_BY_ID.get(building.id):SPECIAL_BY_ID.get(building.id)):null;
   const name=definition?.name||(kind==='common'?'공용':'특화')+' 건설';
   const art=document.createElement('span');art.className='surface-model';
   if(definition?.image){const image=document.createElement('img');image.src=definition.image;image.alt='';art.append(image)}
   else art.textContent=building?'▥':'＋';
   const label=document.createElement('span');label.textContent=name+(building?' Lv.'+building.level:'');
   button.append(art,label);
   if(building?.subs){const subs=document.createElement('small');subs.textContent='부속 '+building.subs.filter(Boolean).length+'/3';button.append(subs)}
   button.onclick=()=>openSurfaceBuilding(kind,index);scene.append(button);
  });
 }
 if(surfaceSelection&&modalKind==='surface')refreshSurfaceBuilding();
}
function openSurfaceBuilding(kind,index){
 const h=habitat(currentHab()),items=kind==='common'?h.common:h.special;
 if(!items[index]){
  surfaceSelection=null;
  const common=kind==='common';
  chooseBuilding(common?'공용 건물 건설':'특화 건물 건설',common?HAB_COMMON:DATA.buildings.special,
   choice=>startHabConstruction(currentHab(),kind,index,choice.id),common);
  return;
 }
 surfaceSelection={kind,index};modalKind='surface';
 $('overlay').classList.remove('hide');refreshSurfaceBuilding();
}
function refreshSurfaceBuilding(){
 const {kind,index}=surfaceSelection;
 const container=$(kind==='common'?'habCommon':'habSpecial'),card=container.children[index];
 $('modalTitle').textContent=card.querySelector('.hab-card-head b').textContent;
 $('modalDesc').textContent=kind==='common'?'공용 건물':'특화 건물';
 const body=$('modalBody');body.replaceChildren(card.cloneNode(true));
 // Reuse the existing construction and worker handlers, including all validation.
 body.querySelectorAll('button').forEach((button,buttonIndex)=>{
  button.onclick=()=>{
   const original=container.children[index].querySelectorAll('button')[buttonIndex];
   original.click();
  };
 });
 if(kind==='common'&&index===0){
  const button=$('habExpandCommon').cloneNode(true);button.removeAttribute('id');
  button.onclick=()=> $('habExpandCommon').click();body.append(button);
 }

}


function faceShip(node,from,to){
 const scene=$('planetList').getBoundingClientRect();
 const dx=(to.x-from.x)*scene.width,dy=(to.y-from.y)*scene.height;
 if(Math.hypot(dx,dy)<.001)return;
 const heading=Math.atan2(dx,-dy/.57)*180/Math.PI;
 state.shipHeadings??={};state.shipHeadings[node.dataset.systemShip]=heading;
 const canvas=node.querySelector('.model-canvas'),replacement=modelCanvas('ship',heading);
 if(canvas&&replacement)canvas.replaceWith(replacement);
 node.querySelector('.engine-effects')?.remove();addEngineEffects(node,heading);
}
function addEngineEffects(node,heading){
 if(node.dataset.systemShip==='colony')return;
 shipGeometry??=readShipGeometry();
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 100 100');svg.classList.add('engine-effects');
 const project=raw=>{
  // GLB nodes share translation (0,-.56,.27).
  const translated=[raw[0],raw[1]-.56,raw[2]+.27],n=shipNormalization;
  const p=projectShipPoint(translated.map((v,i)=>(v-(n.min[i]+n.max[i])/2)*n.scale),heading);
  return [50+p[0]*50,50-p[1]*50];
 };
 for(const [x,y,z,width,length,kind] of [[-2.13,-1.24,5.68,.40,2.8,'wing'],[2.13,-1.24,5.68,.40,2.8,'wing'],[0,0,5.2,.65,4.3,'main']]){
  const flame=document.createElementNS(ns,'polygon');
  flame.setAttribute('points',[[x-width,y,z],[x+width,y,z],[x,y,z+length]].map(project).map(p=>p.join(',')).join(' '));
  flame.classList.add(kind+'-exhaust');svg.append(flame);
 }
 node.append(svg);
}
function renderSystemModels(scene){
 const sun=scene.querySelector('.stellar-sun-sphere'),sunModel=modelCanvas('sun');
 if(sunModel){sun.replaceChildren(sunModel);sun.classList.add('mesh-sphere')}
 scene.querySelectorAll('[data-planet-index]').forEach(button=>{
  const p=state.stars[sysId].planets[Number(button.dataset.planetIndex)],sphere=button.querySelector('.stellar-planet-sphere'),model=modelCanvas(p.type);
  if(model){sphere.replaceChildren(model);sphere.classList.add('mesh-sphere')}
 });
}
function gatePoint(system,neighbor){
 const angle=Math.atan2(neighbor.y-system.y,neighbor.x-system.x);
 return {x:50+Math.cos(angle)*46,y:50+Math.sin(angle)*43,angle:angle*180/Math.PI+90};
}
function renderSystemGates(scene,system){
 for(const id of system.edges){
  const neighbor=state.stars[id],point=gatePoint(system,neighbor),gate=document.createElement('button');
  gate.className='system-gate';gate.dataset.gate=id;gate.setAttribute('aria-label',(systemKnown(id)?neighbor.name:'미확인')+' 성계');
  const triangle=document.createElement('span');triangle.textContent='▲';triangle.style.transform='scaleY(.57) rotate('+point.angle+'deg)';
  const label=document.createElement('small');label.textContent=systemKnown(id)?neighbor.name:'탐사선 도착 후 진입 가능';gate.append(triangle,label);placeNode(gate,point);
  gate.onclick=()=>{if(systemKnown(id))systemOpen(id)};
  gate.oncontextmenu=event=>{
   event.preventDefault();event.stopPropagation();closeSurveyMenu();
   const ship=activeShip,menu=document.createElement('button');menu.id='surveyMenu';
   const cost=ship&&state.ships[ship]===system.id?reachable(system.id,state.ap[ship]).get(id):undefined;
   menu.textContent=cost===undefined?'함선 선택 또는 행동력 확인':(systemKnown(id)?neighbor.name:'? 성계')+' 이동 · 행동력 '+cost;
   menu.disabled=cost===undefined||motionBusy;
   menu.style.left=Math.max(4,Math.min(innerWidth-220,event.clientX))+'px';
   menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
   menu.onclick=()=>{
    closeSurveyMenu();
    if(moveShip(ship,id)){
     if(($('quickMove').checked||ship==='colony')&&systemKnown(id)){sysId=id;selected=id;view='system'}
     moveMode=false;render();
    }
   };
   document.body.append(menu);
  };
  scene.append(gate);
 }
}

let systemCamera={id:null,zoom:1,x:0,y:0};
function updateSystemCamera(){
 const scene=$('planetList');
 if(tutorial){scene.style.transform='';return}
 const viewport=scene.parentElement;
 const fit=Math.min(1,viewport.clientWidth/scene.offsetWidth,viewport.clientHeight/scene.offsetHeight);
 if(systemCamera.id!==sysId)systemCamera={id:sysId,zoom:fit,x:0,y:0};
 systemCamera.zoom=Math.max(fit,systemCamera.zoom);
 const width=scene.offsetWidth*systemCamera.zoom,height=scene.offsetHeight*systemCamera.zoom;
 systemCamera.x=width<=viewport.clientWidth?(viewport.clientWidth-width)/2:Math.max(viewport.clientWidth-width,Math.min(0,systemCamera.x));
 systemCamera.y=height<=viewport.clientHeight?(viewport.clientHeight-height)/2:Math.max(viewport.clientHeight-height,Math.min(0,systemCamera.y));
 scene.style.transformOrigin='0 0';
 scene.style.transform='translate('+systemCamera.x+'px,'+systemCamera.y+'px) scale('+systemCamera.zoom+')';
}
document.querySelector('.stellar-viewport').addEventListener('wheel',event=>{
 if(tutorial||view!=='system')return;
 event.preventDefault();
 if(motionBusy)return;
 const viewport=event.currentTarget,rect=viewport.getBoundingClientRect();
 const x=event.clientX-rect.left,y=event.clientY-rect.top,old=systemCamera.zoom;
 const scene=$('planetList'),fit=Math.min(1,viewport.clientWidth/scene.offsetWidth,viewport.clientHeight/scene.offsetHeight);
 const zoom=Math.max(fit,Math.min(12,old*Math.exp(-event.deltaY*.0015)));
 systemCamera.x=x-(x-systemCamera.x)*zoom/old;
 systemCamera.y=y-(y-systemCamera.y)*zoom/old;
 systemCamera.zoom=zoom;updateSystemCamera();closeSurveyMenu();
},{passive:false});

window.addEventListener('resize',()=>{if(view==='system'&&!tutorial)updateSystemCamera()});

let systemDrag=null,systemDragClick=false;
const systemViewport=document.querySelector('.stellar-viewport');
systemViewport.addEventListener('pointerdown',event=>{
 if(tutorial||motionBusy||event.button!==0)return;
 systemDrag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:systemCamera.x,panY:systemCamera.y,moved:false};
 systemDragClick=false;
});
systemViewport.addEventListener('pointermove',event=>{
 if(!systemDrag||systemDrag.id!==event.pointerId)return;
 const dx=event.clientX-systemDrag.x,dy=event.clientY-systemDrag.y;
 if(Math.abs(dx)+Math.abs(dy)>6){
  systemDrag.moved=true;systemViewport.setPointerCapture(event.pointerId);systemViewport.classList.add('panning');
 }
 if(!systemDrag.moved)return;
 systemCamera.x=systemDrag.panX+dx;systemCamera.y=systemDrag.panY+dy;
 updateSystemCamera();closeSurveyMenu();
});
function finishSystemDrag(event){
 if(!systemDrag||systemDrag.id!==event.pointerId)return;
 systemDragClick=systemDrag.moved;
 if(systemViewport.hasPointerCapture(event.pointerId))systemViewport.releasePointerCapture(event.pointerId);
 systemDrag=null;systemViewport.classList.remove('panning');
 setTimeout(()=>{systemDragClick=false},0);
}
systemViewport.addEventListener('pointerup',finishSystemDrag);
systemViewport.addEventListener('pointercancel',finishSystemDrag);
systemViewport.addEventListener('click',event=>{
 if(systemDragClick){event.preventDefault();event.stopImmediatePropagation()}
},true);
