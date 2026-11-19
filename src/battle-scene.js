// The display interpolates snapshots. Only the fixed combat loop changes gameplay.
let battleSceneFrame=null;
const battleCameras=new WeakMap(),battleCanvasControls=new WeakMap();
const BATTLE_MARKERS={corvette:4,escort:5,destroyer:6,heavy_cruiser:7,battleship:9};
function stopBattleScene(){
 if(battleSceneFrame!==null)cancelAnimationFrame(battleSceneFrame);
 battleSceneFrame=null;
}
function battleSceneSnapshot(combat){
 return new Map(combat.units.map(unit=>[unit.id,{x:unit.x,y:unit.y??0,present:combatUnitPresent(unit)}]));
}
function zoomBattleCamera(camera,zoom,x=.5,y=.5){
 const next=Math.max(1,Math.min(5,zoom));
 if(next===camera.zoom)return;
 const change=1/camera.zoom-1/next;
 const edge=.5/next;
 camera.x=Math.min(1-edge,Math.max(edge,camera.x+(x-.5)*change));
 camera.y=Math.min(1-edge,Math.max(edge,camera.y+(y-.5)*change));
 camera.zoom=next;
}
function bindBattleCamera(canvas,camera,redraw){
 if(!battleCanvasControls.has(canvas)){
  const controls={redraw:null};battleCanvasControls.set(canvas,controls);
  canvas.addEventListener?.('wheel',event=>{
   if(!event.deltaY)return;
   const rect=canvas.getBoundingClientRect();
   if(!rect.width||!rect.height)return;
   event.preventDefault();
   const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
   const multiplier=Math.exp(-Math.max(-0.6,Math.min(0.6,delta*.002)));
   zoomBattleCamera(camera,camera.zoom*multiplier,(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);
   controls.redraw();
  },{passive:false});
  const reset=$('battleZoomReset');
  if(reset)reset.onclick=()=>{zoomBattleCamera(camera,1);controls.redraw()};
 }
 battleCanvasControls.get(canvas).redraw=redraw;
}
function paintFleetBattleScene(combat,previous=null,paused=false){
 const canvas=$('battleCanvas'),ctx=canvas?.getContext?.('2d');
 if(!ctx)return;
 stopBattleScene();
 if(!battleCameras.has(combat))battleCameras.set(combat,{zoom:1,x:.5,y:.5,bounds:null});
 const camera=battleCameras.get(combat);
 const width=canvas.clientWidth||canvas.width,height=canvas.clientHeight||canvas.height;
 const ratio=canvas.clientWidth?Math.min(globalThis.devicePixelRatio||1,2):1;
 const pixelWidth=Math.round(width*ratio),pixelHeight=Math.round(height*ratio);
 if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
 if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
 const current=battleSceneSnapshot(combat),range=DATA.combat.rules.initialSeparation;
 const seconds=DATA.combat.rules.stepSeconds/DATA.combat.retreat.playbackSpeed;
 const animate=previous&&!paused&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const units=combat.units.filter(unit=>current.get(unit.id).present||previous?.get(unit.id)?.present&&unit.hp===0);
 const visibleBounds=units.reduce((box,unit)=>{
  box.left=Math.min(box.left,unit.x-90);box.right=Math.max(box.right,unit.x+90);
  box.vertical=Math.max(box.vertical,Math.abs(unit.y??0)+80);return box;
 },{left:-100,right:range+100,vertical:320});
 // Draw one shot per attacker first so a large volley never covers the whole field.
 const shots=new Map();
 for(const shot of combat.events)if(!shots.has(shot.attackerId)||!shots.get(shot.attackerId).hit&&shot.hit)shots.set(shot.attackerId,shot);
 let lastProgress=1;
 function draw(progress){
  lastProgress=progress;
  if(camera.zoom===1||!camera.bounds)camera.bounds=visibleBounds;
  const bounds=camera.bounds,points=new Map(),centerX=(bounds.left+bounds.right)/2;
  const fit=Math.min(width/(bounds.right-bounds.left),height/(2*bounds.vertical));
  for(const [id,end] of current){
   const start=previous?.get(id)??end;
   points.set(id,{x:width/2+(start.x+(end.x-start.x)*progress-centerX)*fit,y:height/2+(start.y+(end.y-start.y)*progress)*fit,start,end});
  }
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x*width,-camera.y*height);
  if(!paused){
   ctx.globalAlpha=.6*(1-progress*.75);
   for(const shot of [...shots.values()].slice(0,36)){
    const from=points.get(shot.attackerId),to=points.get(shot.targetId);
    if(!from||!to)continue;
    ctx.strokeStyle=shot.damageType==='kinetic'?'#e7ab66':'#8fe2f6';
    ctx.beginPath();ctx.moveTo(from.x,from.y);
    const extent=shot.hit?1:.78;ctx.lineTo(from.x+(to.x-from.x)*extent,to.y+(to.y-from.y)*extent);ctx.stroke();
    if(shot.hit){ctx.fillStyle=shot.shieldDamage>0?'#a4edff':'#ffae70';ctx.beginPath();ctx.arc(to.x,to.y,4+progress*6,0,Math.PI*2);ctx.fill()}
   }
  }
  const crowded=units.length>48&&camera.zoom<2;
  const drawn=new Set();
  for(const unit of units){
   const p=points.get(unit.id),friendly=(unit.faction||unit.side)==='player';
   const cell=Math.round(p.x/12)+':'+Math.round(p.y/12)+':'+friendly;
   if(crowded&&drawn.has(cell)&&unit.hp>0)continue;
   drawn.add(cell);
   if(unit.hp<=0){
    if(progress>=1)continue;
    ctx.globalAlpha=1-progress;ctx.strokeStyle='#ff9f64';ctx.beginPath();ctx.arc(p.x,p.y,5+progress*13,0,Math.PI*2);ctx.stroke();continue;
   }
   const size=BATTLE_MARKERS[unit.hullId]||5;
   ctx.globalAlpha=unit.revealed?1:.55;
   const dx=p.end.x-p.start.x,dy=p.end.y-p.start.y;
   const angle=Math.hypot(dx,dy)>1e-6?Math.atan2(dy,dx):unit.direction<0?Math.PI:0;
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
   ctx.fillStyle=friendly?'#91e6ef':'#ffc184';ctx.strokeStyle=unit.status==='retreating'?'#fff2bf':'#0b141d';
   ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.65,size*.58);ctx.lineTo(-size*.3,0);ctx.lineTo(-size*.65,-size*.58);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
   if(!crowded){
    ctx.fillStyle='#6ee4be';ctx.fillRect(p.x-size,p.y+size*.8,size*2*unit.hp/unit.assembly.armor,1.5);
    if(unit.assembly.shield>0){ctx.fillStyle='#87cfff';ctx.fillRect(p.x-size,p.y+size*.8+2,size*2*unit.shield/unit.assembly.shield,1.5)}
   }
  }
  ctx.globalAlpha=1;
  ctx.restore();
 }
 bindBattleCamera(canvas,camera,()=>draw(lastProgress));
 if(!animate){draw(1);return}
 const start=performance.now();
 const frame=now=>{
  const progress=Math.min(1,(now-start)/(seconds*1000));draw(progress);
  battleSceneFrame=progress<1?requestAnimationFrame(frame):null;
 };
 draw(0);battleSceneFrame=requestAnimationFrame(frame);
}
