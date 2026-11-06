let tutorial=null;
const trainingNeighbor='.starhit[data-id="1"]';
const trainingSteps=[
 ['.starhit[data-id="0"]','테라에 도착했습니다. 시작 항성계를 여세요.'],
 ['.stellar-planet.mineral','붉은 광물 행성을 선택하세요. 광산은 매 턴 광물을 공급합니다.'],
 ['#closeModal','광산의 턴당 생산량을 확인한 뒤 닫으세요.'],
 ['.stellar-planet.gas','보라색 가스 행성을 선택하세요. 채집소는 에너지를 공급합니다.'],
 ['#closeModal','채집소의 턴당 에너지 생산량을 확인한 뒤 닫으세요.'],
 ['.stellar-planet.hab','푸른 거주 가능 행성을 선택해 테라의 인구와 시설을 관리하세요.'],
 ['.hab-overview-panel','인구와 턴당 수입을 확인하세요.','brief'],
 ['.hab-common-panel','공용 건물은 주거와 의료를 담당합니다.','brief'],
 ['.hab-special-panel','특화 건물에서는 배치한 인구가 자원을 생산합니다.','brief'],
 ['[data-hadd="1"]','공용 건물의 빈칸에서 건설을 누르세요.'],
 ['[data-building-id="medical"]','의료 시설을 선택해 착공하세요.'],
 ['#habConstruction','의료 시설 착공. 이곳에서 쌓인 생산력과 남은 턴을 확인합니다.','brief'],
 ['[data-hcw="0"][data-delta="1"]','행성 중심지의 ＋를 눌러 한 명을 배치하세요.'],
 ['#habStats','', 'crew'],
 ['#back','항성계로 돌아가세요.'],
 ['#back','은하 지도로 돌아가 탐사선을 출항시키세요.'],
 ['.shiphit[data-ship="explorer"]','삼각형 탐사선을 선택하세요.'],
 ['#moveBtn','이동 위치 선택을 누르세요.'],
 [trainingNeighbor,'밝게 표시된 이웃 성계로 이동하세요.'],
 ['#scanBtn','탐사를 눌러 행성과 인접 항로를 밝혀내세요.'],
 [trainingNeighbor,'탐사한 성계를 열어 행성 구성을 확인하세요.'],
 ['.stellar-scene','거주 가능·광물·가스·불모 행성이 하나씩 있습니다. 이곳에 두 번째 거점을 세웁니다.','brief'],
 ['#back','은하 지도로 돌아가세요.'],
 ['.shiphit[data-ship="colony"]','테라에 남아 있는 사각형 개척선을 선택하세요.'],
 ['#moveBtn','개척선의 이동 위치를 선택하세요.'],
 [trainingNeighbor,'탐사를 마친 이웃 성계로 이동하세요.'],
 ['#colonizeBtn','개척을 눌러 새 거점을 세우세요.'],
 [trainingNeighbor,'개척한 항성계를 다시 여세요.'],
 ['.stellar-planet.mineral','붉은 광물 행성에 첫 광산을 건설하세요.'],
 ['#levelUp','광물 20을 사용해 1단계 광산을 착공하세요.'],
 ['#closeModal','광산이 5턴 뒤 가동됩니다. 공사 현황을 확인한 뒤 닫으세요.'],
 ['#resource .res','자원에 마우스를 올리거나 터치해 턴당 내역을 보세요.','resource']
];

function startTutorial(){
 state=generate('테라 훈련 구역',true);
 tutorial={step:0,freeStart:null,baseline:null};
 gameActive=true;dirty=false;debugReveal=false;previousCamera=null;pendingDiscoveries=[];
 clearShipSelection();selected=0;sysId=0;view='galaxy';focusHome();
 for(const id of ['gameSave','gameLoad','revealMapBtn'])$(id).classList.add('hide');
 $('mapTip').textContent=$('mapTip').textContent.replace('2척','1척');
 $('tutorialControls').classList.remove('hide');
 $('tutorialStatus').textContent='';
 closeDialog();showScreen('game');render();
}
function leaveTutorial(){
 tutorial=null;gameActive=false;dirty=false;pendingDiscoveries=[];
 $('nextTurn').disabled=false;
 document.querySelectorAll('.training-target').forEach(el=>el.classList.remove('training-target'));
 for(const id of ['gameSave','gameLoad','revealMapBtn'])$(id).classList.remove('hide');
 $('mapTip').textContent=$('mapTip').textContent.replace('1척','2척');
 $('tutorialControls').classList.add('hide');$('tutorialBubble').classList.add('hide');closeDialog();showScreen('main');
}
function paintTutorial(){
 if(!tutorial)return;
 document.querySelectorAll('.training-target').forEach(el=>el.classList.remove('training-target'));
 const step=trainingSteps[tutorial.step];
 if(!step){
  tutorial.freeStart??=state.turn;
  const left=Math.max(0,15-(state.turn-tutorial.freeStart));
  $('tutorialStatus').textContent=left?'자유 탐험 · 남은 '+left+'턴':'자유 훈련 완료';
  $('tutorialBubble').classList.add('hide');
  $('nextTurn').disabled=left===0;
  return;
 }
 const [selector,message,kind]=step;
 let text=message;
 const review=kind==='brief'||kind==='crew';
 if(kind==='crew'){
  const h=habitat(currentHab()),before=tutorial.baseline;
  const turns=Math.ceil((h.construction.required-h.construction.progress)/habPower(h));
  text='배치 가능 '+before.free+' → '+habFree(h)+'명 · 생산력 '+before.power+' → '+habPower(h)+'/턴';
  text+=' · 남은 '+(before.turns===turns?turns:before.turns+' → '+turns)+'턴';
 }
 $('tutorialText').textContent=text;
 $('tutorialNext').hidden=!review;
 const target=document.querySelector(selector);
 const bubble=$('tutorialBubble');
 bubble.classList.toggle('hide',!target);
 if(!target)return;
 target.classList.add('training-target');
 const anchor=trainingAnchor(target);
 if(tutorial.scrolled!==tutorial.step){
  tutorial.scrolled=tutorial.step;
  anchor.scrollIntoView({block:'center',inline:'nearest'});
 }
 positionTrainingBubble();
}
function trainingAnchor(target){
 return target.querySelector('.hab-section-head,.hab-stat,.stellar-sun')||target;
}
function positionTrainingBubble(){
 if(!tutorial||tutorial.freeStart!==null)return;
 const target=document.querySelector(trainingSteps[tutorial.step]?.[0]);
 if(!target)return;
 const rect=trainingAnchor(target).getBoundingClientRect(),bubble=$('tutorialBubble');
 const width=bubble.offsetWidth,height=bubble.offsetHeight,gap=10;
 const x=Math.max(8,Math.min(innerWidth-width-8,rect.left+(rect.width-width)/2));
 const above=rect.top>=height+gap+8;
 const y=above?rect.top-height-gap:rect.bottom+gap;
 bubble.dataset.side=above?'above':'below';
 bubble.style.left=x+'px';
 bubble.style.top=Math.max(6,Math.min(innerHeight-height-6,y))+'px';
 bubble.style.setProperty('--tip-x',Math.max(12,Math.min(width-12,rect.left+rect.width/2-x))+'px');
}
window.addEventListener('resize',positionTrainingBubble);
document.addEventListener('scroll',positionTrainingBubble,true);
function advanceTraining(){
 tutorial.step++;
 paintTutorial();
}
$('tutorialMain').onclick=startTutorial;
$('tutorialNext').onclick=advanceTraining;
$('tutorialExit').onclick=leaveTutorial;

// Accept the highlighted action only. The normal game handler performs it.
// Update the guide after that handler has opened or rebuilt its screen.
document.addEventListener('click',event=>{
 if(!tutorial||tutorial.freeStart!==null||event.target.closest('#tutorialBubble,#tutorialControls'))return;
 const [selector,,kind]=trainingSteps[tutorial.step];
 const allowed=event.target.closest(selector);
 if(tutorial.pending||dragging||!allowed||allowed.disabled){
  event.preventDefault();event.stopImmediatePropagation();return;
 }
 if(kind==='brief'||kind==='crew'){
  event.preventDefault();event.stopImmediatePropagation();advanceTraining();return;
 }
 if(selector==='[data-hcw="0"][data-delta="1"]'){
  const h=habitat(currentHab());
  tutorial.baseline={free:habFree(h),power:habPower(h),turns:Math.ceil(h.construction.required/habPower(h))};
 }
 const current=tutorial,index=current.step;
 current.pending=true;
 setTimeout(()=>{
  if(tutorial!==current)return;
  current.pending=false;
  if(current.step===index)advanceTraining();
 },0);
},true);
function inspectTrainingResource(event){
 if(!tutorial||trainingSteps[tutorial.step]?.[2]!=='resource'||!event.target.closest('#resource .res'))return;
 advanceTraining();
}
document.addEventListener('pointerover',inspectTrainingResource);
document.addEventListener('focusin',inspectTrainingResource);
