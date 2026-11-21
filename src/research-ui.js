let researchPendingTurn=false;
function researchHeader(net){const r=researchState(),t=RESEARCH_BY_ID.get(r.current);if(!t)return '<small class="research-current">'+(DATA.research.technologies.some(n=>researchAvailable(n.id))?'연구 선택 필요':'현재 임시 연구 완료')+'</small>';const e=researchEstimate(t.id,net);return '<small class="research-current" title="'+safeText(t.name)+'">'+safeText(t.name)+'</small><small>'+fmtHab(r.progress[t.id]||0)+' / '+t.cost+' · '+(Number.isFinite(e.turns)?e.turns+'턴':'대기')+'</small>'}
function researchStockHint(net){const r=researchState(),t=RESEARCH_BY_ID.get(r.current);if(!t)return '<p>선택한 연구가 없어 연구력을 비축합니다.</p>';const e=researchEstimate(t.id,net);return '<p>재고 '+resourceAmountMarkup('research',fmtHab(e.stock))+' · 다음 정산 후 투입 '+resourceAmountMarkup('research',fmtHab(e.deposit))+'<br>완료 후 잔량은 다음 연구 선택 후 다음 턴에 투입합니다.</p>'}
function researchCoordinates(){
 const fields=Object.keys(DATA.research.fields),out=new Map(),origins=DATA.research.technologies.filter(t=>t.nodeType==='origin');
 for(const t of DATA.research.technologies){
  const origin=t.nodeType==='origin',siblings=origin?origins:DATA.research.technologies.filter(n=>n.field===t.field&&n.era===t.era),order=siblings.indexOf(t);
  const degrees=origin?-90+order*360/origins.length:-90+fields.indexOf(t.field)*360/fields.length+(order-(siblings.length-1)/2)*Math.min(24,52/Math.max(1,siblings.length-1));
  const angle=degrees*Math.PI/180,r=origin?68:150+(t.era-1)*80;
  out.set(t.id,{x:Math.cos(angle)*r,y:Math.sin(angle)*r,order});
 }
 return out;
}
function researchSectorMarkup(){
 const fields=Object.entries(DATA.research.fields),width=360/fields.length;
 return fields.map(([id,name],i)=>{
  const angle=-90+i*width,left=(angle-width/2+1)*Math.PI/180,right=(angle+width/2-1)*Math.PI/180,a=angle*Math.PI/180;
  const point=(r,t)=>`${Math.cos(t)*r} ${Math.sin(t)*r}`;
  return `<g class="research-sector-area" data-field="${id}" style="--sector-color:${DATA.research.fieldColors[id]}"><path d="M ${point(112,left)} L ${point(520,left)} A 520 520 0 0 1 ${point(520,right)} L ${point(112,right)} A 112 112 0 0 0 ${point(112,left)} Z"/><text class="research-field" x="${Math.cos(a)*545}" y="${Math.sin(a)*545}">${name}</text></g>`;
 }).join('');
}
function researchSpecialDetail(t){
 if(t.nodeType==='research')return null;
 const origin=t.nodeType==='origin';
 return '<div class="research-detail-field">'+(origin?'공통 기원 · 0단계':DATA.research.fields[t.field]+' · '+['0','I','II','III','IV','V'][t.era]+'단계')+'</div><h3>'+safeText(t.name)+'</h3><p>'+safeText(t.description)+'</p><span class="research-classification">'+(origin?'✓ 시작부터 보유':'미설계 · 비활성')+'</span><p>'+(origin?'비용과 진행 과정 없이 항상 완료 상태입니다. 기존 행동을 새로 제한하지 않습니다.':'비용·효과 미정. 연구 진행과 선행 판정에서 제외됩니다.')+'</p><button disabled>'+(origin?'기본 기술 보유':'연구 불가')+'</button>';
}
function showResearch(pendingTurn=false,aiOrders=[]){
 if(tutorial)return;
 researchPendingTurn=pendingTurn;
 const positions=researchCoordinates(),techs=DATA.research.technologies;
 let chosen=researchState().current||techs.find(t=>researchAvailable(t.id))?.id||techs[0].id;
 const circles=[1,2,3,4,5].map(i=>'<circle class="research-ring" r="'+(150+(i-1)*80)+'"/><text class="research-era" x="8" y="'+(-(150+(i-1)*80)+16)+'">'+['','I','II','III','IV','V'][i]+'</text>').join('');
 const fields=researchSectorMarkup();
 const lines=techs.flatMap(t=>t.prerequisites.map(id=>{const a=positions.get(id),b=positions.get(t.id);return '<line data-from="'+id+'" data-to="'+t.id+'" class="research-edge '+(RESEARCH_BY_ID.get(id).field!==t.field?'cross':'')+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>'})).join('');
 const nodes=techs.map(t=>{const p=positions.get(t.id);return '<g class="research-node" data-tech="'+t.id+'" role="button" tabindex="0" aria-label="'+safeText(t.name)+'" transform="translate('+p.x+' '+p.y+')"><title>'+safeText(t.name)+' · '+(t.nodeType==='origin'?'기본 보유':t.nodeType==='placeholder'?'미설계':t.cost+' 연구력')+'</title><circle r="'+(t.nodeType==='origin'?14:18)+'"/><text class="research-symbol" y="5">'+t.era+'</text><text class="research-label" y="'+(t.nodeType==='origin'?29:p.order%2===1?-30:35)+'">'+safeText(t.name)+'</text></g>'}).join('');
 openDialog('연구',pendingTurn?'연구를 선택하면 턴을 진행합니다. 닫으면 턴 진행을 취소합니다.':'휠 확대 · 드래그 이동 · 방향키 탐색 · Enter 선택', '<div class="research-screen"><div class="research-map"><div class="research-legend">✓ 보유/완료 · ◉ 진행 · 밝은 노드: 가능 · 점선: 미설계</div><svg id="researchTree" viewBox="-610 -610 1220 1220" aria-label="분야별 방사형 연구 지도"><g id="researchCamera">'+fields+circles+lines+'<circle class="research-origin" r="29"/><text class="research-field" y="5">기원</text>'+nodes+'</g></svg><div class="research-zoom"><button id="researchZoomOut" aria-label="축소">−</button><button id="researchReset">중앙</button><button id="researchZoomIn" aria-label="확대">＋</button></div></div><aside id="researchDetail" aria-live="polite"></aside></div>',true);
 $('overlay').querySelector('.modal').classList.add('research-modal');
 const svg=$('researchTree'),camera=$('researchCamera');let zoom=1,px=0,py=0,dragged=false;
 const updateCamera=()=>{camera.setAttribute('transform',`translate(${px} ${py}) scale(${zoom})`);svg.classList.toggle('compact-labels',zoom<.8)};
 const local=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())};
 const zoomAt=(factor,p={x:0,y:0})=>{const z=Math.max(.6,Math.min(3,zoom*factor)),r=z/zoom;px=p.x-(p.x-px)*r;py=p.y-(p.y-py)*r;zoom=z;updateCamera()};
 const redraw=()=>{
  const r=researchState(),t=RESEARCH_BY_ID.get(chosen),missing=new Set();const visit=id=>{for(const p of RESEARCH_BY_ID.get(id).prerequisites)if(!researchComplete(p)&&!missing.has(p)){missing.add(p);visit(p)}};visit(chosen);
  svg.querySelectorAll('[data-tech]').forEach(n=>{const id=n.dataset.tech,status=RESEARCH_BY_ID.get(id).nodeType==='placeholder'?'placeholder':researchComplete(id)?'completed':r.current===id?'active':researchAvailable(id)?'available':'locked';n.setAttribute('class','research-node '+status+(id===chosen?' chosen':'')+(missing.has(id)?' required':''));n.setAttribute('aria-label',RESEARCH_BY_ID.get(id).name+' · '+{placeholder:'미설계 · 연구 불가',completed:'완료',active:'진행 중',available:'연구 가능',locked:'잠김'}[status]);n.querySelector('.research-symbol').textContent=status==='placeholder'?'+':status==='completed'?'✓':status==='active'?'◉':RESEARCH_BY_ID.get(id).era});
  svg.querySelectorAll('.research-edge').forEach(n=>n.classList.toggle('required',(n.dataset.to===chosen||missing.has(n.dataset.to))&&missing.has(n.dataset.from)));
  const special=researchSpecialDetail(t);if(special){$('researchDetail').innerHTML=special;return}
  const estimate=researchEstimate(chosen),done=researchComplete(chosen),available=researchAvailable(chosen),running=r.current===chosen;
  $('researchDetail').innerHTML='<div class="research-detail-field">'+DATA.research.fields[t.field]+' · '+['0','I','II','III','IV','V'][t.era]+'단계'+'</div><h3>'+safeText(t.name)+'</h3><p>'+safeText(t.description)+'</p><span class="research-classification">'+(t.classification==='applied'?'임시 연구 · 현재 효과 적용':'임시 연구 · 실제 효과 미적용')+' / '+({unlock:'콘텐츠 해금',expansion:'시스템 확장',enhancement:'수치 강화'}[t.researchType])+'</span>'+(t.integrationNote?'<p>'+safeText(t.integrationNote)+'</p>':'')+'<p>연구 진행 '+resourceAmountMarkup('research',(done?t.cost:fmtHab(r.progress[chosen]||0))+' / '+t.cost)+'</p><progress max="'+t.cost+'" value="'+(done?t.cost:r.progress[chosen]||0)+'"></progress><p>'+ (done?'연구 완료':((available||running)?'예상 '+(Number.isFinite(estimate.turns)?estimate.turns+'턴':'생산 필요'):'선행 연구 완료 필요'))+'</p><p class="note">비축 '+resourceAmountMarkup('research',fmtHab(estimate.stock))+' · 생산 '+resourceAmountMarkup('research',fmtHab(estimate.net)+'/턴')+'<br>다음 정산 투입 '+((available||running)?resourceAmountMarkup('research',fmtHab(estimate.deposit)):'—')+'</p><h4>선행 연구 · 모두 필요</h4><div class="research-prerequisites">'+(t.prerequisites.map(id=>'<button data-prereq="'+id+'">'+(researchComplete(id)?'✓ ':'○ ')+safeText(RESEARCH_BY_ID.get(id).name)+'</button>').join('')||'없음')+'</div><div class="research-actions"><button id="researchStart" '+(!available||r.current===chosen?'disabled':'')+'>'+(done?'완료':r.current===chosen?'진행 중':r.current?'연구 전환':'연구 시작')+'</button>'+(r.current?'<button id="researchStop">현재 연구 중단</button>':'')+'</div><p class="note">중단·전환해도 투입한 진행도를 보존합니다. 한 턴에 한 기술만 완료합니다.</p>'+((r.legacyCompleted||[]).length?'<details><summary>이전 저장의 완료 효과 보존 ('+r.legacyCompleted.length+')</summary>'+r.legacyCompleted.map(id=>'<p>'+safeText(RESEARCH_LEGACY[id].name)+'</p>').join('')+'</details>':'');
  $('researchDetail').querySelectorAll('[data-prereq]').forEach(b=>b.onclick=()=>{chosen=b.dataset.prereq;redraw()});
  $('researchStart').onclick=()=>{if(!startResearch(chosen))return;const resume=researchPendingTurn;if(resume){closeDialog();nextTurn(aiOrders)}else{redraw();renderHeader()}};
  if($('researchStop'))$('researchStop').onclick=()=>{stopResearch();redraw();renderHeader()};
 };
 svg.addEventListener('click',e=>{if(dragged)return;const n=e.target.closest('[data-tech]');if(n){chosen=n.dataset.tech;redraw()}});
 svg.addEventListener('keydown',e=>{const n=e.target.closest('[data-tech]');if(!n)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();chosen=n.dataset.tech;redraw()}else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();const index=techs.findIndex(t=>t.id===n.dataset.tech),next=(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+techs.length)%techs.length;const target=techs[next],p=positions.get(target.id);px=-p.x*zoom;py=-p.y*zoom;updateCamera();svg.querySelector('[data-tech="'+target.id+'"]').focus()}});
 const pointers=new Map();let origin=null,pressedTech=null;
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,local(e));origin=local(e);pressedTech=e.target.closest('[data-tech]')?.dataset.tech||null;dragged=pointers.size>1;svg.setPointerCapture(e.pointerId)});
 svg.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const previous=pointers.get(e.pointerId),now=local(e);if(pointers.size===2){const other=[...pointers].find(([id])=>id!==e.pointerId)[1],before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(now.x-other.x,now.y-other.y);if(before>0)zoomAt(after/before,{x:(now.x+other.x)/2,y:(now.y+other.y)/2});dragged=true}else if(dragged||Math.hypot(now.x-origin.x,now.y-origin.y)>4){px+=now.x-previous.x;py+=now.y-previous.y;dragged=true;updateCamera()}pointers.set(e.pointerId,now)});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,e=>{if(type==='pointerup'&&!dragged&&pressedTech){chosen=pressedTech;redraw()}pointers.delete(e.pointerId);if(!pointers.size)pressedTech=null});
 svg.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.exp(-e.deltaY*.001),local(e))},{passive:false});
 $('researchZoomIn').onclick=()=>zoomAt(1.2);$('researchZoomOut').onclick=()=>zoomAt(1/1.2);$('researchReset').onclick=()=>{zoom=1;px=py=0;updateCamera()};redraw();
}
