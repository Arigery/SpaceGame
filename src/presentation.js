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
function gatewayPoint(){return {x:78,y:32}}
function highlightPortal(system,kind){
 const index=system.objects.findIndex(object=>object.kind==='hole');
 const selector=kind==='gateway'?'.orbital-gateway':'[data-object-index="'+index+'"]';
 $('planetList').querySelector(selector)?.classList.add('portal-active');
}
function playBlackholeTransit(ship,from,to){return playPortalTransit(ship,from,to,'hole')}
async function playPortalTransit(ship,from,to,kind){
 const point=kind==='gateway'?gatewayPoint:blackholePoint;
 const entry=point(state.stars[from]),exit=point(state.stars[to]);
 const rest={x:exit.x,y:exit.y+9};
 if($('quickMove').checked){setShipPoint(ship,rest);return}
 motionBusy=true;
 await Promise.resolve();
 try{
  view='system';sysId=from;activeShip=ship;render();highlightPortal(state.stars[from],kind);
  const node=makeSystemShip(ship),start=shipPoint(ship);placeNode(node,start);$('planetList').append(node);
  faceShip(node,start,entry);node.classList.add('cruising');
  await animateShip(node,[{left:start.x+'%',top:start.y+'%'},{left:entry.x+'%',top:entry.y+'%'}],{duration:1000,easing:'ease-in'});
  placeNode(node,entry);node.classList.remove('cruising');
  await animateShip(node,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-50%) scale(.02)',opacity:0}],{duration:650,easing:'ease-in'});
  node.remove();setShipPoint(ship,exit);sysId=to;selected=to;render();highlightPortal(state.stars[to],kind);
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
 return state.shipPoints[ship]??{x:ship==='explorer2'?58:isColonyShip(ship)?42:50,y:65};
}
function setShipPoint(ship,point){state.shipPoints??={};state.shipPoints[ship]=point}
function placeNode(node,point){node.style.left=point.x+'%';node.style.top=point.y+'%'}
async function animateShip(node,frames,options){
 const {onFrame,...timing}=options;
 const animation=node.animate(frames,{fill:'forwards',...timing});
 let frame;
 if(onFrame){
  const update=()=>{
   onFrame(Math.min(1,Math.max(0,(animation.currentTime??0)/timing.duration)));
   frame=requestAnimationFrame(update);
  };
  frame=requestAnimationFrame(update);
 }
 try{await animation.finished}finally{
  if(frame!==undefined)cancelAnimationFrame(frame);
  animation.cancel();
 }
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
  const center={x:ship==='explorer2'?58:isColonyShip(ship)?42:50,y:65};
  faceShip(arriving,edge,center);arriving.classList.add('cruising');
  await animateShip(arriving,[{left:edge.x+'%',top:edge.y+'%'},{left:center.x+'%',top:center.y+'%'}],{duration:1600,easing:'ease-out'});
  setShipPoint(ship,center);
 }finally{motionBusy=false;render()}
}
function makeSystemShip(ship,{picked=activeShip===ship,heading=state.shipHeadings?.[ship]||0,onSelect=()=>chooseShip(ship)}={}){
 const node=document.createElement('button');
 node.className='system-ship'+(picked?' selected':'');
 node.dataset.systemShip=ship;
 const model=modelCanvas(isColonyShip(ship)?'colony':'ship',heading);
 if(model)node.append(model);else node.textContent=isColonyShip(ship)?'□':'▲';
 addEngineEffects(node,heading);node.title=shipName(ship);node.setAttribute('aria-label',shipName(ship));
 const marker=document.createElement('span');marker.className='ship-locator';marker.setAttribute('aria-hidden','true');node.append(marker);
 const label=document.createElement('span');label.className='ship-name';label.textContent=shipName(ship);node.append(label);
 node.onclick=onSelect;return node;
}
function wedgeSlots(count){
 if(count===2)return [{side:-.5,depth:0},{side:.5,depth:.3}];
 const slots=[];
 for(let row=0;slots.length<count;row++){
  const width=Math.min(row+1,7,count-slots.length);
  for(let i=0;i<width;i++)slots.push({side:i-(width-1)/2,depth:row});
 }
 return slots;
}
function projectFleetOffset(side,depth,heading){
 const angle=heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return {x:c*side-s*depth,y:(s*side+c*depth)*.57};
}
function systemFleetMembers(game,fleet){
 const ids=new Set(fleet.shipIds);
 return game.military.ships.filter(ship=>ids.has(ship.id));
}
const SYSTEM_FLEET_ROLES={
 heavy_cruiser:{order:0,score:({side,depth})=>depth+Math.abs(side)},
 escort:{order:1,score:({side,depth})=>depth-Math.abs(side)*.4},
 battleship:{order:2,score:({side,depth})=>-depth+Math.abs(side)*.4},
 corvette:{order:3,score:({side,depth})=>-Math.abs(side)*2+depth*.25},
 destroyer:{order:4,score:({side,depth})=>Math.abs(side)+depth*.25}
};
const SYSTEM_FORMATION_NAMES={single:'단독',echelon:'엇갈림 대형',screen:'호위 대형',line:'전열 대형',wedge:'쐐기 대형'};
function systemFormationType(members){
 if(members.length<=1)return 'single';
 if(members.length<=3)return 'echelon';
 const count=id=>members.filter(ship=>ship.hullId===id).length;
 if(count('battleship')||count('escort')*2>=members.length)return 'screen';
 if((count('heavy_cruiser')+count('destroyer'))*2>=members.length)return 'line';
 return 'wedge';
}
function systemFormationSlots(count,type){
 if(type==='echelon')return Array.from({length:count},(_,i)=>({side:i-(count-1)/2,depth:i%2*.42}));
 if(type==='wedge'||type==='single')return wedgeSlots(count);
 const slots=[];
 for(let row=0;slots.length<count;row++){
  const width=Math.min(count-slots.length,type==='line'?Math.min(6,Math.max(3,Math.ceil(Math.sqrt(count)))):Math.min(row+2,6));
  for(let i=0;i<width;i++){
   const side=i-(width-1)/2;
   slots.push({side,depth:row+Math.abs(side)*(type==='screen'?.24:.13)});
  }
 }
 return slots;
}
function systemShipFormation(members,heading){
 const type=systemFormationType(members);
 const slots=systemFormationSlots(members.length,type),size=Math.min(25,128/Math.min(7,Math.ceil(Math.sqrt(members.length))));
 const middle=Math.max(0,...slots.map(slot=>slot.depth))/2;
 const ordered=[...members].sort((a,b)=>(SYSTEM_FLEET_ROLES[a.hullId]?.order??4)-(SYSTEM_FLEET_ROLES[b.hullId]?.order??4));
 const offsets=ordered.map(ship=>{
  const score=(SYSTEM_FLEET_ROLES[ship.hullId]??SYSTEM_FLEET_ROLES.destroyer).score;
  const index=slots.reduce((best,slot,i)=>score(slot)<score(slots[best])?i:best,0);
  const [{side,depth}]=slots.splice(index,1);
  const lateral=side*size*1.45,lane=(depth-middle)*size*1.7;
  return {ship,lateral,lane,...projectFleetOffset(lateral,lane,heading)};
 });
 return {size,offsets,type};
}
function fleetFormationPoints(center,count,heading,width,height){
 const slots=wedgeSlots(count),middle=(slots.at(-1)?.depth??0)/2;
 const spacing=Math.min(150,660/Math.max(4,Math.sqrt(count)));
 const offsets=slots.map(({side,depth})=>projectFleetOffset(side*spacing,(depth-middle)*spacing*1.3,heading))
  .map(({x,y})=>({x:x*100/width,y:y*100/height}));
 const fit=(axis,extent)=>{
  const values=offsets.map(p=>p[axis]),min=Math.min(...values),max=Math.max(...values);
  const scale=Math.min(1,Math.max(0,100-2*extent)/(max-min||1));
  const origin=Math.max(extent-min*scale,Math.min(100-extent-max*scale,center[axis]));
  return offsets.map(p=>origin+p[axis]*scale);
 };
 const xs=fit('x',8),ys=fit('y',8);
 return offsets.map((_,i)=>({x:xs[i],y:ys[i]}));
}
function systemFleetPose(game,fleet,systemId){
 const pose=fleet.systemPose;
 if(pose?.systemId===systemId&&[pose.x,pose.y].every(value=>Number.isFinite(value)&&value>=0&&value<=100)&&Number.isFinite(pose.heading))return pose;
 const local=game.military.fleets.filter(f=>f.shipIds.length&&(f===fleet||f.systemId===systemId));
 const groups=new Map();
 for(const f of local){
  const key=f.corpsId==null?f.id:f.owner+':'+f.corpsId;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(f);
 }
 const formations=[...groups.values()],index=formations.findIndex(group=>group.includes(fleet));
 if(index<0)return {x:60,y:28,heading:45};
 const group=formations[index],center={x:60+(index%3)*16,y:28+Math.floor(index/3)%7*9};
 return {...fleetFormationPoints(center,group.length,45,1000,640)[group.indexOf(fleet)],heading:45};
}
function makeSystemFleet(game,fleet,pose,picked=false,onSelect){
 const members=systemFleetMembers(game,fleet);
 const friendly=fleet.owner==='player',selectable=friendly&&!!onSelect;
 const node=document.createElement(selectable?'button':'span');
 node.className='system-ship system-military-fleet'+(friendly?'':' hostile')+(picked?' selected':'');
 node.dataset.systemFleet=fleet.id;
 const {size,offsets,type}=systemShipFormation(members,pose.heading);
 node.title=`${fleet.name} · ${members.length}척 · ${SYSTEM_FORMATION_NAMES[type]}`;node.setAttribute('aria-label',node.title);
 if(selectable){node.type='button';node.setAttribute('aria-pressed',String(picked));node.onclick=event=>onSelect(fleet.id,extendFleetSelection(event))}
 const width=Math.max(16,...offsets.map(p=>Math.abs(p.x)))+size/2;
 const height=Math.max(11,...offsets.map(p=>Math.abs(p.y)))+size/2;
 const radians=pose.heading*Math.PI/180,screenHeading=Math.atan2(Math.sin(radians),Math.cos(radians)*.57)*180/Math.PI;
 node.style.setProperty('--fleet-ship-size',size+'px');
 node.style.setProperty('--fleet-width',width*2+'px');
 node.style.setProperty('--fleet-height',height*2+'px');
 node.style.setProperty('--fleet-heading',screenHeading+'deg');
 node.innerHTML=`<span class="system-fleet-models">${offsets.map(({ship,x,y})=>`<span class="system-fleet-member" data-formation-ship="${safeText(ship.id)}" style="--fleet-x:${x.toFixed(2)}px;--fleet-y:${y.toFixed(2)}px" title="${safeText(ship.name)}">${militaryShipPortraitMarkup(ship.hullId,pose.heading)}<span class="fleet-exhaust" aria-hidden="true"></span></span>`).join('')}</span><span class="ship-name">${safeText(fleet.name)} · ${SYSTEM_FORMATION_NAMES[type]}</span>`;
 placeNode(node,pose);return node;
}
function renderSystemMilitaryFleets(scene,game,systemId,selectedIds,onSelect,onSelectCorps){
 const local=(game.military?.fleets??[]).filter(f=>f.systemId===systemId&&f.shipIds.length);
 const corps=new Map();
 for(const fleet of local){
  scene.append(makeSystemFleet(game,fleet,systemFleetPose(game,fleet,systemId),selectedIds.includes(fleet.id),onSelect));
  if(!onSelectCorps||fleet.owner!=='player'||fleet.corpsId==null)continue;
  if(!corps.has(fleet.corpsId))corps.set(fleet.corpsId,[]);
  corps.get(fleet.corpsId).push(fleet);
 }
 for(const group of corps.values()){
  if(group.length<2)continue;
  const lead=group[0],pose=systemFleetPose(game,lead,systemId),ids=group.map(f=>f.id);
  const badge=document.createElement('button');badge.type='button';badge.className='system-corps-control';
  badge.title=lead.corpsName;badge.setAttribute('aria-label',lead.corpsName+' · 함대 '+ids.length+'개 선택');
  badge.setAttribute('aria-pressed',String(ids.every(id=>selectedIds.includes(id))));
  badge.innerHTML=fleetFormationIcon('corps');badge.onclick=event=>onSelectCorps(ids,extendFleetSelection(event));
  placeNode(badge,{x:pose.x,y:Math.max(4,pose.y-10)});scene.append(badge);
 }
}
function fleetScreenHeading(scene,from,to,fallback=45){
 const rect=scene.getBoundingClientRect();
 const dx=(to.x-from.x)*(rect.width||1000),dy=(to.y-from.y)*(rect.height||640);
 return Math.hypot(dx,dy)>.001?Math.atan2(dx,-dy/.57)*180/Math.PI:fallback;
}
function fleetMovePoint(scene,event){
 const rect=scene.getBoundingClientRect(),clamp=n=>Math.max(8,Math.min(92,n));
 if(!rect.width||!rect.height)return null;
 return {x:clamp((event.clientX-rect.left)/rect.width*100),y:clamp((event.clientY-rect.top)/rect.height*100)};
}
function fleetRepositionTarget(event,scene,game,ids,systemId){
 if(event.button!==2||motionBusy||encounterUILocked||event.target.closest('button,a,[data-system-fleet],.stellar-sun'))return null;
 if(!canRepositionFleets(game,ids,systemId))return null;
 return fleetMovePoint(scene,event);
}
function animateFleetMovement(){
 return !$('quickMove').checked&&typeof Element!=='undefined'&&typeof Element.prototype.animate==='function'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function flightFrames(from,to){
 return [from,to].map(point=>({left:point.x+'%',top:point.y+'%'}));
}
function fleetCruisePath(from,to,width,height){
 const start={x:from.x*width/100,y:from.y*height/100},end={x:to.x*width/100,y:to.y*height/100};
 const dx=end.x-start.x,dy=end.y-start.y,distance=Math.hypot(dx,dy);
 if(distance<1)return progress=>({x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress,heading:from.heading});
 const facing=projectFleetOffset(0,-1,from.heading),length=Math.hypot(facing.x,facing.y);
 const forward={x:facing.x/length,y:facing.y/length},towards={x:dx/distance,y:dy/distance};
 const lead=Math.min(distance*.52,180),tail=Math.min(distance*.34,120);
 const dot=forward.x*towards.x+forward.y*towards.y;
 const side=dot<-.8?Math.min(width,height)*.12*((start.x-width/2)*towards.y-(start.y-height/2)*towards.x>=0?1:-1):0;
 const keepInScene=p=>({x:Math.max(0,Math.min(width,p.x)),y:Math.max(0,Math.min(height,p.y))});
 const a=keepInScene({x:start.x+forward.x*lead,y:start.y+forward.y*lead});
 const b=keepInScene({x:end.x-towards.x*tail-towards.y*side,y:end.y-towards.y*tail+towards.x*side});
 return progress=>{
  const t=progress*progress*(3-2*progress),u=1-t;
  const position=k=>u*u*u*start[k]+3*u*u*t*a[k]+3*u*t*t*b[k]+t*t*t*end[k];
  const tangent=k=>u*u*(a[k]-start[k])+2*u*t*(b[k]-a[k])+t*t*(end[k]-b[k]);
  const tx=tangent('x'),ty=tangent('y');
  return {x:position('x')*100/width,y:position('y')*100/height,
   heading:Math.hypot(tx,ty)>.01?Math.atan2(tx,-ty/.57)*180/Math.PI:from.heading};
 };
}
function fleetCruiseVisuals(node,members,heading){
 const layout=new Map(systemShipFormation(members,heading).offsets.map(p=>[p.ship.id,p]));
 const sprites=[...node.querySelectorAll('[data-formation-ship]')].map(el=>({
  el,img:el.querySelector('.military-ship-model'),...layout.get(el.dataset.formationShip)
 }));
 if(!sprites.length)return ()=>{};
 let lastYaw=militaryModelYaw(heading);
 return angle=>{
  const forward=projectFleetOffset(0,-1,angle),yaw=militaryModelYaw(angle);
  node.style.setProperty('--fleet-heading',Math.atan2(forward.x,-forward.y)*180/Math.PI+'deg');
  for(const {el,img,ship,lateral,lane} of sprites){
   const {x,y}=projectFleetOffset(lateral,lane,angle);
   el.style.setProperty('--fleet-x',x.toFixed(2)+'px');
   el.style.setProperty('--fleet-y',y.toFixed(2)+'px');
   if(img&&yaw!==lastYaw){
    const src=militaryShipImage(ship.hullId,yaw);
    if(src)img.src=src;
   }
  }
  lastYaw=yaw;
 };
}
async function turnSystemFleet(node,members,fromHeading,toHeading){
 const delta=((toHeading-fromHeading+540)%360)-180;
 if(Math.abs(delta)<2)return;
 const initial=new Map(systemShipFormation(members,fromHeading).offsets.map(offset=>[offset.ship.id,offset]));
 const final=new Map(systemShipFormation(members,toHeading).offsets.map(offset=>[offset.ship.id,offset]));
 const screenHeading=heading=>{
  const {x,y}=projectFleetOffset(0,-1,heading);
  return Math.atan2(x,-y)*180/Math.PI;
 };
 const rotation=((screenHeading(fromHeading)-screenHeading(toHeading)+540)%360)-180;
 await Promise.all([...node.querySelectorAll('[data-formation-ship]')].map((el,i)=>{
  const from=initial.get(el.dataset.formationShip),to=final.get(el.dataset.formationShip);
  return animateShip(el,[
   {transform:`translate(-50%,-50%) translate(${from.x-to.x}px,${from.y-to.y}px) rotate(${rotation}deg)`},
   {transform:'translate(-50%,-50%)'}
  ],{duration:320,easing:'ease-in-out',delay:Math.min(i*10,60),fill:'both'});
 }));
}
async function repositionSystemFleets(game,ids,systemId,point,scene){
 if(motionBusy||!canRepositionFleets(game,ids,systemId))return false;
 motionBusy=true;
 try{
  const fleetNodes=new Map([...scene.querySelectorAll('[data-system-fleet]')].map(node=>[node.dataset.systemFleet,node]));
  const animated=animateFleetMovement();
  const fleets=ids.map(id=>game.military.fleets.find(f=>f.id===id));
  const origins=fleets.map(fleet=>systemFleetPose(game,fleet,systemId));
  const center=origins.reduce((sum,p)=>({x:sum.x+p.x/ids.length,y:sum.y+p.y/ids.length}),{x:0,y:0});
  const width=scene.offsetWidth||1000,height=scene.offsetHeight||640;
  const cruise=fleetCruisePath({...center,heading:origins[0].heading},point,width,height);
  const heading=cruise(1).heading;
  const destinations=fleetFormationPoints(point,fleets.length,heading,width,height);
  const route=Array.from({length:33},(_,index)=>cruise(index/32));
  const moves=fleets.map((fleet,i)=>{
   const from=origins[i],projected={x:point.x+from.x-center.x,y:point.y+from.y-center.y};
   const distance=p=>Math.hypot((p.x-projected.x)*width,(p.y-projected.y)*height);
   const nearest=destinations.reduce((best,p,index)=>distance(p)<distance(destinations[best])?index:best,0);
   const [to]=destinations.splice(nearest,1);
   fleet.systemPose={systemId,...to,heading};
   if(!animated)return null;
   const node=makeSystemFleet(game,fleet,from,true);
   fleetNodes.get(fleet.id)?.remove();scene.append(node);
   return {fleet,node,from,to};
  }).filter(Boolean);
  await Promise.all(moves.map(({fleet,node,from,to})=>{
   node.classList.add('cruising');
   const update=fleetCruiseVisuals(node,systemFleetMembers(game,fleet),from.heading);
   const turnOffset=((from.heading-origins[0].heading+540)%360)-180;
   const frames=route.map((p,i)=>{
    const t=i/(route.length-1),blend=t*t*(3-2*t);
    return {left:(p.x+(from.x-center.x)*(1-blend)+(to.x-point.x)*blend)+'%',
     top:(p.y+(from.y-center.y)*(1-blend)+(to.y-point.y)*blend)+'%'};
   });
   return animateShip(node,frames,{duration:1450,easing:'linear',
    onFrame:t=>update(cruise(t).heading+turnOffset*(1-t))
   }).catch(error=>console.warn(error));
  }));
  return true;
 }finally{motionBusy=false}
}
function warpFleetEdge(game,systemId,neighborId){
 const {x,y,angle}=gatePoint(game.stars[systemId],game.stars[neighborId]);
 return {x:50+(x-50)*.88,y:50+(y-50)*.88,angle};
}
async function playMilitaryFleetWarp(game,order,showScene){
 const routes=order.routes.filter(route=>route.from!==order.to);
 if(!routes.length||!animateFleetMovement())return;
 const fleets=new Map(game.military.fleets.map(fleet=>[fleet.id,fleet]));
 motionBusy=true;
 try{
  const firstOrigin=routes[0].from;
  const departure=showScene(firstOrigin);
  await Promise.all(routes.filter(route=>route.from===firstOrigin).map(async route=>{
   const fleet=fleets.get(route.fleetId),from=systemFleetPose(game,fleet,route.from),edge=order.viaGateway?gatewayPoint():warpFleetEdge(game,route.from,route.path[1]);
   const heading=fleetScreenHeading(departure,from,edge),node=makeSystemFleet(game,fleet,{...from,heading},true);
   departure.append(node);
   await turnSystemFleet(node,systemFleetMembers(game,fleet),from.heading,heading);
   node.classList.add('warp-charge');
   await animateShip(node,[{filter:'brightness(1)'},{filter:'brightness(3)'}],{duration:520});
   const flight=flightFrames(from,edge);
   await animateShip(node,[{...flight[0],opacity:1},{...flight[1],opacity:0}],{duration:610,easing:'ease-in'});
   node.remove();
  }));
  const arrival=showScene(order.to);
  await Promise.all(routes.map(async route=>{
   const fleet=fleets.get(route.fleetId),to=systemFleetPose(game,fleet,order.to),edge=order.viaGateway?gatewayPoint():warpFleetEdge(game,order.to,route.path.at(-2));
   const heading=fleetScreenHeading(arrival,edge,to);
   fleet.systemPose={systemId:order.to,...to,heading};
   const node=makeSystemFleet(game,fleet,{...edge,heading},true);
   [...arrival.querySelectorAll('[data-system-fleet]')].find(node=>node.dataset.systemFleet===fleet.id)?.remove();
   arrival.append(node);
   await animateShip(node,[{opacity:0,filter:'brightness(4)'},{opacity:1,filter:'brightness(1)'}],{duration:360});
   node.classList.add('cruising');
   await animateShip(node,flightFrames(edge,to),{duration:1100,easing:'ease-out'});
  }));
 }finally{motionBusy=false}
}
function renderSystemShips(){
 const scene=$('planetList'),system=state.stars[sysId];
 for(const ship of Object.keys(state.ships)){
  if(state.ships[ship]!==sysId)continue;
  const node=makeSystemShip(ship);placeNode(node,shipPoint(ship));scene.append(node);
 }
 renderSystemMilitaryFleets(scene,state,sysId,selectedFleetIds,selectMapFleet);
 updateSystemCamera();
 renderSystemModels(scene);
 renderSystemGates(scene,system);
 renderColonyStation(scene,system);
 surveyTargets(system);
 system.objects.forEach((object,index)=>{
  const node=document.createElement('button');node.className='system-object '+object.kind+' '+(targetSurveyed(system,object)?'surveyed':'unsurveyed');
  node.dataset.objectIndex=index;node.textContent=object.kind==='hole'?'◉':'◇';
  const relic=object.kind==='relic'&&!tutorial?relicDefinition(system):null;
  const blocked=relic?relicSurveyBlock(state,system):'';
  node.title=relic?relic.name+' · '+(blocked||'조사 가능'):object.label+(targetSurveyed(system,object)?' · 탐사 완료':' · 미탐사');
  node.setAttribute('aria-label',node.title);
  const status=document.createElement('small');status.className='object-survey-status';
  status.textContent=targetSurveyed(system,object)?'✓':relic?(system.relic.requiredResearch===DATA.exploration.relics.advancedResearch?'II':'I'):'?';node.append(status);
  placeNode(node,{x:16+index*68,y:18});scene.append(node);
 });
 markSystemCommandTargets(scene,system);
 scene.parentElement.oncontextmenu=event=>{
  if(tutorial)return;
  const point=fleetRepositionTarget(event,scene,state,selectedFleetIds,system.id);
  if(!point)return;
  event.preventDefault();closeSurveyMenu();
  fleetMoveMode=false;
  return repositionSystemFleets(state,selectedFleetIds,system.id,point,scene)
   .then(moved=>{if(moved)dirty=true}).finally(render);
 };
 if(scene.commandClickHandler)scene.removeEventListener('click',scene.commandClickHandler,true);
 scene.commandClickHandler=event=>{
  if(motionBusy||systemViewportWasDragged())return;
  if(colonizeMode&&event.target.closest('.stellar-sun')){
   event.preventDefault();event.stopImmediatePropagation();
   if(canCommandColonize(system)){colonizeMode=false;performAction(activeShip)}
   return;
  }
  if(!scanMode)return;
  const node=event.target.closest('[data-planet-index],[data-object-index]');
  if(!node)return;
  event.preventDefault();event.stopImmediatePropagation();
  const planet=node.dataset.planetIndex!==undefined,index=Number(planet?node.dataset.planetIndex:node.dataset.objectIndex);
  const target=planet?system.planets[index]:system.objects[index];
  if(!canCommandSurvey(system,target))return;
  const ship=activeShip;scanMode=false;markSystemCommandTargets(scene,system);
  $('scanBtn').classList.remove('command-active');$('scanBtn').setAttribute('aria-pressed','false');
  surveyObject(ship,system,target,planet?systemPoint(index):{x:16+index*68,y:18});
 };
 scene.addEventListener('click',scene.commandClickHandler,true);
 scene.oncontextmenu=event=>{
  if(tutorial||event.target.closest('[data-gate]'))return;
  event.preventDefault();closeSurveyMenu();
  if(!activeShip||state.ships[activeShip]!==sysId||motionBusy||event.target.closest('.orbital-shipyard,.orbital-gateway,.chain-target')||colonyBuildingGateway(state,activeShip))return;
  if(event.target.closest('.stellar-sun')&&isColonyShip(activeShip)){
   const menu=document.createElement('button');menu.id='surveyMenu';menu.textContent=system.owned?'개척 완료':systemOwner(system)?'다른 진영 소유':'개척 · 행동력 1';
   menu.disabled=state.ap[activeShip]<1||!canColonize(system);
   menu.style.left=Math.max(4,Math.min(innerWidth-180,event.clientX))+'px';menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
   menu.onclick=()=>{closeSurveyMenu();if(isColonyShip(activeShip)&&state.ships[activeShip]===system.id)performAction(activeShip)};
   document.body.append(menu);return;
  }
  const planet=event.target.closest('[data-planet-index]'),object=event.target.closest('[data-object-index]');
  if(planet&&isColonyShip(activeShip)&&system.owned){
   const index=Number(planet.dataset.planetIndex);
   if(system.planets[index]?.type==='hab'){
    const existing=orbitalShipyards(system).some(yard=>yard.planetIndex===index);
    const menu=document.createElement('button');menu.id='surveyMenu';menu.textContent=existing?'궤도 조선소 보기':'궤도 조선소 건설';
    menu.style.left=Math.max(4,Math.min(innerWidth-180,event.clientX))+'px';menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
    menu.onclick=()=>{closeSurveyMenu();showShipyards(system.id,'',null,index)};
    document.body.append(menu);return;
   }
  }
  const rect=scene.getBoundingClientRect();
  const point={x:Math.max(3,Math.min(97,(event.clientX-rect.left)/rect.width*100)),y:Math.max(3,Math.min(97,(event.clientY-rect.top)/rect.height*100))};
  if(!planet&&!object){moveWithinSystem(activeShip,point);return}
  const target=planet?system.planets[Number(planet.dataset.planetIndex)]:system.objects[Number(object.dataset.objectIndex)];
  const destination=planet?systemPoint(Number(planet.dataset.planetIndex)):{x:16+Number(object.dataset.objectIndex)*68,y:18};
  const canJump=target.kind==='hole'&&blackholeReady(system);
  const menu=document.createElement('button');menu.id='surveyMenu';
  const relicBlock=target.kind==='relic'?relicSurveyBlock(state,system):'';
  menu.textContent=canJump?'블랙홀을 통해 이동 · 행동력 1':relicBlock|| (targetSurveyed(system,target)?'탐사 완료':'탐사 · 행동력 1');
  menu.disabled=state.ap[activeShip]<1||(canJump&&isColonyShip(activeShip)&&!systemExplored(system.blackholeTo))||(!canJump&&(isColonyShip(activeShip)||targetSurveyed(system,target)||!!relicBlock));
  menu.style.left=Math.max(4,Math.min(innerWidth-180,event.clientX))+'px';
  menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
  const ship=activeShip;
  menu.onclick=()=>{
   closeSurveyMenu();
   if(canJump){
    if(blackholeJump(ship)){
     if($('quickMove').checked){sysId=state.ships[ship];view='system'}
     moveMode=false;render();
    }
   }else surveyObject(ship,system,target,destination);
  };
  document.body.append(menu);
 };
}
function canCommandColonize(system){
 return !motionBusy&&!pendingScoutDanger(state)&&!civilianOperationsBlocked(state,system.id)&&isColonyShip(activeShip)&&!colonyBuildingGateway(state,activeShip)&&state.ships[activeShip]===system.id&&state.ap[activeShip]>=1&&canColonize(system);
}
function canCommandSurvey(system,target){
 return canSurveyFromShip(state,activeShip,system.id)&&!targetSurveyed(system,target)&&
  (tutorial||target.kind!=='relic'||!relicSurveyBlock(state,system));
}
function markSystemCommandTargets(scene,system){
 scene.querySelector('.stellar-sun')?.classList.toggle('colonize-target',colonizeMode&&canCommandColonize(system));
 scene.querySelectorAll('[data-planet-index],[data-object-index]').forEach(node=>{
  const target=node.dataset.planetIndex!==undefined?system.planets[Number(node.dataset.planetIndex)]:system.objects[Number(node.dataset.objectIndex)];
  node.classList.toggle('command-target',scanMode&&canCommandSurvey(system,target));
 });
}
function closeSurveyMenu(){document.getElementById('surveyMenu')?.remove()}
async function moveWithinSystem(ship,point,scan=false){
 if(colonyBuildingGateway(state,ship)||state.scoutDisabledTurn?.[ship]===state.turn)return;
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
 if(motionBusy||!canSurveyFromShip(state,ship,system.id)||targetSurveyed(system,target))return false;
 const hasRelic=!tutorial&&target.kind==='relic'&&system.relic;
 const relicSurvey=hasRelic?surveyAncientRelic(state,system):null;
 if(hasRelic&&!relicSurvey)return false;
 scanMode=false;colonizeMode=false;moveMode=false;
 state.ap[ship]=Math.round((state.ap[ship]-1)*10000)/10000;
 prepareExploration(system);
 target.scanned=true;researchSurveyReward(system,target);
 if(target.kind==='hole')revealBlackholePair(system);
 system.surveyed=surveyTargets(system).every(item=>item.scanned);
 dirty=true;rec((target.label||'대상')+' 탐사 완료'+(system.surveyed?' · 성계 전체 탐사 완료':''));
 await moveWithinSystem(ship,{x:point.x,y:Math.max(5,point.y-13)},true);
 const eventStarted=triggerExploration(system,target,ship);
 const chain=!tutorial&&claimSurveyChain(state,system,target);
 if(relicSurvey){
  const {first,definition}=relicSurvey;
  const result=first?'최초 조사 · '+relicEffectText(definition):'조사 기록 확보';
  rec(definition.name+' · '+result);notifyExploration(result,'positive',definition.name);
 }else if(chain)reportSurveyChain(chain,'첫 단서 확보 · 1 / 3');
 else if(!tutorial&&!eventStarted)notifyExploration((target.label||'대상')+' · 탐사 완료');
 render();pumpExploration();
 return true;
}
document.addEventListener('click',event=>{
 if(motionBusy||encounterUILocked&&!event.target.closest('#overlay')){event.preventDefault();event.stopImmediatePropagation()}
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
  const expansion=$('habExpandCommon').parentElement.cloneNode(true);
  expansion.querySelector('small').removeAttribute('id');
  const button=expansion.querySelector('button');button.removeAttribute('id');
  button.onclick=()=> $('habExpandCommon').click();body.append(expansion);
 }

}


function faceShip(node,from,to){
 const scene=$('planetList').getBoundingClientRect();
 const dx=(to.x-from.x)*scene.width,dy=(to.y-from.y)*scene.height;
 if(Math.hypot(dx,dy)<.001)return;
 const heading=Math.atan2(dx,-dy/.57)*180/Math.PI;
 state.shipHeadings??={};state.shipHeadings[node.dataset.systemShip]=heading;
 const canvas=node.querySelector('.model-canvas'),replacement=modelCanvas(isColonyShip(node.dataset.systemShip)?'colony':'ship',heading);
 if(canvas&&replacement)canvas.replaceWith(replacement);
 node.querySelector('.engine-effects')?.remove();addEngineEffects(node,heading);
}
function addEngineEffects(node,heading){

 shipGeometry??=readShipGeometry();
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 100 100');svg.classList.add('engine-effects');
 const colony=isColonyShip(node.dataset.systemShip);
 const project=raw=>{
  if(colony){const p=projectShipPoint(raw,heading);return [50+p[0]*50,50-p[1]*50]}
  // GLB nodes share translation (0,-.56,.27).
  const translated=[raw[0],raw[1]-.56,raw[2]+.27],n=shipNormalization;
  const p=projectShipPoint(translated.map((v,i)=>(v-(n.min[i]+n.max[i])/2)*n.scale),heading);
  return [50+p[0]*50,50-p[1]*50];
 };
 // Colony exhaust uses normalized rear coordinates after the model-axis correction.
 const outlets=colony?
  [[-.18,-.03,.77,.035,.28,'wing'],[.18,-.03,.77,.035,.28,'wing'],[0,-.03,.77,.055,.4,'main']]:
  [[-2.13,-1.24,5.68,.40,2.8,'wing'],[2.13,-1.24,5.68,.40,2.8,'wing'],[0,0,5.2,.65,4.3,'main']];
 for(const [x,y,z,width,length,kind] of outlets){
  const flame=document.createElementNS(ns,'polygon');
  flame.setAttribute('points',[[x-width,y,z],[x+width,y,z],[x,y,z+length]].map(project).map(p=>p.join(',')).join(' '));
  flame.classList.add(kind+'-exhaust');svg.append(flame);
 }
 node.append(svg);
}
function renderSystemModels(scene,system=state.stars[sysId],isOpen=()=>gameActive&&view==='system'){
 stopPlanetRotation();
 const sun=scene.querySelector('.stellar-sun-sphere'),sunModel=modelCanvas('sun');
 if(sunModel){sun.replaceChildren(sunModel);sun.classList.add('mesh-sphere')}
 scene.querySelectorAll('[data-planet-index]').forEach(button=>{
  const p=system.planets[Number(button.dataset.planetIndex)],sphere=button.querySelector('.stellar-planet-sphere'),model=modelCanvas(p.type,0,planetLightDirection(parseFloat(button.style.left)*10,parseFloat(button.style.top)*6.4),planetSpinAngle(p));
  button.style.setProperty('--planet-size',DATA.balance.planetAppearance.sizeScales[planetSizeClass(p)]);
  if(model){sphere.replaceChildren(model);sphere.classList.add('mesh-sphere')}
 });
 startPlanetRotation(scene,system,isOpen);
}
// Visual-only clocks are tied to planet objects; new/load games get fresh clocks.
const planetRotationTime=new WeakMap(),stationAnimationTime=new WeakMap();
let planetRotationTimer=null,planetRotationSession=null,stationOrbitFrame=null;
function planetSpinAngle(planet){
 const period=DATA.balance.planetAppearance.rotationMinutes[planet.type][planetSizeClass(planet)]*60000;
 return ((planetRotationTime.get(planet)||0)%period)/period*Math.PI*2;
}
function stopPlanetRotation(){
 if(stationOrbitFrame!==null)cancelAnimationFrame(stationOrbitFrame);
 stationOrbitFrame=null;
 if(planetRotationTimer!==null)clearTimeout(planetRotationTimer);
 planetRotationTimer=null;
 if(planetRotationSession){
  const elapsed=Math.max(0,performance.now()-planetRotationSession.last);
  for(const p of planetRotationSession.planets)planetRotationTime.set(p,(planetRotationTime.get(p)||0)+elapsed);
  advanceStationClock(planetRotationSession.system,elapsed);
 }
 planetRotationSession=null;
}
function startPlanetRotation(scene,system=state.stars[sysId],isOpen=()=>!tutorial&&gameActive&&view==='system'){
 if(!isOpen()||document.hidden)return;
 // Rotation periods depend on type and saved size, not orbital position.
 const planets=system.planets;
 planetRotationSession={planets,system,last:performance.now(),scene,isOpen};
 planets.forEach((p,rank)=>{
  const canvas=scene.querySelector('[data-planet-index="'+rank+'"] .model-canvas');
  if(canvas)modelCanvas(p.type,0,JSON.parse(canvas.dataset.light),planetSpinAngle(p),canvas);
 });
 function tick(){
  if(!planetRotationSession)return;
  if(!isOpen()||document.hidden||!scene.isConnected){stopPlanetRotation();return}
  const now=performance.now(),elapsed=now-planetRotationSession.last;
  planetRotationSession.last=now;
  planets.forEach((p,rank)=>{
   planetRotationTime.set(p,(planetRotationTime.get(p)||0)+elapsed);
   const canvas=scene.querySelector('[data-planet-index="'+rank+'"] .model-canvas');
   if(canvas)modelCanvas(p.type,0,JSON.parse(canvas.dataset.light),planetSpinAngle(p),canvas);
  });
  advanceStationClock(planetRotationSession.system,elapsed);
  updateStationAnimation(scene,planetRotationSession.system);
  planetRotationTimer=setTimeout(tick,1000/15);
 }
 planetRotationTimer=setTimeout(tick,1000/15);
 startStationOrbit(scene,planetRotationSession.system);
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)stopPlanetRotation();
 else if(combatTestSession?.systemId!=null)renderCombatTest();
 else if(gameActive&&view==='system'){stopPlanetRotation();startPlanetRotation($('planetList'))}
});
function gatePoint(system,neighbor){
 const angle=Math.atan2(neighbor.y-system.y,neighbor.x-system.x);
 return {x:50+Math.cos(angle)*46,y:50+Math.sin(angle)*43,angle:angle*180/Math.PI+90};
}
function createSystemGate(system,neighbor,known,connected){
 const point=gatePoint(system,neighbor),gate=document.createElement('button');
 const routeText=(connected?'개척 연결 항로':'일반 항로')+' · 행동력 '+regionalLaneCost(system,neighbor,'player');
 gate.className='system-gate'+(connected?' connected-route':'');gate.dataset.gate=neighbor.id;
 gate.setAttribute('aria-label',(known?neighbor.name:'미확인')+' 성계 · '+routeText);
 const triangle=document.createElement('span');triangle.textContent='▲';triangle.style.transform='scaleY(.57) rotate('+point.angle+'deg)';
 const label=document.createElement('small');label.textContent=(known?neighbor.name:'탐사선 도착 후 진입 가능')+' · '+routeText;
 gate.append(triangle,label);placeNode(gate,point);return gate;
}
function renderSystemGates(scene,system){
 const fleetTargets=fleetMoveMode?fleetMoveTargets():null;
 for(const id of system.edges){
  const neighbor=state.stars[id],gate=createSystemGate(system,neighbor,systemKnown(id),system.owned&&neighbor.owned);
  const eligible=()=>!!activeShip&&state.ships[activeShip]===system.id&&reachable(system.id,state.ap[activeShip],activeShip).has(id);
  gate.classList.toggle('command-target',!!fleetTargets?.has(id)||moveMode&&eligible());
  const travel=()=>{
   if(motionBusy||!eligible())return;
   const ship=activeShip;scanMode=false;colonizeMode=false;moveMode=false;
   if(moveShip(ship,id)){
    if($('quickMove').checked&&systemKnown(id)){sysId=id;selected=id;view='system'}
    render();
   }else render();
  };
  gate.onclick=()=>{if(fleetMoveMode){if(fleetTargets?.has(id))commandFleetMove(id);return}if(moveMode){travel();return}if(systemKnown(id))systemOpen(id)};

  gate.oncontextmenu=event=>{
   event.preventDefault();event.stopPropagation();closeSurveyMenu();
   const ship=activeShip,menu=document.createElement('button');menu.id='surveyMenu';
   const cost=ship&&state.ships[ship]===system.id?reachable(system.id,state.ap[ship],ship).get(id):undefined;
   menu.textContent=cost===undefined?'함선 선택 또는 행동력 확인':(systemKnown(id)?neighbor.name:'? 성계')+' 이동 · 행동력 '+cost;
   menu.disabled=cost===undefined||motionBusy;
   menu.style.left=Math.max(4,Math.min(innerWidth-220,event.clientX))+'px';
   menu.style.top=Math.max(4,Math.min(innerHeight-45,event.clientY))+'px';
   menu.onclick=()=>{closeSurveyMenu();travel()};
   document.body.append(menu);
  };
  scene.append(gate);
 }
}

let systemCamera={id:null,zoom:1,x:0,y:0};
function stellarCameraFit(viewport,scene){return Math.min(1,viewport.clientWidth/scene.offsetWidth,viewport.clientHeight/scene.offsetHeight)}
function applyStellarCamera(viewport,scene,camera){
 camera.zoom=Math.max(stellarCameraFit(viewport,scene),camera.zoom);
 const width=scene.offsetWidth*camera.zoom,height=scene.offsetHeight*camera.zoom;
 camera.x=width<=viewport.clientWidth?(viewport.clientWidth-width)/2:Math.max(viewport.clientWidth-width,Math.min(0,camera.x));
 camera.y=height<=viewport.clientHeight?(viewport.clientHeight-height)/2:Math.max(viewport.clientHeight-height,Math.min(0,camera.y));
 scene.style.transformOrigin='0 0';
 scene.style.transform='translate('+camera.x+'px,'+camera.y+'px) scale('+camera.zoom+')';
}
function updateSystemCamera(){
 const scene=$('planetList');
 if(tutorial){scene.style.transform='';return}
 const viewport=scene.parentElement;
 if(systemCamera.id!==sysId)systemCamera={id:sysId,zoom:stellarCameraFit(viewport,scene),x:0,y:0};
 applyStellarCamera(viewport,scene,systemCamera);
}
function bindStellarCameraInput(viewport,getScene,getCamera,canInteract){
 let drag=null,wasDragged=false;
 viewport.addEventListener('wheel',event=>{
  if(!canInteract())return;
  event.preventDefault();
  const scene=getScene(),camera=getCamera(),rect=viewport.getBoundingClientRect();
  const x=event.clientX-rect.left,y=event.clientY-rect.top,old=camera.zoom;
  const zoom=Math.max(stellarCameraFit(viewport,scene),Math.min(12,old*Math.exp(-event.deltaY*.0015)));
  camera.x=x-(x-camera.x)*zoom/old;camera.y=y-(y-camera.y)*zoom/old;camera.zoom=zoom;
  applyStellarCamera(viewport,scene,camera);closeSurveyMenu();
 },{passive:false});
 viewport.addEventListener('pointerdown',event=>{
  if(!canInteract()||event.button!==0)return;
  const {x,y}=getCamera();
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:x,panY:y,moved:false};wasDragged=false;
 });
 viewport.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.abs(dx)+Math.abs(dy)>6){
   drag.moved=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');
  }
  if(!drag.moved)return;
  const camera=getCamera();camera.x=drag.panX+dx;camera.y=drag.panY+dy;
  applyStellarCamera(viewport,getScene(),camera);closeSurveyMenu();
 });
 const finish=event=>{
  if(!drag||drag.id!==event.pointerId)return;
  wasDragged=drag.moved;
  if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
  drag=null;viewport.classList.remove('panning');setTimeout(()=>{wasDragged=false},0);
 };
 viewport.addEventListener('pointerup',finish);
 viewport.addEventListener('pointercancel',finish);
 viewport.addEventListener('click',event=>{if(wasDragged){event.preventDefault();event.stopImmediatePropagation()}},true);
 return ()=>wasDragged;
}
const systemViewportWasDragged=bindStellarCameraInput(document.querySelector('.stellar-viewport'),()=>$('planetList'),()=>systemCamera,
 ()=>!tutorial&&!motionBusy&&!encounterUILocked&&view==='system');
window.addEventListener('resize',()=>{if(view==='system'&&!tutorial)updateSystemCamera()});

function advanceStationClock(system,elapsed){
 if(system?.owned)stationAnimationTime.set(system,(stationAnimationTime.get(system)||0)+elapsed);
}
function stationOrbitPoint(milliseconds){
 const config=DATA.balance.stationAppearance,angle=(milliseconds%(config.orbitMinutes*60000))/(config.orbitMinutes*60000)*Math.PI*2-Math.PI/2;
 return {x:500+Math.cos(angle)*config.orbitRadius,y:310+Math.sin(angle)*config.orbitRadius*config.orbitFlattening};
}
function updateStationPosition(scene,system,elapsed=stationAnimationTime.get(system)||0){
 const station=scene.querySelector('.colony-station');if(!station)return;
 const point=stationOrbitPoint(elapsed);
 const x=(point.x-500)*scene.clientWidth/1000,y=(point.y-310)*scene.clientHeight/640;
 station.style.transform='translate(-50%,-50%) translate3d('+x+'px,'+y+'px,0)';
}
function startStationOrbit(scene,system){
 if(stationOrbitFrame!==null)cancelAnimationFrame(stationOrbitFrame);
 stationOrbitFrame=null;
 if(!system.owned)return;
 const session=planetRotationSession;
 function frame(){
  stationOrbitFrame=null;
  if(!session||planetRotationSession!==session)return;
  if(!session.isOpen()||document.hidden||!scene.isConnected){stopPlanetRotation();return}
  // Interpolate from the 15fps clock without advancing it twice.
  const elapsed=(stationAnimationTime.get(system)||0)+Math.max(0,performance.now()-session.last);
  updateStationPosition(scene,system,elapsed);
  stationOrbitFrame=requestAnimationFrame(frame);
 }
 stationOrbitFrame=requestAnimationFrame(frame);
}
function updateStationAnimation(scene,system){
 const station=scene.querySelector('.colony-station');if(!station)return;
 const elapsed=stationAnimationTime.get(system)||0;
 const previous=station.querySelector('.model-canvas'),model=modelCanvas('station',45,[0,0,1],elapsed/1000,previous);
 if(model&&!previous)station.append(model);
}
function renderColonyStation(scene,system){
 if(!system.owned)return;
 const station=document.createElement('span');station.className='colony-station station-model';station.title='개척 우주정거장';station.setAttribute('role','img');station.setAttribute('aria-label','개척 우주정거장');
 scene.append(station);updateStationAnimation(scene,system);updateStationPosition(scene,system);
}
