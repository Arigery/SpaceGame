function shortageRules(){return DATA.balance.shortages}

function normalizedShortages(game){
 const rules=shortageRules(),active={};
 for(const id of Object.keys(rules.resources)){
  const entry=game.shortages?.[id];
  const consecutive=Number.isSafeInteger(entry?.consecutive)&&entry.consecutive>0?entry.consecutive:0;
  const remaining=Number.isSafeInteger(entry?.remaining)&&entry.remaining>0?
   Math.min(entry.remaining,rules.stage2Duration):0;
  if(consecutive||remaining)active[id]={consecutive,remaining};
 }
 return active;
}

function advanceResourceShortages(game,uncovered){
 const rules=shortageRules(),active=normalizedShortages(game);
 for(const id of Object.keys(rules.resources)){
  const previous=active[id];
  const consecutive=uncovered.has(id)?(previous?.consecutive??0)+1:0;
  const remaining=consecutive>=rules.stage2StartsOn?rules.stage2Duration:Math.max(0,(previous?.remaining??0)-1);
  if(consecutive||remaining)active[id]={consecutive,remaining};
  else delete active[id];
 }
 game.shortages=active;
}

function shortageEffects(game){
 const effects={};
 if(!game?.shortages)return effects;
 for(const [id,entry] of Object.entries(game.shortages)){
  const rule=shortageRules().resources[id];
  if(!rule)continue;
  for(const stage of [entry.consecutive>0&&rule.stage1,entry.remaining>0&&rule.stage2]){
   if(!stage)continue;
   for(const [effect,amount] of Object.entries(stage))effects[effect]=(effects[effect]??0)+amount;
  }
 }
 return effects;
}

function shortageCombatAssembly(ship,penalty){
 if(!penalty||ship.owner!=='player')return ship.assembly;
 const assembly=ship.assembly,ratio=Math.max(.01,1-penalty);
 return {...assembly,speed:assembly.speed*ratio,evasion:assembly.evasion*ratio,
  weapons:assembly.weapons.map(weapon=>({...weapon,damage:weapon.damage*ratio}))};
}

function shortageConsumptionRate(effects,resource,category){
 if(resource==='energy')return 1+(effects.energyConsumption??0);
 if(resource==='food')return 1+(effects.foodConsumption??0);
 if(resource==='consumer')return 1+(effects.consumerConsumption??0);
 if(resource==='mineral'&&['building','ship','shipyard'].includes(category))return 1+(effects.mineralMaintenance??0);
 return 1;
}
