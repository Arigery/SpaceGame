import fs from 'node:fs';
import vm from 'node:vm';
const designSource=fs.readFileSync(new URL('../src/ship-designs.js',import.meta.url),'utf8');
export function validateCombat(data,research=null) {
  if(data.fleets?.maxCapacity!==50||Object.entries({corvette:1,escort:2,destroyer:3,heavy_cruiser:6,battleship:10}).some(([id,cost])=>data.fleets.classCosts?.[id]!==cost)||!Number.isInteger(data.fleets.maxCombatSteps)||data.fleets.maxCombatSteps<1)throw Error('Invalid fleet configuration');
  const ids=['corvette','escort','destroyer','heavy_cruiser','battleship'];
  const retreat=data.retreat;
  for(const key of ['shortSeconds','warpSeconds','playbackSpeed'])if(!Number.isFinite(retreat?.[key])||retreat[key]<=0)throw Error('Invalid retreat timing '+key);
  const bands=retreat.missingTurns;
  if(!Array.isArray(bands)||!bands.length||bands.at(-1).maxDistance!==null||bands.some((b,i)=>!Number.isInteger(b.turns)||b.turns<1||i<bands.length-1&&(!Number.isInteger(b.maxDistance)||b.maxDistance<=(i?bands[i-1].maxDistance:0))))throw Error('Invalid warp distance bands');
  for(const key of ['reviewSeconds','projectSeconds','lossThreshold','supportWeight','minimumShortArmorFraction'])if(!Number.isFinite(retreat.ai?.[key])||retreat.ai[key]<0)throw Error('Invalid AI retreat setting '+key);
  if(!retreat.ai.reviewSeconds||!retreat.ai.projectSeconds||retreat.ai.minimumShortArmorFraction>1)throw Error('Invalid AI retreat limits');
  const t=data.tactics;
  for(const id of ids){
    const order=t?.priorities?.[id];
    if(!Array.isArray(order)||order.length!==ids.length||new Set(order).size!==ids.length||order.some(target=>!ids.includes(target)))throw Error('Invalid tactical priorities '+id);
    if(!(t.preferredRange?.[id]>0&&t.preferredRange[id]<=1))throw Error('Invalid preferred range '+id);
  }
  for(const key of ['distanceScale','threatRangeFactor','escortDetectionRange','flankOffset','flankClearance'])if(!Number.isFinite(t[key])||t[key]<=0)throw Error('Invalid tactical setting '+key);
  for(const key of ['targetHoldSeconds','switchMargin','screenOffset','rearSpacing','formationSpacing'])if(!Number.isFinite(t[key])||t[key]<0)throw Error('Invalid tactical setting '+key);
  for(const key of ['priority','inRange','distance','immediateThreat','frontlineTank','screenThreat','escortPressure','flankAssist'])if(!Number.isFinite(t.weights?.[key])||t.weights[key]<0)throw Error('Invalid tactical weight '+key);
  for(const key of ['front','middle','rear'])if(!Number.isFinite(t.formationDepth?.[key])||t.formationDepth[key]<0)throw Error('Invalid formation depth '+key);
  if(data.version!==2||data.hulls?.length!==ids.length)throw Error('Invalid combat schema');
  for(const [i,h] of data.hulls.entries()) {
    if(h.id!==ids[i]||h.unlockOrder!==i+1||h.strategicAP!==2||!h.name||!h.role)throw Error('Invalid hull identity');
    if(!['front','middle','rear'].includes(h.line)||typeof h.light!=='boolean')throw Error('Invalid hull role');
    for(const k of ['armor','shield','damage','secondsPerShot','speed','range'])if(!Number.isFinite(h.benchmark[k])||h.benchmark[k]<=0)throw Error('Invalid benchmark '+k);
    if(h.slots.reactor!==1||h.slots.engine!==1||h.slots.weapon!==[2,2,3,4,5][i]||h.slots.defense!==h.slots.weapon)throw Error('Invalid slots');
    for(const k of ['accuracy','evasion'])if(!Number.isFinite(h.base[k])||h.base[k]<0||h.base[k]>1)throw Error('Invalid probability');
    for(const k of ['stealth','intercept','drawFire'])if(typeof h.abilities[k]!=='boolean')throw Error('Invalid ability');
  }
  for(const k of ['stealthDetectionRange','interceptRadius','tauntRadius','lightDamageMultiplier','minimumHitChance','maximumHitChance','initialSeparation','stepSeconds','speedUnitsPerSecond','baseHitChance','shieldRecoveryPerTurn'])if(!Number.isFinite(data.rules[k])||data.rules[k]<=0)throw Error('Invalid combat rule '+k);
  const moduleIds=new Set();
  const amounts=obj=>{if(!obj||typeof obj!=='object')throw Error('Missing costs');for(const [r,n] of Object.entries(obj))if(!['alloy','mineral','energy'].includes(r)||!Number.isFinite(n)||n<0)throw Error('Invalid costs');};
  for(const h of data.hulls){amounts(h.buildCost);amounts(h.upkeep);for(const k of ['armor','shield','speed','evasion','accuracy'])if(!Number.isFinite(h.base[k])||h.base[k]<0)throw Error('Invalid base');}
  for(const m of data.modules){
    if(!m.id||moduleIds.has(m.id)||!ids.includes(m.hullId)||!['reactor','engine','weapon','defense'].includes(m.kind)||!Number.isFinite(m.powerDraw)||m.powerDraw<0)throw Error('Invalid module');
    moduleIds.add(m.id);amounts(m.buildCost);amounts(m.upkeep);
    for(const [key,value] of Object.entries(m.stats))if(key!=='damageType'&&(!Number.isFinite(value)||value<0))throw Error('Invalid module stats');
    const required={reactor:['powerOutput'],engine:['speed','evasion'],weapon:['damage','secondsPerShot','range'],defense:[]}[m.kind];
    for(const key of required)if(!Number.isFinite(m.stats[key])||m.stats[key]<=0)throw Error('Missing module stat');
    if(m.kind==='defense'&&!(m.stats.armor>0||m.stats.shield>0))throw Error('Invalid defense');
    if(m.kind==='weapon'&&!['energy','kinetic'].includes(m.stats.damageType))throw Error('Invalid weapon type');
  }
  for(const type of ['energy','kinetic'])for(const layer of ['armor','shield'])if(!(data.damageModifiers[type]?.[layer]>0))throw Error('Invalid damage multiplier');
  if(!Number.isInteger(data.shipyards?.buildTurns)||data.shipyards.buildTurns<1||!(data.shipyards.repairCostFraction>0)||!(data.shipyards.minimumRepairCost>0)||!(data.shipyards.minimumRepairTurns>0))throw Error('Invalid shipyard');
  amounts(data.shipyards.cost);
  if(research)for(const item of [...data.hulls,...data.modules])if(item.requiredResearch&&!research.technologies.some(t=>t.id===item.requiredResearch&&t.nodeType==='research'))throw Error('Missing military research');
  const context=vm.createContext({DATA:{combat:data}});
  vm.runInContext(designSource,context);
  if(data.defaultDesigns.length!==5||new Set(data.defaultDesigns.map(d=>d.id)).size!==5)throw Error('Invalid defaults');
  for(const h of data.hulls){
    if(!Number.isInteger(h.buildTurns)||h.buildTurns<1)throw Error('Invalid build turns');
    const d=data.defaultDesigns.find(d=>d.hullId===h.id);if(!d)throw Error('Missing default');
    context.design=d;const a=vm.runInContext('assembleShipDesign(design)',context);
    if(Math.abs(a.buildCost.alloy-h.economyBenchmark.alloy)>1e-4||Math.abs(a.upkeep.energy-h.economyBenchmark.energyUpkeep)>1e-4||Math.abs(a.upkeep.alloy-h.economyBenchmark.alloyUpkeep)>1e-4)throw Error('Economy benchmark mismatch');
    for(const k of ['armor','shield','evasion','speed'])if(Math.abs(a[k]-h.benchmark[k])>1e-8)throw Error('Benchmark mismatch '+k);
    if(Math.abs(a.weapons.reduce((n,w)=>n+w.damage,0)-h.benchmark.damage)>1e-8||a.weapons.some(w=>w.range!==h.benchmark.range||w.secondsPerShot!==h.benchmark.secondsPerShot))throw Error('Weapon benchmark mismatch');
  }
  if(data.rules.baseHitChance>1||data.rules.shieldRecoveryPerTurn>1)throw Error('Invalid combat probability');
  if(data.rules.minimumHitChance>data.rules.maximumHitChance||data.rules.maximumHitChance>1)throw Error('Invalid hit bounds');
}
