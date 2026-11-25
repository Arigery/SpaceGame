let researchPendingTurn=false;
const RESEARCH_ERAS=['0','I','II','III','IV','V'];
const RESEARCH_STATUS={placeholder:'미설계',completed:'완료',active:'진행 중',available:'연구 가능',locked:'잠김'};
const RESEARCH_NODE_MARK={
 placeholder:'<path d="M-4 0h8M0-4v8"/>',
 completed:'<path d="m-6 0 4 4 8-8"/>',
 active:'<path d="M-6 4V1m6 3v-6m6 6v-9"/>',
 available:'<path d="m0-5 5 5-5 5-5-5Z"/>',
 locked:'<path d="M-4-1v-3a4 4 0 0 1 8 0v3M-6-1H6v8H-6Z"/>'
};
function researchHeader(net){const r=researchState(),t=RESEARCH_BY_ID.get(r.current);if(!t)return '<small class="research-current">'+(DATA.research.technologies.some(n=>researchAvailable(n.id))?'연구 선택 필요':'현재 임시 연구 완료')+'</small>';const e=researchEstimate(t.id,net);return '<small class="research-current" title="'+safeText(t.name)+'">'+safeText(t.name)+'</small><small>'+fmtHab(r.progress[t.id]||0)+' / '+t.cost+' · '+(Number.isFinite(e.turns)?e.turns+'턴':'대기')+'</small>'}
function researchCoordinates(){
 const fields=Object.keys(DATA.research.fields),out=new Map(),origins=DATA.research.technologies.filter(t=>t.nodeType==='origin');
 for(const t of DATA.research.technologies){
  const origin=t.nodeType==='origin',siblings=origin?origins:DATA.research.technologies.filter(n=>n.field===t.field&&n.era===t.era),order=siblings.indexOf(t);
  const axis=-90+fields.indexOf(t.field)*360/fields.length;
  const degrees=origin?-90+order*360/origins.length:axis+(order-(siblings.length-1)/2)*Math.min(24,52/Math.max(1,siblings.length-1));
  const angle=degrees*Math.PI/180,r=origin?68:150+(t.era-1)*80;
  const mirror=Math.cos(axis*Math.PI/180)>.1;
  const labelY=origin?32:(order%2===0)===mirror?-30:40;
  out.set(t.id,{x:Math.cos(angle)*r,y:Math.sin(angle)*r,labelY});
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
function researchDetailHeading(t,status){
 const origin=t.nodeType==='origin';
 const field=origin?'공통 기원':DATA.research.fields[t.field];
 const color=origin?'#dcc596':DATA.research.fieldColors[t.field];
 const label=origin?'기본 보유':RESEARCH_STATUS[status];
 return `<header class="research-detail-heading" style="--sector-color:${color}">
  <div class="research-detail-context"><span>${field} · ${RESEARCH_ERAS[t.era]}단계</span><span class="research-detail-status ${status}">${label}</span></div>
  <h3>${safeText(t.name)}</h3>
  <svg class="research-insignia" viewBox="-46 -46 92 92" aria-hidden="true">
   <path class="research-insignia-outline" d="M0-39 34-19V19L0 39-34 19V-19Z M0-30 26-15V15L0 30-26 15V-15Z"/>
   <g transform="scale(2.2)">${RESEARCH_NODE_MARK[status]}</g>
  </svg>
 </header>`;
}
function researchStageMarkup(){
 const angle=162*Math.PI/180;
 return RESEARCH_ERAS.slice(1).map((label,index)=>{
  const radius=150+index*80;
  return `<circle class="research-ring" r="${radius}"/><g transform="translate(${radius*Math.cos(angle)} ${radius*Math.sin(angle)})">
   <rect class="research-era-plate" x="-21" y="-13" width="42" height="26" rx="4"/>
   <text class="research-era" y="7">${label}</text></g>`;
 }).join('');
}
function placeLockedResearchLabel(svg,positions,id){
 const label=svg.querySelector('.research-node.chosen.locked .research-label');
 if(!label)return;
 const {x,y,labelY}=positions.get(id),box=label.getBBox(),gap=6;
 const columns=[...svg.querySelectorAll('.research-node.required')].flatMap(node=>{
  const point=positions.get(node.dataset.tech),other=node.querySelector('.research-label').getBBox();
  return x+box.x < point.x+other.x+other.width+gap&&x+box.x+box.width+gap > point.x+other.x?
   [{top:point.y+other.y,bottom:point.y+other.y+other.height}]:[];
 });
 const top=y+box.y,bottom=top+box.height;
 const fits=offset=>columns.every(other=>bottom+offset+gap<=other.top||top+offset>=other.bottom+gap);
 if(fits(0))return;
 const opposite=(labelY<0?40:-30)-labelY;
 // If both defaults are busy, try the closest gap next to a prerequisite label.
 const candidates=columns.flatMap(other=>[other.top-gap-bottom,other.bottom+gap-top]).sort((a,b)=>Math.abs(a)-Math.abs(b));
 const offset=[opposite,...candidates].find(dy=>fits(dy));
 if(offset!==undefined)label.setAttribute('y',labelY+offset);
}
function researchDetailMarkup(t,r,status){
 const heading=researchDetailHeading(t,status);
 if(t.nodeType!=='research')return heading+`<div class="research-detail-content"><p class="research-effect">${safeText(t.description)}</p></div>`;
 const {id,cost}=t,done=status==='completed',ready=status==='available',active=status==='active';
 const estimate=researchEstimate(id),progress=done?cost:r.progress[id]||0;
 const requirements=t.prerequisites.map(id=>{
  const complete=researchComplete(id);
  return `<button class="${complete?'':'unmet'}" data-prereq="${id}"><span>${complete?'✓':'○'}</span> ${safeText(RESEARCH_BY_ID.get(id).name)}</button>`;
 }).join('');
 const prerequisite=requirements?`<h4>선행 연구</h4><div class="research-prerequisites">${requirements}</div>`:'';
 const turns=Number.isFinite(estimate.turns)?estimate.turns+'턴':'생산 필요';
 const detailStats=`<details class="research-cost-detail"><summary>정산 내역</summary><p>비축 ${resourceAmountMarkup('research',fmtHab(estimate.stock))} · 생산 ${resourceAmountMarkup('research',fmtHab(estimate.net)+'/턴')}<br>다음 정산 투입 ${ready||active?resourceAmountMarkup('research',fmtHab(estimate.deposit)):'—'}</p></details>`;
 const legacy=(r.legacyCompleted||[]).length?`<details><summary>이전 저장의 완료 효과 (${r.legacyCompleted.length})</summary>${r.legacyCompleted.map(id=>`<p>${safeText(RESEARCH_LEGACY[id].name)}</p>`).join('')}</details>`:'';
 return `${heading}<div class="research-detail-content">
  ${status==='locked'?prerequisite:''}
  <section class="research-effects"><h4>${({unlock:'콘텐츠 해금',expansion:'시스템 확장',enhancement:'수치 강화'})[t.researchType]}${t.classification==='applied'?'':' · 효과 미적용'}</h4>
   <p class="research-effect">${safeText(t.description)}</p>${t.integrationNote?`<p class="research-integration-note">${safeText(t.integrationNote)}</p>`:''}</section>
  <div class="research-investment">
   <dl><div><dt>연구 진행</dt><dd>${resourceAmountMarkup('research',fmtHab(progress)+' / '+cost)}</dd></div>
   ${ready||active?`<div><dt>예상 완료</dt><dd>${turns}</dd></div>`:''}</dl>
   <progress aria-label="선택 기술 연구 진행률" max="${cost}" value="${progress}"></progress>
  </div>
  ${status==='locked'?'':prerequisite}
  ${detailStats}${legacy}
  </div><div class="research-actions"><button id="researchStart"${ready?'':' disabled'}>${ready?(r.current?'연구 전환':'연구 시작'):RESEARCH_STATUS[status]}</button></div>`;
}
function showResearch(pendingTurn=false,aiOrders=[]){
 if(tutorial)return;
 researchPendingTurn=pendingTurn;
 const positions=researchCoordinates(),techs=DATA.research.technologies,fields=Object.entries(DATA.research.fields);
 let chosen=researchState().current||techs.find(t=>researchAvailable(t.id))?.id||techs[0].id;
 let focusedField=null;
 const fieldButtons=fields.map(([id,name])=>`<button data-research-field="${id}" aria-pressed="false" style="--sector-color:${DATA.research.fieldColors[id]}"><span>${name}</span><b></b></button>`).join('');
 const lines=techs.flatMap(t=>t.prerequisites.map(id=>{
  const a=positions.get(id),b=positions.get(t.id),cross=RESEARCH_BY_ID.get(id).field!==t.field;
  return `<line data-from="${id}" data-to="${t.id}" class="research-edge${cross?' cross':''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
 })).join('');
 const nodes=techs.map(t=>{
  const p=positions.get(t.id),origin=t.nodeType==='origin';
  return `<g class="research-node" data-tech="${t.id}" role="button" tabindex="0" transform="translate(${p.x} ${p.y})">
   <title></title><circle r="${origin?15:20}"/><g class="research-symbol" aria-hidden="true"></g>
   <text class="research-label" y="${p.labelY}">${safeText(t.name)}</text></g>`;
 }).join('');
 const key=Object.entries(RESEARCH_STATUS).map(([kind,label])=>`<span class="${kind}"><svg viewBox="-10 -10 20 20" aria-hidden="true">${RESEARCH_NODE_MARK[kind]}</svg>${label}</span>`).join('');
 openDialog('연구',pendingTurn?'연구 선택 필요 · 닫으면 턴 취소':'',`<div class="research-screen">
  <div class="research-atlas">
   <nav id="researchFields" aria-label="분야별 연구 가능 수">${fieldButtons}</nav>
   <div class="research-map"><svg id="researchTree" viewBox="-585 -585 1170 1170" aria-label="분야별 방사형 연구 지도">
    <g id="researchCamera">${researchSectorMarkup()}${researchStageMarkup()}${lines}<circle class="research-origin" r="35"/>
    <text class="research-origin-title" y="-2">기원</text><text class="research-origin-mark" y="16">기본 보유</text>${nodes}</g>
   </svg></div>
   <div class="research-map-tools"><div class="research-key" aria-label="연구 상태 범례">${key}</div>
    <div class="research-zoom"><button id="researchZoomOut" aria-label="축소">−</button><button id="researchReset" title="중심 및 분야 강조 초기화">중앙</button><button id="researchZoomIn" aria-label="확대">＋</button></div></div>
  </div>
  <aside class="research-sidebar">
   <div id="researchCurrent"></div>
   <div id="researchDetail" aria-live="polite"></div>
  </aside></div>`,true);
 $('overlay').querySelector('.modal').classList.add('research-modal');
 const svg=$('researchTree'),camera=$('researchCamera'),detail=$('researchDetail');
 const fieldControls=$('researchFields').querySelectorAll('button');
 let zoom=1,px=0,py=0,dragged=false;
 const updateCamera=()=>{camera.setAttribute('transform',`translate(${px} ${py}) scale(${zoom})`);svg.classList.toggle('compact-labels',zoom<.85)};
 const local=e=>{const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;return point.matrixTransform(svg.getScreenCTM().inverse())};
 const zoomAt=(factor,p={x:0,y:0})=>{
  const z=Math.max(.6,Math.min(3,zoom*factor)),ratio=z/zoom;
  px=p.x-(p.x-px)*ratio;py=p.y-(p.y-py)*ratio;zoom=z;updateCamera();
 };
 const reveal=id=>{
  const p=positions.get(id);
  if(Math.abs(p.x*zoom+px)>500||Math.abs(p.y*zoom+py)>500){px=-p.x*zoom;py=-p.y*zoom;updateCamera()}
 };
 const select=(id,showNode=false)=>{
  chosen=id;
  if(focusedField&&RESEARCH_BY_ID.get(id).field!==focusedField)focusedField=null;
  if(showNode)reveal(id);
  redraw();
 };
 const redraw=()=>{
  const r=researchState(),t=RESEARCH_BY_ID.get(chosen),missing=new Set();
  const visit=id=>{for(const p of RESEARCH_BY_ID.get(id).prerequisites)if(!researchComplete(p)&&!missing.has(p)){missing.add(p);visit(p)}};
  visit(chosen);
  const ready=techs.filter(tech=>tech.id!==r.current&&researchAvailable(tech.id)),readyIds=new Set(ready.map(tech=>tech.id));
  const statusOf=tech=>tech.nodeType==='placeholder'?'placeholder':researchComplete(tech.id)?'completed':r.current===tech.id?'active':readyIds.has(tech.id)?'available':'locked';
  fieldControls.forEach(button=>{
   const id=button.dataset.researchField,count=ready.filter(tech=>tech.field===id).length;
   button.querySelector('b').textContent=count;
   button.setAttribute('aria-label',DATA.research.fields[id]+' · 연구 가능 '+count+'개');
   button.setAttribute('aria-pressed',String(focusedField===id));
  });
  svg.querySelectorAll('.research-sector-area').forEach(sector=>{
   sector.classList.toggle('focused',focusedField===sector.dataset.field);
   sector.classList.toggle('muted-sector',!!focusedField&&focusedField!==sector.dataset.field);
  });
  svg.querySelectorAll('[data-tech]').forEach(n=>{
   const tech=RESEARCH_BY_ID.get(n.dataset.tech),status=statusOf(tech),selected=tech.id===chosen,required=missing.has(tech.id);
   const muted=focusedField&&tech.field!==focusedField&&tech.nodeType!=='origin'&&!selected&&!required&&status!=='active';
   n.setAttribute('class',['research-node',status,selected&&'chosen',required&&'required',muted&&'muted-node'].filter(Boolean).join(' '));
   const label=tech.name+' · '+(tech.nodeType==='origin'?'기본 보유':RESEARCH_STATUS[status]);
   n.setAttribute('aria-label',label);n.setAttribute('aria-pressed',String(selected));
   n.querySelector('title').textContent=label;n.querySelector('.research-symbol').innerHTML=RESEARCH_NODE_MARK[status];
   n.querySelector('.research-label').setAttribute('y',positions.get(tech.id).labelY);
  });
  placeLockedResearchLabel(svg,positions,chosen);
  svg.querySelectorAll('.research-edge').forEach(n=>n.classList.toggle('required',(n.dataset.to===chosen||missing.has(n.dataset.to))&&missing.has(n.dataset.from)));
  const active=RESEARCH_BY_ID.get(r.current),progress=active?(r.progress[active.id]||0):0;
  $('researchCurrent').innerHTML=active?`<div class="research-current-line"><span>진행 중</span><button id="researchStop" title="누적 진행도 유지">중단</button></div>
   <button id="researchCurrentTech">${safeText(active.name)}</button><div class="research-progress-line">${resourceAmountMarkup('research',fmtHab(progress)+' / '+active.cost)}</div>
   <progress value="${progress}" max="${active.cost}" aria-label="현재 연구 진행률"></progress>`:'<div class="research-current-line"><span>현재 연구</span><small>대기</small></div>';
  if(active){
   $('researchCurrentTech').onclick=()=>{select(active.id,true);$('researchCurrentTech').focus({preventScroll:true})};
   $('researchStop').onclick=()=>{stopResearch();redraw();renderHeader();$('researchStart')?.focus({preventScroll:true})};
  }
  detail.innerHTML=researchDetailMarkup(t,r,statusOf(t));
  detail.querySelectorAll('[data-prereq]').forEach(button=>button.onclick=()=>{
   const id=button.dataset.prereq;select(id,true);svg.querySelector('[data-tech="'+id+'"]')?.focus({preventScroll:true});
  });
  if($('researchStart'))$('researchStart').onclick=()=>{
   if(!startResearch(chosen))return;
   if(researchPendingTurn){closeDialog();nextTurn(aiOrders)}
   else{redraw();renderHeader();$('researchCurrentTech')?.focus({preventScroll:true})}
  };
 };
 const resetCamera=()=>{zoom=1;px=py=0;updateCamera();redraw()};
 fieldControls.forEach(button=>button.onclick=()=>{
  const id=button.dataset.researchField;
  focusedField=focusedField===id?null:id;
  resetCamera();
 });
 svg.addEventListener('click',e=>{if(dragged)return;const node=e.target.closest('[data-tech]');if(node)select(node.dataset.tech)});
 svg.addEventListener('keydown',e=>{
  const node=e.target.closest('[data-tech]');if(!node)return;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();select(node.dataset.tech)}
  else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){
   e.preventDefault();const index=techs.findIndex(t=>t.id===node.dataset.tech),step=['ArrowRight','ArrowDown'].includes(e.key)?1:-1;
   const target=techs[(index+step+techs.length)%techs.length],p=positions.get(target.id);
   px=-p.x*zoom;py=-p.y*zoom;updateCamera();svg.querySelector('[data-tech="'+target.id+'"]').focus({preventScroll:true});
  }
 });
 const pointers=new Map();let origin=null,pressedTech=null;
 svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  origin=local(e);pointers.set(e.pointerId,origin);pressedTech=e.target.closest('[data-tech]')?.dataset.tech||null;
  dragged=pointers.size>1;svg.setPointerCapture(e.pointerId);
 });
 svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  const previous=pointers.get(e.pointerId),now=local(e);
  if(pointers.size===2){
   const other=[...pointers].find(([id])=>id!==e.pointerId)[1];
   const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(now.x-other.x,now.y-other.y);
   if(before>0)zoomAt(after/before,{x:(now.x+other.x)/2,y:(now.y+other.y)/2});dragged=true;
  }else if(dragged||Math.hypot(now.x-origin.x,now.y-origin.y)>4){
   px+=now.x-previous.x;py+=now.y-previous.y;dragged=true;updateCamera();
  }
  pointers.set(e.pointerId,now);
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,e=>{
  if(type==='pointerup'&&!dragged&&pressedTech)select(pressedTech);
  pointers.delete(e.pointerId);if(!pointers.size)pressedTech=null;
 });
 svg.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.exp(-e.deltaY*.001),local(e))},{passive:false});
 $('researchZoomIn').onclick=()=>zoomAt(1.2);
 $('researchZoomOut').onclick=()=>zoomAt(1/1.2);
 $('researchReset').onclick=()=>{focusedField=null;resetCamera()};
 redraw();
}
