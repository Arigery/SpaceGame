/** Design: {id,name,hullId,slots:{reactor:string[],engine:string[],weapon:(string|null)[],defense:(string|null)[]}}.
 * Module values are additive; benchmarks are validation targets, never stat inputs.
 * Assemblies are immutable snapshots for combat units; editing a design cannot refit existing ships.
 */
const COMBAT_MODULES=new Map(DATA.combat.modules.map(m=>[m.id,m]));
function validateShipDesign(design){
 const errors=[],h=DATA.combat.hulls.find(h=>h.id===design?.hullId);
 if(!h)return ['알 수 없는 함체입니다.'];
 if(typeof design.id!=='string'||!design.id.trim()||typeof design.name!=='string'||!design.name.trim()||design.name.length>60)errors.push('설계 ID와 60자 이내 이름이 필요합니다.');
 let output=0,draw=0;
 for(const [kind,count] of Object.entries(h.slots)){
  const slots=design.slots?.[kind];
  if(!Array.isArray(slots)||slots.length!==count){errors.push(kind+' 슬롯 수가 맞지 않습니다.');continue}
  for(const id of slots){
   if(id===null&&['weapon','defense'].includes(kind))continue;
   const m=COMBAT_MODULES.get(id);
   if(!m||m.kind!==kind||m.hullId!==h.id){errors.push(kind+' 슬롯에 호환되지 않는 모듈입니다.');continue}
   output+=m.stats.powerOutput||0;draw+=m.powerDraw;
  }
 }
 if(Object.keys(design.slots||{}).some(k=>!Object.hasOwn(h.slots,k)))errors.push('알 수 없는 슬롯입니다.');
 if(draw>output)errors.push('전력 초과: '+draw+' / '+output);
 if(!design.slots?.weapon?.some(id=>COMBAT_MODULES.get(id)?.kind==='weapon'))errors.push('무기가 하나 이상 필요합니다.');
 return errors;
}
function assembleShipDesign(design){
 const errors=validateShipDesign(design);if(errors.length)throw Error(errors.join(' '));
 const h=DATA.combat.hulls.find(h=>h.id===design.hullId);
 const a={hullId:h.id,strategicAP:h.strategicAP,...h.base,powerOutput:0,powerDraw:0,weapons:[],buildCost:{...h.buildCost},upkeep:{...h.upkeep}};
 for(const id of Object.values(design.slots).flat()){
  if(id===null)continue;
  const m=COMBAT_MODULES.get(id);a.powerDraw+=m.powerDraw;
  for(const key of ['armor','shield','evasion','speed','powerOutput'])a[key]+=m.stats[key]||0;
  if(m.kind==='weapon')a.weapons.push({...m.stats,moduleId:id});
  for(const kind of ['buildCost','upkeep'])for(const [r,n] of Object.entries(m[kind]))a[kind][r]=(a[kind][r]||0)+n;
 }
 a.evasion=Math.min(1,a.evasion);
 for(const kind of ['buildCost','upkeep'])for(const r of Object.keys(a[kind]))a[kind][r]=Math.round(a[kind][r]*10000)/10000;
 return a;
}
function initializeShipDesigns(game){
 const existing=Array.isArray(game.shipDesigns)?game.shipDesigns:[];
 const seen=new Set();
 game.shipDesigns=existing.filter(d=>!validateShipDesign(d).length&&!seen.has(d.id)&&(seen.add(d.id),true));
 for(const d of DATA.combat.defaultDesigns)if(!seen.has(d.id))game.shipDesigns.push(JSON.parse(JSON.stringify(d)));
 game.shipDesignVersion=1;
}
function saveShipDesign(game,design){
 const errors=validateShipDesign(design);if(errors.length)throw Error(errors.join(' '));
 initializeShipDesigns(game);
 const copy=JSON.parse(JSON.stringify(design)),index=game.shipDesigns.findIndex(d=>d.id===design.id);
 if(index<0)game.shipDesigns.push(copy);else game.shipDesigns[index]=copy;
}
