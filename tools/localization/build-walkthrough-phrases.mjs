// Build-time, conservative translations for repetitive walkthrough instructions.
// No network access, no translation of unknown clauses, no changes to source guide data.
import fs from 'node:fs';
import { GAME_TERMS } from '../../ui/js/game-terms.js';
const regions = ['kanto','johto','hoenn','sinnoh','unova'];
function translateGuideLine(input,terms){
  const source=input.trim();
  if(!source.endsWith(".")||/[?!;:]/.test(source)||source.includes("\n"))return null;
  const raw=source.slice(0,-1).trim().toLowerCase().replace(/\s+/g," ");
  const key=s=>s.normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^\p{L}\p{N}]/gu,"");
  const dir={north:["norte","北"],south:["sur","南"],east:["este","东"],west:["oeste","西"],"north east":["noreste","东北"],"north west":["noroeste","西北"],"south east":["sureste","东南"],"south west":["suroeste","西南"]};
  const dpat="north east|north west|south east|south west|north|south|east|west";
  const things={house:["la casa","房屋"],building:["el edificio","建筑"],room:["la habitación","房间"],cave:["la cueva","洞窟"],gym:["el Gimnasio","道馆"],door:["la puerta","门"],elevator:["el ascensor","电梯"],portal:["el portal","传送门"],hole:["el agujero","洞口"],pokecenter:["el Centro Pokémon","宝可梦中心"],pokemart:["la Tienda Pokémon","宝可梦商店"],laboratory:["el laboratorio","研究所"],grass:["la hierba","草丛"],water:["el agua","水域"],"next area":["la siguiente zona","下一区域"],"next room":["la siguiente habitación","下一个房间"]};
  const fixed={
    "go up the stairs":["Sube las escaleras","上楼梯"],"go down the stairs":["Baja las escaleras","下楼梯"],
    "go up the ladder":["Sube por la escalera de mano","爬上梯子"],"go down the ladder":["Baja por la escalera de mano","爬下梯子"],
    "follow the path":["Sigue el camino","沿路前进"],"dive out of the water":["Sal a la superficie usando Buceo","使用潜水浮出水面"],
    "dive in the water":["Usa Buceo en el agua","在水中使用潜水"],"smash a rock":["Rompe una roca con Golpe Roca","使用碎岩打碎一块岩石"],
    "cut the tree":["Corta el árbol con Corte","使用居合斩砍掉树"],"jump on a switch":["Salta sobre un interruptor","跳到一个开关上"],
    "talk to the girl":["Habla con la chica","与女孩交谈"],"talk to the guy":["Habla con el hombre","与男子交谈"],"talk to your rival":["Habla con tu rival","与劲敌交谈"],"talk to the gym guide":["Habla con el guía del Gimnasio","与道馆向导交谈"],
    "say yes":["Responde que sí","选择“是”"],"say no":["Responde que no","选择“否”"],
    "go on the right arrow":["Pisa la flecha de la derecha","踩上右边的箭头"],"go on the left arrow":["Pisa la flecha de la izquierda","踩上左边的箭头"],"go on the first arrow":["Pisa la primera flecha","踩上第一个箭头"],
    "go back to the first stairs":["Regresa a las primeras escaleras","返回第一处楼梯"],"go on the button":["Pisa el botón","踩上按钮"],"push a boulder":["Empuja una roca grande","推动一块巨石"],
    "click on the statue":["Interactúa con la estatua","调查雕像"],"avoid all the trainers":["Evita a todos los Entrenadores","避开所有训练家"],
    "go back to the first trainer":["Regresa al primer Entrenador","返回第一名训练家"],"go back to the parasol girl":["Regresa a la chica de la sombrilla","返回打伞的女孩处"],
    "sometimes its bugged and you wont get the item":["A veces hay un fallo y no recibes el objeto","有时会出现错误，导致无法获得该道具"]
  };
  function named(domain,value){const k=key(value),a=terms.es[domain]?.[k],b=terms.zh[domain]?.[k];return a&&b?[a,b]:null;}
  function place(v){const m=v.match(/^route (\d+)$/);if(m)return [`la Ruta ${m[1]}`,`${m[1]}号道路`];if(things[v])return things[v];return named("location",v);}
  function item(v){const aliases={parlyzheal:"paralyzeheal",paralysisheal:"paralyzeheal"};const move=v.match(/^(tm|hm)[- ](.+)$/);if(move){const n=named("move",move[2]);return n?[`${move[1]==="tm"?"MT":"MO"} ${n[0]}`,`${move[1]==="tm"?"招式学习器":"秘传学习器"}：${n[1]}`]:null;}return named("item",aliases[key(v)]||v);}
  function clause(v,depth=0){
    if(depth>6)return null;
    if(fixed[v])return fixed[v];
    let m;
    if(v.startsWith("now ")||v.startsWith("also ")){const a=clause(v.slice(v.indexOf(" ")+1),depth+1);if(a)return [(v.startsWith("now ")?"Ahora ":"También ")+a[0][0].toLowerCase()+a[0].slice(1),(v.startsWith("now ")?"现在":"另外")+a[1]];}
    if(v.includes(" and ")){const parts=v.split(/ and (?:then )?/);const pairs=parts.map(x=>clause(x,depth+1));if(pairs.every(Boolean))return [pairs.map(x=>x[0]).join(". "),pairs.map(x=>x[1]).join("。")];}
    m=v.match(/^(.*?) while avoiding (.+)$/);if(m){const a=clause(m[1],depth+1),b=clause("avoid "+m[2],depth+1);if(a&&b)return [`${a[0]}. ${b[0]} durante el trayecto`,`在途中${b[1][0].toLowerCase()+b[1].slice(1)}，${a[1]}`];}
    m=v.match(new RegExp(`^go (${dpat})(?: (all the way|as much as you can|a few steps))?$`));
    if(m){const d=dir[m[1]],tail=m[2];return [tail==="a few steps"?`Da unos pasos hacia el ${d[0]}`:`Ve hacia el ${d[0]}${tail?" hasta donde puedas":""}`,tail==="a few steps"?`向${d[1]}走几步`:tail==="as much as you can"?`尽量向${d[1]}走`:`向${d[1]}走${tail?"到尽头":""}`];}
    m=v.match(new RegExp(`^(?:go|walk) (\\d+) steps? (${dpat})$`));if(m)return [`Camina ${m[1]} ${m[1]==="1"?"paso":"pasos"} hacia el ${dir[m[2]][0]}`,`向${dir[m[2]][1]}走 ${m[1]} 步`];
    m=v.match(new RegExp(`^go (${dpat}) to (?:the )?(.+)$`));if(m){const d=dir[m[1]],p=place(m[2]);if(p)return [`Ve hacia el ${d[0]} hasta ${p[0]}`,`向${d[1]}前往${p[1]}`];const a=clause(m[2],depth+1);if(a&&/^fight /.test(m[2]))return [`Ve hacia el ${d[0]}. ${a[0]}`,`向${d[1]}走。${a[1]}`];}
    m=v.match(/^(go back to|go to|fly to) (?:the )?(.+)$/);if(m){const p=place(m[2]);if(p)return [`${m[1]==="fly to"?"Vuela a":m[1]==="go back to"?"Regresa a":"Ve a"} ${p[0]}`.replace(/\ba el\b/g,"al"),`${m[1]==="fly to"?"使用飞翔前往":m[1]==="go back to"?"返回":"前往"}${p[1]}`];}
    m=v.match(new RegExp(`^(enter|go in|exit|leave) the (.+?)(?: (${dpat}))?$`));if(m){const p=things[m[2]];if(p){const enter=m[1]==="enter"||m[1]==="go in",d=m[3]?dir[m[3]]:null;const verb=enter?(m[2]==="door"?"Pasa por":"Entra en"):"Sal de";return [`${verb} ${p[0]}${d?` ${p[0].startsWith("el ")?"situado":"situada"} al ${d[0]}`:""}`.replace(/\bde el\b/g,"del"),`${m[2]==="door"&&enter?"穿过":enter?"进入":"离开"}${d?d[1]+"边的":""}${p[1]}`];}}
    m=v.match(new RegExp(`^go in the house (${dpat}) (?:of|from) the (pokecenter|gym|pokemart)$`));if(m){const p=things[m[2]],d=dir[m[1]];return [`Entra en la casa al ${d[0]} de ${p[0]}`.replace(/\bde el\b/g,"del"),`进入${p[1]}${d[1]}边的房屋`];}
    m=v.match(new RegExp(`^go (up|down) the (stairs|ladder) (${dpat})$`));if(m){const d=dir[m[3]],up=m[1]==="up";return [`${up?"Sube":"Baja"} por ${m[2]==="stairs"?"las escaleras":"la escalera de mano"} del ${d[0]}`,`从${d[1]}边的${m[2]==="stairs"?"楼梯":"梯子"}${up?"上去":"下去"}`];}
    m=v.match(new RegExp(`^(slide|swim|surf) (${dpat})(?: (all the way))?$`));if(m){const d=dir[m[2]],verb=m[1];return [`${verb==="slide"?"Deslízate":verb==="swim"?"Nada":"Usa Surf"} hacia el ${d[0]}${m[3]?" hasta el final":""}`,`向${d[1]}${verb==="slide"?"滑行":verb==="swim"?"游泳":"冲浪"}${m[3]?"到尽头":""}`];}
    m=v.match(new RegExp(`^surf (${dpat}) to (?:the )?(.+)$`));if(m){const p=place(m[2]),d=dir[m[1]];if(p)return [`Usa Surf hacia el ${d[0]} hasta ${p[0]}`,`向${d[1]}冲浪前往${p[1]}`];}
    m=v.match(new RegExp(`^jump (${dpat}) on the ledge(?: (once|twice))?$`));if(m)return [`Salta el desnivel hacia el ${dir[m[1]][0]}${m[2]?m[2]==="once"?" una vez":" dos veces":""}`,`向${dir[m[1]][1]}跳下台阶${m[2]?m[2]==="once"?"一次":"两次":""}`];
    m=v.match(new RegExp(`^go on the arrow pointing (${dpat})$`));if(m)return [`Pisa la flecha que apunta al ${dir[m[1]][0]}`,`踩上指向${dir[m[1]][1]}方的箭头`];
    m=v.match(new RegExp(`^go (${dpat}) on the (first ice square|dragon head)$`));if(m)return [`Ve hacia el ${dir[m[1]][0]} por ${m[2]==="first ice square"?"la primera casilla de hielo":"la cabeza del dragón"}`,`向${dir[m[1]][1]}走到${m[2]==="first ice square"?"第一块冰面":"龙头"}`];
    m=v.match(new RegExp(`^push the (next )?boulder (${dpat})(?: (\\d+) (steps?|times?))?$`));if(m)return [`Empuja ${m[1]?"la siguiente":"la"} roca hacia el ${dir[m[2]][0]}${m[3]?` ${m[3]} ${m[4].startsWith("time")?m[3]==="1"?"vez":"veces":m[3]==="1"?"paso":"pasos"}`:""}`,`将${m[1]?"下一块":"这块"}巨石向${dir[m[2]][1]}推${m[3]?` ${m[3]} ${m[4].startsWith("time")?"次":"步"}`:""}`];
    m=v.match(/^go on the button (\d+) times?$/);if(m)return [`Pisa el botón ${m[1]} ${m[1]==="1"?"vez":"veces"}`,`踩按钮 ${m[1]} 次`];
    m=v.match(/^(fight|beat|avoid) (a|an|the|another|the next|the first|the second|the third|the 2nd|the 3rd|the \d+|the next \d+) (trainer|trainers|girl trainer|bug trainer|rocket trainer|gym leader|rival)$/);
    if(m){const action=m[1],q=m[2],kind=m[3],plural=kind==="trainers";
      const obj={trainer:["Entrenador","训练家"],trainers:["Entrenadores","训练家"],"girl trainer":["Entrenadora","女训练家"],"bug trainer":["Cazabichos","捕虫少年"],"rocket trainer":["recluta del Equipo Rocket","火箭队队员"],"gym leader":["líder del Gimnasio","道馆馆主"],rival:["rival","劲敌"]}[kind];
      const fem=kind==="girl trainer";let es,zh;
      if(q==="a"||q==="an"){es=(fem?"una ":"un ")+obj[0];zh="一名"+obj[1];}
      else if(q==="another"){es=(fem?"otra ":"otro ")+obj[0];zh="另一名"+obj[1];}
      else if(q==="the"){es=(plural?"los ":fem?"la ":"el ")+obj[0];zh=(plural?"这些":"该")+obj[1];}
      else if(q==="the next"){es=(fem?"la siguiente ":"el siguiente ")+obj[0];zh="下一名"+obj[1];}
      else if(["the first","the second","the third","the 2nd","the 3rd"].includes(q)){const n=q==="the first"?1:q==="the second"||q==="the 2nd"?2:3;es=(fem?"la ":"el ")+({1:fem?"primera":"primer",2:fem?"segunda":"segundo",3:fem?"tercera":"tercer"}[n])+" "+obj[0];zh=`第${/\d/.test(q)?" "+n+" ":["","一","二","三"][n]}名${obj[1]}`;}
      else{const num=q.match(/\d+/)?.[0];if(!num||!plural)return null;es=`los ${num}${q.includes("next")?" siguientes":""} ${obj[0]}`;zh=`${q.includes("next")?"接下来的":""}${num} 名${obj[1]}`;}
      return [`${action==="fight"?"Combate contra":action==="beat"?"Derrota a":"Evita a"} ${es}`.replace(/\ba el\b/g,"al"),`${action==="fight"?"与":action==="beat"?"击败":"避开"}${zh}${action==="fight"?"对战":""}`];}
    if(v==="fight your rival")return ["Combate contra tu rival","与劲敌对战"];if(v==="beat your rival")return ["Derrota a tu rival","击败劲敌"];
    m=v.match(/^follow the path to (fight .+)$/);if(m){const a=clause(m[1],depth+1);if(a)return ["Sigue el camino. "+a[0],"沿路前进。"+a[1]];}
    m=v.match(/^use (?:the move )?(cut|surf|strength|rock smash|rock climb|waterfall|dive|fly|flash|defog)(?: on the (northern|southern|eastern|western) side)?$/);
    if(m){const mv=named("move",m[1]);if(!mv)return null;const sd={northern:dir.north,southern:dir.south,eastern:dir.east,western:dir.west}[m[2]];return [`Usa ${mv[0]}${sd?` en el lado ${sd[0]}`:""}`,`${sd?`在${sd[1]}侧`:""}使用${mv[1]}`];}
    m=v.match(/^(pick|get) (?:up )?(a|an|the|x\d+|\d+) (hidden )?(.+?)(?: (in the grass|in a rock|in the tree|in a tree|on the ground|in a pokeball|in the wall))?$/);
    if(m){const n=item(m[4]);if(!n)return null;const count=/\d+/.test(m[2])?m[2].replace("x",""):"";const loc={"in the grass":["en la hierba","草丛中"],"in a rock":["en una roca","岩石中"],"in the tree":["en el árbol","树上"],"in a tree":["en un árbol","树上"],"on the ground":["en el suelo","地上"],"in a pokeball":["en una Poké Ball","精灵球中"],"in the wall":["en la pared","墙中"]}[m[5]];return [`${m[1]==="pick"?"Recoge":"Consigue"} ${count?count+" × ":""}${n[0]}${m[3]?" (objeto oculto)":""}${loc?" "+loc[0]:""}`,`${loc?"在"+loc[1]:""}${m[1]==="pick"?"拾取":"获得"}${m[3]?"隐藏的":""}${count?count+" × ":""}${n[1]}`];}
    m=v.match(/^talk to the gym guide to get a (.+)$/);if(m){const n=item(m[1]);if(n)return [`Habla con el guía del Gimnasio para conseguir ${n[0]}`,`与道馆向导交谈，领取${n[1]}`];}
    return null;
  }
  const pair=clause(raw);
  return pair?[pair[0]+".",pair[1]+"。"]:null;
}
function buildTranslations(guides,terms,manualIds){
  const out={},counts={};
  for(const guide of guides){let n=0;for(const step of guide.steps){
    if(manualIds.has(step.id)||step.text!==step.lines.join(" ")||!step.lines.length)continue;
    const pairs=step.lines.map(l=>translateGuideLine(l,terms));if(!pairs.every(Boolean))continue;
    const es=pairs.map(p=>p[0]).join(" "),zh=pairs.map(p=>p[1]).join("");
    const nums=s=>[...s.matchAll(/\d+/g)].map(m=>m[0]).join(",");
    if(nums(step.text)!==nums(es)||nums(step.text)!==nums(zh))continue;
    out[step.id]=[step.text_hash,es,zh];n++;
  }counts[guide.region]=n;}
  return {out,counts};
}
const manual = fs.readFileSync('ui/js/walkthrough-locales.js', 'utf8');
const manualIds = new Set([...manual.matchAll(/^\s*"([^"]+)": \[/gm)].map(m => m[1]));
const guides = regions.map(region => JSON.parse(fs.readFileSync('companion/data/walkthroughs/'+region+'.json','utf8')));
const {out,counts} = buildTranslations(guides,GAME_TERMS,manualIds);
const rendered = '// Generated bilingual walkthrough drafts. Rebuild with tools/localization/build-walkthrough-phrases.mjs.\n// Exact source IDs and hashes; unrecognized lines are not translated by this generator.\nexport const GENERATED_WALKTHROUGH_TEXT = {\n'+Object.entries(out).map(([k,v])=>'  '+JSON.stringify(k)+': '+JSON.stringify(v)+',').join('\n')+'\n};\n';
fs.writeFileSync('ui/js/walkthrough-generated.js',rendered);
console.log(JSON.stringify(counts));
