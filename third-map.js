// 藤蔓山坳. Coordinates are transcribed from the 20 × 32 block board in the clip.
(function (root) {
  'use strict';
  const W = 720, H = 960, LEFT = 60, CELL = 30, COLS = 20, ROWS = 32, R = 16;
  const grid = Array.from({length: ROWS}, (_, y) =>
    Array.from({length: COLS}, (_, x) => !x || !y || x === 19 || y === 31 ? 'hedge' : 'grass'));
  const roof = Array.from({length: ROWS}, () => Array(COLS).fill('stone'));
  function rect(array, kind, x, y, w, h) {
    for (let r = y; r < y+h; r++) for (let c = x; c < x+w; c++) array[r][c] = kind;
  }
  function points(array, kind, list) { for (const [x,y] of list) array[y][x] = kind; }
  rect(grid,'path',11,3,2,2); rect(grid,'path',5,5,6,2); rect(grid,'path',5,7,2,12);
  rect(grid,'path',7,17,2,2); rect(grid,'path',9,19,2,6); rect(grid,'path',7,23,2,4);
  rect(grid,'path',5,25,2,2);
  points(grid,'dirt',[[11,3],[11,4],[5,5],[8,5],[7,6],[10,6],[5,7],[6,7],[5,12],[6,13],[5,17],[7,23],[6,25]]);
  rect(grid,'water',1,21,2,7); rect(grid,'water',3,23,2,4);
  points(grid,'moss',[[1,1],[9,1],[13,3],[15,3],[1,5],[18,5],[17,6],[8,8],[1,9],[2,9],[7,10],[8,14],
    [2,15],[3,16],[1,17],[5,19],[6,19],[12,20],[14,20],[18,20],[15,21],[16,21],[16,22],[5,24],[11,24],
    [11,25],[18,25],[15,28],[13,29],[17,29]]);
  for (const [x,y,w,h] of [[5,1,4,2],[15,1,4,2],[3,3,2,2],[17,3,2,2],[1,13,2,2],[15,19,2,2],
    [13,25,2,4],[11,27,2,2],[5,29,4,2]]) rect(grid,'leaves',x,y,w,h);
  points(grid,'vine',[[5,2],[7,2],[15,2],[17,2],[3,4],[17,4],[1,14],[15,20],[13,26],[13,28],[5,30],[7,30]]);

  // Outer masonry and walkable interior have different textures in the exposed cutaway.
  rect(grid,'rim',9,7,8,12); rect(grid,'rim',17,9,2,8); rect(grid,'cave',11,9,6,8);
  rect(grid,'westGate',8,11,3,2); rect(grid,'southGate',13,17,2,2);
  rect(roof,'rockMoss',13,7,4,1); rect(roof,'rockMoss',9,14,1,5);
  points(roof,'rockMoss',[[16,8],[18,14],[18,15],[17,16],[12,17],[16,17],[10,18],[12,18],[16,18]]);
  points(roof,'moss',[[10,8],[11,9],[11,10],[17,9],[18,9],[18,10],[11,11],[12,11],[11,12],[12,12],
    [13,13],[12,14],[13,14],[12,15],[14,16]]);
  function at(col,row) { return grid[row]?.[col] || 'void'; }
  const tileAt = (x,y) => at(Math.floor((x-LEFT)/CELL),Math.floor(y/CELL));
  const isWater = (x,y) => tileAt(x,y) === 'water';
  const caveTile = kind => kind === 'cave' || kind === 'westGate' || kind === 'southGate';
  const isInCave = (x,y) => caveTile(tileAt(x,y));
  const solid = (c,r) => ['void','hedge','leaves','vine','rim'].includes(at(c,r));
  function canStand(x,y,r=R) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < LEFT+r || x > LEFT+CELL*COLS-r || y < r || y > H-r) return false;
    for (let j=Math.floor((y-r)/CELL);j<=Math.floor((y+r)/CELL);j++)
      for (let i=Math.floor((x-LEFT-r)/CELL);i<=Math.floor((x-LEFT+r)/CELL);i++) if (solid(i,j)) return false;
    return true;
  }
  // Exact sweep against solid blocks expanded by the actor/projectile half-size.
  function segmentClear(x,y,tx,ty,r=0) {
    if (!canStand(x,y,r) || !canStand(tx,ty,r)) return false;
    const dx=tx-x,dy=ty-y;
    for (let j=Math.floor((Math.min(y,ty)-r)/CELL);j<=Math.floor((Math.max(y,ty)+r)/CELL);j++) {
      for (let i=Math.floor((Math.min(x,tx)-LEFT-r)/CELL);i<=Math.floor((Math.max(x,tx)-LEFT+r)/CELL);i++) {
        if (!solid(i,j)) continue;
        const ax=LEFT+i*CELL-r,bx=ax+CELL+2*r,ay=j*CELL-r,by=ay+CELL+2*r;
        if ((!dx && (x<ax || x>bx)) || (!dy && (y<ay || y>by))) continue;
        const x0=dx?(ax-x)/dx:-Infinity,x1=dx?(bx-x)/dx:Infinity;
        const y0=dy?(ay-y)/dy:-Infinity,y1=dy?(by-y)/dy:Infinity;
        if (Math.max(0,Math.min(x0,x1),Math.min(y0,y1)) <= Math.min(1,Math.max(x0,x1),Math.max(y0,y1))) return false;
      }
    }
    return true;
  }
  function moveActor(a,dx,dy,r=R) {
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/6));
    for (let i=0;i<n;i++) {
      if (dx && canStand(a.x+dx/n,a.y,r)) a.x+=dx/n;
      if (dy && canStand(a.x,a.y+dy/n,r)) a.y+=dy/n;
    }
  }
  const step=CELL/2, stride=41, nodes=[], open=[], routes=new Map();
  function makeNodes() {
    if (open.length) return;
    for (let j=0;j<=64;j++) for (let i=0;i<=40;i++) {
      const x=LEFT+i*step,y=j*step,id=j*stride+i;
      if (canStand(x,y)) { nodes[id]={x,y,id,edges:[]}; open.push(nodes[id]); }
    }
    for (const a of open) for (const d of [-1,1,-stride,stride,-stride-1,-stride+1,stride-1,stride+1]) {
      const b=nodes[a.id+d];
      if (b && segmentClear(a.x,a.y,b.x,b.y,R)) a.edges.push(b.id);
    }
  }
  function nearest(x,y,r=R,visible=false) {
    makeNodes();
    const i=Math.round((x-LEFT)/step),j=Math.round(y/step);
    let d=Infinity,best;
    function consider(b) {
      if (!b) return;
      const next=(b.x-x)**2+(b.y-y)**2;
      if (next>=d || (r!==R && !canStand(b.x,b.y,r)) || (visible && !segmentClear(x,y,b.x,b.y,r))) return;
      d=next; best=b;
    }
    for (let a=j-1;a<=j+1;a++) for(let c=i-1;c<=i+1;c++) consider(nodes[a*stride+c]);
    if (!best) open.forEach(consider);
    return best;
  }
  function safePosition(x,y,r=R) {
    if (canStand(x,y,r)) return {x,y};
    const n=nearest(x,y,r);
    return n ? {x:n.x,y:n.y} : {x:465,y:139};
  }
  function nextWaypoint(from,target,r=R) {
    const to=canStand(target.x,target.y,r) ? target : safePosition(target.x,target.y,r);
    if (segmentClear(from.x,from.y,to.x,to.y,r)) return to;
    const end=nearest(to.x,to.y,r,true),start=nearest(from.x,from.y,r,true);
    if (!end || !start) return from;
    let links=routes.get(end.id);
    if (!links) {
      const queue=[end.id]; links=new Int16Array(nodes.length).fill(-1); links[end.id]=end.id;
      for (let h=0;h<queue.length;h++) for (const b of nodes[queue[h]].edges) {
        if (links[b]!==-1) continue;
        links[b]=queue[h]; queue.push(b);
      }
      if (routes.size>=96) routes.delete(routes.keys().next().value);
      routes.set(end.id,links);
    }
    let n=start;
    for(let k=0;k<14 && n!==end;k++) {
      const b=nodes[links[n.id]];
      if (!b || !segmentClear(from.x,from.y,b.x,b.y,r)) break;
      n=b;
    }
    return n;
  }
  // Same five quadrants as the first frame. The extra TNT is on the clearing next to spawn.
  const spawns=[{x:465,y:139},{x:476,y:358},{x:222,y:469},{x:470,y:688},{x:260,y:750}];
  const initialItems=[
    {type:'tnt',x:510,y:139}, {type:'apple',x:375,y:180}, {type:'regenPotion',x:286,y:469},
    {type:'bow',x:248,y:469}, {type:'bow',x:480,y:515}, {type:'sword',x:470,y:385},
    {type:'sword',x:555,y:850}
  ];

  // Byte-sized indices into palettes sampled from unoccupied blocks of the supplied clip.
  const materials = {
    "grass":[["#739258","#6e8c53","#6b8850","#69884e","#67864c","#65844b","#67824a","#648349","#628147","#607f46","#617d44","#5e7d43","#5c7b42","#5d7a41","#5a793f","#57763c"],"74599ceff40311af1becccccb5102dfdfe9887ecefb43ad59b8911952bfb2aed2987b3324bedaefab3499cbfee70262697279b5b7218d72613001911002ddd66230118131028ad264707931c987762067544c15707e5a7da738339bc77bea2de02ecbbbbc98ad23ac5ece9b0157236a1301b0074eb38623a959b137780084aa8"],
    "grassB":[["#739357","#6d8c51","#6b894f","#69864d","#65854a","#668249","#638349","#618147","#627f46","#617d42","#5e7e43","#5d7b41","#5d7a40","#597a3e","#58773c","#567339"],"2625cc9ee70260ae6d999dcee61117fbdeb985fbdd712da7c85832c13bf817bd7cb5555337caaadba7a8ceceef40264ad629bf9fd832647a3303592b603cca7a12015515106a8a6a7203955a46a4466b6335819503a7e7a84474c58c29cee6ec46eb58efb9cee28e64feb55025536672411b2295e888827c86ab229ce15828a7"],
    "moss":[["#49681f","#45631a","#446218","#436016","#3f5e15","#3f5c12","#3d5a10","#395b13","#39590f","#3c570f","#39550b","#37560c","#35550c","#37510a","#335008","#2e5007"],"d647600fff7fcc82e51cde4bff878cf7d9782444cce74177ad885008cce521479d88434cd86ee8775afd87eeb4632cfe5dfde88bb44017c79dfee83385384111ee7bcbb3623bb722d103ecb55335bc723008e5354b66cf4169cd8515488bcb489bb582039aa9969568835226da3362016bfb555655015322aee4013630014950"],
    "path":[["#866f28","#846c26","#836b24","#806923","#80681f","#7f6720","#7e661f","#7e671b","#7c661c","#816525","#7c651e","#7b6519","#7b631d","#7a641d","#7a611b","#765f17"],"668228558eee3009a522568ce8623a9cfe65654cffe01c99cc866522cfc33ce952200422ffce66ccc4777886c12efa6c6bb7bbfc8026ea904fb7b8e2212ce3006f656684453ae303dd42556efe55a53a652035888caa600163346552135ac23a305e84488222ca59326c34ffb44ff339a56204bbbb8fe539a552077bbbec43ca"],
    "dirt":[["#8f693d","#825f34","#7f582f","#78572a","#785329","#774f26","#725126","#714d22","#714a21","#6d4a1e","#6e461d","#68461a","#674418","#694118","#624015","#5c380d"],"1be934cc70f731bc6ceb6becb9e9773921488f848ea16e1491284a824da145daf4142afdad848ada66355a20022024273128a84005302424636976ff8838955b4ffbcbffe52553ef2eecfe8ad72000cb66307104d4002d7766301578a22eff9bf425402da58cbb12beeda116ef1fe1143f94fbbeb236ef626c61e13bc36699ff"],
    "water":[["#3a7160","#336a59","#2e6553","#2e6354","#2c6352","#2a6351","#2d6251","#2b6250","#296250","#2c6051","#296050","#29604f","#2b5f4e","#275e4c","#255f4c","#255c4b"],"48ed848ecb77944647ddb7bbcc96333347ddbbbbcc99699947b7bbb7cc996cd934a9bb7477443221134adb4244422000001322247774211100010012222222761499424fb74474bcffd77bbbb74447bddfd77bbb74224bdddffdbbbddddddddcdffdbbb7dfdd777cbffddd74d71114497db42112421014b44742100122227bbc"],
    "leaves":[["#658c35","#5d8038","#587734","#517530","#4c6d2d","#48682a","#486728","#436526","#406123","#3e5e23","#3b5a20","#36561a","#305013","#2a4a0f","#25460b","#1e3e06"],"599dd75595217979255cfa458cb8dcb4324bec5adffdabc62399899bffc821378c9559beedda1007db1368eea8ab4033f81468ea587b6131f432023365aed111c320000154bfd4118430001124cdbc84576100321efaa5533a67c73468caaa7208ccc86655cec84117d84acfffedb94118fa47adee6133754bda584ad521124a"],
    "vine":[["#668732","#667f31","#667937","#5b7934","#6b702d","#607030","#587130","#50702c","#6f672d","#656729","#5b672a","#4d6729","#705f2b","#615f25","#4d6023","#465419"],"befbabbbb62226ef37ba8a7766544ada336589ba55999dd232655aea8cc991456365afd98cdd901bf2226a489dd99117f523798ccae98933f31711427becc402f700001167ac8422e7130013235cc923b7770076328cde767ba94156ba8cefb32288444aaa888db322c889d9d9989d522289af9ccc425a523befbfaddd223666"],
    "rim":[["#39423f","#343d38","#32393a","#2f3834","#2e3435","#2b3334","#2a3131","#27302d","#262d2e","#232c28","#23292b","#202826","#1f2629","#1e2622","#1c2324","#192021"],"7dfddedb96468bb93113799dfecaaaaa9317ddd9730000259769bed76310002603666ce6233124540454acf84469bfe8348aca403369efc898acc82022468cca9acca84014668cec78cca66438baacca125873468eeca8203268100058acca427acf610026ceee829abfb63288efffe80136898de4246640002236bea1024842"],
    "rimLight":[["#5d6465","#575e5e","#525859","#4d5454","#4b5052","#464d4d","#454a4b","#41494a","#414648","#3f4647","#3c4445","#3b4243","#3a4142","#383e40","#363d3e","#32393a"],"80027a00023cfc5783439902337efea7f648e93656c9427ffb843597ac62103b452024befc41014729e224acfe921484368546aa7215a887c4026cf511248effe2027af711458dca811577db759dda446869adffdbdff700668aec2003dff31261029a01345ad578411469259759edc912376bcd857e927c97cbb8addcd94115"],
    "cave":[["#5b626b","#515862","#4c545d","#485059","#444b55","#404752","#3c444c","#39414a","#373e48","#363d46","#343b44","#323942","#303841","#2e353e","#2b323d","#272e38"],"9efebbdb6347ad972022359eedeccfed93357ad852000114d76adcc41111123601346ac53345567501468fe8447defe827bcb821234bee9779cdb7102335cda7bffd97324576ceec799ba7668becac9423597558cdfd962025b6200148aba63059db501235addb7467adc745768dddc8002459de930344200043358851024641"],
    "caveMoss":[["#596166","#50585e","#4c535a","#475155","#474f56","#464c56","#414a4f","#3f464d","#3b4349","#3a4249","#373f45","#343b42","#303a3d","#2f383e","#2d343b","#293037"],"9dfebccc83378dbb211368bfffebcfcd7215accea7100236b627bdd96200013747559de71121123701259ffa638aaed7279abb41127aefd879aeea401447aeb9ca7cb94025459ffbeedda752699aaeee333aa87adffea820368910002abdea106add501129dded65ceffd5126aeeffdb02478baba4479751002347afb1036641"],
    "gravel":[["#787961","#727259","#706f58","#696f53","#6d6d53","#6b6a52","#656a4e","#676850","#68674f","#64664e","#65644c","#61634c","#5d5e48","#5c5b44","#575b49","#535644"],"eedc757bbcd92441effd9854247724a0fecbbc91222c7282fe71bdc2777fd225ffd9d8242100257afff9900170017eb8bec25005827c9b24777774148adc4025bbb524542ad85156fec202ac2265854aeb5015cd805b821de7541008ba59814dfeb94511101b6011effd226841259b14eb9979cb5224cda1e316b66666636cba"],
    "gravelDark":[["#7f7a66","#7a7561","#77715d","#73705c","#736d5a","#706a57","#6d6b59","#6d6856","#6d6753","#6a6652","#696452","#666352","#625e4d","#5d5a49","#575546","#504e43"],"fefecb7c7bdb6bb3fffdbc92346b66b6fdc4adc479bec666feb3bdb7457c9137ffeac3024100374beff550029315bc54b9c9422448dc9114ddc9127519b83025eef7019b02888548edd205bc11575439ec941008a545411cec99200150184113eeed433211155211eeed438852448c21cbb957aa83448db1eb5b955787558ac9"],
    "stone":[["#9fa590","#9aa08d","#9a9e8b","#969c89","#969a88","#939984","#949884","#929784","#8c987e","#909582","#8f9280","#8a937b","#8a907d","#8a8e7b","#848c78","#828874"],"8bb8eb888beeffeb8beecdeffeca78bba4113343101469de9447aa7662002aec44695779a6addffda94102742aefdaaaceffeee955adda461015224100026766200223200022222193346a7003961120ccacccefeaca75aa49974127747a935744ac637eecacffff01aee99efea79ecc2aca777977633110995575aea20145c4"],
    "rockMoss":[["#a8b38f","#92a073","#8a9770","#87995f","#85916e","#82915a","#7d8e57","#7b8b55","#7b8763","#77864c","#768160","#708052","#718243","#6e7b4f","#697946","#667344"],"80018f933557d4128001ae5557bdeeb5d42ade5822d969cfdaade8aa8884337c0851208dfa01436906c1004accd812a817fc72ab3379a44a8fc569f51359dbbddfc66ce31159beffd9797c962237edaa2ccbcfeeed9de5216fcbee6369ed4000d6325e369626a44443412d798218bfa222422df7224aa41ab28a8ffffaa40001"]
  };
  let textures;
  function makeTextures() {
    if (textures) return;
    textures={};
    for (const [kind,[palette,pixels]] of Object.entries(materials)) {
      const tile=document.createElement('canvas'); tile.width=tile.height=16;
      const c=tile.getContext('2d');
      for (let i=0;i<256;i++) { c.fillStyle=palette[parseInt(pixels[i],16)]; c.fillRect(i%16,i>>4,1,1); }
      textures[kind]=tile;
    }
  }
  function drawTerrain(c,inside=true) {
    makeTextures(); c.save(); c.imageSmoothingEnabled=false;
    for (let row=0;row<ROWS;row++) for(let col=-2;col<COLS+2;col++) {
      const kind=at(col,row),x=LEFT+col*CELL,y=row*CELL;
      const h=((col+17)*19+row*31+row*col*7)>>>0;
      let key=kind;
      if(kind==='void' || kind==='hedge') key='leaves';
      if(kind==='rim') key=inside ? (h%5===0?'rimLight':'rim') : roof[row][col];
      if(kind==='cave') key=inside ? (h%4===0?'caveMoss':'cave') : roof[row][col];
      if(kind==='westGate') key=col<9?'gravel':col===9?'gravelDark':inside?'cave':roof[row][col];
      if(kind==='southGate') key=row===18 && col===14?'dirt':row===18?'gravel':'gravelDark';
      if(key==='grass' && h%3===1) key='grassB';
      c.drawImage(textures[key],x,y,CELL,CELL);
      if (kind==='void' || kind==='hedge') {
        c.fillStyle=kind==='void'?'rgba(9,18,16,.68)':'rgba(15,30,14,.20)'; c.fillRect(x,y,CELL,CELL);
      } else if (h%4===0) {c.fillStyle='rgba(15,25,18,.04)';c.fillRect(x,y,CELL,CELL);}
      if ((kind==='westGate' && col===9) || (kind==='southGate' && row===17)) {
        const g=kind==='westGate'?c.createLinearGradient(x,y,x+CELL,y):c.createLinearGradient(x,y+CELL,x,y);
        g.addColorStop(0,'rgba(13,18,20,0)'); g.addColorStop(1,'rgba(13,18,20,.47)');
        c.fillStyle=g;c.fillRect(x,y,CELL,CELL);
      }
    }
    // Contact shadows emphasize hedge collision and the internal cave wall without covering the doors.
    for(let j=0;j<ROWS;j++) for(let i=0;i<COLS;i++) {
      if (!solid(i,j)) continue;
      const x=LEFT+i*CELL,y=j*CELL;
      if (!solid(i,j+1)) {c.fillStyle='rgba(17,24,20,.24)';c.fillRect(x,y+CELL,CELL,3);}
      if (!solid(i+1,j)) {c.fillStyle='rgba(17,24,20,.17)';c.fillRect(x+CELL,y,2,CELL);}
    }
    // Log-end landmark on the western hedge, at the bend opposite the cave entrance.
    const lx=LEFT+1,ly=11*CELL+1;
    for (const [inset,color] of [[0,'#745136'],[2,'#b48b5d'],[4,'#dab180'],[6,'#be9868'],[8,'#d2ad77'],[11,'#bf9967']]) {
      c.fillStyle=color; c.fillRect(lx+inset,ly+inset,28-2*inset,28-2*inset);
    }
    c.restore();
  }
  const api={drawTerrain, spawns, initialItems, tileAt, isWater, isInCave, isSlippery:()=>false,
    canStand,safePosition,moveActor,segmentClear,nextWaypoint};
  root.ThirdMap=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
