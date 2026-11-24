import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { readData, root, sourceFiles } from './build.mjs';

const args=process.argv.slice(2);
const option=(name,fallback)=>args.find(arg=>arg.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const turns=Number(option('turns','30')),seed=option('seed','shortage-test-v1');
const scenario=option('scenario','all'),verbose=args.includes('--verbose');
const population=Number(option('population','6'));
const baseData=readData();
const overrides=Object.fromEntries(option('stock','').split(',').filter(Boolean).map(pair=>{
  const [key,value,...extra]=pair.split(':');
  if(extra.length||!Object.hasOwn(baseData.resources,key)||value===undefined||!value.trim()||!Number.isFinite(Number(value))||Number(value)<0){
    throw Error('Use --stock=energy:0,mineral:20');
  }
  return [key,Number(value)];
}));
if(!Number.isSafeInteger(turns)||turns<1||!['all','normal','recover','ignore'].includes(scenario))throw Error('Invalid --turns or --scenario');
if(!Number.isSafeInteger(population)||population<3)throw Error('Invalid --population (minimum 3)');

const gameplaySources=new Set([
  'state','shortages','gateways','ship-designs','combat','fleets','retreat','scout-danger','shipyards','galaxy',
  'research','habitat','construction','exploration','chains','wonders','relics','habitable-events','simulation',
]);
const sources=sourceFiles.filter(file=>gameplaySources.has(file.slice(0,-3)))
  .map(file=>[file,fs.readFileSync(path.join(root,'src',file),'utf8')]);
const modes=scenario==='all'?['normal','recover','ignore']:[scenario];
for(const mode of modes){
  const rates=mode==='normal'?[baseData.balance.shortages.resources.energy.stage1.buildingProduction]:
    [...new Set([baseData.balance.shortages.resources.energy.stage1.buildingProduction,.1])];
  for(const rate of rates){
    const DATA=structuredClone(baseData);
    DATA.balance.shortages.resources.energy.stage1.buildingProduction=rate;
    const context=vm.createContext({DATA,mode,turns,seed,overrides,rate,population});
    for(const [filename,source] of sources)vm.runInContext(source,context,{filename});
    vm.runInContext('var tutorial=false,motionBusy=false;var clearFleetSelection=()=>{},restoreEncounterView=()=>{},render=()=>{};',context);
    const result=vm.runInContext(`(()=>{
      const home=state=generate(seed);
      initializeExploration(home);initializeResearch(home);initializeShipDesigns(home);initializeShipyards(home);
      createStartingMilitaryFleet(home);
      const fleet=home.military.fleets[0],spec=militaryBuildSpec(home,'default_corvette');
      for(let i=0;i<16;i++){
        const ship=makeMilitaryShip(home,spec,0);
        home.military.ships.push(ship);fleet.shipIds.push(ship.id);
      }
      const p=home.stars[0].planets.find(p=>p.type==='hab'),h=habitat(p);
      h.pop=population;h.baseCap=Math.max(h.baseCap,population);
      for(const [index,id] of ['energy','alloy','research'].entries())h.special[index]={id,level:1,workers:1,subs:[false,false,false]};
      if(mode!=='normal')home.res.energy=0;
      Object.assign(home.res,overrides);
      const initial={...home.res},rows=[];
      let upgradeTurn=null;
      for(let turn=1;turn<=turns;turn++){
        if(mode!=='ignore'&&turn>=8&&!upgradeTurn&&startHabConstruction(p,'specialUpgrade',0,'energy'))upgradeTurn=turn;
        if(h.special[0].level===2)h.special[0].workers=2;
        if(!researchState().current){
          const tech=DATA.research.technologies.find(tech=>researchAvailable(tech.id));
          if(tech)startResearch(tech.id);
        }
        const details=resourceDetails(),totals=Object.fromEntries(Object.entries(details).map(([id,entry])=>[id,resourceTotals(entry)]));
        nextTurn();
        if(home.turn!==turn+1)throw Error('Turn was not completed');
        rows.push({turn,totals,stock:{...home.res},shortages:JSON.parse(JSON.stringify(home.shortages)),effects:shortageEffects(home)});
      }
      const production=Object.fromEntries(HAB_RESOURCES.map(id=>[id,Math.round(rows.reduce((sum,row)=>sum+row.totals[id].production,0)*10000)/10000]));
      const start=rows.findIndex(row=>row.shortages.energy?.consecutive);
      const recovered=start<0?null:rows.slice(start+1).find(row=>!row.shortages.energy?.consecutive)?.turn??null;
      const otherShortageTurns=Object.fromEntries(HAB_RESOURCES.filter(id=>id!=='energy'&&id!=='research')
        .map(id=>[id,rows.filter(row=>row.shortages[id]?.consecutive).length]));
      return {seed,mode,rate,turns,population,initial,upgradeTurn,production,firstShortage:start<0?null:rows[start].turn,
        stage2:rows.find(row=>row.shortages.energy?.remaining)?.turn??null,recovered,
        maxShipCombatPenalty:rows.reduce((max,row)=>Math.max(max,row.effects.shipCombat??0),0),otherShortageTurns,final:rows.at(-1),rows};
    })()`,context);
    const {rows,...summary}=result;
    console.log(JSON.stringify(verbose?{...summary,rows}:summary));
  }
}
