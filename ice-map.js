// Ice Ridge Snowfield. Each square follows the 20 by 32 block arena in the reference video.
(function (root) {
  'use strict';
  const CELL = 30, LEFT = 60, WIDTH = 720, HEIGHT = 960, RADIUS = 16;
  // Blanks are the void, # is raised ice, * is a light set in raised ice,
  // dots are packed snow and ~ is the smooth ice that carries momentum.
  const layout = [
    '   ########',
    '  #........#',
    ' ##........#',
    '#..........#',
    '#..........######',
    '#......#*........#',
    '#......##........##',
    ' ##....####........#',
    '  #....####........#',
    '  #......##........#',
    ' ##......##........#',
    '#........##........#',
    '#........##........#',
    '#......~~~~........#',
    '#......~~~~........#',
    '#....~~~~~~..####..#',
    '#....~~~~~~..####..#',
    '#......~~~~..####..#',
    '#......~~~~..####..#',
    ' ####........###*..#',
    ' ####........####..#',
    '  #........####....#',
    '  #........####....#',
    '  #................#',
    ' ##................#',
    '#....####..........#',
    '#....*###..........#',
    '#....####........##',
    '#....####........#',
    ' ##..........####',
    '  #..........#',
    '   ##########'
  ];
  function block(col, row) { return layout[row]?.[col] || ' '; }
  function solid(col, row) {
    const type = block(col, row);
    return type !== '.' && type !== '~';
  }
  function tileAt(x, y) {
    const tile = block(Math.floor((x - LEFT) / CELL), Math.floor(y / CELL));
    return ({ '.': 'snow', '~': 'ice', '#': 'wall', '*': 'lamp', ' ': 'void' })[tile];
  }
  function isSlippery(x, y) { return tileAt(x, y) === 'ice'; }

  function canStand(x, y, r = RADIUS) {
    const x0 = Math.floor((x - LEFT - r) / CELL), x1 = Math.floor((x - LEFT + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let row = y0; row <= y1; row++)
      for (let col = x0; col <= x1; col++)
        if (solid(col, row)) return false;
    return true;
  }

  // Slab intersection against the footprint-expanded block prevents fast projectiles,
  // teleports and diagonal shortcuts from cutting a corner between two samples.
  function segmentClear(x, y, endX, endY, r = 0) {
    if (!canStand(x, y, r) || !canStand(endX, endY, r)) return false;
    const dx = endX - x, dy = endY - y;
    const x0 = Math.floor((Math.min(x, endX) - LEFT - r) / CELL);
    const x1 = Math.floor((Math.max(x, endX) - LEFT + r) / CELL);
    const y0 = Math.floor((Math.min(y, endY) - r) / CELL);
    const y1 = Math.floor((Math.max(y, endY) + r) / CELL);
    for (let row = y0; row <= y1; row++) {
      const top = row * CELL - r, bottom = (row + 1) * CELL + r;
      const a = dy ? (top - y) / dy : -Infinity, b = dy ? (bottom - y) / dy : Infinity;
      const yEnter = Math.min(a, b), yExit = Math.max(a, b);
      for (let col = x0; col <= x1; col++) {
        if (!solid(col, row)) continue;
        const left = LEFT + col * CELL - r, right = LEFT + (col + 1) * CELL + r;
        const c = dx ? (left - x) / dx : -Infinity, d = dx ? (right - x) / dx : Infinity;
        if (Math.max(0, yEnter, Math.min(c, d)) <= Math.min(1, yExit, Math.max(c, d))) return false;
      }
    }
    return true;
  }

  function moveActor(actor, dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx && canStand(actor.x + sx, actor.y)) actor.x += sx;
      if (sy && canStand(actor.x, actor.y + sy)) actor.y += sy;
    }
  }

  // Half-block spacing includes the middle of two-block-wide corridors, although
  // neither of their block centers fits a fighter's 32-pixel footprint.
  const STEP = CELL / 2, NC = 41, NR = 65;
  const nodes = Array(NC * NR), openNodes = [];
  for (let row = 0; row < NR; row++) {
    for (let col = 0; col < NC; col++) {
      const x = LEFT + col * STEP, y = row * STEP;
      if (!canStand(x, y)) continue;
      const index = row * NC + col, node = { x, y, index, neighbors: [] };
      nodes[index] = node;
      openNodes.push(node);
    }
  }
  for (const node of openNodes) {
    for (const offset of [-1, 1, -NC, NC, -NC - 1, -NC + 1, NC - 1, NC + 1]) {
      const next = nodes[node.index + offset];
      if (next && segmentClear(node.x, node.y, next.x, next.y, RADIUS)) node.neighbors.push(next.index);
    }
  }
  function nearestNode(x, y, r = RADIUS) {
    const col = Math.round((x - LEFT) / STEP), row = Math.round(y / STEP);
    let best, min = Infinity;
    function consider(node) {
      if (!node || (r !== RADIUS && !canStand(node.x, node.y, r))) return;
      const d = (node.x - x) ** 2 + (node.y - y) ** 2;
      if (d < min) { min = d; best = node; }
    }
    if (col >= 0 && col < NC && row >= 0 && row < NR) {
      for (let j = row - 1; j <= row + 1; j++)
        for (let i = col - 1; i <= col + 1; i++) consider(nodes[j * NC + i]);
      if (best) return best;
    }
    for (const node of openNodes) consider(node);
    return best;
  }
  function safePosition(x, y, r = RADIUS) {
    if (canStand(x, y, r)) return { x, y };
    const node = nearestNode(x, y, r);
    return { x: node.x, y: node.y };
  }
  const routes = new Map();
  function routeTo(goal) {
    if (routes.has(goal.index)) return routes.get(goal.index);
    const links = new Int16Array(nodes.length).fill(-1), queue = [goal.index];
    links[goal.index] = goal.index;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      for (const next of nodes[at].neighbors) {
        if (links[next] !== -1) continue;
        links[next] = at;
        queue.push(next);
      }
    }
    // Moving targets share routes within each half-block; cap retained maps for long sessions.
    if (routes.size >= 160) routes.delete(routes.keys().next().value);
    routes.set(goal.index, links);
    return links;
  }
  function nextWaypoint(from, to) {
    if (segmentClear(from.x, from.y, to.x, to.y, RADIUS)) return to;
    const start = nearestNode(from.x, from.y), end = nearestNode(to.x, to.y);
    const route = routeTo(end);
    let node = start;
    for (let i = 0; i < 10 && node !== end; i++) {
      const next = nodes[route[node.index]];
      if (!next || !segmentClear(from.x, from.y, next.x, next.y, RADIUS)) break;
      node = next;
    }
    return node;
  }

  // Starting locations are projected from the video opening into this arena.
  const spawns = [{ x: 210, y: 260 }, { x: 570, y: 304 }, { x: 270, y: 695 }, { x: 532, y: 786 }];
  const initialItems = [
    { type: 'bow', x: 229, y: 276 }, { type: 'snowball', x: 551, y: 167 },
    { type: 'snowball', x: 548, y: 314 }, { type: 'boots', x: 255, y: 406 },
    { type: 'berries', x: 345, y: 525 }, { type: 'stoneSword', x: 588, y: 492 },
    { type: 'bow', x: 170, y: 650 }, { type: 'bow', x: 288, y: 679 }
  ];

  // Tile palettes sampled from unobstructed individual blocks in the supplied footage.
  const art = {
    snow: [["#cee0ed","#cedeec","#cadeea","#c8deea","#cbddea","#cadde9","#c9dde9","#c7dde9","#cadce9","#c7dce7","#c7dae6","#c5dce7"],"11100148810188481110114a81018441411055895458410114456666226940005559bb7337b622016667bb73377222249627bb7337322268a859b77679622698a88a966699666964a88a662699999664a849622699999624a448622999996222a415266666666222841599962222266684489a9622222699a845999941001488"],
    ridge: [["#4d82d4","#4879cf","#4575ca","#3f75cd","#4271cc","#4271c4","#3b71cb","#3f6dc6","#3a6dc7","#3b68c3","#3968c1","#3765bf"],"66663336860001566686633666100257666663113830177736863100186228973686300016857a9436a810001477412238a71001257a50023a831025579aa201488311257979aa527866422577999abaaa88647777999a999ba8677999977779aba84779b97777797aa42449b77775255a721149a22522155aa52449b2111127"],
    ice: [["#7badfb","#75a7f7","#6fa2f3","#6c9ef0","#6b9bf0","#679beb","#6899eb","#6696eb","#6396e8","#6192e4","#5e90e0","#5b8ddf"],"bb94211234861125b97210386683229b98422355378468bb743249834888899823348955aa84443334424888983321126873377786331113bb98722366210159b7353248a80005ab8323239b910059bb322226ab8008aaba21015aba338aba9611139bb9569aa8630138aaa85338763113799862112642003898731111574100"],
    lamp: [["#a5c4cf","#a6c3cf","#a3c3cf","#9ec3cf","#9dbfcb","#93bac5","#86b2bc","#78a3ad","#5c8b95","#4b7885","#406e86","#336a96"],"8a99999999999999baa887766677789aba87654444445779ba76544200024568b965333200002458b964332200022458b963320200002458b953321111112358b953320111112358b964321111002358b964301112000358b975432102003568ba76543444345679ba87655554455789baa888877777789abbaaaaaaaaaaaaaa"],
    void: [["#222934","#212834","#202831","#202733","#1f2730","#1f2632","#1e262f","#1e2531","#1d252e","#1c242e","#1b232c","#1a222b"],"554468888abbba96778668889abbba96779aaaaa9888888877444466420002687566666642222466132222242499998835222444249aa98877666664226884445553333101333122777555577555556677555557a511124455333113773554665555533577577775015775555335531001333555311333005111155531013333"]
  };
  function drawTerrain(ctx) {
    const textures = {};
    for (const [kind, [colors, pixels]] of Object.entries(art)) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 16;
      const brush = tile.getContext('2d');
      for (let n = 0; n < pixels.length; n++) {
        brush.fillStyle = colors[parseInt(pixels[n], 16)];
        brush.fillRect(n % 16, Math.floor(n / 16), 1, 1);
      }
      textures[kind] = tile;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < layout.length; row++) {
      for (let col = -2; col < 22; col++) {
        const x = LEFT + col * CELL, y = row * CELL, tile = block(col, row);
        const name = ({ '.': 'snow', '~': 'ice', '#': 'ridge', '*': 'lamp', ' ': 'void' })[tile];
        ctx.drawImage(textures[name], x, y, CELL, CELL);
        if (tile === '.' || tile === ' ') {
          // Gentle, deterministic variation keeps the large snow sheets from looking flat.
          ctx.fillStyle = 'rgba(76,113,143,' + (((col + 4) * 19 + row * 31) % 7) * 0.006 + ')';
          ctx.fillRect(x, y, CELL, CELL);
        }
      }
    }
    for (let row = 0; row < layout.length; row++) {
      for (let col = 0; col < 20; col++) {
        const tile = block(col, row), x = LEFT + col * CELL, y = row * CELL;
        if (tile !== '#' && tile !== '*') continue;
        if (!solid(col, row + 1)) {
          ctx.fillStyle = '#28427948'; ctx.fillRect(x, y + CELL, CELL, 3);
          ctx.fillStyle = '#35568321'; ctx.fillRect(x, y + CELL + 3, CELL, 3);
        }
        if (!solid(col + 1, row)) {
          ctx.fillStyle = '#3957883d'; ctx.fillRect(x + CELL, y + 2, 3, CELL);
          ctx.fillStyle = '#48648d1c'; ctx.fillRect(x + CELL + 3, y + 3, 2, CELL - 1);
        }
        if (tile === '*') {
          const cx = x + CELL / 2, cy = y + CELL / 2, light = ctx.createRadialGradient(cx, cy, 2, cx, cy, 64);
          light.addColorStop(0, '#c5ffff33'); light.addColorStop(1, '#b7fcff00');
          ctx.fillStyle = light; ctx.fillRect(cx - 64, cy - 64, 128, 128);
        }
      }
    }
    const shade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    shade.addColorStop(0, '#e0f5ff08'); shade.addColorStop(0.64, '#23446a04'); shade.addColorStop(1, '#1c3c601d');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
  const api = { drawTerrain, spawns, initialItems, tileAt, isSlippery, canStand, safePosition, moveActor, segmentClear, nextWaypoint };
  root.IceMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
