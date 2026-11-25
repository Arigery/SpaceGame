function resourceIcon(id,label=''){
 return `<img class="resource-icon" src="assets/icons/${id}.svg" alt="${safeText(label)}"${label?'':' aria-hidden="true"'}>`;
}

function resourceAmountMarkup(id,amount){
 const name=Object.hasOwn(DATA.resources,id)?DATA.resources[id]:null;
 const value=amount===null?'미정':typeof amount==='number'?amount.toLocaleString('ko-KR',{maximumFractionDigits:4}):amount;
 return `<span class="resource-amount"${name?` title="${safeText(name)}"`:''}>${name?resourceIcon(id,name):safeText(id)+' '}${safeText(value)}</span>`;
}

function resourceAmountsMarkup(amounts,empty='없음'){
 const items=Object.entries(amounts??{}).map(([id,amount])=>resourceAmountMarkup(id,amount));
 return items.length?`<span class="resource-amounts">${items.join('')}</span>`:empty;
}

function orbitalRequirement(markup,met){
 return `<span class="orbital-requirement${met?'':' unmet'}">${markup}${met?'':'<span class="orbital-requirement-status"> 미충족</span>'}</span>`;
}

function orbitalResourceRequirements(game,cost,exact=false){
 return Object.entries(cost).map(([id,amount])=>orbitalRequirement(resourceAmountMarkup(id,amount),
  exact?(game.res[id]??0)>=amount:canPayMilitaryCost(game,{[id]:amount}))).join('');
}
