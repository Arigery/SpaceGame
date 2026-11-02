let habIndex=0;
function currentHab(){return state.stars[sysId].planets[habIndex]}
function openHabitat(index){const s=state.stars[sysId],p=s.planets[index];if(!s.owned||p.type!=='hab')return;habIndex=index;habitat(p);view='habitat';render()}
function fmtHab(n){return (Math.round(n*10)/10).toFixed(1)}
function habRender(){let p=currentHab(),h=habitat(p),prod=habProduce(h),cons=habConsume(h);
 $('habTitle').textContent=p.label+' · 거주 가능 행성';$('habSubtitle').textContent=`기본 인구 ${HAB_BALANCE.initialPopulation}명 · 공용 건물 ${HAB_BALANCE.commonSlots}칸 · 특화 건물 ${HAB_BALANCE.specialSlots}칸`;
 $('habStats').innerHTML=[['인구',Math.floor(h.pop)+' / '+habCap(h)],['인구 성장','+'+fmtHab(habGrowth(h))+'/턴'],['배치 가능',habFree(h)+'명'],['생산력',habPower(h)+'/턴']]
 .map(([name,value])=>`<div class="hab-stat"><small>${name}</small><b>${value}</b></div>`).join('');
 $('habEconomy').innerHTML=HAB_RESOURCES.map(r=>{let a=prod[r],b=cons[r],net=a-b,tag=r==='consumer'?`<span class="hab-penalty">디버프 +${fmtHab(habPenalty()*100)}%</span>`:'';
 return `<div class="hab-resource"><div class="hab-resline"><span>${resourceNames[r]}</span><b class="${net<0?'negative':net>0?'positive':''}">${net>=0?'+':''}${fmtHab(net)}/턴</b>${tag}</div><div class="hab-breakdown">생산 +${fmtHab(a)} · 소모 -${fmtHab(b)}</div></div>`}).join('');
 $('habCommonInfo').textContent='설치 '+h.common.filter(Boolean).length+'/'+h.common.length;
 $('habCommon').innerHTML=h.common.map((b,i)=>{
 let t=b?HAB_COMMON_BY_ID.get(b.id):null,center=b?.id==='center',max=center?h.commonLevel:1;
 let title=b?(center?DATA.buildings.center.name:t.name):'빈 공용 슬롯 '+(i+1);
 let desc=b?(center?`최대 인구 +${h.commonLevel-1} · 배치 인구당 생산력 +1 · 식량/소비재/연구력 각 +5/턴 (고정)`:(t.effects?t.effects[b.level-1]:t.desc)):'주거 · 의료 · 행정 · 물류';
 return `<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${title}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}">건물 이미지</div><div class="hab-card-desc">${desc}</div>
 ${b?`<div class="hab-worker"><span>배치 ${b.workers||0}/${max}</span><div class="hab-wBtns"><button data-hcw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button data-hcw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=max?'disabled':''}>+</button></div></div>`:''}
 <div class="hab-card-actions">${b?(center?'<button disabled>기본 건물</button>':`${t.effects?`<button data-hup="${i}" ${b.level>=HAB_BALANCE.upgradeMaxLevel?'disabled':''}>${b.level>=HAB_BALANCE.upgradeMaxLevel?'최대 단계':'업그레이드'}</button>`:''}<button data-hremove="${i}">철거</button>`):`<button class="primary" data-hadd="${i}">건설</button>`}</div></article>`}).join('');
 $('habSpecial').innerHTML=h.special.map((b,i)=>`<article class="hab-card ${b?'':'empty'}"><div class="hab-card-head"><b>${b?SPECIAL_BY_ID.get(b.id).name:'빈 특화 슬롯 '+(i+1)}</b><small>${b?'Lv.'+b.level:'+'}</small></div><div class="hab-art ${b?'':'empty'}">특화 건물 이미지</div>
 ${b?`<div class="hab-worker"><span>배치 ${b.workers}/${b.level}</span><div class="hab-wBtns"><button data-hsw="${i}" data-delta="-1" ${!b.workers?'disabled':''}>−</button><button data-hsw="${i}" data-delta="1" ${habFree(h)<1||b.workers>=b.level?'disabled':''}>+</button></div></div><div class="hab-sub-grid">${b.subs.map((v,j)=>`<div class="hab-sub" data-hsub="${i}" data-subindex="${j}"><div class="hab-sub-art">부속 이미지</div><span>${v?'부속 시설 설치됨':'＋ 부속 '+(j+1)}</span></div>`).join('')}</div><div class="hab-card-actions"><button data-hsremove="${i}">철거</button><button class="primary" data-hsexpand="${i}" ${b.level>=HAB_BALANCE.specialMaxLevel?'disabled':''}>${b.level>=HAB_BALANCE.specialMaxLevel?'최대 Lv.'+HAB_BALANCE.specialMaxLevel:'개별 확장 (Lv.'+b.level+'/'+HAB_BALANCE.specialMaxLevel+')'}</button></div>`:`<div class="hab-card-desc">6종 자원 중 하나를 선택해 생산</div><div class="hab-card-actions"><button class="primary" data-hsadd="${i}">건설</button></div>`}</article>`).join('');
 $('habExpandCommon').textContent=h.commonLevel>=HAB_BALANCE.commonMaxLevel?'최대 확장 (Lv.'+HAB_BALANCE.commonMaxLevel+')':'공용 구역 확장 (Lv.'+h.commonLevel+'/'+HAB_BALANCE.commonMaxLevel+')';$('habExpandCommon').disabled=h.commonLevel>=HAB_BALANCE.commonMaxLevel;
}
function chooseBuilding(title,opts,callback){modalKind='building';$('modalTitle').textContent=title;$('modalDesc').textContent='설치할 건물을 선택하세요.';
 const body=$('modalBody');body.replaceChildren();const list=document.createElement('div');list.className='stack';
 for(let o of opts){let btn=document.createElement('button');btn.className='slotRow';let lhs=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=o.name;small.textContent=o.desc||o.effects?.[0]||'';lhs.append(strong,small);btn.append(lhs);let icon=document.createElement('span');icon.textContent='선택';btn.append(icon);btn.onclick=()=>{callback(o);closeDialog();render()};list.append(btn)}body.append(list);$('overlay').classList.remove('hide');
}
$('habCommon').addEventListener('click',e=>{let b=e.target.closest('button');if(!b)return;let d=b.dataset,h=habitat(currentHab());
 if(d.hcw!==undefined){let item=h.common[+d.hcw],v=Number(d.delta),max=item.id==='center'?h.commonLevel:1;if(v>0&&(habFree(h)<1||item.workers>=max)||v<0&&item.workers<=0)return;item.workers+=v}
 else if(d.hadd!==undefined){let idx=+d.hadd;chooseBuilding('공용 건물 건설',HAB_COMMON,choice=>{h.common[idx]={id:choice.id,level:1,workers:0};dirty=true});return}
 else if(d.hup!==undefined){let item=h.common[+d.hup];if(item.level>=HAB_BALANCE.upgradeMaxLevel)return;item.level++}
 else if(d.hremove!==undefined){h.common[+d.hremove]=null}else return;
 dirty=true;render();
});
$('habSpecial').addEventListener('click',e=>{let el=e.target.closest('button,[data-hsub]');if(!el)return;let d=el.dataset,h=habitat(currentHab());
 if(d.hsadd!==undefined){let idx=+d.hsadd;chooseBuilding('특화 건물 건설',DATA.buildings.special,choice=>{h.special[idx]={id:choice.id,level:1,workers:0,subs:Array(HAB_BALANCE.subSlots).fill(false)};dirty=true});return}
 else if(d.hsw!==undefined){let item=h.special[+d.hsw],v=Number(d.delta);if(v>0&&(habFree(h)<1||item.workers>=item.level)||v<0&&item.workers<=0)return;item.workers+=v}
 else if(d.hsub!==undefined){let item=h.special[+d.hsub],i=+d.subindex;item.subs[i]=!item.subs[i]}
 else if(d.hsexpand!==undefined){let item=h.special[+d.hsexpand];if(item.level>=HAB_BALANCE.specialMaxLevel)return;item.level++}
 else if(d.hsremove!==undefined){h.special[+d.hsremove]=null}else return;
 dirty=true;render();
});
$('habExpandCommon').onclick=()=>{let h=habitat(currentHab());if(h.commonLevel>=HAB_BALANCE.commonMaxLevel)return;h.commonLevel++;h.common[0].level=h.commonLevel;dirty=true;render()};
