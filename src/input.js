$('nextTurn').onclick=()=>nextTurn();
$('moveBtn').onclick=()=>{if(selectedFleetIds.length){fleetMoveMode=!fleetMoveMode;if(view!=='system')view='galaxy';render();return}if(activeShip){scanMode=false;colonizeMode=false;moveMode=!moveMode;closeSurveyMenu();render()}};$('warpBtn').onclick=()=>{if(blackholeJump(activeShip))render()};$('scanBtn').onclick=()=>{
 if(civilianShipRole(activeShip)!=='scout'||pendingScoutDanger(state)||civilianOperationsBlocked(state,state.ships[activeShip]))return;
 if(view==='system'&&!tutorial){
  if(state.ships[activeShip]!==sysId||state.ap[activeShip]<1)return;
  moveMode=false;colonizeMode=false;scanMode=!scanMode;closeSurveyMenu();render();
 }else if(performAction(activeShip))render();
};$('colonizeBtn').onclick=()=>{
 if(view==='system'&&!tutorial){
  if(!canCommandColonize(state.stars[sysId]))return;
  moveMode=false;scanMode=false;colonizeMode=!colonizeMode;closeSurveyMenu();render();
 }else if(performAction(activeShip||'colony'))render();
};$('openBtn').onclick=()=>systemOpen(selected);$('back').onclick=()=>{view=view==='habitat'?'system':'galaxy';render()};$('closeModal').onclick=()=>dismissModal();$('overlay').onclick=e=>{if(e.target===$('overlay'))dismissModal()};
function zoom(f){let old=scale;scale=Math.max(.4,Math.min(3.2,scale*f));panX=W/2-(W/2-panX)*scale/old;panY=H/2-(H/2-panY)*scale/old;render()}$('zoomin').onclick=()=>zoom(1.25);$('zoomout').onclick=()=>zoom(.8);$('center').onclick=()=>{focusHome();render()};$('mapWrap').addEventListener('wheel',e=>{e.preventDefault();if(motionBusy||encounterUILocked)return;zoom(e.deltaY<0?1.1:.9)},{passive:false});
let mapWrap=$('mapWrap'),moved=false;mapWrap.addEventListener('pointerdown',e=>{if(motionBusy||encounterUILocked)return;if(tutorial&&tutorial.freeStart===null)return;if(e.button!==0&&e.pointerType==='mouse')return;dragStart={x:e.clientX,y:e.clientY,panX,panY};moved=false});mapWrap.addEventListener('pointermove',e=>{if(!dragStart||encounterUILocked)return;let dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.abs(dx)+Math.abs(dy)>6){moved=true;mapWrap.classList.add('dragging');if(!mapWrap.hasPointerCapture(e.pointerId))mapWrap.setPointerCapture(e.pointerId)}if(moved){let rect=mapWrap.getBoundingClientRect();panX=dragStart.panX+dx*W/rect.width;panY=dragStart.panY+dy*H/rect.height;drawMap()}});mapWrap.addEventListener('pointerup',e=>{if(mapWrap.hasPointerCapture(e.pointerId))mapWrap.releasePointerCapture(e.pointerId);dragStart=null;mapWrap.classList.remove('dragging');if(moved){dragging=true;setTimeout(()=>dragging=false,0)}});

$('mapWrap').addEventListener('click',e=>{if(dragging||e.target.closest('.shiphit,.starhit,.fleethit'))return;if(activeShip||selectedFleetIds.length){clearShipSelection();render()}});

document.addEventListener('keydown',event=>{
 const battleGame=combatPreview??state;
 if(event.key==='Escape'&&battleGame?.military?.battle?.decision?.kind==='destination'&&modalKind==='fleet-battle'){
  cancelRetreatDecision(battleGame);showFleetBattle('',battleGame);return;
 }
 if(encounterUILocked)return;
 if(event.key==='Escape'&&dialogBackgroundActive){
  if(!$('closeModal').hidden){event.preventDefault();dismissModal()}
  return;
 }
 if(event.key==='Escape'&&$('menuBtn').getAttribute('aria-expanded')==='true'){
  event.preventDefault();setGameMenuOpen(false);$('menuBtn').focus();return;
 }
 if(event.key==='Escape'&&(combatTestSession?.fleetMove||combatTestSession?.colonyMove)){
  combatTestSession.fleetMove=combatTestSession.colonyMove=false;renderCombatTest();return;
 }
 if(event.key==='Escape'&&(moveMode||scanMode||colonizeMode||fleetMoveMode)&&!motionBusy){fleetMoveMode=false;moveMode=false;scanMode=false;colonizeMode=false;closeSurveyMenu();render()}
});
