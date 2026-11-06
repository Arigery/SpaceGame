// 저장 정보: 브라우저 localStorage에 슬롯별 전체 게임 상태를 보존한다.
const SAVE_KEY='space_civilization_slots_v5';
function getSlots(){try{let v=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function setSlots(v){try{localStorage.setItem(SAVE_KEY,JSON.stringify(v));return true}catch(e){alert('저장할 수 없습니다. 브라우저의 로컬 저장소 설정을 확인해 주세요.');return false}}
function safeText(t){return String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function showScreen(which){$('mainScreen').classList.toggle('hide',which!=='main');$('raceScreen').classList.toggle('hide',which!=='race');document.querySelector('.top').classList.toggle('hide',which!=='game');document.querySelector('.layout').classList.toggle('hide',which!=='game');document.querySelector('.turnDock').classList.toggle('hide',which!=='game');$('menuDrop').classList.add('hide')}
function openDialog(title,desc,body,wide=false){modalKind='menu';$('modalTitle').textContent=title;$('modalDesc').textContent=desc;$('modalBody').innerHTML=body;$('overlay').classList.remove('hide');$('overlay').querySelector('.modal').classList.toggle('wide',wide)}
function closeDialog(){$('overlay').classList.add('hide');$('overlay').querySelector('.modal').classList.remove('wide','building-picker','common-building-picker');modalKind=null}
function showSlots(mode){if(tutorial)return;let slots=getSlots();let body='<div class="stack">'+Array.from({length:5},(_,i)=>{let a=slots[i];return `<button class="slotRow" data-slot="${i}"><span><strong>슬롯 ${i+1} · ${a?'저장됨':'빈 슬롯'}</strong><small>${a?`${safeText(a.savedAt)} · ${safeText(a.race)} · ${Number(a.turn)||1}턴`:'저장 데이터 없음'}</small></span><span>${mode==='save'?'저장':a?'불러오기':'—'}</span></button>`}).join('')+'</div>';
openDialog(mode==='save'?'게임 저장':'게임 불러오기',mode==='save'?'저장할 슬롯을 선택하세요. 기존 데이터는 덮어씁니다.':'불러올 슬롯을 선택하세요.',body,true);
$('modalBody').querySelectorAll('[data-slot]').forEach(btn=>btn.onclick=()=>{let i=+btn.dataset.slot;if(mode==='save'){let current=getSlots();if(current[i]&&!confirm(`슬롯 ${i+1}의 기존 저장 데이터를 덮어쓸까요?`))return;current[i]={savedAt:new Date().toLocaleString('ko-KR'),race:currentRace,turn:state.turn,state:JSON.parse(JSON.stringify(state))};if(setSlots(current)){dirty=false;showSlots('save')}}else{let a=getSlots()[i];if(!a){alert('빈 슬롯입니다.');return}if(gameActive&&dirty&&!confirm('저장하지 않은 진행 내용이 사라집니다. 불러올까요?'))return;let loaded;try{loaded=normalizeSavedState(structuredCloneSafe(a.state))}catch(e){alert(e.message);return}debugReveal=false;previousCamera=null;pendingDiscoveries=[];state=loaded;$('currentSeed').textContent=state?.seed||'(이전 저장 파일)';currentRace=a.race||'기본 종족';if(!state||!state.stars||!state.ships){alert('저장 데이터가 올바르지 않습니다.');return}activeShip=null;selected=0;sysId=0;view='galaxy';moveMode=false;focusHome();dirty=false;gameActive=true;closeDialog();showScreen('game');render()}});
}
function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v))}
$('newGameMain').onclick=()=>{$('seedInput').value='';showScreen('race')};$('raceBack').onclick=()=>showScreen('main');
$('startGame').onclick=()=>{currentRace='기본 종족';const seed=$('seedInput').value.trim()||randomSeed();try{reset(seed);gameActive=true;showScreen('game')}catch(e){alert('지도 생성 실패: '+e.message)}};
$('loadMain').onclick=()=>showSlots('load');$('exitMain').onclick=()=>openDialog('게임 종료','브라우저 환경에서는 창을 자동으로 닫을 수 없을 수 있습니다.','<p>게임을 종료하려면 브라우저 탭을 닫아 주세요.</p>');
function updateRevealButton(){ $('revealMapBtn').textContent=debugReveal?'원래 탐험 시야로 돌아가기':'맵 전체 확인하기 (테스트)'; }
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
  updateRevealButton();$('menuDrop').classList.add('hide');render();
};
$('menuBtn').onclick=()=>{$('currentSeed').textContent=state?.seed||'(이전 저장 파일)';updateRevealButton();$('menuDrop').classList.toggle('hide')};
$('toMain').onclick=()=>{if(tutorial){leaveTutorial();return}if(!confirm('저장되지 않은 진행 내용은 사라집니다. 정말 메인 메뉴로 돌아가겠습니까?'))return;gameActive=false;dirty=false;closeDialog();showScreen('main')};
$('gameLoad').onclick=()=>{ $('menuDrop').classList.add('hide');showSlots('load')};
$('gameSave').onclick=()=>{ $('menuDrop').classList.add('hide');showSlots('save')};
// 행성 및 발견 팝업은 기존 닫기 동작을 그대로 유지한다.
const originalDismiss=dismissModal;
dismissModal=function(){if(modalKind==='menu'||modalKind==='building'){closeDialog();return}originalDismiss()};
showScreen('main');
