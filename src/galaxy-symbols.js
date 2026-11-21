function galaxyGlowDefs(id){
 return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#fff9e8" stop-opacity=".95"/><stop offset=".24" stop-color="#bcdced" stop-opacity=".45"/><stop offset="1" stop-color="#87b9e0" stop-opacity="0"/></radialGradient></defs>`;
}
function galaxyLane(from,to,connected){
 return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${connected?'#6cc8b1':'#425975'}" stroke-width="${connected?2.5:1.5}" opacity=".8"/>`;
}
function galaxyMoveHalo({x,y}){
 return `<circle cx="${x}" cy="${y}" r="25" fill="#50c6b91a" stroke="#65eab0" stroke-width="2" stroke-dasharray="5 3"/>`;
}
function galaxyHabitableMarker({x,y},count){
 if(!count)return '';
 return `<g class="habitable-marker"><title>거주 가능 행성 ${count}개</title><circle cx="${x-28}" cy="${y}" r="9" fill="#102b3c" stroke="#9cd5d9" stroke-width="1"/><image href="assets/icons/habitable.svg" x="${x-35}" y="${y-7}" width="14" height="14"/>${count>1?`<text x="${x-34}" y="${y+19}" fill="#9be5ff" font-size="9">${count}</text>`:''}</g>`;
}
function galaxySystemSymbol({x,y},name,{owned=false,surveyed=false,hostile=false,glow='systemGlow',labelWidth=72}={}){
 const tone=hostile?'#efa991':owned?'#e8ca8e':surveyed?'#a9daee':'#c7d3e3';
 const border=hostile?'#b58272':owned?'#bfa77a':'#536377';
 return `<g class="system-emblem" style="color:${tone}" pointer-events="none"><circle cx="${x}" cy="${y}" r="${owned?23:18}" fill="url(#${glow})" opacity=".7"/><circle cx="${x}" cy="${y}" r="${owned?18:13}" fill="none" stroke="currentColor" stroke-width=".6" opacity=".5"/><path d="M${x-16} ${y}h32M${x} ${y-16}v32" stroke="currentColor" stroke-width=".6" opacity=".45"/><circle cx="${x}" cy="${y}" r="${owned?5:3.7}" fill="${hostile?'#ffd4b7':'#fff5db'}"/><circle cx="${x}" cy="${y}" r="2" fill="white"/></g>`+
  `<rect x="${x-labelWidth/2}" y="${y+18}" width="${labelWidth}" height="18" rx="4" fill="#0b1420b0" stroke="${border}" stroke-width=".5"/>`+
  `<text x="${x}" y="${y+30}" fill="#d8e1e9" font-size="11" text-anchor="middle">${safeText(name)}</text>`;
}
function galaxyFleetGlyph(color,stroke='#d7b971'){
 return `<path d="M0 -7L7 5H-7Z" fill="${color}" stroke="${stroke}" stroke-width="1"/>`;
}
function galaxyCivilianShipSymbol(ship,x,y,selected){
 const body=ship==='colony'?`<path class="shipbody" d="M${x} ${y-10} l6 6 1 5 4 6 -8 -2 -3 4 -3 -4 -8 2 4 -6 1 -5Z" fill="#d2c3ee" stroke="#9e8bbf" stroke-width="1"/>`:
  `<path class="shipbody" d="M${x} ${y-11} l4 12 6 7 -9 -4 -1 5 -1 -5 -9 4 6 -7Z" fill="#b5e6fa" stroke="#82b8d2" stroke-width="1"/>`;
 return `<g class="shiphit ${selected?'selected':''}" data-ship="${ship}" transform="translate(${x} ${y}) scale(0.55) translate(${-x} ${-y})" role="button" aria-label="${shipName(ship)} 선택"><circle cx="${x}" cy="${y}" r="15" fill="${selected?'#385b69':'#192d45'}" stroke="${selected?'#ffdf8c':'#537b9f'}" stroke-width="1.5"/>${body}</g>`;
}
function galaxyCorpsGlyph(color){
 return `<path d="M-11 8V-3L0 -10L11 -3V8Z" fill="none" stroke="${color}"/><path d="M0 -5L5 0H-5Z M0 1L5 6H-5Z" fill="${color}"/>`;
}
