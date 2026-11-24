import { validateCombat } from './validate-combat.mjs';
import fs from 'node:fs';
import { validateResearch } from './validate-research.mjs';
import { validateHabitableEvents } from './validate-habitable-events.mjs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const militaryShipModels = {
  corvette: 'NX02_style_corvette.glb',
  escort: 'NX02_Escort_Reference_Style.glb',
  destroyer: 'NX02_Destroyer_V4_Broader.glb',
  heavy_cruiser: 'NX02_Heavy_Cruiser_V5_Blunt.glb',
  battleship: 'NX02_Battleship_V5_Integrated_Hull.glb',
};
export const sourceFiles = ['state.js', 'shortages.js', 'resource-ui.js', 'galaxy-symbols.js', 'gateways.js', 'ship-designs.js', 'combat.js', 'fleets.js', 'retreat.js', 'scout-danger.js', 'battle-scene.js', 'battle-ui.js', 'battle-test.js', 'battle-test-ui.js', 'shipyards.js', 'shipyard-ui.js', 'fleet-workspace.js', 'fleet-ui.js', 'ship-designer-ui.js', 'galaxy.js', 'research.js', 'research-ui.js', 'habitat.js', 'construction.js', 'exploration.js', 'chains.js', 'wonders.js', 'relics.js', 'habitable-events.js', 'habitat-ui.js', 'simulation.js', 'map-ui.js', 'input.js', 'models.js', 'presentation.js', 'tutorial.js', 'command-ui.js', 'saves-menu.js'];
export function readData() {
  const data = Object.fromEntries(['resources', 'planets', 'map', 'buildings', 'balance', 'exploration', 'habitableEvents', 'habitableStories', 'research', 'combat'].map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'))]));
  const ids = Object.keys(data.resources);
  if (ids.join(',') !== 'energy,mineral,food,consumer,alloy,research') throw Error('v13 resource IDs and order must be preserved for save compatibility.');
  const allIds = new Set();
  for (const b of data.buildings.common) {
    if (!b.id || !b.name || allIds.has(b.id)) throw Error('Missing/duplicate common building ID: ' + b.id);
    allIds.add(b.id);
  }
  for (const id of ['house', 'medical', ...['consumer','mineral','energy','food'].map(r=>'admin_'+r), ...ids.map(r=>'log_'+r)]) {
    if (!allIds.has(id)) throw Error('Missing v13 building: ' + id);
  }
  if (data.buildings.special.map(b=>b.id).join(',') !== ids.join(',')) throw Error('Special buildings must match resource IDs.');
  for (const b of data.buildings.special) {
    if (!Number.isFinite(b.productionPerWorker) || b.productionPerWorker < 0) throw Error('Invalid production: ' + b.id);
  }
  for (const id of ['hab','mineral','gas','barren']) if (!data.planets[id]?.name) throw Error('Missing planet type: '+id);
  for (const id of ['mineral','gas']) {
    const p=data.planets[id];
    if (!ids.includes(p.resource) || !Number.isInteger(p.maxLevel) || p.maxLevel<1 || !(p.productionPerLevel>=0)) throw Error('Invalid facility: '+id);
    for(let level=1;level<=p.maxLevel;level++)if(!Number.isInteger(p.levels?.[level]?.constructionTurns)||p.levels[level].constructionTurns<1)throw Error('Invalid facility timer: '+id+'/'+level);
  }
  for (const id of ids) if (!Number.isFinite(data.balance.initialResources[id]) || data.balance.initialResources[id]<0) throw Error('Invalid initial resource: '+id);
  const shortage=data.balance.shortages;
  if(!Number.isInteger(shortage?.stage2StartsOn)||shortage.stage2StartsOn<2||!Number.isInteger(shortage.stage2Duration)||shortage.stage2Duration<1||
   Object.keys(shortage.resources??{}).sort().join()!==ids.filter(id=>id!=='research').sort().join())throw Error('Invalid shortage timing or resource coverage');
  const shortageEffects=['buildingProduction','shipCombat','energyConsumption','populationGrowth','consumerConsumption','researchProduction','foodConsumption','mineralMaintenance'];
  for(const rule of Object.values(shortage.resources))for(const stage of [rule.stage1,rule.stage2]){
   if(!stage||typeof stage!=='object'||Array.isArray(stage)||Object.entries(stage).some(([key,value])=>!shortageEffects.includes(key)||!Number.isFinite(value)||value<0||value>=1))throw Error('Invalid shortage effect');
  }
  const m=data.map;
  for (const key of ['STAR_COUNT','PLACEMENT_ATTEMPTS','MAX_EDGES','START_MIN_EDGES']) if (!Number.isInteger(m[key]) || m[key]<1) throw Error('Invalid map value: '+key);
  for (const key of ['HAB_CHANCES','GENERAL_CHANCES']) if (!Array.isArray(m[key]) || m[key].length!==3 || m[key].some(v=>!Number.isFinite(v)||v<0) || Math.abs(m[key].reduce((a,b)=>a+b,0)-1)>1e-9) throw Error('Probabilities must sum to 1: '+key);
  const amounts=(values,label,nullable=false)=>{
    if(!values||typeof values!=='object')throw Error('Missing '+label);
    for(const [r,n] of Object.entries(values))if(!ids.includes(r)||!(nullable&&n===null)&&(!Number.isFinite(n)||n<0))throw Error('Invalid '+label+': '+r);
  };
  const work=(spec,label)=>{amounts(spec.cost,label+' cost');if(!Number.isFinite(spec.productionRequired)||spec.productionRequired<=0)throw Error('Invalid work: '+label)};
  for(const b of [...data.buildings.common,...data.buildings.special]){
    work(b,b.id);amounts(b.upkeep,b.id+' upkeep',true);
    if(b.upkeepPerWorker)amounts(b.upkeepPerWorker,b.id+' upkeep per worker');
    if(b.inputsPerOutput)amounts(b.inputsPerOutput,b.id+' inputs per output');
    for(const [level,spec] of Object.entries(b.upgrades||{})){work(spec,b.id+'/'+level);amounts(spec.upkeep,b.id+'/'+level+' upkeep',true)}
  }
  amounts(data.buildings.center.upkeep,'center upkeep',true);
  for(const [level,spec] of Object.entries(data.buildings.specialUpgrades))work(spec,'special/'+level);
  work(data.buildings.subfacility,'subfacility');
  const subSlots=data.buildings.subfacility.slots;
  if(!Array.isArray(subSlots)||subSlots.length!==data.balance.habitat.subSlots)throw Error('Invalid subfacility slot count');
  for(const [index,slot] of subSlots.entries())if(slot.tier!==index+1||!Number.isFinite(slot.productionBonus)||slot.productionBonus<0)throw Error('Invalid subfacility tier/bonus: '+index);
  for(const type of ['mineral','gas'])for(const spec of Object.values(data.planets[type].levels)){amounts(spec.cost,type+' cost');amounts(spec.upkeep,type+' upkeep',true)}
  for(const n of Object.values(data.buildings.commonExpansion))if(!Number.isFinite(n)||n<=0)throw Error('Invalid expansion factor');
  for(const key of ['initialPopulation','colonyPopulation'])if(!Number.isInteger(data.balance.habitat[key])||data.balance.habitat[key]<1)throw Error('Invalid population: '+key);
  const appearance=data.balance.planetAppearance;
  for(const size of ['small','medium','large']){
    if(!(appearance?.sizeScales[size]>0))throw Error('Invalid planet size: '+size);
    for(const type of ['hab','gas','mineral','barren'])if(!(appearance.rotationMinutes[type]?.[size]>0))throw Error('Invalid rotation period: '+type+'/'+size);
  }
  for(const key of ['orbitMinutes','orbitRadius','orbitFlattening'])if(!Number.isFinite(data.balance.stationAppearance?.[key])||data.balance.stationAppearance[key]<=0)throw Error('Invalid station orbit: '+key);
  const exploration=data.exploration;
  for(const rates of [exploration.rates,exploration.outcomeRates,exploration.barrenOutcomeRates])if(Object.values(rates).some(n=>!Number.isFinite(n)||n<0)||Math.abs(Object.values(rates).reduce((a,b)=>a+b,0)-1)>1e-9)throw Error('Invalid exploration ratios');
  if(!Number.isFinite(exploration.habitableChance)||exploration.habitableChance<0||exploration.habitableChance>1||Object.keys(exploration.rates).sort().join(',')!=='anomaly,normal,rare')throw Error('Invalid split exploration probabilities');
  if(!Number.isFinite(exploration.signalChance)||exploration.signalChance<0||exploration.signalChance>1)throw Error('Invalid signal chance');
  if(!Number.isFinite(exploration.signalChanceAfterResearch)||exploration.signalChanceAfterResearch<exploration.signalChance||exploration.signalChanceAfterResearch>1)throw Error('Invalid upgraded signal chance');
  const eventIds=new Set();
  for(const event of [...exploration.events,...data.habitableEvents.events]){
    if(event.scoutDanger===undefined)continue;
    const danger=event.scoutDanger;
    if(!['fauna','hazard'].includes(danger?.kind)||typeof danger.description!=='string'||!danger.description.trim())throw Error('Invalid scout danger: '+(event.id??event.event_id));
  }
  const expansion=exploration.anomalyExpansion;
  if(!(expansion?.share>=0&&expansion.share<=1)||typeof expansion.destructionEnabled!=='boolean'||
     !['hostileCap','destructionCap','clueDistance','clearResearchReward'].every(key=>Number.isInteger(expansion[key])&&expansion[key]>0)||
     !data.combat.defaultDesigns.some(design=>design.id===expansion.defenderDesign))throw Error('Invalid anomaly expansion rules');
  for(const weights of [expansion.weights,expansion.fallbackWeights])if(Object.values(weights).some(weight=>!Number.isFinite(weight)||weight<0)||
     Math.abs(Object.values(weights).reduce((sum,weight)=>sum+weight,0)-1)>1e-9)throw Error('Invalid anomaly expansion weights');
  for(const event of expansion.events)if(!Object.hasOwn(expansion.weights,event.group)||event.tone==='choice'||event.planet==='barren'&&event.group!=='positive')
    throw Error('Invalid expanded anomaly group: '+event.id);
  for(const e of [...exploration.events,...expansion.events]){
    if(eventIds.has(e.id)||!['mineral','gas','barren'].includes(e.planet)||!['positive','negative','choice'].includes(e.tone)||!e.title||!e.description||e.options.length!==(e.tone==='choice'?2:1))throw Error('Invalid exploration event: '+e.id);
    eventIds.add(e.id);
    for(const option of e.options)for(const effect of option.effects){
      if(!['resource','production','temporaryProduction','construction','actionPoints','clue','automaticClue','scoutDisabled','hostileDefense','scoutDestroyed'].includes(effect.kind))throw Error('Invalid exploration effect');
      if(effect.kind==='resource'&&(!ids.includes(effect.resource)||!Number.isFinite(effect.amount)||effect.amount<0&&e.group!=='negative'))throw Error('Invalid event reward');
      if(effect.kind==='automaticClue'&&(!Number.isInteger(effect.fallbackResearch)||effect.fallbackResearch<0))throw Error('Invalid anomaly clue fallback');
      if(effect.kind==='hostileDefense'&&(e.group!=='hostile'||!effect.name))throw Error('Invalid anomaly defender');
      if(effect.kind==='scoutDestroyed'&&e.group!=='destruction')throw Error('Invalid anomaly destruction');
      if(['production','temporaryProduction','actionPoints'].includes(effect.kind)&&(!Number.isFinite(effect.amount)||effect.amount < (effect.kind==='temporaryProduction'?-1:0)))throw Error('Invalid event modifier');
      if(['construction','temporaryProduction'].includes(effect.kind)&&(!Number.isInteger(effect.turns)||effect.turns<1))throw Error('Invalid event duration');
    }
  }
  for(const planet of ['mineral','gas','barren'])for(const tone of (planet==='barren'?['positive','choice']:['positive','negative','choice']))if(!exploration.events.some(e=>!e.retired&&e.planet===planet&&e.tone===tone))throw Error('Missing exploration category');
  if(Object.keys(exploration.barrenOutcomeRates).sort().join(',')!=='choice,positive'||exploration.events.some(e=>!e.retired&&e.planet==='barren'&&e.tone==='negative'))throw Error('Barren events cannot be negative');
  const chains=exploration.chains;
  if(chains?.events?.length!==5||!Number.isInteger(chains.minDistance)||!Number.isInteger(chains.maxDistance)||chains.minDistance<1||chains.minDistance>chains.maxDistance||
     new Set(chains.events.map(event=>event.id)).size!==chains.events.length)throw Error('Invalid survey chains');
  for(const event of chains.events){
    if(!event.title||event.steps?.length!==3||event.steps.some(label=>!label)||
       event.finalPlanet&&!['mineral','gas','hab'].includes(event.finalPlanet)||
       event.branchCount!==undefined&&event.branchCount!==2||!event.rewards?.length||event.rewards.length>2)throw Error('Invalid survey chain: '+event.id);
    for(const reward of event.rewards)if(reward.resources)amounts(reward.resources,event.id+' reward');
  }
  for(const role of ['scout','colony']){
    const ship=data.balance.civilianProduction?.[role];
    if(!ship?.name||!Number.isInteger(ship.turns)||ship.turns<1)throw Error('Invalid civilian build: '+role);
    amounts(ship.cost,role+' cost');
  }
  validateHabitableEvents(data.habitableEvents,ids);
  const storyIds=new Set();
  for(const story of data.habitableStories.stories){
    if(storyIds.has(story.event_id)||!data.habitableEvents.events.some(e=>e.event_id===story.event_id)||['story_intro','route_a_story','route_b_story'].some(k=>typeof story[k]!=='string'||!story[k].trim()))throw Error('Invalid habitat story: '+story.event_id);
    storyIds.add(story.event_id);
  }
  if(storyIds.size!==data.habitableEvents.events.length)throw Error('Missing habitat story');
  if(data.habitableStories.biomes.length!==5||new Set(data.habitableStories.biomes).size!==5||data.habitableEvents.events.some(e=>e.biome!=='공통'&&!data.habitableStories.biomes.includes(e.biome)))throw Error('Invalid habitat biomes');
  validateResearch(data.research,data.buildings);
  const gateway=data.balance.gateways;
  amounts(gateway.constructionCost,'gateway construction');
  amounts(gateway.upkeep,'gateway upkeep');
  const gatewayTech=data.research.technologies.find(tech=>tech.id===gateway.researchId);
  if(gatewayTech?.field!=='exp'||gatewayTech.era!==4||gatewayTech.nodeType!=='research'||
     !['siteCount','minimumPopulation','minimumCommonLevel','constructionTurns','travelCost','victoryCount','victoryTurns'].every(key=>Number.isInteger(gateway[key])&&gateway[key]>0)||
     gateway.victoryCount>gateway.siteCount||gateway.siteCount>=m.STAR_COUNT)throw Error('Invalid gateway balance or research');
  validateCombat(data.combat,data.research);
  const wonders=data.balance.regionalWonders;
  if(!wonders||!['minimumStartDistance','minimumSize','maximumSize','discoveryResearch'].every(key=>Number.isInteger(wonders[key])&&wonders[key]>0)||
     wonders.minimumSize>wonders.maximumSize||Object.keys(wonders.types??{}).join()!=='WON_01,WON_02,WON_03,WON_04')throw Error('Invalid regional wonders');
  for(const wonder of Object.values(wonders.types)){
    if(!wonder.name||wonder.planet&&(!Object.hasOwn(data.planets,wonder.planet)||!Number.isInteger(wonder.minimumSystems)||wonder.minimumSystems>wonders.maximumSize)||
       Object.entries(wonder).some(([key,value])=>!['name','planet'].includes(key)&&(!Number.isFinite(value)||value<0)))throw Error('Invalid regional wonder effect');
  }
  const relics=exploration.relics;
  if(relics?.types?.length!==m.RELIC_COUNT||new Set(relics.types.map(type=>type.id)).size!==relics.types.length||
     !Number.isInteger(relics.advancedCount)||relics.advancedCount<1||!Number.isInteger(relics.scienceGoal)||relics.scienceGoal<1||
     relics.scienceGoal>m.RELIC_COUNT-relics.advancedCount||
     ![relics.standardResearch,relics.advancedResearch].every(id=>data.research.technologies.some(tech=>tech.id===id&&tech.nodeType==='research')))
    throw Error('Invalid ancient relic research');
  for(const type of relics.types)if(!type.id||!type.name||!Number.isFinite(type.amount)||type.amount<=0||
     !(type.kind==='production'&&ids.includes(type.target)||['growth','shipbuilding'].includes(type.kind)&&type.target===''))
    throw Error('Invalid ancient relic effect: '+type.id);
  return data;
}
export function bundle(data=readData()) {
  return '// GENERATED by npm run build. Edit src/, styles/ and data/ instead.\n' +
    "(()=>{'use strict';\nconst DATA="+JSON.stringify(data)+';\n'+
    '\nconst SHIP_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/ships/exploration_ship_NX02.glb')).toString('base64'))+';\n'+
    '\nconst COLONY_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/ships/space_colony_ship.glb')).toString('base64'))+';\n'+
    '\nconst MILITARY_GLB='+JSON.stringify(Object.fromEntries(Object.entries(militaryShipModels).map(([hull,name])=>[hull,fs.readFileSync(path.join(root,'assets/ships',name)).toString('base64')])))+';\n'+
    '\nconst STATION_GLB='+JSON.stringify(fs.readFileSync(path.join(root,'assets/stations/titanium_colony_station.glb')).toString('base64'))+';\n'+
    '\nconst CELESTIAL_GLB='+JSON.stringify(Object.fromEntries(Object.entries({sun:'golden_star',hab:'habitable_planet',gas:'gas_planet',mineral:'mineral_planet',barren:'barren_planet'}).map(([kind,name])=>[kind,fs.readFileSync(path.join(root,'assets/celestial',name+'.glb')).toString('base64')])))+';\n'+
    sourceFiles.map(name=>'\n// ---- src/'+name+' ----\n'+fs.readFileSync(path.join(root,'src',name),'utf8')).join('\n')+'\n})();\n';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output=bundle();
  new vm.Script(output, {filename:'game.js'});
  if(process.argv.includes('--check')){
    for(const name of sourceFiles)new vm.Script(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
    if(fs.readFileSync(path.join(root,'game.js'),'utf8')!==output)throw Error('game.js is stale. Run npm run build.');
    console.log('Source syntax, JSON data and generated game.js consistency checks passed.');
  }else{
    fs.writeFileSync(path.join(root,'game.js'),output);
    console.log('Built game.js from '+sourceFiles.length+' source files and 10 JSON files. Open index.html directly.');
  }
}
