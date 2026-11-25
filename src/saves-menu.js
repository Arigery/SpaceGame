// 저장 정보: 브라우저 localStorage에 슬롯별 전체 게임 상태를 보존한다.
const SAVE_KEY='space_civilization_slots_v5';
function getSlots(){try{let v=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function setSlots(v){try{localStorage.setItem(SAVE_KEY,JSON.stringify(v));return true}catch(e){alert('저장할 수 없습니다. 브라우저의 로컬 저장소 설정을 확인해 주세요.');return false}}
function safeText(t){return String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function setGameMenuOpen(open){
 $('menuDrop').classList.toggle('hide',!open);
 $('menuBtn').setAttribute('aria-expanded',String(open));
}
function showScreen(which){$('explorationNotice').textContent='';document.body?.classList.toggle('combat-test-mode',which==='combat-test');$('combatTestScreen').classList.toggle('hide',which!=='combat-test');if(which!=='game')stopPlanetRotation();closeSurveyMenu();$('mainScreen').classList.toggle('hide',which!=='main');$('raceScreen').classList.toggle('hide',which!=='race');document.querySelector('.top').classList.toggle('hide',which!=='game');document.querySelector('.layout').classList.toggle('hide',which!=='game');setGameMenuOpen(false)}
let dialogReturnFocus=null;
function showGameDialog(){
 if(!dialogBackgroundActive)dialogReturnFocus=document.activeElement;
 dialogBackgroundActive=true;
 $('overlay').classList.remove('hide');
 syncInterfaceInert();
 queueMicrotask(()=>{
  if(!dialogBackgroundActive||!document.activeElement)return;
  const modal=$('overlay').querySelector('.modal');
  if(modal.contains(document.activeElement))return;
  const entry=$('closeModal').hidden?modal:$('closeModal');
  entry.focus({preventScroll:true});
 });
}
function hideGameDialog(){
 $('overlay').classList.add('hide');
 if(!dialogBackgroundActive)return;
 dialogBackgroundActive=false;
 syncInterfaceInert();
 const origin=dialogReturnFocus;
 dialogReturnFocus=null;
 queueMicrotask(()=>{
  if(dialogBackgroundActive||encounterUILocked||!document.activeElement)return;
  const target=[origin,$('viewTitle'),$('galaxyNav'),$('combatTestDetails'),$('newGameMain')]
   .find(element=>element!==document.body&&element?.getClientRects().length);
  target?.focus({preventScroll:true});
 });
}
function openDialog(title,desc,body,wide=false){$('closeModal').hidden=false;$('overlay').querySelector('.modal').classList.remove('hab-event-modal','anomaly-modal','victory-modal','research-modal','fleet-battle-modal','fleet-workspace-modal','save-slots-modal','settings-modal');modalKind='menu';$('modalTitle').textContent=title;$('modalDesc').textContent=desc;$('modalBody').innerHTML=body;$('overlay').querySelector('.modal').classList.toggle('wide',wide);showGameDialog()}
function closeDialog(){lockEncounterUI(false);stopBattleScene();researchPendingTurn=false;if(modalKind==='surface')surfaceSelection=null;hideGameDialog();$('overlay').querySelector('.modal').classList.remove('wide','building-picker','common-building-picker','building-detail','hab-event-modal','anomaly-modal','victory-modal','research-modal','fleet-battle-modal','fleet-workspace-modal','save-slots-modal','settings-modal');modalKind=null;queueMicrotask(()=>{if(gameActive&&!combatTestSession){showNextDiscovery();pumpExploration()}})}
function saveSlotTime(slot){
 if(Number.isFinite(slot.savedAtMs))return slot.savedAtMs;
 const date=String(slot.savedAt??'');
 const korean=date.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/u);
 if(!korean)return Date.parse(date);
 const [,year,month,day,half,hour,minute,second]=korean;
 return new Date(+year,+month-1,+day,+hour%12+(half==='오후'?12:0),+minute,+(second??0)).getTime();
}
function showSlots(mode){
 if(tutorial)return;
 const slots=getSlots(),saving=mode==='save',count=5;
 let recent=-1,latest=-Infinity;
 for(let i=0;i<count;i++){
  if(!slots[i])continue;
  const time=saveSlotTime(slots[i]);
  if(time>latest){recent=i;latest=time}
 }
 const rows=Array.from({length:count},(_,i)=>{
  const entry=slots[i],civilization=entry?.state?.civilizationName||(entry?.race==='기본 종족'||!entry?.race?'테라 문명':entry.race);
  const turn=Number(entry?.turn??entry?.state?.turn)||1;
  return `<button type="button" class="save-slot${entry?' is-filled':''}" data-slot="${i}"${!entry&&!saving?' disabled':''}>
   <span class="save-slot-number" aria-label="${i+1}번 슬롯">${String(i+1).padStart(2,'0')}</span>
   <span class="save-slot-summary"><strong>${entry?safeText(civilization):'빈 슬롯'}</strong>
    ${entry?`<small>${safeText(entry.savedAt??'')}</small>`:''}</span>
   ${entry?`<span class="save-slot-turn">턴 ${turn}</span>`:''}
   ${i===recent?'<span class="save-slot-recent">최근</span>':''}
   <span class="save-slot-action">${saving?'저장':entry?'불러오기':''}</span>
  </button>`;
 }).join('');
 openDialog(saving?'게임 저장':'게임 불러오기','',`<div class="save-slots">${rows}</div>`,true);
 $('overlay').querySelector('.modal').classList.add('save-slots-modal');
 $('modalBody').querySelectorAll('[data-slot]').forEach(button=>button.onclick=()=>{
  const index=Number(button.dataset.slot);
  if(saving){
   const current=getSlots();
   if(current[index]&&!confirm(`슬롯 ${index+1}의 기존 저장 데이터를 덮어쓸까요?`))return;
   const now=new Date();
   current[index]={savedAt:now.toLocaleString('ko-KR'),savedAtMs:now.getTime(),race:currentRace,turn:state.turn,state:JSON.parse(JSON.stringify(state))};
   if(setSlots(current)){dirty=false;if(!showPendingEncounter())showSlots('save')}
   return;
  }
  const entry=slots[index];
  if(!entry)return;
  if(gameActive&&dirty&&!confirm('저장하지 않은 진행 내용이 사라집니다. 불러올까요?'))return;
  let loaded;
  try{loaded=normalizeSavedState(structuredCloneSafe(entry.state))}catch(e){alert(e.message);return}
  if(!loaded||!loaded.stars||!loaded.ships){alert('저장 데이터가 올바르지 않습니다.');return}
  debugReveal=false;previousCamera=null;pendingDiscoveries=[];state=loaded;clearFleetSelection();
  $('currentSeed').textContent=state.seed||'(이전 저장 파일)';currentRace=entry.race||'기본 종족';
  activeShip=null;selected=0;sysId=0;view='galaxy';moveMode=false;focusHome();dirty=false;gameActive=true;
  closeDialog();showScreen('game');render();showPendingEncounter();
 });
}
function showDisplaySettings(){
 openDialog('설정','',`<label class="settings-switch-row">
  <span><strong>빠른 이동</strong><small>함선 이동 연출을 건너뜁니다.</small></span>
  <span class="settings-switch"><input id="quickMoveSetting" type="checkbox" role="switch" aria-label="빠른 이동"><span aria-hidden="true"></span></span>
 </label>`);
 $('overlay').querySelector('.modal').classList.add('settings-modal');
 const setting=$('quickMoveSetting'),quickMove=$('quickMove');
 setting.checked=quickMove.checked;
 setting.onchange=()=>{quickMove.checked=setting.checked;quickMove.onchange()};
}

function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v))}
$('newGameMain').onclick=()=>{$('seedInput').value='';showScreen('race');$('setupTitle').focus({preventScroll:true})};
$('raceBack').onclick=()=>{showScreen('main');$('newGameMain').focus({preventScroll:true})};
$('startGame').onclick=()=>{currentRace='기본 종족';const seed=$('seedInput').value.trim()||randomSeed();try{reset(seed);gameActive=true;showScreen('game')}catch(e){alert('지도 생성 실패: '+e.message)}};
$('loadMain').onclick=()=>showSlots('load');$('exitMain').onclick=()=>openDialog('게임 종료','브라우저 탭을 닫아 종료합니다.','');
$('settingsMain').onclick=showDisplaySettings;
function updateRevealButton(){ $('revealMapBtn').textContent=debugReveal?'탐험 시야':'전체 지도'; }
$('revealMapBtn').onclick=()=>{
  if(!state)return;
  if(!debugReveal){
    previousCamera={scale,panX,panY};debugReveal=true;
    const xs=state.stars.map(s=>s.x),ys=state.stars.map(s=>s.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    scale=Math.min((W-130)/(maxX-minX),(H-120)/(maxY-minY),1);
    panX=W/2-(minX+maxX)/2*scale;panY=H/2-(minY+maxY)/2*scale;
    view='galaxy';moveMode=false;
  }else{
    debugReveal=false;
    if(previousCamera){({scale,panX,panY}=previousCamera);previousCamera=null}
  }
  updateRevealButton();setGameMenuOpen(false);$('menuBtn').focus();render();
};
$('menuBtn').onclick=()=>{$('currentSeed').textContent=state?.seed||'(이전 저장 파일)';updateRevealButton();setGameMenuOpen($('menuDrop').classList.contains('hide'))};
$('toMain').onclick=()=>{if(tutorial){leaveTutorial();return}if(!confirm('저장되지 않은 진행 내용은 사라집니다. 정말 메인 메뉴로 돌아가겠습니까?'))return;gameActive=false;dirty=false;closeDialog();showScreen('main')};
$('gameLoad').onclick=()=>{setGameMenuOpen(false);$('menuBtn').focus();showSlots('load')};
$('gameSave').onclick=()=>{setGameMenuOpen(false);$('menuBtn').focus();showSlots('save')};
$('gameSettings').onclick=()=>{setGameMenuOpen(false);$('menuBtn').focus();showDisplaySettings()};
// 행성 및 발견 팝업은 기존 닫기 동작을 그대로 유지한다.
const originalDismiss=dismissModal;
dismissModal=function(){if(combatPreview)return;if(pendingScoutDanger(state)){if(modalKind==='scout-danger-save')showPendingEncounter();return}if(state?.military?.battle){if(modalKind==='battle-save')showFleetBattle();return}if(modalKind==='exploration')return;if(modalKind==='menu'||modalKind==='building'||modalKind==='surface'){closeDialog();return}originalDismiss()};
showScreen('main');

installCombatTestEntry();
