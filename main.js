(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Game, CHARACTERS, ITEM_NAMES, isBlade, isRanged, isSplashPotion } = ArenaEngine;
  const activeHand = weapon => isRanged(weapon) || weapon === 'tnt' || isSplashPotion(weapon) || weapon === 'healingPotion';
  const maps = {
    forest: {
      name: '林间水池',
      items: ['sword', 'bow', 'apple', 'helmet'],
      airdrops: ['enchanted']
    },
    ice: {
      name: '冰脊雪原',
      items: ['snowball', 'bow', 'stoneSword', 'berries', 'boots'],
      airdrops: ['potato', 'crossbow', 'fireworkBow']
    },
    third: {
      name: '藤蔓山坳',
      items: ['sword', 'bow', 'apple', 'regenPotion', 'tnt'],
      airdrops: ['sharpBook', 'powerBook']
    }
  };
  const itemEffects = {
    ironSpear: '基础 1 伤害。每持有 5 秒 +0.5，最多 +1；冲刺后 1 秒内再 +0.5',
    sword: '剑刃触敌 · 1 点伤害', bow: '单发 · 1 点伤害',
    apple: '回复 1 生命并获得护盾', helmet: '抵挡一次伤害',
    enchanted: '回复 3 生命并获得 2 护盾', snowball: '0.25 伤害并击退',
    stoneSword: '剑刃触敌 · 0.75 伤害', berries: '回复 0.5 生命',
    boots: '抵挡一次伤害', potato: '回复 1.5 生命',
    crossbow: '单发 · 2 点伤害', fireworkBow: '直击 1.5，溅射 0.5',
    sharpBook: '近战 +0.25 · 本局可叠加', powerBook: '远程 +0.25 · 本局可叠加',
    regenPotion: '每秒回复 0.25 生命，持续 8 秒', tnt: '每 10 秒刷新一枚，放置后 2 秒爆炸',
    poisonSplash: '中毒 8 秒 · 每秒减 0.25，最低留 0.25 血',
    harmingSplash: '溅射 1.5 伤害，也会波及自己',
    totem: '抵挡一次致命伤害，保留 1 生命'
  };
  const mapButtons = Array.from(document.querySelectorAll('[data-map]'));
  const canvas = $('arena');
  const renderer = new ArenaRenderer(canvas);
  const keys = new Set();
  const joystick = $('joystick');
  const joystickThumb = $('joystickThumb');
  const stick = { pointerId: null, x: 0, y: 0 };
  const held = { shoot: new Set(), skill: new Set(), dash: new Set() };
  const pendingActions = new Set();
  let touchMode = matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches);
  let displayedWeapon;
  let rosterActors = [], knownActorCount = 0;
  let selected = 'random', selectedMap = 'forest', game, paused = false, autoAim = true, spectating = false;
  let round = 1, savedResult = false, lastFrame = 0, uiClock = 0, eventId = 0, lastSound = 0;
  let aimX = 360, aimY = 350;
  const sound = new ArenaAudio(ArenaSoundAssets);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timeText = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function soundButton() {
    $('soundBtn').querySelector('span').textContent = sound.enabled ? '音效开' : '音效关';
    $('soundBtn').setAttribute('aria-label', sound.enabled ? '关闭音效' : '开启音效');
    $('soundBtn').setAttribute('aria-pressed', String(sound.enabled));
  }
  function playUI(type) { sound.unlock(); sound.play({type}); }
  function playFrameSounds() {
    if (lastSound === game.soundSeq) return;
    if (sound.enabled) for (const cue of game.soundCues)
      if (cue.id > lastSound) sound.play(cue, game.player);
    lastSound = game.soundSeq;
  }
  function buildCharacters() {
    $('characterList').replaceChildren();
    const choices = [...Object.entries(CHARACTERS), ['random', { name: '随机' }]];
    choices.forEach(([type, info]) => {
      const button = document.createElement('button'); button.className = 'character-card';
      button.dataset.character = type; button.setAttribute('aria-pressed', String(type === selected));
      button.setAttribute('aria-label', type === 'random' ? '随机选择出战角色' :
        `选择${info.name}，${type === 'slime' ? '被动' : '技能'}：${info.skillName}`);
      let icon;
      if (type === 'random') {
        icon = document.createElement('span'); icon.className = 'random-icon'; icon.textContent = '⚄';
      } else {
        icon = document.createElement('canvas');
        ArenaRenderer.drawAvatar(icon, type, 40);
      }
      icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = info.name;
      button.append(icon, name);
      button.addEventListener('click', () => { selected = type; reset(false); playUI('click'); });
      $('characterList').append(button);
    });
  }
  function buildRoster() {
    $('roster').replaceChildren();
    knownActorCount = game.actors.length;
    const splitParents = new Set(game.actors.filter(a => a.isMiniSlime).map(a => a.slimeParentId));
    rosterActors = game.actors.filter(a => !splitParents.has(a.id));
    rosterActors.forEach(actor => {
      const row = document.createElement('div'); row.className = 'roster-row'; row.dataset.actor = actor.id;
      const icon = document.createElement('canvas'); icon.width = 28; icon.height = 28; ArenaRenderer.drawAvatar(icon, actor.type, 28);
      const name = document.createElement('span'); name.className = 'roster-name'; name.textContent = actor.name;
      if (actor.isPlayer) { const tag = document.createElement('small'); tag.className = 'you-tag'; tag.textContent = '你'; name.append(tag); }
      const hp = document.createElement('span'); hp.className = 'roster-hp'; row.append(icon, name, hp); $('roster').append(row);
    });
  }
  function buildItemList(map) {
    const list = $('itemList');
    list.replaceChildren();
    function addItem(type) {
      const row = document.createElement('div'); row.className = 'item-row';
      const icon = document.createElement('canvas'); icon.dataset.item = type;
      icon.setAttribute('aria-hidden', 'true');
      ArenaRenderer.drawItem(icon, type, 32);
      const text = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = ITEM_NAMES[type];
      const effect = document.createElement('span'); effect.textContent = itemEffects[type];
      text.append(title, effect); row.append(icon, text); list.append(row);
    }
    map.items.forEach(addItem);
    addItem('ironSpear');
    addItem('poisonSplash');
    addItem('harmingSplash');
    addItem('totem');
    const heading = document.createElement('h3'); heading.textContent = '空投补给';
    list.append(heading);
    map.airdrops.forEach(addItem);
  }
  function buildMapPicker() {
    mapButtons.forEach(button => {
      const mapId = button.dataset.map;
      const thumbnail = button.querySelector('canvas');
      const context = thumbnail.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(renderer.terrainForMap(mapId), 72, 370, 570, 171, 0, 0, thumbnail.width, thumbnail.height);
      button.addEventListener('click', () => {
        if (game.started || selectedMap === mapId) return;
        selectedMap = mapId;
        reset(false); playUI('click');
      });
    });
  }
  function centerStick() {
    stick.pointerId = null;
    stick.x = 0;
    stick.y = 0;
    joystick.style.removeProperty('--stick-x');
    joystick.style.removeProperty('--stick-y');
  }
  function clearInput() {
    keys.clear();
    pendingActions.clear();
    Object.values(held).forEach(pointers => pointers.clear());
    centerStick();
  }
  function syncInputLayout() {
    document.documentElement.classList.toggle('touch-mode', touchMode);
    document.documentElement.classList.toggle('touch-battle', touchMode && game.started);
    const directions = touchMode ? '左手摇杆移动，右手按钮使用道具、技能和冲刺。' : 'WASD 移动，剑刃触敌自动攻击，J 使用手中物品。';
    canvas.setAttribute('aria-label', maps[game.map].name + '对战场地，' + directions);
  }
  function setTouchMode(value) {
    if (touchMode === value) return;
    clearInput();
    touchMode = value;
    syncInputLayout();
  }
  function reset(startImmediately) {
    sound.stop(); lastSound = 0;
    clearInput(); paused = false; spectating = false; savedResult = false; eventId = 0;
    const mapChanged = !game || game.map !== selectedMap;
    game = new Game({ map: selectedMap, character: selected, difficulty: $('difficulty').value });
    const map = maps[game.map];
    const fighter = CHARACTERS[game.player.type];
    document.body.dataset.arena = game.map;
    document.title = '方块竞技场 · ' + map.name;
    $('mapTitle').textContent = map.name;
    $('matchRules').textContent = '与 ' + (game.actors.length - 1) + ' 名电脑角色对战，最后存活的阵营获胜。' +
      (game.map === 'ice' ? ' 冰面会打滑，深蓝色冰脊可作掩体。' : game.map === 'third' ? ' 从西、南洞口进入山体；附魔书拾取即生效。' : '');
    mapButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.map === selectedMap));
      button.disabled = startImmediately;
    });
    if (mapChanged) buildItemList(map);
    aimX = game.player.x; aimY = game.player.y - 200;
    $('startBtn').hidden = startImmediately; $('resultOverlay').hidden = true; $('pauseOverlay').hidden = true;
    document.body.classList.toggle('in-match', startImmediately);
    document.querySelector('[data-character="slime"] strong').textContent = CHARACTERS.slime.name;
    $('skillName').textContent = (selected === 'random' ? fighter.name + ' · ' : '') + fighter.skillName;
    $('skillDesc').textContent = fighter.skillDescription;
    $('skillAction').textContent = fighter.skillName;
    $('skillBtn').title = game.character === 'slime' ? fighter.skillDescription : `Q · ${fighter.skillName}`;
    $('skillBtn').querySelector('kbd').hidden = game.character === 'slime';
    document.querySelector('.skill-description kbd').hidden = game.character === 'slime';
    document.querySelectorAll('.character-card').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.character === selected)); b.disabled = !!startImmediately;
      b.classList.toggle('fielded', b.dataset.character === game.player.type);
    });
    $('difficulty').disabled = !!startImmediately;
    $('matchBadge').textContent = `第 ${round} 局`;
    buildRoster(); if (startImmediately) game.start(); syncInputLayout(); updateUI();
    renderer.render(game, { reducedMotion });
    if (startImmediately) canvas.focus({ preventScroll: true });
  }
  function start() {
    if (game.started) return;
    $('startBtn').hidden = true; $('difficulty').disabled = true; document.body.classList.add('in-match');
    document.querySelectorAll('.character-card').forEach(b => b.disabled = true);
    mapButtons.forEach(button => { button.disabled = true; });
    game.start(); syncInputLayout(); playUI('click'); canvas.focus({ preventScroll: true }); updateUI();
  }
  function restart() { round++; reset(true); playUI('click'); }
  function setPause(value) {
    if (!game.started || game.finished || (!game.player.alive && !spectating)) return;
    paused = value; clearInput(); if (paused) sound.stop(); else sound.unlock(); $('pauseOverlay').hidden = !paused;
    $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ'; $('pauseBtn').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    updateUI();
  }
  function finish() {
    const won = game.status === 'won', wasSpectating = spectating;
    savedResult = true; spectating = false;
    const winner = game.winner;
    $('resultTitle').textContent = winner?.type === 'slime' ? '史莱姆胜利' : won ? '胜利' :
      game.finished && !winner ? '平局' : wasSpectating && winner ? winner.name + '胜利' : '已淘汰';
    const familyWin = won && winner?.type === 'slime';
    $('resultDescription').textContent = familyWin ? `史莱姆阵营存活 ${game.remaining} 只 · 第 1 名` :
      `${game.player.name} · 第 ${won ? 1 : game.player.rank || game.remaining + 1} 名`;
    $('resultKills').textContent = game.stats.kills;
    $('resultTime').textContent = timeText(game.player.deathTime ?? game.time);
    $('spectateBtn').hidden = won || game.finished;
    $('resultOverlay').hidden = false;
    if (won) sound.play({type:'win'});
    clearInput(); updateUI();
  }
  function toggleAim() {
    if (touchMode) return;
    autoAim = !autoAim; $('aimLabel').textContent = autoAim ? '自动瞄准' : '鼠标瞄准';
    $('aimBtn').setAttribute('aria-label', autoAim ? '切换为鼠标瞄准' : '切换为自动瞄准');
  }
  function currentInput() {
    const down = (...codes) => codes.some(c => keys.has(c));
    if (touchMode || autoAim) {
      const targets = game.opponentsOf(game.player);
      targets.sort((a, b) => Math.hypot(a.x-game.player.x, a.y-game.player.y) - Math.hypot(b.x-game.player.x, b.y-game.player.y));
      if (targets[0]) { aimX = targets[0].x; aimY = targets[0].y; }
    }
    const controls = {
      x: touchMode ? stick.x : Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft')),
      y: touchMode ? stick.y : Number(down('KeyS', 'ArrowDown')) - Number(down('KeyW', 'ArrowUp')),
      aimX, aimY,
      shoot: activeHand(game.player.weapon) && (held.shoot.size > 0 || down('KeyJ', 'KeyK') || pendingActions.has('shoot')),
      skill: held.skill.size > 0 || down('KeyQ') || pendingActions.has('skill'),
      dash: held.dash.size > 0 || down('Space') || pendingActions.has('dash')
    };
    pendingActions.clear();
    return controls;
  }
  function updateUI() {
    const p = game.player;
    if (knownActorCount !== game.actors.length) {
      buildRoster();
      if (p.isMiniSlime) {
        document.querySelector('[data-character="slime"] strong').textContent = p.name;
        $('skillName').textContent = p.name;
        $('skillDesc').textContent = '生命上限 1 点。同伴可被误伤，场上仅剩史莱姆即全队胜利。';
      }
    }
    $('timer').textContent = timeText(game.time);
    $('phaseLabel').textContent = paused ? '已暂停' : game.finished ? '对战结束' : spectating ? '观战中' : game.countdown > 0 ? '准备开始' : game.started ? '对战进行中' : '等待入场';
    $('aliveCount').textContent = `${game.remaining} / ${rosterActors.length}`;
    $('dropTimer').hidden = !game.started;
    $('dropTimer').textContent = game.time > 90 ? '边界收缩' : `空投 ${Math.max(0, Math.ceil(game.nextAirDrop - game.time))}s`;
    $('playerHealth').textContent = game.map !== 'forest' || !Number.isInteger(p.hp) ? `♥ ${p.hp} / ${p.maxHp}` :
      '♥ '.repeat(p.hp) + '♡ '.repeat(p.maxHp - p.hp);
    $('playerShield').textContent = [p.shield ? '◆' + p.shield : '', p.armor ? ITEM_NAMES[p.armorType] : ''].filter(Boolean).join(' ');
    $('playerTotem').hidden = !p.hasTotem;
    const poisoned = p.alive && p.poisonUntil > game.time;
    $('playerHealth').classList.toggle('poisoned', poisoned);
    const spearBonus = game.spearHoldBonus(p);
    const buffs = [spearBonus ? '长矛 +' + spearBonus : '', p.meleeBonus ? '锋利 +' + p.meleeBonus : '', p.rangedBonus ? '力量 +' + p.rangedBonus : '',
      p.regenTicks ? '恢复 ' + p.regenTicks + 's' : '', p.burnUntil > game.time ? '燃烧中' : '',
      poisoned ? '中毒 ' + Math.ceil(p.poisonUntil - game.time) + 's' : ''].filter(Boolean).join(' · ');
    $('buffStatus').hidden = !buffs; $('buffStatus').textContent = buffs;
    const slowed = $('slowStatus');
    slowed.hidden = !p.alive || !(p.inWeb || p.slowRemaining > 0);
    if (!slowed.hidden) {
      slowed.textContent = p.inWeb ? '蛛网 · 移速 20%' : `迟缓 ${Math.ceil(p.slowRemaining)}s`;
    }
    const usable = activeHand(p.weapon);
    if (displayedWeapon !== p.weapon) {
      displayedWeapon = p.weapon;
      const label = ITEM_NAMES[p.weapon] || '空手';
      $('attackState').textContent = p.weapon==='poisonSplash' ? '剧毒药水' : p.weapon==='harmingSplash' ? '伤害药水' : label;
      const thrown = isSplashPotion(p.weapon) || p.weapon==='snowball';
      const instruction = p.weapon === 'ironSpear' ? '矛尖触敌' : p.weapon === 'ironAxe' ? '斧刃触敌' : p.weapon === 'tnt' ? '放在脚下' :
        p.weapon === 'healingPotion' ? '饮用 +1' : thrown ? '投掷 · 1 次' :
        usable ? '射击 · 1 发' : isBlade(p.weapon) ? '剑刃触敌' : '拾剑或矛可近战';
      $('weaponAction').textContent = instruction;
      $('weaponKey').hidden = !usable;
      $('attackBtn').title = usable ? instruction + '（左键、右键、J 或 K）' : instruction;
      $('attackBtn').setAttribute('aria-label', label + '，' + instruction);
      $('attackBtn').classList.toggle('passive-weapon', !usable);
      $('heldIcon').hidden = p.weapon === 'fist';
      $('attackBtn').classList.toggle('unarmed', p.weapon === 'fist');
      if (p.weapon !== 'fist') ArenaRenderer.drawItem($('heldIcon'), p.weapon, 30);
    }
    const needsSword = p.type === 'zombie' && !isBlade(p.weapon);
    const passive = p.type === 'slime';
    if (passive) {
      $('skillAction').textContent = p.isMiniSlime ? '小史莱姆' : CHARACTERS.slime.skillName;
      $('skillBtn').title = p.isMiniSlime ? '小史莱姆没有主动技能' : CHARACTERS.slime.skillDescription;
    }
    $('skillState').textContent = passive ? (p.isMiniSlime ? '无主动技能' : '被动') : p.drainReady ? `吸血 ${Math.ceil(p.drainRemaining)}s` :
      needsSword ? (game.map === 'ice' ? '需石剑' : '需铁剑') : p.skillCooldown > .1 ? `${p.skillCooldown.toFixed(1)}s` : '就绪';
    $('dashState').textContent = p.dashCooldown > .1 ? `${p.dashCooldown.toFixed(1)}s` : '就绪';
    [['skillBtn', p.skillCooldown], ['dashBtn', p.dashCooldown]].forEach(([id, cd]) => { $(id).classList.toggle('ready', cd <= .1); $(id).classList.toggle('cooling', cd > .1); });
    const controlsLocked = !game.started || !p.alive || paused || game.finished || game.countdown > 0;
    $('attackBtn').disabled = controlsLocked || !usable;
    $('skillBtn').disabled = controlsLocked || needsSword || passive;
    $('dashBtn').disabled = controlsLocked;
    $('pauseBtn').disabled = !game.started || game.finished;
    $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    rosterActors.forEach(actor => {
      const row = $('roster').querySelector(`[data-actor="${actor.id}"]`);
      row.classList.toggle('dead', !actor.alive);
      const health = game.map !== 'forest' || !Number.isInteger(actor.hp) ? `♥ ${actor.hp} / ${actor.maxHp}` : '♥'.repeat(actor.hp);
      row.querySelector('.roster-hp').textContent = actor.alive ? health + (actor.shield ? ' ◆' : '') : '已淘汰';
    });
    const recent = game.events[game.events.length - 1];
    if (recent && recent.id !== eventId) {
      eventId = recent.id; $('eventLog').replaceChildren();
      const log = game.events.filter(e => e.type !== 'info').slice(-5).reverse();
      $('eventLog').parentElement.hidden = log.length === 0;
      log.forEach(e => {
        const row = document.createElement('div'); row.className = `log-entry ${e.type}`;
        const time = document.createElement('time'); time.textContent = timeText(e.time);
        const text = document.createElement('span'); text.textContent = e.text; row.append(time, text); $('eventLog').append(row);
      });
    }
    $('arenaWrap').classList.toggle('hit', p.hitFlash > .05);
  }
  function frame(now) {
    const dt = lastFrame ? Math.min((now-lastFrame) / 1000, .2) : 0; lastFrame = now;
    if (!paused && (!savedResult || spectating)) game.update(dt, currentInput());
    playFrameSounds();
    renderer.render(game, { aimX, aimY, showAim: game.started && game.player.alive && !paused && !game.finished, reducedMotion });
    if (game.countdown > 0 && !paused) { $('countdown').hidden = false; $('countdown').textContent = String(Math.ceil(game.countdown)); } else $('countdown').hidden = true;
    if (game.status === 'spectating' && !spectating) {
      spectating = true; clearInput(); updateUI();
    }
    if ((game.status === 'won' || game.status === 'lost') && (!savedResult || (spectating && game.finished))) finish();
    uiClock += dt; if (uiClock >= .1 || displayedWeapon !== game.player.weapon) { updateUI(); uiClock = 0; }
    requestAnimationFrame(frame);
  }
  const gameCodes = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyJ','KeyK','KeyQ','KeyR','KeyE','Escape']);
  addEventListener('keydown', e => {
    if (gameCodes.has(e.code) || e.code === 'Tab' || e.code === 'Enter') setTouchMode(false);
    if ($('helpDialog').open) return;
    if (!game.started && e.target !== canvas) return;
    if (gameCodes.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Escape') setPause(!paused);
      if (e.code === 'KeyE') toggleAim();
      if (e.code === 'KeyR' && game.started) restart();
      if (e.code === 'Enter' && !game.started && e.target === canvas) start();
      const action = {KeyJ:'shoot',KeyK:'shoot',KeyQ:'skill',Space:'dash'}[e.code];
      if (action && game.status === 'playing' && !paused) pendingActions.add(action);
    }
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { clearInput(); if (game.started && !game.finished) setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); setPause(true); } });
  function aimAtPointer(e) {
    if (touchMode || autoAim || e.pointerType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect(); aimX = (e.clientX - rect.left) / rect.width * 720; aimY = (e.clientY - rect.top) / rect.height * 960;
  }
  addEventListener('pointerdown', e => {
    if (e.pointerType) setTouchMode(e.pointerType !== 'mouse');
  }, {capture: true, passive: true});
  addEventListener('pointermove', e => {
    if (touchMode && stick.pointerId === null && e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false);
  }, {capture: true, passive: true});
  canvas.addEventListener('pointermove', aimAtPointer);
  canvas.addEventListener('pointerdown', e => {
    if (touchMode || !game.started || paused || !game.player.alive) return;
    canvas.focus({ preventScroll: true });
    if (activeHand(game.player.weapon) && (e.button === 0 || e.button === 2)) {
      aimAtPointer(e);
      held.shoot.add(e.pointerId); pendingActions.add('shoot');
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function releasePointer(e) {
    if (e.pointerId === stick.pointerId) centerStick();
    Object.values(held).forEach(pointers => pointers.delete(e.pointerId));
  }
  addEventListener('pointerup', releasePointer);
  addEventListener('pointercancel', releasePointer);
  addEventListener('lostpointercapture', releasePointer);
  [['attackBtn','shoot'],['skillBtn','skill'],['dashBtn','dash']].forEach(([id,key]) => {
    const button = $(id);
    button.addEventListener('pointerdown', e => {
      if (button.disabled) return;
      e.preventDefault();
      if (!touchMode) held[key].add(e.pointerId);
      pendingActions.add(key);
      button.setPointerCapture(e.pointerId);
    });
    button.addEventListener('click', e => { if (e.detail === 0) pendingActions.add(key); });
  });
  function moveStick(e) {
    const bounds = joystick.getBoundingClientRect();
    const radius = Math.max(1, (bounds.width - joystickThumb.offsetWidth) / 2);
    const dx = e.clientX - bounds.left - bounds.width / 2;
    const dy = e.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const extent = Math.min(distance / radius, 1);
    const directionX = dx / (distance || 1), directionY = dy / (distance || 1);
    // A small central dead zone lets a resting thumb stop without lifting.
    const strength = Math.max(0, (extent - 0.12) / 0.88);
    stick.x = directionX * strength;
    stick.y = directionY * strength;
    joystick.style.setProperty('--stick-x', directionX * extent * radius + 'px');
    joystick.style.setProperty('--stick-y', directionY * extent * radius + 'px');
  }
  joystick.addEventListener('pointerdown', e => {
    if (!touchMode || stick.pointerId !== null || !game.started || paused || !game.player.alive) return;
    e.preventDefault();
    stick.pointerId = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  joystick.addEventListener('pointermove', e => {
    if (e.pointerId === stick.pointerId) moveStick(e);
  });
  $('startBtn').onclick = start; $('againBtn').onclick = restart; $('pauseRestartBtn').onclick = restart;
  $('pauseBtn').onclick = () => setPause(!paused); $('resumeBtn').onclick = () => setPause(false);
  $('chooseBtn').onclick = $('pauseChooseBtn').onclick = () => {
    round++; reset(false);
    mapButtons.find(button => button.dataset.map === selectedMap).focus({ preventScroll: true });
  };
  $('spectateBtn').onclick = () => { spectating = true; $('resultOverlay').hidden = true; canvas.focus({ preventScroll: true }); };
  $('difficulty').onchange = () => reset(false); $('aimBtn').onclick = toggleAim;
  $('soundBtn').onclick = () => { sound.setEnabled(!sound.enabled); soundButton(); if (sound.enabled) playUI('click'); };
  addEventListener('pointerdown', () => sound.unlock(), {capture:true,passive:true});
  addEventListener('keydown', () => sound.unlock(), {capture:true});
  let resumeAfterHelp = false;
  $('helpBtn').onclick = () => { resumeAfterHelp = game.started && !paused && !game.finished; if (resumeAfterHelp) setPause(true); $('helpDialog').showModal(); };
  $('closeHelpBtn').onclick = $('helpDoneBtn').onclick = () => $('helpDialog').close();
  $('helpDialog').addEventListener('close', () => { if (resumeAfterHelp) setPause(false); resumeAfterHelp = false; });
  soundButton(); buildMapPicker(); buildCharacters(); reset(false); requestAnimationFrame(frame);
  // Read-only snapshots support regression checks without changing gameplay state.
  window.blockArena = Object.freeze({ audioStatus: () => sound.status(), snapshot: () => ({
    map: game.map, status: game.status, paused, autoAim: touchMode || autoAim, time: game.time, remaining: game.remaining,
    character: game.player.type, selection: selected, round, countdown: game.countdown, player: { ...game.player },
    actors: game.actors.map(({ id, type, hp, maxHp, alive, isPlayer, isMiniSlime, slimeParentId }) =>
      ({ id, type, hp, maxHp, alive, isPlayer, isMiniSlime, slimeParentId })),
    webs: game.webs.map(({ ownerId, x, y, radius }) => ({ ownerId, x, y, radius })),
    bombs: game.bombs.map(({ ownerId, x, y, fuse, radius }) => ({ ownerId, x, y, fuse, radius })),
    projectiles: game.projectiles.map(({ ownerId, type }) => ({ ownerId, type })),
    stats: { ...game.stats }, finished: game.finished
  }) });
})();
