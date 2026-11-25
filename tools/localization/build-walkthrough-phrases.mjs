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
    "talk to your dad": ["Habla con tu padre", "与爸爸交谈"],
    "talk to your mom": ["Habla con tu madre", "与妈妈交谈"],
    "talk to the first girl that you see": ["Habla con la primera chica que veas", "和你看到的第一个女孩交谈"],
    "avoid all the other trainers": ["Evita a todos los demás Entrenadores", "避开其他所有训练家"],
    "avoid all trainers": ["Evita a todos los Entrenadores", "避开所有训练家"],
    "follow the path to the next tree you can cut": ["Sigue el camino hasta el siguiente árbol que puedas cortar", "沿路走到下一棵可以砍掉的树旁"],
    "follow the path until you see stairs to your right": ["Sigue el camino hasta ver unas escaleras a tu derecha", "沿路走到右手边出现楼梯为止"],
    "smash a rock": ["Usa Golpe Roca en una roca", "对一块岩石使用碎岩"],
    "cut a tree": ["Usa Corte en un árbol", "对一棵树使用居合斩"],
    "dive out of the water": ["Usa Buceo para salir a la superficie", "使用潜水浮出水面"],
    "dive in the water": ["Usa Buceo para sumergirte", "使用潜水下潜"],
    "go in the southern most wave": ["Entra en la corriente situada más al sur", "进入最南侧的水流"],
    "go west in the wave": ["Ve hacia el oeste por la corriente", "沿水流向西走"],
    "go on the button": ["Pisa el botón", "踩上按钮"],
    "go upstairs": ["Sube las escaleras", "上楼梯"],
    "go downstairs": ["Baja las escaleras", "下楼梯"],
    "go down the stairs again": ["Vuelve a bajar las escaleras", "再次下楼梯"],
    "go up the stairs again": ["Vuelve a subir las escaleras", "再次上楼梯"],
    "enter the gym again": ["Vuelve a entrar en el Gimnasio", "再次进入道馆"],
    "fight the team aqua member": ["Combate contra el miembro del Equipo Aqua", "与海洋队队员对战"],
    "fight a team aqua member": ["Combate contra un miembro del Equipo Aqua", "与一名海洋队队员对战"],
    "fight the team magma member": ["Combate contra el miembro del Equipo Magma", "与熔岩队队员对战"],
    "fight a team magma member": ["Combate contra un miembro del Equipo Magma", "与一名熔岩队队员对战"],
    "follow the path until you see the grass": ["Sigue el camino hasta ver la hierba", "沿路走，直到看到草丛"],
    "go north until you see the stairs": ["Ve al norte hasta ver las escaleras", "向北走，直到看到楼梯"],
    "go east until you see the stairs": ["Ve al este hasta ver las escaleras", "向东走，直到看到楼梯"],
    "go west until you see the stairs": ["Ve al oeste hasta ver las escaleras", "向西走，直到看到楼梯"],
    "go south until you see the stairs": ["Ve al sur hasta ver las escaleras", "向南走，直到看到楼梯"],
    "fight a lady trainer": ["Combate contra una Dama", "与一名大小姐对战"],
    "fight the rocket": ["Combate contra el miembro del Equipo Rocket", "与火箭队队员对战"],
    "pick a pokeball": ["Recoge una Poké Ball", "拾取一个精灵球"],
    "get a pokeball": ["Consigue una Poké Ball", "获得一个精灵球"],
    "you will get a greatball": ["Recibirás una Super Ball", "你会获得一个超级球"],
    "pick a hidden pokeball in the grass": ["Recoge una Poké Ball oculta en la hierba", "在草丛中拾取隐藏的精灵球"],
    "pick a hidden pokeball near the bug trainer while avoiding that trainer": ["Recoge una Poké Ball oculta cerca del Cazabichos evitando que te vea", "避开捕虫少年，在他附近拾取隐藏的精灵球"],
    "go stand where the snorlax was and use the item finder to get a leftovers": ["Colócate donde estaba Snorlax y usa el Buscaobjetos para conseguir Restos","站到卡比兽原先的位置，使用探宝器获得吃剩的东西"],
    "the other balls are the pokemon electrode": ["Las otras Poké Balls son Pokémon Electrode","其他精灵球是顽皮雷弹"],
    "surf east and enter the cave while avoiding the swimmer": ["Usa Surf hacia el este y entra en la cueva evitando al Nadador","向东冲浪，避开游泳选手并进入洞窟"],
    "run north and go on the arrow pointing east": ["Corre hacia el norte y pisa la flecha que apunta al este","向北跑，踩上指向东方的箭头"],
    "slide north to fight the trainer": ["Deslízate hacia el norte para combatir contra el Entrenador","向北滑行，与训练家对战"],
    "surf north a few steps": ["Usa Surf unos pasos hacia el norte","向北冲浪几步"],
    "go heal at the pokecenter and exit the house": ["Cura a tus Pokémon en el Centro Pokémon y sal del edificio","到宝可梦中心治疗，然后离开建筑"],
    "go in the middle portal": ["Entra en el portal central","进入中间的传送门"],
    "follow the path and dive out of the water at the end of the path": ["Sigue el camino y usa Buceo para salir a la superficie al final","沿路前进，到尽头使用潜水浮出水面"],
    "go west all the way and dive out of the water at the end of the path": ["Ve hacia el oeste hasta el final del camino y usa Buceo para salir a la superficie","向西走到道路尽头，使用潜水浮出水面"],
    "go back to the fisher": ["Regresa al Pescador","返回垂钓者处"],
    "use rock climb on the southern side all the way east": ["Usa Treparrocas en el lado sur, en el extremo este","在南侧最东边使用攀岩"],
    "avoid the trainer with a blue hat": ["Evita al Entrenador con gorra azul","避开戴蓝色帽子的训练家"],
    "avoid the trainer with a blue hat and go back to the 2nd bug trainer": ["Evita al Entrenador con gorra azul y regresa al 2.º Cazabichos","避开戴蓝色帽子的训练家，返回第 2 名捕虫少年处"],
    "follow the path until you get to a pokecenter": ["Sigue el camino hasta llegar a un Centro Pokémon","沿路前进，直到到达宝可梦中心"],
    "go north west and pick a parlyzheal while avoiding the trainer": ["Ve hacia el noroeste y recoge un Antiparalizador mientras evitas al Entrenador","向西北走，避开训练家并拾取解麻药"],
    "talk to the other fighter and say yes to get a tm-megakick": ["Habla con el otro luchador y responde que sí para recibir la MT Megapatada","与另一名格斗家交谈，选择“是”，领取招式学习器“百万吨重踢”"],
    "talk to the guy and say yes to get a powderjar": ["Habla con el hombre y responde que sí para recibir el Bote Polvos","与男子交谈并选择“是”，领取粉末瓶"],
    "if you go in the house west of the pokecenter you can trade your poliwhirl for a jynx by talking to the guy": ["Si entras en la casa al oeste del Centro Pokémon, puedes intercambiar tu Poliwhirl por un Jynx hablando con el hombre","进入宝可梦中心西侧的房屋后，可与男子交谈，用蚊香君交换迷唇姐"],
    "go east and pick a pechaberry near the grass": ["Ve hacia el este y recoge una Baya Meloc cerca de la hierba","向东走，在草丛附近拾取桃桃果"],
    "talk to the pokemon and say yes": ["Habla con el Pokémon y responde que sí","与宝可梦交谈并选择“是”"],
    "beat the rocket trainer to get a tm-dig": ["Derrota al recluta del Equipo Rocket para conseguir la MT Excavar","击败火箭队队员，获得招式学习器“挖洞”"],
    "pick a hidden burnheal near the stairs": ["Recoge un Antiquemar oculto cerca de las escaleras","在楼梯附近拾取隐藏的灼伤药"],
    "go south and avoid the bug trainer by going in the grass": ["Ve hacia el sur y evita al Cazabichos pasando por la hierba","向南走，从草丛绕开捕虫少年"],
    "fight only the guy trainer by making him see you from the western most position": ["Combate solo contra el Entrenador masculino haciendo que te vea desde la posición más occidental","只与男训练家对战，从最西侧的位置让他看到你"],
    "if you go in the house west of the pokemart you can trade your spearow for a farfetchd by talking to the girl": ["Si entras en la casa al oeste de la Tienda Pokémon, puedes intercambiar tu Spearow por un Farfetch’d hablando con la chica","进入宝可梦商店西侧的房屋后，可与女孩交谈，用烈雀交换大葱鸭"],
    "pick a hidden superpotion in a trash can": ["Recoge una Superpoción oculta en una papelera","在垃圾桶中拾取隐藏的好伤药"],
    "go in the 3rd room and fight a sailor": ["Entra en la 3.ª habitación y combate contra un Marinero","进入第 3 个房间，与水手对战"],
    "enter the door and go south west to pick a greatball": ["Pasa por la puerta y ve hacia el suroeste para recoger una Super Ball","穿过门，向西南走并拾取超级球"],
    "go south and go in the 2nd room": ["Ve hacia el sur y entra en la 2.ª habitación","向南走，进入第 2 个房间"],
    "go in the 4th room and fight only the guy": ["Entra en la 4.ª habitación y combate solo contra el hombre","进入第 4 个房间，只与男子对战"],
    "talk to the scientist": ["Habla con el científico","与科学家交谈"],
    "say yes and you will get a itemfinder if you own 30 pokemon": ["Responde que sí; si tienes 30 especies registradas como «En posesión» en la Pokédex, recibirás el Buscaobjetos","选择“是”；如果图鉴中已登记拥有 30 种宝可梦，就会获得探宝器"],
    "in the house you can trade your nidorino for a nidorina by talking to the guy with the blue hat on the 2nd floor": ["En la casa puedes intercambiar tu Nidorino por una Nidorina hablando con el hombre de gorra azul del 2.º piso","在房屋内，可与第 2 层戴蓝色帽子的男子交谈，用尼多力诺交换尼多娜"],
    "go down the stairs and go west to exit the building": ["Baja las escaleras y ve hacia el oeste para salir del edificio","下楼梯，向西离开建筑"],
    "go west and fight the trainer with the grey hair": ["Ve hacia el oeste y combate contra el Entrenador de pelo gris","向西走，与灰发训练家对战"],
    "check your pokedex and make sure you have at least 10 owned pokemon": ["Consulta tu Pokédex y asegúrate de tener al menos 10 especies registradas como «En posesión»","查看宝可梦图鉴，确认至少已登记拥有 10 种宝可梦"],
    "enter the diglett cave and go down the stairs": ["Entra en la Cueva Diglett y baja las escaleras","进入地鼠洞穴，下楼梯"],
    "go south and if you enter the small house you can trade your abra for a mr.mime by talking to the guy north east": ["Ve hacia el sur. Si entras en la casa pequeña, podrás intercambiar tu Abra por un Mr. Mime hablando con el hombre del noreste","向南走。如果进入小房屋，可与东北侧的男子交谈，用凯西交换魔墙人偶"],
    "you will get a hm05-flash if you own at least 10 pokemon": ["Recibirás la MO05 Destello si tienes al menos 10 especies registradas como «En posesión» en la Pokédex","如果图鉴中已登记拥有至少 10 种宝可梦，就会获得秘传学习器05“闪光”"],
    "beat the gym leader to get a tm-shockwave": ["Derrota al líder del Gimnasio para conseguir la MT Onda Voltio","击败道馆馆主，获得招式学习器“电击波”"],
    "talk to the guy with the yellow hair to get a bicycle": ["Habla con el hombre de pelo rubio para conseguir una Bicicleta","与黄发男子交谈，获得自行车"],
    "go east and cut a tree to get a tm-teleport": ["Ve hacia el este y usa Corte en un árbol para conseguir la MT Teletransporte","向东走，使用居合斩砍树以获得招式学习器“瞬间移动”"],
    "jump south 2 times and go east while avoiding the hiker": ["Salta hacia el sur 2 veces y ve hacia el este evitando al Montañero","向南跳 2 次，再向东走并避开登山男"],
    "go south east and fight a hiker": ["Ve hacia el sureste y combate contra un Montañero","向东南走，与登山男对战"],
    "follow the path and go west to fight a hiker": ["Sigue el camino y ve hacia el oeste para combatir contra un Montañero","沿路前进，向西与登山男对战"],
    "go west to fight a hiker": ["Ve hacia el oeste para combatir contra un Montañero","向西走，与登山男对战"],
    "avoid the girl trainer and fight the old man": ["Evita a la Entrenadora y combate contra el anciano","避开女训练家，与老人对战"],
    "cut another tree and go west all the way while avoiding all the trainers": ["Usa Corte en otro árbol y ve hacia el oeste hasta el final evitando a todos los Entrenadores","使用居合斩砍掉另一棵树，向西走到尽头并避开所有训练家"],
    "go north and enter the small house": ["Ve hacia el norte y entra en la casa pequeña","向北走，进入小房屋"],
    "pick a hidden potion near the stairs": ["Recoge una Poción oculta cerca de las escaleras","在楼梯附近拾取隐藏的伤药"],
    "go north of the pokecenter and go north west all the way to pick a ether": ["Ve al norte del Centro Pokémon y después hacia el noroeste hasta el final para recoger un Éter","到宝可梦中心北侧，再向西北走到尽头拾取PP 单项小补剂"],
    "go south of the pokecenter and cut a tree": ["Ve al sur del Centro Pokémon y usa Corte en un árbol","到宝可梦中心南侧，使用居合斩砍树"],
    "go north west and talk to the old woman to get a tea": ["Ve hacia el noroeste y habla con la anciana para conseguir Té","向西北走，与老妇人交谈获得茶"],
    "also give her a lemonade and you will get a tm-reflect": ["Dale también una Limonada y recibirás la MT Reflejo","另外给她一瓶劲爽汽水，获得招式学习器“反射壁”"],
    "talk to the guy north west to get a coincase and exit the house": ["Habla con el hombre del noroeste para conseguir el Monedero y sal de la casa","与西北侧的男子交谈，获得代币盒后离开房屋"],
    "talk to the girl to get a hm02-fly and exit the house": ["Habla con la chica para conseguir la MO02 Vuelo y sal de la casa","与女孩交谈，获得秘传学习器02“飞翔”，然后离开房屋"],
    "avoid the trainer and go on the first arrow that you see": ["Evita al Entrenador y pisa la primera flecha que veas","避开训练家，踩上看到的第一个箭头"],
    "go on the southern most arrow pointing west": ["Pisa la flecha situada más al sur que apunta al oeste","踩上最南侧指向西方的箭头"],
    "go north west to fight a beauty girl while avoiding the other trainers": ["Ve hacia el noroeste para combatir contra una Bella, evitando a los demás Entrenadores","向西北走，与大姐姐对战并避开其他训练家"],
    "go in the building east of the pokecenter": ["Entra en el edificio al este del Centro Pokémon","进入宝可梦中心东侧的建筑"],
    "beat the marowak near the stairs and go up the stairs": ["Derrota al Marowak cerca de las escaleras y sube","击败楼梯附近的嘎啦嘎啦，然后上楼梯"],
    "talk to the old man again to get a pokeflute": ["Habla otra vez con el anciano para conseguir la Poké Flauta","再次与老人交谈，获得宝可梦之笛"],
    "exit the tower and fly to celadon city": ["Sal de la torre y usa Vuelo para ir a Ciudad Azulona","离开塔楼，使用飞翔前往玉虹市"],
    "you need to use the bicycle for this area": ["Necesitas usar la Bicicleta en esta zona","此区域需要使用自行车"],
    "avoid the first biker by going west from the southern most position": ["Evita al primer motorista yendo hacia el oeste desde la posición más al sur","从最南侧的位置向西走，避开第一名骑车人"],
    "avoid all the trainers and go south east a few steps until you see the grass": ["Evita a todos los Entrenadores y avanza unos pasos hacia el sureste hasta ver la hierba","避开所有训练家，向东南走几步直到看到草丛"],
    "go north a few steps to route 17 and pick a hidden ether": ["Avanza unos pasos hacia el norte hasta la Ruta 17 y recoge un Éter oculto","向北走几步到 17 号道路，拾取隐藏的PP 单项小补剂"],
    "if you want you can trade your golduck for a lickitung by talking to the guy on the 2nd floor": ["Si quieres, puedes intercambiar tu Golduck por un Lickitung hablando con el hombre del 2.º piso","如果愿意，可与第 2 层的男子交谈，用哥达鸭交换大舌头"],
    "avoid the trainer west and fight the other trainer": ["Evita al Entrenador del oeste y combate contra el otro","避开西侧的训练家，与另一名训练家对战"],
    "avoid the 2 trainers north west": ["Evita a los 2 Entrenadores del noroeste","避开西北侧的 2 名训练家"],
    "talk to the fisher and say yes to get a goodrod": ["Habla con el Pescador y responde que sí para conseguir la Caña Buena","与垂钓者交谈，选择“是”，获得好钓竿"],
    "talk to the guy to get a hm03-surf and exit the house": ["Habla con el hombre para conseguir la MO03 Surf y sal de la casa","与男子交谈，获得秘传学习器03“冲浪”，然后离开房屋"],
    "go down the stairs and go east to exit the building": ["Baja las escaleras y ve hacia el este para salir del edificio","下楼梯，向东离开建筑"],
    "go north and avoid the couple": ["Ve hacia el norte y evita a la pareja","向北走，避开那对搭档"],
    "silph co": ["SILPH S. A.","西尔佛公司"],
    "in this building there is a girl on the 9th floor all the way south west that can heal your pokemon": ["En este edificio hay una chica en el extremo suroeste del 9.º piso que puede curar a tus Pokémon","此建筑第 9 层的最西南侧有一名女孩，可以治疗你的宝可梦"],
    "go north and beat the boss of team rocket": ["Ve hacia el norte y derrota al jefe del Equipo Rocket","向北走，击败火箭队首领"],
    "talk to the girl and say yes to get a tm-thunderwave": ["Habla con la chica y responde que sí para conseguir la MT Onda Trueno","与女孩交谈并选择“是”，获得招式学习器“电磁波”"],
    "talk to the girl to get a tm-mimic": ["Habla con la chica para conseguir la MT Mimético","与女孩交谈，获得招式学习器“模仿”"],
    "the last item is bugged sometimes and the girl does not give it sometimes": ["El último objeto a veces tiene un fallo y la chica no siempre lo entrega","最后一个道具偶尔会出现错误，女孩有时不会给予该道具"],
    "beat the gym leader to get a tm-calmmind": ["Derrota al líder del Gimnasio para conseguir la MT Paz Mental","击败道馆馆主，获得招式学习器“冥想”"],
    "if you want you can trade a venonat for a tangela by talking to the girl in the first room": ["Si quieres, puedes intercambiar un Venonat por un Tangela hablando con la chica de la primera habitación","如果愿意，可与第一个房间的女孩交谈，用毛球交换蔓藤怪"],
    "if you talk to the first guy in the 3rd room you can trade your ponyta for a seel": ["Si hablas con el primer hombre de la 3.ª habitación, puedes intercambiar tu Ponyta por un Seel","与第 3 个房间的第一名男子交谈，可用小火马交换小海狮"],
    "the guy all the way north in the 3rd room can revive your pokemon from a fossil": ["El hombre situado en el extremo norte de la 3.ª habitación puede revivir tu Pokémon a partir de un fósil","第 3 个房间最北侧的男子可以复活化石宝可梦"],
    "if you give him a fossil you have to leave the room and come back to pick your pokemon": ["Si le das un fósil, tienes que salir de la habitación y volver para recoger tu Pokémon","交给他化石后，需要离开房间再返回领取宝可梦"],
    "avoid the next trainer and click on the computer": ["Evita al siguiente Entrenador e interactúa con el ordenador","避开下一名训练家，调查电脑"],
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
    if (Object.hasOwn(fixed, v)) return fixed[v];
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

    m=v.match(new RegExp("^(?:go|run) ("+dpat+") (?:all the way )?to (pick .+|exit the .+|enter the .+|fight .+|get .+|cut the tree)$"));
    if(m){const a=clause(m[2],depth+1);if(a){const all=v.includes(" all the way to ");return ["Ve hacia el "+dir[m[1]][0]+(all?" hasta el final":"")+". "+a[0],"向"+dir[m[1]][1]+"走"+(all?"到尽头":"")+"。"+a[1]];}}
    m=v.match(/^go to the (\d+)(?:st|nd|rd|th) floor$/);
    if(m)return ["Ve al "+m[1]+".º piso","前往第 "+m[1]+" 层"];
    m=v.match(new RegExp("^go on the (northern|southern|eastern|western) most arrow pointing ("+dpat+")$"));
    if(m){const sd={northern:dir.north,southern:dir.south,eastern:dir.east,western:dir.west}[m[1]];return ["Pisa la flecha situada más al "+sd[0]+" que apunta al "+dir[m[2]][0],"踩上最"+sd[1]+"侧指向"+dir[m[2]][1]+"方的箭头"];}
    m=v.match(/^(enter|go in) the (\d+)(?:st|nd|rd|th) room$/);
    if(m)return ["Entra en la "+m[2]+".ª habitación","进入第 "+m[2]+" 个房间"];
    m=v.match(/^enter the (small house|tower|building)$/);
    if(m)return ["Entra en "+({"small house":"la casa pequeña",tower:"la torre",building:"el edificio"}[m[1]]),"进入"+({"small house":"小房屋",tower:"塔楼",building:"建筑"}[m[1]])];
    m=v.match(/^exit the (tower|ship|lab|laboratory)$/);
    if(m)return ["Sal de "+({tower:"la torre",ship:"el barco",lab:"el laboratorio",laboratory:"el laboratorio"}[m[1]]),"离开"+({tower:"塔楼",ship:"船",lab:"研究所",laboratory:"研究所"}[m[1]])];
    m=v.match(/^(fight|avoid|beat) (a|the|another|the next) (hiker|fisher|sailor|scientist|swimmer|biker|beauty trainer|beauty girl|scientist trainer|rocket trainer|guy trainer|old man|other trainer)$/);
    if(m){const names={hiker:["Montañero","登山男"],fisher:["Pescador","垂钓者"],sailor:["Marinero","水手"],scientist:["científico","科学家"],swimmer:["Nadador","游泳选手"],biker:["motorista","骑车人"],"beauty trainer":["Bella","大姐姐"],"beauty girl":["Bella","大姐姐"],"scientist trainer":["científico","科学家"],"rocket trainer":["recluta del Equipo Rocket","火箭队队员"],"guy trainer":["Entrenador masculino","男训练家"],"old man":["anciano","老人"],"other trainer":["otro Entrenador","另一名训练家"]};const o=names[m[3]],f=m[3].startsWith("beauty"),q=m[2];const es=q==="a"?(f?"una ":"un "):q==="another"?(f?"otra ":"otro "):q==="the next"?(f?"la siguiente ":"el siguiente "):(f?"la ":"el ");const zh=q==="a"?"一名":q==="another"?"另一名":q==="the next"?"下一名":"该";return [((m[1]==="fight"?"Combate contra ":m[1]==="beat"?"Derrota a ":"Evita a ")+es+o[0]).replace(/\ba el\b/g,"al"),(m[1]==="fight"?"与":m[1]==="beat"?"击败":"避开")+zh+o[1]+(m[1]==="fight"?"对战":"")];}
    m=v.match(/^(talk to the (guy|girl|fisher|old man|old woman|scientist|fighter|other fighter|gym guide))( and say yes)? to get (?:a|an|the|x\d+) (.+)$/);
    if(m&&!/\d/.test(m[0].split(" to get ")[1].split(" ")[0])){const n=item(m[4]);const npc={guy:["el hombre","男子"],girl:["la chica","女孩"],fisher:["el Pescador","垂钓者"],"old man":["el anciano","老人"],"old woman":["la anciana","老妇人"],scientist:["el científico","科学家"],fighter:["el luchador","格斗家"],"other fighter":["el otro luchador","另一名格斗家"],"gym guide":["el guía del Gimnasio","道馆向导"]}[m[2]];if(n)return ["Habla con "+npc[0]+(m[3]?" y responde que sí":"")+" para conseguir "+n[0],"与"+npc[1]+"交谈"+(m[3]?"，选择“是”":"")+"，领取"+n[1]];}
    m=v.match(/^beat the gym leader to get a (.+)$/);
    if(m){const n=item(m[1]);if(n)return ["Derrota al líder del Gimnasio para conseguir "+n[0],"击败道馆馆主，获得"+n[1]];}
    m=v.match(new RegExp("^go ("+dpat+") of the (pokecenter|gym|pokemart)$"));
    if(m){const p=things[m[2]];return ["Ve al "+dir[m[1]][0]+" de "+p[0],"前往"+p[1]+dir[m[1]][1]+"侧"];}
    m=v.match(/^(pick|get) (?:up )?(a|an|the) (hidden )?(.+?) (near the stairs|in a trash can|near the grass|on the table|near the yellow boxes)$/);
    if(m){const n=item(m[4]);if(n){const loc={"near the stairs":["cerca de las escaleras","楼梯附近"],"in a trash can":["en una papelera","垃圾桶中"],"near the grass":["cerca de la hierba","草丛附近"],"on the table":["sobre la mesa","桌上"],"near the yellow boxes":["cerca de las cajas amarillas","黄色箱子附近"]}[m[5]];return ["Recoge "+n[0]+(m[3]?" (objeto oculto)":"")+" "+loc[0],"在"+loc[1]+"拾取"+(m[3]?"隐藏的":"")+n[1]];}}
    return null;
  }
  const pair=clause(raw);
  return pair?[pair[0]+".",pair[1]+"。"]:null;
}
function buildTranslations(guides, terms, existingIds) {
  const out = {};
  for (const guide of guides) for (const step of guide.steps) {
    if(existingIds.has(step.id)||step.text!==step.lines.join(" ")||!step.lines.length)continue;
    const pairs=step.lines.map(l=>translateGuideLine(l,terms));if(!pairs.every(Boolean))continue;
    const es=pairs.map(p=>p[0]).join(" "),zh=pairs.map(p=>p[1]).join("");
    const nums = s => s.normalize("NFKC").match(/\d+/g)?.join(",") ?? "";
    if(nums(step.text)!==nums(es)||nums(step.text)!==nums(zh))continue;
    out[step.id] = [step.text_hash, es, zh];
  }
  return out;
}
const manualPath = 'ui/js/walkthrough-locales.js';
const outputPath = 'ui/js/walkthrough-generated.js';
const guides = regions.map(region => JSON.parse(fs.readFileSync(
  `companion/data/walkthroughs/${region}.json`, 'utf8',
)));
const canonical = new Map();
for (const { steps } of guides) {
  for (const { id, text_hash } of steps) {
    if (canonical.has(id)) throw new Error(`Duplicate canonical step ${id}`);
    canonical.set(id, text_hash);
  }
}

function readTranslations(path) {
  const rows = new Map();
  const source = fs.readFileSync(path, 'utf8');
  const body = source.match(/^export const (?:WALKTHROUGH_TEXT|GENERATED_WALKTHROUGH_TEXT) = \{\n([\s\S]*?)^};$/m)?.[1];
  if (body === undefined) throw new Error(`Cannot read translation table in ${path}`);
  for (const line of body.trim().split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*"([^"]+)": (\[.*\]),$/);
    if (!match) throw new Error(`Unrecognized translation row in ${path}: ${line}`);
    const [, id, raw] = match;
    if (rows.has(id)) throw new Error(`Duplicate step ${id} in ${path}`);
    const entry = JSON.parse(raw);
    if (!canonical.has(id) || entry[0] !== canonical.get(id)) {
      throw new Error(`Review ${id} in ${path} before regenerating: missing or changed canonical source`);
    }
    if (entry.length !== 3 || !entry.slice(1).every(text => typeof text === 'string' && text.trim())) {
      throw new Error(`Invalid translation for ${id} in ${path}`);
    }
    rows.set(id, entry);
  }
  if (!rows.size) throw new Error(`No translation rows found in ${path}`);
  return rows;
}

const manual = readTranslations(manualPath);
const previous = fs.existsSync(outputPath) ? readTranslations(outputPath) : new Map();
const existingIds = new Set([...manual.keys(), ...previous.keys()]);
const out = buildTranslations(guides, GAME_TERMS, existingIds);
// Keep reviewed text byte-for-byte. A manual entry can explicitly replace a generated entry.
for (const [id, entry] of previous) {
  if (!manual.has(id)) out[id] = entry;
}
const rendered = '// Generated bilingual walkthrough drafts. Rebuild with tools/localization/build-walkthrough-phrases.mjs.\n// Exact source IDs and hashes; unrecognized lines are not translated by this generator.\nexport const GENERATED_WALKTHROUGH_TEXT = {\n'+Object.entries(out).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>'  '+JSON.stringify(k)+': '+JSON.stringify(v)+',').join('\n')+'\n};\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(outputPath, 'utf8') !== rendered) {
    throw new Error(`Run node tools/localization/build-walkthrough-phrases.mjs to update ${outputPath}`);
  }
} else {
  fs.writeFileSync(outputPath, rendered);
}
for (const { region, steps } of guides) {
  const covered = steps.filter(({ id }) => manual.has(id) || Object.hasOwn(out, id)).length;
  console.log(`${region}: ${covered}/${steps.length} in both languages`);
}
