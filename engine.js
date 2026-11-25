/* Block Arena — deterministic, DOM-free combat simulation. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const WORLD = Object.freeze({ width: 720, height: 960, border: 28, actorRadius: 16 });
  const CHARACTERS = Object.freeze({
    creeper: { name: '苦力怕', color: '#86d760', skillName: '爆破脉冲', skillDescription: '震退附近敌人，造成 1 点伤害', skillCooldown: 8, icon: '✦' },
    zombie: { name: '僵尸', color: '#71a894', skillName: '生命汲取', skillDescription: '持剑蓄能，6 秒内剑刃击伤敌人可回复 1 生命', skillCooldown: 9, icon: '♥' },
    skeleton: { name: '骷髅', color: '#d6e0dc', skillName: '三重箭雨', skillDescription: '朝瞄准方向射出三支箭，不消耗箭矢', skillCooldown: 7, icon: '➶' },
    enderman: { name: '末影人', color: '#b58bee', skillName: '末影闪现', skillDescription: '向瞄准方向传送，短暂无敌', skillCooldown: 7, icon: '◇' },
    blaze: { name: '烈焰人', color: '#f9b84e', skillName: '烈焰弹', skillDescription: '启用后点击场地逐发瞄准射击，射完 3 枚后冷却 8 秒。命中点燃 3 秒，每秒造成 0.25 点伤害。', skillCooldown: 8, icon: '✹' },
    stray: { name: '流浪者', color: '#a3d7ed', skillName: '迟缓之箭', skillDescription: '射出一箭，造成 1 点伤害，使目标移速减半 5 秒', skillCooldown: 8, icon: '➶' },
    spider: { name: '蜘蛛', color: '#e18989', skillName: '布置蛛网', skillDescription: '蛛网持续整局。网内移速降至原速的 20%，蜘蛛免疫', skillCooldown: 8, icon: '▦' },
    vindicator: { name: '卫道士', color: '#acb5af', skillName: '唤出铁斧', skillDescription: '铁斧触敌造成 2 点伤害后消失；未命中可持有 4 秒', skillCooldown: 12, icon: '⚒' },
    witch: { name: '女巫', color: '#bd8dd4', skillName: '调配药水', skillDescription: '随机获得一瓶剧毒、瞬间伤害或治疗药水', skillCooldown: 8, icon: '⚗' },
    slime: { name: '史莱姆', color: '#8ecf70', skillName: '分裂', skillDescription: '倒下后分裂成三只 1 血小史莱姆。同伴可被误伤，击败所有外敌即全队获胜。', skillCooldown: 0, icon: '▣' }
  });
  const ITEM_NAMES = { sword: '铁剑', ironSpear: '铁长矛', ironAxe: '铁斧', bow: '弓与箭', apple: '金苹果', helmet: '铁头盔', enchanted: '附魔金苹果',
    poisonSplash: '喷溅型剧毒药水', harmingSplash: '喷溅型瞬间伤害药水', healingPotion: '治疗药水',
    sharpBook: '锋利附魔书', powerBook: '力量附魔书', tnt: 'TNT', regenPotion: '恢复药水 II', totem: '不死图腾',
    stoneSword: '石剑', snowball: '雪球', berries: '甜浆果', boots: '皮革靴子', potato: '烤土豆', crossbow: '弩', fireworkBow: '烟花弩' };
  const MAP_LOOT = {
    end: {common:['sword','bow','apple','helmet','tnt','sharpBook','powerBook'], supplies:['sword','bow','bow'], rare:['enchanted']},
    forest: { common: ['sword', 'bow', 'apple', 'helmet', 'apple'], supplies: ['sword', 'sword', 'bow'], rare: ['enchanted'] },
    ice: { common: ['snowball', 'bow', 'stoneSword', 'berries', 'boots'], supplies: ['stoneSword', 'snowball', 'bow'], rare: ['potato', 'crossbow', 'fireworkBow'] },
    third: { common: ['sword', 'bow', 'apple', 'regenPotion', 'tnt'], supplies: ['sword', 'bow'], recovery: ['apple','regenPotion'], rare: ['sharpBook', 'powerBook'] }
  };
  const RANGED_SHOTS = new Map([['bow', 'arrow'], ['snowball', 'snowball'], ['crossbow', 'bolt'], ['fireworkBow', 'firework']]);
  const isRanged = type => RANGED_SHOTS.has(type);
  const isBlade = type => type === 'sword' || type === 'stoneSword';
  const isGroundMelee = type => isBlade(type) || type === 'ironSpear';
  const POTION_FIRST_DROPS = { poisonSplash: 12, harmingSplash: 18 };
  const POTION_TYPES = Object.keys(POTION_FIRST_DROPS);
  const WITCH_POTIONS = [...POTION_TYPES, 'healingPotion'];
  const isSplashPotion = type => Object.hasOwn(POTION_FIRST_DROPS, type);
  const POTION_RANGE = 108, POTION_RADIUS = POTION_RANGE / 2, BOTTLE_RADIUS = 3;
  const isWeapon = type => isGroundMelee(type) || isRanged(type) || type === 'tnt' || isSplashPotion(type) || type === 'healingPotion';
  const TNT_FUSE = 2, TNT_RADIUS = 140;
  const OPENING_SEARCH_RADIUS = 170;
  const arrowLike = type => type === 'arrow' || type === 'slowArrow' || type === 'bolt';
  const isArmor = type => type === 'helmet' || type === 'boots';
  const snowHealing = { berries: 0.5, potato: 1.5 };
  const skillRanges = { creeper: 110, zombie: 84, enderman: 160, spider: 90, vindicator: 160 };
  const LEVELS = {
    easy: { speed: 0.70, reaction: 0.48, accuracy: 0.25, attackDelay: 0.45, skillChance: 0.35 },
    normal: { speed: 0.85, reaction: 0.24, accuracy: 0.13, attackDelay: 0.22, skillChance: 0.65 },
    hard: { speed: 1.00, reaction: 0.12, accuracy: 0.04, attackDelay: 0.08, skillChance: 0.95 }
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const actorRadius = actor => actor.hitRadius ?? (actor.isMiniSlime ? 10 : WORLD.actorRadius);
  const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const inWater = (x, y) => (Math.abs(x - 360) < 64 && Math.abs(y - 480) < 100) || (Math.abs(x - 360) < 100 && Math.abs(y - 480) < 64);

  // One authoritative world-space sword model for both drawing and collision.
  // angle points from the actor to the tip. Only bladePoints can deal damage;
  // the grip, hilt and guard are decorative and never expand the hit area.
  function getSwordGeometry(actor) {
    const angle = Number(actor.angle) || 0;
    const uX = Math.cos(angle), uY = Math.sin(angle), nX = -uY, nY = uX;
    const point = (along, across = 0) => ({ x: actor.x + along * uX + across * nX, y: actor.y + along * uY + across * nY });
    const base = point(28), tip = point(58), grip = point(20), handleBase = point(14), guard = point(26);
    return {
      angle, uX, uY, nX, nY,
      baseX: base.x, baseY: base.y, tipX: tip.x, tipY: tip.y,
      gripX: grip.x, gripY: grip.y, handleBaseX: handleBase.x, handleBaseY: handleBase.y,
      guardX: guard.x, guardY: guard.y, halfWidth: 3, guardHalfWidth: 7, handleHalfWidth: 2,
      totalLength: 44, bladeLength: 30,
      bladePoints: [point(28, 3), point(54, 3), tip, point(54, -3), point(28, -3)]
    };
  }

  // Solid iron pixels in the 16x16 iron_axe.png, stored as [row,left,rightExclusive].
  // In particular, neither the wooden handle nor the empty notch can inflict damage.
  const AXE_EDGE = [[1,9,11],[2,8,12],[3,7,12],[4,6,11],[5,6,12],
    [6,7,9],[6,10,14],[7,11,14],[8,11,13]];
  // Iron pixels on the 16x16 spear sprite. The long wooden shaft is visible but harmless.
  const SPEAR_EDGE = [[0,13,16],[1,11,16],[2,9,16],[3,7,15],[4,7,15],
    [5,8,14],[6,9,14],[7,10,13],[8,11,13]];
  const SPEAR_LENGTH = 66;
  function getSpriteEdgeGeometry(actor, offset, size, edge, tipColumn, tipRow) {
    const facing = Number(actor.angle) || 0, angle = facing + Math.PI/4;
    const centerX = actor.x + offset*Math.cos(facing), centerY = actor.y + offset*Math.sin(facing);
    const cos = Math.cos(angle)*size/16, sin = Math.sin(angle)*size/16;
    const point = (x,y) => ({x:centerX+(x-8)*cos-(y-8)*sin, y:centerY+(x-8)*sin+(y-8)*cos});
    const bladeParts = edge.map(([y,l,r])=>[point(l,y),point(r,y),point(r,y+1),point(l,y+1)]);
    const tip = point(tipColumn,tipRow);
    return {centerX,centerY,angle,size,bladeParts,tipX:tip.x,tipY:tip.y};
  }
  const getAxeGeometry = actor => getSpriteEdgeGeometry(actor, 36, 40, AXE_EDGE, 11, 1);
  function getSpearGeometry(actor) {
    return { ...getSpriteEdgeGeometry(actor, 14 + SPEAR_LENGTH / 2, SPEAR_LENGTH / Math.SQRT2, SPEAR_EDGE, 16, 0),
      totalLength: SPEAR_LENGTH };
  }

  function polygonIntersectsHead(blade, target) {
    const r = actorRadius(target);
    const head = [{ x: target.x - r, y: target.y - r }, { x: target.x + r, y: target.y - r },
      { x: target.x + r, y: target.y + r }, { x: target.x - r, y: target.y + r }];
    // Exact convex polygon / axis-aligned head overlap, with no circular
    // proximity test, cone, padded blade radius, or invisible attack reach.
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    for (let i = 0; i < blade.length; i++) {
      const a = blade[i], b = blade[(i + 1) % blade.length];
      axes.push({ x: -(b.y - a.y), y: b.x - a.x });
    }
    for (const axis of axes) {
      const bladeProjection = blade.map(point => point.x * axis.x + point.y * axis.y);
      const headProjection = head.map(point => point.x * axis.x + point.y * axis.y);
      if (Math.max(...bladeProjection) < Math.min(...headProjection) - 1e-8 || Math.max(...headProjection) < Math.min(...bladeProjection) - 1e-8) return false;
    }
    return true;
  }
  const swordIntersectsHead = (geometry,target) => polygonIntersectsHead(geometry.bladePoints,target);
  const spriteEdgeIntersectsHead = (geometry,target) => geometry.bladeParts.some(part=>polygonIntersectsHead(part,target));

  class Game {
    constructor(options = {}) {
      this.map = Object.hasOwn(MAP_LOOT, options.map) ? options.map : 'forest';
      this.terrain = this.map === 'end' ? (root.EndMap || require('./end-map.js'))
        : this.map === 'third' ? (root.ThirdMap || require('./third-map.js'))
        : this.map === 'ice' ? (root.IceMap || require('./ice-map.js')) : null;
      this.loot = MAP_LOOT[this.map];
      this.difficulty = LEVELS[options.difficulty] ? options.difficulty : 'normal';
      this.level = LEVELS[this.difficulty];
      this.seed = Number(options.seed ?? Date.now()) >>> 0;
      // Mix nearby seeds before drawing the first opponent.
      this.randomState = Math.imul(this.seed || 1, 0x9e3779b1) >>> 0;
      const roster = Object.keys(CHARACTERS);
      this.character = options.character === 'random'
        ? roster[Math.floor(this.random() * roster.length)]
        : roster.includes(options.character) ? options.character : 'creeper';
      this.time = 0;
      this.status = 'ready';
      this.started = false;
      this.countdown = 0;
      this.finished = false;
      this.cheats = { invincible:false, noCooldown:false };
      this.winner = null;
      this.safeInset = WORLD.border;
      this.nextDrop = this.map === 'third' ? 9 : 12;
      this.nextWeaponDrop = this.map === 'third' ? 6 : 4;
      this.swordSupplySlots = 0;
      this.nextTntDrop = this.map === 'third' || this.map === 'end' ? 10 : Infinity;
      this.nextTotemDrop = 45;
      this.potionDrops = { poisonSplash: 0, harmingSplash: 0 };
      this.nextAirDrop = this.map === 'third' ? 30 : 45;
      this.dropWarning = null;
      this.airdropBag = [];
      this.actors = [];
      this.items = [];
      this.projectiles = [];
      this.bombs = [];
      this.webs = [];
      this.effects = [];
      this.events = [];
      this.soundCues = [];
      this.soundSeq = 0;
      this._nextId = 1;
      this._announcedStorm = false;
      this.stats = { damageDealt: 0, damageTaken: 0, pickups: 0, shots: 0, skills: 0, kills: 0 };
      const spawns = this.terrain ? this.terrain.spawns : [{ x: 190, y: 730 }, { x: 150, y: 170 }, { x: 560, y: 170 }, { x: 560, y: 730 }, { x: 360, y: 285 }];
      const opponents = roster.filter(type => type !== this.character);
      spawns.forEach((spawn, index) => {
        const type = index === 0 ? this.character : opponents.splice(Math.floor(this.random() * opponents.length), 1)[0];
        this.actors.push(this.createActor(type, spawn, index === 0));
      });
      this.player = this.actors[0];
      this.raid = this.map === 'end' ? new (root.EndEncounter || require('./end-encounter.js'))(this) : null;
      const initialItems = [
        ['ironSpear', 116, 470], ['sword', 580, 460], ['bow', 210, 300],
        ['bow', 525, 820], ['apple', 570, 315], ['apple', 330, 780],
        ['helmet', 122, 840], ['helmet', 410, 130], ['apple', 145, 610],
        ['apple', 270, 170], ['apple', 540, 610], ['apple', 270, 850],
        ['helmet', 610, 545], ['helmet', 110, 285],
        ['sword', 340, 660], ['sword', 460, 335], ['bow', 170, 790], ['bow', 560, 120],
        ['sword', 190, 655], ['sword', 145, 245], ['sword', 590, 680], ['sword', 390, 220]
      ];
      if (this.terrain) this.terrain.initialItems.forEach(({ type, x, y }) => this.spawnItem(type, x, y));
      else initialItems.forEach(([type, x, y]) => this.spawnItem(type, x, y));
      if (this.terrain) this.spawnItem('ironSpear', spawns[0].x + 95, spawns[0].y + 36);
      this.addEvent('进入' + ({forest:'林间水池', ice:'冰脊雪原', third:'藤蔓山坳',end:'末地浮岛'})[this.map], 'info');
    }

    createActor(type, spawn, isPlayer, slimeParentId = null) {
      const info = CHARACTERS[type];
      const weapon = type === 'skeleton' ? 'bow' : 'fist';
      const maxHp = slimeParentId ? 1 : 3;
      return {
        id: 'actor-' + this.actors.length, type, name: slimeParentId ? '小史莱姆' : info.name, color: info.color,
        isMiniSlime: !!slimeParentId, slimeParentId,
        x: spawn.x, y: spawn.y, spawnX: spawn.x, spawnY: spawn.y,
        hp: maxHp, maxHp, shield: 0, armor: 0, armorType: null,
        alive: true, isPlayer, angle: isPlayer ? -Math.PI / 2 : Math.PI / 2,
        weapon, weaponUses: weapon === 'fist' ? 0 : 1,
        ammo: weapon === 'bow' ? 1 : 0, weaponPickupContacts: [], axeRemaining: 0, axeExpiresAt: 0,
        attackCooldown: isPlayer ? 0 : 1.5, shootCooldown: isPlayer ? 0 : 2.5, skillCooldown: isPlayer ? 0 : 3, dashCooldown: 0,
        kills: 0, invulnerable: 0.5, hitFlash: 0, attackAnimation: 0, drainReady: false, drainRemaining: 0,
        vx: 0, vy: 0, slideX: 0, slideY: 0, walkPhase: 0, moving: false, inWater: false,
        slowRemaining: 0, inWeb: false, meleeBonus: 0, rangedBonus: 0, regenTicks: 0, regenNext: 0,
        hasTotem: false, totemUsedAt: -1, burnUntil: 0, burnNext: 0, burnSource: null, blazeVolley: null,
        poisonUntil: 0, poisonNext: 0, poisonSource: null,
        aiTimer: 0.3 + this.random() * 0.7, aiGoal: null, aiTargetId: null, aiStrafe: this.random() < 0.5 ? -1 : 1,
        stormTimer: 1.5, lastDamageBy: null, deathTime: null, rank: null
      };
    }

    get remaining() { return this.actors.filter(actor => actor.alive).length; }

    opponentsOf(actor) {
      if(this.raid) return this.raid.targets.filter(target=>target.alive);
      return this.actors.filter(other => other.alive && other !== actor &&
        !(actor.type === 'slime' && other.type === 'slime'));
    }

    get damageTargets() { return this.raid ? this.actors.concat(this.raid.targets) : this.actors; }

    spearHoldBonus(actor) {
      if (actor.weapon !== 'ironSpear' || actor.spearEquippedAt == null) return 0;
      const elapsed = Math.max(0, this.time - actor.spearEquippedAt);
      return 0.5 * Math.min(2, Math.floor((elapsed + 1e-8) / 5));
    }

    splitSlime(parent) {
      const children = [];
      for (let i = 0; i < 3; i++) {
        const child = this.createActor('slime', parent, i === 0 && parent.isPlayer, parent.id);
        // Try nearby directions around the fallen parent. Moving through the normal
        // terrain collision path keeps children on this side of a wall or map edge.
        for (let attempt = 0; attempt < 12; attempt++) {
          const angle = parent.angle + TAU * (i / 3 + attempt / 12);
          child.x = parent.x; child.y = parent.y;
          const dx = Math.cos(angle) * 27, dy = Math.sin(angle) * 27;
          if (this.raid) {
            this.terrain.moveActor(child, dx, dy, actorRadius(child));
            if (!this.terrain.touchesLand(child.x, child.y, actorRadius(child))) continue;
          } else this.move(child, dx, dy);
          if (children.every(sibling => distance(child, sibling) >= 20)) break;
        }
        if (this.raid && !this.terrain.touchesLand(child.x, child.y, actorRadius(child))) {
          const spawn = this.terrain.safePosition(parent.x, parent.y);
          child.x = spawn.x; child.y = spawn.y;
        }
        child.spawnX = child.x; child.spawnY = child.y;
        child.angle = parent.angle;
        this.actors.push(child);
        children.push(child);
      }
      if (parent === this.player) {
        parent.isPlayer = false;
        this.player = children[0];
        this.player.kills = parent.kills;
      }
      this.addEvent('史莱姆分裂成了三只小史莱姆', 'split');
    }

    random() {
      let x = this.randomState;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.randomState = x >>> 0;
      return this.randomState / 4294967296;
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.countdown = 3;
      this.addEvent(this.raid?'准备就绪 · 五人迎战末影龙':'准备就绪 · 最后存活的阵营获胜', 'info');
    }

    addEvent(text, type = 'info') {
      this.events.push({ id: this._nextId++, text, type, time: this.time });
      if (this.events.length > 12) this.events.shift();
    }

    // Presentation reads by sequence number; adding sounds must not consume game IDs or RNG.
    cue(type, at, actor) {
      this.soundCues.push({ id: ++this.soundSeq, type, x: at.x, y: at.y,
        actorId: actor?.id, actorType: actor?.type });
      if (this.soundCues.length > 128) this.soundCues.shift();
    }

    effect(type, x, y, options = {}) {
      const ttl = options.ttl ?? 0.45;
      this.effects.push({ id: this._nextId++, type, x, y, ttl, maxTtl: ttl, ...options });
      if (type === 'explosion') this.cue('explosion', {x, y});
    }

    dropPosition(x, y) {
      if ((this.map === 'third' || this.raid) && x == null && y == null) {
        // Random ground loot shares the walkable grid. Keep it off actors and
        // other items, including the reserved spot for the next enchanted book.
        if (!this.dropSites) {
          this.dropSites = [];
          for (let j = 40; j < WORLD.height; j += 20) for (let i = 40; i < WORLD.width; i += 20)
            if (this.terrain.canStand(i,j)) this.dropSites.push({x:i,y:j});
        }
        const blocked = [...this.items, ...this.bombs, ...this.actors.filter(a=>a.alive)];
        if (this.dropWarning) blocked.push(this.dropWarning);
        const slots = this.dropSites.filter(p => blocked.every(q => (q.x-p.x)**2 + (q.y-p.y)**2 >= 36**2));
        const safe = slots.filter(p => Math.min(p.x,p.y,WORLD.width-p.x,WORLD.height-p.y) >= this.safeInset);
        const pool = safe.length ? safe : slots;
        if (pool.length) return pool[Math.floor(this.random()*pool.length)];
      }
      const margin = Math.min(340, Math.max(70, this.safeInset + 30));
      x = x ?? margin + this.random() * (WORLD.width - 2 * margin);
      y = y ?? margin + this.random() * (WORLD.height - 2 * margin);
      return this.terrain ? this.terrain.safePosition(x, y) : { x, y };
    }

    spawnItem(type, x, y) {
      if (type !== 'totem' && type !== 'ironSpear' && !WITCH_POTIONS.includes(type) && !this.loot.common.includes(type) && !this.loot.rare.includes(type)) return null;
      ({ x, y } = this.dropPosition(x, y));
      const item = { id: this._nextId++, type, x, y, bornAt: this.time, phase: this.random() * TAU };
      this.items.push(item);
      return item;
    }

    spawnSupply(type) {
      // One scheduled melee supply per slot: four swords, then one spear.
      // Starting gear and dropped weapons go straight to spawnItem.
      if (isBlade(type) && this.loot.common.includes(type) && ++this.swordSupplySlots % 5 === 0) type = 'ironSpear';
      this.spawnItem(type);
    }

    replenish(types, limit) {
      const counts = types.map(type=>this.items.filter(item=>item.type===type).length);
      if (counts.reduce((sum,n)=>sum+n,0) >= limit) return;
      const least = Math.min(...counts), choices = types.filter((_,i)=>counts[i]===least);
      this.spawnSupply(choices[Math.floor(this.random()*choices.length)]);
    }

    update(dt, input = {}) {
      if (!Number.isFinite(dt) || dt <= 0 || !this.started || this.finished) return;
      // Small integration steps retain projectile and collision accuracy after a slow frame.
      let remaining = Math.min(dt, 0.25);
      while (remaining > 0.00001) {
        const step = Math.min(remaining, 1 / 60);
        this._step(step, input);
        if (this.cheats.noCooldown && input.skill) input = {...input,skill:false};
        remaining -= step;
      }
    }

    _step(dt, input) {
      if (this.finished) return;
      if (this.countdown > 0) {
        this.countdown = Math.max(0, this.countdown - dt);
        if (this.countdown <= 0.00001) {
          this.countdown = 0;
          this.status = 'playing';
          this.addEvent(this.raid?'战斗开始！摧毁水晶，击败末影龙':'战斗开始！拾取道具，生存到最后', 'start');
        }
        return;
      }
      this.time += dt;
      this.effects.forEach(effect => { effect.ttl -= dt; });
      this.effects = this.effects.filter(effect => effect.ttl > 0);
      const now = this.time + 1e-8;
      if(!this.raid) for (const type of POTION_TYPES) {
        const count = this.potionDrops[type];
        if (count < 3 && now >= POTION_FIRST_DROPS[type] + count * 20) {
          this.spawnItem(type);
          this.potionDrops[type]++;
        }
      }
      if (now >= this.nextTotemDrop) {
        if (this.items.filter(item => item.type === 'totem').length < 2) this.spawnItem('totem');
        this.nextTotemDrop += 45;
      }
      if(this.raid) {
        if(now>=this.nextWeaponDrop) {
          if(this.items.filter(i=>i.type==='bow').length<5) this.spawnItem('bow');
          if(this.items.filter(i=>isGroundMelee(i.type)).length<5) this.spawnSupply('sword');
          this.nextWeaponDrop+=4;
        }
        if(now>=this.nextTntDrop) {
          if(this.items.filter(i=>i.type==='tnt').length<3) this.spawnItem('tnt');
          this.nextTntDrop+=10;
        }
        if(now>=this.nextDrop) {
          this.replenish(['apple','helmet','sharpBook','powerBook'],10);this.nextDrop+=8;
        }
      } else if (this.map === 'third') {
        if (now >= this.nextTntDrop) { this.spawnItem('tnt'); this.nextTntDrop += 10; }
        if (now >= this.nextWeaponDrop) { this.replenish(this.loot.supplies, 6); this.nextWeaponDrop += 6; }
        if (now >= this.nextDrop) { this.replenish(this.loot.recovery, 4); this.nextDrop += 9; }
      } else {
        if (this.time >= this.nextDrop) {
          const common = this.loot.common;
          if (this.items.length < 22) this.spawnSupply(common[Math.floor(this.random() * common.length)]);
          this.nextDrop += 12;
        }
        if (this.time >= this.nextWeaponDrop) {
          if (this.items.filter(item => isWeapon(item.type)).length < 10)
            this.loot.supplies.forEach(type => this.spawnSupply(type));
          this.nextWeaponDrop += 4;
        }
      }
      if (this.map === 'third' && !this.dropWarning && this.time + 1e-8 >= this.nextAirDrop - 10) {
        this.dropWarning = { ...this.dropPosition(), landsAt: this.nextAirDrop };
      }
      if (this.time + 1e-8 >= this.nextAirDrop) {
        const rare = this.loot.rare;
        let type;
        if (this.map === 'third') {
          if (!this.airdropBag.length) this.airdropBag.push(...rare);
          type = this.airdropBag.splice(Math.floor(this.random() * this.airdropBag.length), 1)[0];
        } else type = rare.length === 1 ? rare[0] : rare[Math.floor(this.random() * rare.length)];
        const drop = this.spawnItem(type, this.dropWarning?.x, this.dropWarning?.y);
        this.dropWarning = null;
        drop.airdrop = true;
        this.effect('airdrop', drop.x, drop.y, { ttl: 2, radius: 48 });
        this.cue('airdrop', drop);
        this.addEvent('高级空投到达 · ' + ITEM_NAMES[drop.type], 'airdrop');
        this.nextAirDrop += this.map === 'third' ? 30 : 45;
      }
      if (!this.raid && this.time > 90) {
        this.safeInset = Math.min(342, WORLD.border + (this.time - 90) * 3);
        if (!this._announcedStorm) {
          this._announcedStorm = true;
          this.addEvent('边界正在收缩，向竞技场中心移动！', 'warning');
        }
      }

      const previousPoses = new Map(this.damageTargets.map(actor => [actor.id, { x: actor.x, y: actor.y, angle: actor.angle, weapon: actor.weapon }]));
      if(this.raid) this.raid.update(dt);
      this.actors.forEach(actor => { actor.swordDiscontinuous = false; });
      for (const actor of this.actors) {
        if (!actor.alive) continue;
        for (const key of ['attackCooldown', 'shootCooldown', 'skillCooldown', 'dashCooldown', 'invulnerable', 'hitFlash', 'attackAnimation', 'drainRemaining']) {
          actor[key] = Math.max(0, actor[key] - dt);
        }
        if (actor.drainRemaining <= 0) actor.drainReady = false;
        if (actor.skillCooldown < 1e-8) actor.skillCooldown = 0;
        if (actor.weapon === 'ironAxe') {
          actor.axeRemaining = Math.max(0, actor.axeExpiresAt - this.time);
          if (actor.axeRemaining < 1e-8) this.equipWeapon(actor,'fist');
        }
        if (actor.regenTicks > 0 && this.time + 1e-8 >= actor.regenNext) {
          actor.regenTicks--;
          actor.regenNext += 1;
          actor.hp = Math.min(actor.maxHp, actor.hp + 0.25);
        }
        if (actor.poisonUntil > 0) {
          if (now >= actor.poisonNext && actor.poisonNext <= actor.poisonUntil + 1e-8) {
            actor.poisonNext += 1;
            const amount = Math.min(0.25, actor.hp - 0.25);
            if (amount > 0) this.damage(actor, amount, this.actors.find(a => a.id === actor.poisonSource),
              { magic: true, poison: true, bypassInvulnerability: true });
          }
          if (now >= actor.poisonUntil) {
            actor.poisonUntil = 0; actor.poisonNext = 0; actor.poisonSource = null;
          }
        }
        if (actor.burnUntil > 0) {
          if (now >= actor.burnNext && actor.burnNext <= actor.burnUntil + 1e-8) {
            actor.burnNext += 1;
            const source = this.actors.find(a => a.id === actor.burnSource);
            this.damage(actor, 0.25, source, { burn: true, bypassInvulnerability: true });
          }
          if (now >= actor.burnUntil || !actor.alive) {
            actor.burnUntil = 0; actor.burnNext = 0; actor.burnSource = null;
          }
          if (!actor.alive) continue;
        }
        const control = actor.isPlayer ? input : this.aiControl(actor, dt);
        let mx = Number(control.x) || 0, my = Number(control.y) || 0;
        const length = Math.hypot(mx, my);
        if (length > 1) { mx /= length; my /= length; }
        const hasAim = Number.isFinite(control.aimX) && Number.isFinite(control.aimY);
        let desiredAngle = actor.angle;
        if (hasAim && Math.hypot(control.aimX - actor.x, control.aimY - actor.y) > 2) {
          desiredAngle = Math.atan2(control.aimY - actor.y, control.aimX - actor.x);
        } else if (length > 0.05 && !hasAim) desiredAngle = Math.atan2(my, mx);
        // Mouse jumps rotate the actual displayed sword over several frames;
        // collision never sweeps an unrendered instantaneous half-circle.
        const maxTurn = isGroundMelee(actor.weapon) || actor.weapon === 'ironAxe' ? Math.PI * 8 * dt : Infinity;
        actor.angle += clamp(angleDifference(desiredAngle, actor.angle), -maxTurn, maxTurn);
        actor.inWater = this.terrain ? !!this.terrain.isWater?.(actor.x, actor.y) : inWater(actor.x, actor.y);
        const speed = 190 * (actor.isPlayer ? 1 : this.level.speed) * (actor.inWater ? 0.60 : 1);
        if (this.terrain?.isSlippery(actor.x, actor.y)) {
          const traction = 1 - Math.exp(-dt * (length > 0.05 ? 5 : 2.3));
          actor.slideX += (mx * speed - actor.slideX) * traction;
          actor.slideY += (my * speed - actor.slideY) * traction;
        } else {
          actor.slideX = mx * speed;
          actor.slideY = my * speed;
        }
        // Webs take priority over slow arrows for both walking and ice momentum.
        const moveTime = this.isInWeb(actor) ? dt * 0.20 : dt - Math.min(actor.slowRemaining, dt) * 0.5;
        actor.slowRemaining = Math.max(0, actor.slowRemaining - dt);
        if (actor.slowRemaining < 1e-8) actor.slowRemaining = 0;
        actor.moving = Math.hypot(actor.slideX, actor.slideY) > 7;
        if (actor.moving) actor.walkPhase += moveTime * speed / 12;
        this.move(actor, actor.slideX * moveTime + actor.vx * dt, actor.slideY * moveTime + actor.vy * dt);
        if(!actor.alive) continue;
        actor.vx *= Math.exp(-dt * 11); actor.vy *= Math.exp(-dt * 11);
        if (control.dash && actor.dashCooldown <= 0) this.dash(actor, mx, my);
        if (!actor.alive) continue;
        const cast = control.skill && actor.skillCooldown <= 0 && this.useSkill(actor);
        if (!actor.alive) continue;
        if (!actor.isPlayer && actor.blazeVolley && now >= actor.blazeVolley.next)
          this.fireBlazeShot(actor, desiredAngle);
        if (control.shoot && !(cast && actor.type === 'witch')) this.shoot(actor);
        this.pickUp(actor);
        if (!this.raid && this.time > 90) {
          const s = this.safeInset;
          const exposed = actor.x < s || actor.x > WORLD.width - s || actor.y < s || actor.y > WORLD.height - s;
          if (exposed) {
            actor.stormTimer -= dt;
            if (actor.stormTimer <= 0) {
              actor.stormTimer = 1.7;
              this.damage(actor, 1, null, { storm: true, bypassInvulnerability: true });
            }
          } else actor.stormTimer = 1.5;
        }
      }
      this.separateActors();
      this.updateSwordContacts(previousPoses);
      this.updateProjectiles(dt);
      this.updateBombs();
      for (const actor of this.actors) actor.inWeb = actor.alive && this.isInWeb(actor);
      this.checkEnd();
    }

    isInWeb(actor) {
      return actor.type !== 'spider' && this.webs.some(web => distance(actor, web) <= web.radius && this.clearLine(web, actor));
    }

    move(actor, dx, dy) {
      if (this.terrain) {
        this.terrain.moveActor(actor, dx, dy, actorRadius(actor));
        if(this.raid && actor.alive && !this.terrain.touchesLand(actor.x,actor.y,actorRadius(actor))) {
          if (actor === this.player && this.cheats.invincible) {
            const shore = this.terrain.safePosition(actor.x,actor.y);
            actor.x=shore.x; actor.y=shore.y; actor.vx=actor.vy=0;
            return;
          }
          actor.hp=0;
          this.eliminate(actor,null,true);
        }
        return;
      }
      const margin = WORLD.border + actorRadius(actor);
      actor.x = clamp(actor.x + dx, margin, WORLD.width - margin);
      actor.y = clamp(actor.y + dy, margin, WORLD.height - margin);
    }

    separateActors() {
      for (let i = 0; i < this.actors.length; i++) {
        const a = this.actors[i]; if (!a.alive) continue;
        for (let j = i + 1; j < this.actors.length; j++) {
          const b = this.actors[j]; if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          const gap = actorRadius(a) + actorRadius(b);
          if (d < gap) {
            const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
            const correction = (gap - d) * 0.5;
            this.move(a, -ux * correction, -uy * correction);
            this.move(b, ux * correction, uy * correction);
          }
        }
      }
    }

    openingPatrolPoint(actor) {
      const heading = this.random() * TAU;
      const radius = 60 + this.random() * 36;
      const margin = WORLD.border + WORLD.actorRadius;
      let farthest, farthestDistance = -1;
      for (let i = 0; i < 8; i++) {
        const angle = heading + i * TAU / 8;
        const x = clamp(actor.spawnX + Math.cos(angle) * radius, margin, WORLD.width - margin);
        const y = clamp(actor.spawnY + Math.sin(angle) * radius, margin, WORLD.height - margin);
        const point = this.terrain ? this.terrain.safePosition(x, y) : { x, y };
        const travel = distance(actor, point);
        if (travel >= 60 && this.clearLine(actor, point, WORLD.actorRadius)) return point;
        if (travel > farthestDistance) { farthest = point; farthestDistance = travel; }
      }
      // In a tight corridor the regular pathfinder can route around a corner.
      return farthest;
    }

    aiControl(actor, dt) {
      if(this.raid) return this.raid.control(actor,dt);
      actor.aiTimer -= dt;
      const enemies = this.opponentsOf(actor);
      if (!enemies.length) {
        actor.aiTargetId = null;
        actor.aiGoal = null;
        return {};
      }
      let target = enemies.find(other => other.id === actor.aiTargetId);
      const looting = this.time < 9;
      const holdingHeal = actor.weapon === 'healingPotion';
      const needsWeapon = actor.weapon === 'fist' || holdingHeal;
      const patrol = looting && actor.aiGoal?.roam;
      const reachedPatrol = patrol && distance(actor, patrol) <= WORLD.actorRadius;
      if (actor.aiTimer <= 0 || !actor.aiGoal || reachedPatrol) {
        actor.aiTimer = this.level.reaction + this.random() * 0.35;
        // Opponents prefer a free duel. The same rule applies to humans and bots;
        // nobody receives hidden damage immunity or a special targeting exemption.
        const scoredTargets = enemies.map(other => {
          const contenders = this.actors.filter(bot => bot !== actor && bot.alive && bot.aiTargetId === other.id && distance(bot, other) < 300).length;
          return { actor: other, score: distance(actor, other) + contenders * 700 };
        }).sort((a, b) => a.score - b.score);
        target = scoredTargets[0].actor;
        actor.aiTargetId = target.id;
        const d = distance(actor, target);
        const useful = this.items.filter(item => {
          // The opening scramble starts in each fighter's own corner of the map.
          if (looting && Math.hypot(item.x - actor.spawnX, item.y - actor.spawnY) > OPENING_SEARCH_RADIUS) return false;
          if ((actor.weaponPickupContacts || []).includes(item.id)) return false;
          if (item.type === 'totem' && actor.hasTotem) return false;
          if (isArmor(item.type) && actor.armor >= 1) return false;
          if (snowHealing[item.type] && actor.hp >= actor.maxHp) return false;
          if (item.type === 'regenPotion' && actor.hp >= actor.maxHp) return false;
          if (item.type === 'apple' && actor.hp >= actor.maxHp && actor.shield >= 1) return false;
          if (item.type === 'enchanted' && actor.hp >= actor.maxHp && actor.shield >= 2) return false;
          return true;
        }).map(item => {
          let value = 1;
          if (item.type === 'totem') value = actor.hp <= 1 ? 4.5 : 3;
          if (item.type === 'apple' || item.type === 'enchanted') value = actor.hp < actor.maxHp ? 4 : actor.shield < 1 ? 1.8 : 0.35;
          if (snowHealing[item.type]) value = item.type === 'potato' ? 4 : 2;
          if (item.type === 'regenPotion') value = actor.regenTicks ? 1 : 3;
          if (item.type === 'healingPotion') value = actor.hp < actor.maxHp ? 4 : 0.3;
          if (item.type === 'sharpBook' || item.type === 'powerBook') value = 2.6;
          if (isGroundMelee(item.type)) value = needsWeapon ? 3.8 : 0.35;
          if (isRanged(item.type)) value = needsWeapon ? (actor.type === 'skeleton' ? 3 : 2.2) : 0.3;
          if (item.type === 'tnt' || isSplashPotion(item.type)) value = needsWeapon ? 3.2 : 0.3;
          if (isArmor(item.type)) value = actor.armor < 1 ? 1.8 : 0.1;
          return { item, score: distance(actor, item) / value };
        }).sort((a, b) => a.score - b.score);
        const itemThreshold = looting || needsWeapon ? 900 : Math.min(d * 1.05, 240);
        if (useful[0] && useful[0].score < itemThreshold) {
          actor.aiGoal = { itemId: useful[0].item.id };
        } else if (looting) {
          if (!patrol || reachedPatrol) actor.aiGoal = { roam: this.openingPatrolPoint(actor) };
        } else if (needsWeapon) {
          actor.aiGoal = { roam: { x: 90 + this.random() * 540, y: 90 + this.random() * 780 } };
        } else {
          actor.aiGoal = { targetId: target.id };
        }
        actor.aiAimError = (this.random() - 0.5) * this.level.accuracy;
      }
      if (!target) { target = enemies[0]; actor.aiTargetId = target.id; }
      const d = distance(actor, target);
      let goal = actor.aiGoal.itemId ? this.items.find(item => item.id === actor.aiGoal.itemId) : actor.aiGoal.roam || target;
      if (!goal) { actor.aiGoal = null; goal = target; }
      if (actor.weapon === 'ironAxe') goal = target;
      const visibleTarget = !this.terrain || this.clearLine(actor, target);
      const holdingPotion = isSplashPotion(actor.weapon);
      // Allow for both square heads at a diagonal and the bottle breaking on contact.
      const safeThrowDistance = POTION_RADIUS + (2 * WORLD.actorRadius + BOTTLE_RADIUS) * Math.SQRT2;
      const edge = this.safeInset + 30;
      const returning = this.time > 90 && (actor.x < edge || actor.x > 720 - edge || actor.y < edge || actor.y > 960 - edge);
      if (returning && this.terrain) goal = this.terrain.safePosition(360, 480);
      const waypoint = this.terrain ? this.terrain.nextWaypoint(actor, goal, actorRadius(actor)) : goal;
      let dx = waypoint.x - actor.x, dy = waypoint.y - actor.y;
      const goalDistance = Math.hypot(dx, dy) || 1;
      dx /= goalDistance; dy /= goalDistance;
      if (goal === target && visibleTarget) {
        const wantsRanged = isRanged(actor.weapon) && actor.ammo > 0;
        if ((holdingPotion && d <= safeThrowDistance) || (actor.weapon === 'ironSpear' && d < 56)) { dx *= -1; dy *= -1; }
        else if (wantsRanged && d < 180) { dx *= -0.75; dy *= -0.75; }
        else if (wantsRanged && d < 290) {
          const ox = dx; dx = -dy * actor.aiStrafe; dy = ox * actor.aiStrafe;
        } else if (d < 65 && (isBlade(actor.weapon) || actor.weapon === 'ironAxe')) { dx *= 0.15; dy *= 0.15; }
      }
      const retreatToBrew = actor.type === 'witch' && !looting && d < 160 && !returning;
      if (needsWeapon && visibleTarget && (retreatToBrew || (d < 100 && !actor.aiGoal?.itemId && !(returning && this.terrain)))) {
        dx = (actor.x - target.x) / (d || 1); dy = (actor.y - target.y) / (d || 1);
      }
      if (returning && !this.terrain) {
        const centerDistance = Math.hypot(360 - actor.x, 480 - actor.y) || 1;
        dx = (360 - actor.x) / centerDistance; dy = (480 - actor.y) / centerDistance;
      }
      // The planter retreats at once; other fighters react as the fuse flashes faster.
      const danger = this.bombs.find(bomb => (bomb.ownerId === actor.id || bomb.fuse <= 0.6)
        && distance(actor, bomb) < bomb.radius + 12 && this.clearLine(actor, bomb));
      if (danger) {
        const away = distance(actor, danger) > 1 ? Math.atan2(actor.y - danger.y, actor.x - danger.x)
          : Math.atan2(actor.y - target.y, actor.x - target.x);
        const margin = WORLD.border + WORLD.actorRadius;
        let best = -Infinity;
        for (const offset of [0, 1, -1, 2, -2, 3, -3, 4]) {
          const dir = away + offset * Math.PI / 4;
          const to = { x: clamp(actor.x + Math.cos(dir) * 42, margin, WORLD.width - margin),
            y: clamp(actor.y + Math.sin(dir) * 42, margin, WORLD.height - margin) };
          const step = distance(actor, to);
          if (step < 1 || !this.clearLine(actor, to, WORLD.actorRadius)) continue;
          const score = distance(to, danger) - Math.abs(offset) * 0.1;
          if (score > best) { best = score; dx = (to.x - actor.x) / step; dy = (to.y - actor.y) / step; }
        }
      }
      const aiming = goal === target || (visibleTarget && !looting &&
        (holdingPotion || (this.terrain && isRanged(actor.weapon)) || ((actor.type === 'stray' || actor.type === 'blaze') && actor.skillCooldown <= 0)));
      const facing = aiming ? Math.atan2(target.y - actor.y, target.x - actor.x) : Math.atan2(dy, dx);
      const aim = facing + (actor.aiAimError || 0);
      const skillRange = skillRanges[actor.type] ?? 350;
      const shouldDrink = holdingHeal && actor.hp < actor.maxHp;
      const shouldBrew = d < 330 && (actor.weapon === 'fist' ||
        (actor.hp <= actor.maxHp - 1 && !holdingPotion && !holdingHeal));
      return {
        x: dx, y: dy, aimX: actor.x + Math.cos(aim) * 250, aimY: actor.y + Math.sin(aim) * 250,
        attack: false,
        shoot: shouldDrink || (!looting && visibleTarget && ((holdingPotion && d > safeThrowDistance && d <= POTION_RANGE + POTION_RADIUS)
          || (actor.weapon === 'tnt' ? d < TNT_RADIUS * 0.7 : isRanged(actor.weapon) && d > 40 && d < 360 && actor.ammo > 0))),
        skill: actor.type !== 'slime' && this.time >= 12 && actor.skillCooldown <= 0 && (actor.type === 'witch' ? shouldBrew :
          visibleTarget && d < skillRange && this.random() < dt * this.level.skillChance * 0.6),
        dash: !looting && ((actor.weapon === 'ironSpear' && goal === target && visibleTarget && !danger && !returning && d > 96 && d < 180)
          || (d < 80 && actor.hp === 1 && this.random() < dt * 0.4))
      };
    }

    melee(actor) {
      // Retained as a harmless compatibility stub: no button can swing or punch.
      return false;
    }

    updateSwordContacts(previousPoses = null) {
      for (const actor of this.actors) {
        const axe = actor.weapon === 'ironAxe';
        const spear = actor.weapon === 'ironSpear';
        if (!actor.alive || (!isGroundMelee(actor.weapon) && !axe) || actor.weaponUses !== 1) continue;
        const geometryFor = spear ? getSpearGeometry : axe ? getAxeGeometry : getSwordGeometry;
        const intersects = spear || axe ? spriteEdgeIntersectsHead : swordIntersectsHead;
        const tipReach = spear ? 14 + SPEAR_LENGTH : 58;
        const old = previousPoses?.get(actor.id);
        const from = old && old.weapon === actor.weapon && !actor.swordDiscontinuous ? old : actor;
        const angleDelta = angleDifference(actor.angle, from.angle);
        const candidates = [];
        for (const target of this.damageTargets) {
          if (!target.alive || target === actor || target.invulnerable > 0) continue;
          const oldTarget = previousPoses?.get(target.id);
          const targetFrom = oldTarget && !target.swordDiscontinuous ? oldTarget : target;
          const headRadius = actorRadius(target);
          const reach = tipReach + headRadius * Math.SQRT2;
          if (Math.max(from.x, actor.x) + reach < Math.min(targetFrom.x, target.x)
            || Math.min(from.x, actor.x) - reach > Math.max(targetFrom.x, target.x)
            || Math.max(from.y, actor.y) + reach < Math.min(targetFrom.y, target.y)
            || Math.min(from.y, actor.y) - reach > Math.max(targetFrom.y, target.y)) continue;
          const travel = Math.hypot(actor.x - from.x, actor.y - from.y) + Math.abs(angleDelta) * tipReach
            + Math.hypot(target.x - targetFrom.x, target.y - targetFrom.y);
          const samples = Math.max(1, Math.ceil(travel / 1.25));
          for (let sample = 0; sample <= samples; sample++) {
            const t = sample / samples;
            const pose = { x: from.x + (actor.x - from.x) * t, y: from.y + (actor.y - from.y) * t, angle: from.angle + angleDelta * t };
            const head = { x: targetFrom.x + (target.x - targetFrom.x) * t, y: targetFrom.y + (target.y - targetFrom.y) * t, hitRadius:headRadius, base:target.base, raidKind:target.raidKind };
            const geometry = geometryFor(pose);
            if (intersects(geometry, head) && this.clearLine(pose, head)) {
              candidates.push({ target, t, distance: distance(pose, head),
                hitX: clamp(geometry.tipX, head.x - headRadius, head.x + headRadius), hitY: clamp(geometry.tipY, head.y - headRadius, head.y + headRadius) });
              break;
            }
          }
        }
        candidates.sort((a, b) => a.t - b.t || a.distance - b.distance || a.target.id.localeCompare(b.target.id));
        const hit = candidates[0];
        if (!hit) continue;
        const oldHp = hit.target.hp, drain = actor.drainReady;
        const damage = spear ? 1 + this.spearHoldBonus(actor) + (this.time + 1e-8 < actor.spearBoostUntil ? 0.5 : 0)
          : axe ? 2 : (actor.weapon === 'stoneSword' ? 0.75 : 1) + actor.meleeBonus;
        if (this.damage(hit.target, damage, actor, { knockback: 230 })) {
          if (drain && hit.target.hp < oldHp) {
            actor.hp = Math.min(actor.maxHp, actor.hp + 1);
            this.effect('heal', actor.x, actor.y, { text: '+1', color: '#a2efa0', ttl: 0.8 });
          }
          this.equipWeapon(actor, 'fist');
          this.effect('swordHit', hit.hitX, hit.hitY, { angle: actor.angle, color: '#f6f1c6', ttl: 0.24 });
          this.cue(axe ? 'axeHit' : 'swordHit', {x:hit.hitX, y:hit.hitY}, actor);
        }
      }
    }

    shoot(actor) {
      if (actor.weapon === 'healingPotion') {
        if (!actor.alive || actor.weaponUses !== 1) return false;
        const restored = Math.min(1, actor.maxHp - actor.hp);
        actor.hp += restored;
        this.equipWeapon(actor, 'fist');
        this.cue(actor.type === 'witch' ? 'witchDrink' : 'drink', actor, actor);
        if (restored > 0) this.effect('heal', actor.x, actor.y, { text: '+' + restored, color: '#aeeba2', ttl: 0.7 });
        return true;
      }
      if (actor.weapon === 'tnt') return this.placeTnt(actor);
      if (isSplashPotion(actor.weapon)) {
        if (!actor.alive || actor.weaponUses !== 1) return false;
        this.projectiles.push({ id: this._nextId++, type: actor.weapon, ownerId: actor.id,
          x: actor.x, y: actor.y, angle: actor.angle, speed: 330, remaining: POTION_RANGE, ttl: POTION_RANGE / 330,
          leftThrower: false });
        this.cue('potionThrow', actor, actor);
        this.equipWeapon(actor, 'fist');
        if (actor.isPlayer) this.stats.shots++;
        return true;
      }
      if (!actor.alive || actor.shootCooldown > 0 || !isRanged(actor.weapon) || actor.ammo <= 0) return false;
      actor.shootCooldown = actor.isPlayer ? 0.55 : 4.2 + (this.difficulty === 'easy' ? 0.6 : this.difficulty === 'hard' ? -0.7 : 0);
      const shot = RANGED_SHOTS.get(actor.weapon);
      this.cue(shot === 'snowball' ? 'snowball' : shot === 'arrow' ? 'bow' : 'crossbow', actor, actor);
      this.fireProjectile(actor, actor.angle, shot, shot === 'snowball' ? 0 : actor.rangedBonus);
      this.equipWeapon(actor, 'fist');
      if (actor.isPlayer) this.stats.shots++;
      return true;
    }

    equipWeapon(actor, weapon) {
      actor.weapon = isWeapon(weapon) || weapon === 'ironAxe' ? weapon : 'fist';
      actor.spearEquippedAt = actor.weapon === 'ironSpear' ? this.time : null;
      actor.axeRemaining = actor.weapon === 'ironAxe' ? 4 : 0;
      actor.axeExpiresAt = actor.axeRemaining ? this.time + actor.axeRemaining : 0;
      actor.weaponUses = actor.weapon === 'fist' ? 0 : 1;
      actor.ammo = isRanged(actor.weapon) ? 1 : 0;
      actor.drainReady = false;
      actor.drainRemaining = 0;
    }

    placeTnt(actor) {
      if (!actor.alive || actor.weapon !== 'tnt' || actor.weaponUses !== 1) return false;
      this.bombs.push({ id: this._nextId++, x: actor.x, y: actor.y, ownerId: actor.id,
        fuse: TNT_FUSE, detonateAt: this.time + TNT_FUSE, radius: TNT_RADIUS });
      this.cue('tntPrime', actor, actor);
      this.equipWeapon(actor, 'fist');
      return true;
    }

    updateBombs() {
      if (!this.bombs.length) return;
      for (const bomb of this.bombs) {
        bomb.fuse = Math.max(0, bomb.detonateAt - this.time);
        if (bomb.fuse > 1e-8) continue;
        const owner = this.actors.find(actor => actor.id === bomb.ownerId);
        this.explode(bomb,bomb.radius,owner,'tnt');
      }
      this.bombs = this.bombs.filter(bomb => bomb.fuse > 1e-8);
    }

    explode(origin,radius,owner,sourceType) {
      this.effect('explosion',origin.x,origin.y,{sourceType,radius,ttl:.65,color:sourceType==='crystal'?'#e99eff':'#ffac61'});
      for(const target of this.damageTargets.filter(a=>a.alive)) {
        const d=distance(target,origin);
        if(d>=radius || !this.clearLine(origin,target)) continue;
        const intensity=1-d/radius;
        this.damage(target,.5+Math.round(10*intensity)/4,owner,{origin,knockback:300*intensity});
      }
    }

    fireProjectile(actor, angle, type = 'arrow', weaponBonus = 0) {
      const speed = type === 'fireball' ? 290 : type === 'bolt' ? 505 : type === 'snowball' ? 360 : 410;
      const damage = type === 'fireball' ? 0 : type === 'snowball' ? 0.25 : type === 'bolt' ? 2 : type === 'firework' ? 1.5 : 1;
      // In the End the muzzle can already overlap a perched target. Include
      // the stretch from the shooter's centre when testing the first impact.
      const offset = this.raid ? 0 : 23;
      const projectile = { id: this._nextId++, x: actor.x + Math.cos(angle) * offset, y: actor.y + Math.sin(angle) * offset,
        angle, ownerId: actor.id, type, ttl: type === 'fireball' ? 2.4 : 2.2, speed, damage: damage + weaponBonus };
      if (!this.clearLine(actor, projectile, 2)) {
        if (arrowLike(type)) this.cue('arrowHit', actor, actor);
        return null;
      }
      this.projectiles.push(projectile);
      this.effect('muzzle', projectile.x, projectile.y, { ttl: 0.12, color: type === 'fireball' ? '#ffd266' : '#f3e3b5' });
      return projectile;
    }

    dash(actor, dx = 0, dy = 0) {
      if (!actor.alive || actor.dashCooldown > 0) return false;
      const angle = Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : actor.angle;
      actor.dashCooldown = 3;
      actor.spearBoostUntil = this.time + 1;
      actor.invulnerable = Math.max(actor.invulnerable, 0.24);
      const oldX = actor.x, oldY = actor.y;
      this.move(actor, Math.cos(angle) * 100, Math.sin(angle) * 100);
      this.effect('dash', oldX, oldY, { toX: actor.x, toY: actor.y, angle, ttl: 0.3, color: actor.color });
      return true;
    }

    fireBlazeShot(actor, angle = actor.angle) {
      const volley = actor.blazeVolley;
      if (!actor.alive || !volley) return false;
      this.cue('blazeShoot', actor, actor);
      this.fireProjectile(actor, angle, 'fireball');
      if (--volley.left === 0) {
        actor.blazeVolley = null;
        actor.skillCooldown = actor.isPlayer && this.cheats.noCooldown ? 0 : CHARACTERS.blaze.skillCooldown * (actor.isPlayer ? 1 : 1.5);
      } else if (!actor.isPlayer) volley.next = this.time + 0.3;
      return true;
    }

    ignite(victim, ownerId) {
      // A repeat hit extends the flame, not the damage rate or time to the next tick.
      if (victim.burnUntil <= this.time) {
        victim.burnNext = this.time + 1;
        this.cue('ignite', victim, victim);
      }
      victim.burnUntil = this.time + 3;
      victim.burnSource = ownerId;
    }

    useSkill(actor) {
      if (!actor.alive || actor.type === 'slime' || actor.skillCooldown > 0 || actor.blazeVolley) return false;
      if (actor.type === 'zombie' && !isBlade(actor.weapon)) return false;
      if (actor.isPlayer) this.stats.skills++;
      if (actor.type === 'blaze') {
        actor.blazeVolley = { left: 3 };
        if (!actor.isPlayer) this.fireBlazeShot(actor);
        return true;
      }
      actor.skillCooldown = actor.isPlayer && this.cheats.noCooldown ? 0 : CHARACTERS[actor.type].skillCooldown * (actor.isPlayer || actor.type === 'vindicator' || actor.type === 'witch' ? 1 : 1.5);
      const enemies = this.damageTargets.filter(other => other !== actor && other.alive);
      if (actor.type === 'creeper') {
        this.effect('explosion', actor.x, actor.y, { radius: 128, ttl: 0.55, color: '#c4fa85' });
        enemies.filter(other => distance(actor, other) < 128 && this.clearLine(actor, other)).forEach(other => this.damage(other, 1, actor, { knockback: 450 }));
      } else if (actor.type === 'vindicator') {
        this.equipWeapon(actor,'ironAxe');
        this.cue('axeSummon',actor,actor);
      } else if (actor.type === 'witch') {
        const potion = WITCH_POTIONS[Math.floor(this.random() * WITCH_POTIONS.length)];
        this.equipWeapon(actor, potion);
        // Loot underfoot may replace this hand only after the witch leaves and returns.
        const contacts = new Set(actor.weaponPickupContacts);
        for (const item of this.nearbyWeapons(actor)) contacts.add(item.id);
        actor.weaponPickupContacts = [...contacts];
        this.cue('witchBrew', actor, actor);
      } else if (actor.type === 'zombie') {
        actor.drainReady = true;
        actor.drainRemaining = 6;
        this.effect('heal', actor.x, actor.y, { text: '吸血蓄能', color: '#a2efa0', ttl: 0.7 });
      } else if (actor.type === 'skeleton') {
        this.cue('bow', actor, actor);
        [-0.18, 0, 0.18].forEach(offset => this.fireProjectile(actor, actor.angle + offset));
      } else if (actor.type === 'stray') {
        this.cue('bow', actor, actor);
        this.fireProjectile(actor, actor.angle, 'slowArrow');
      } else if (actor.type === 'spider') {
        this.webs.push({ id: this._nextId++, ownerId: actor.id, x: actor.x, y: actor.y, radius: 55 });
        this.cue('web', actor, actor);
      } else if (actor.type === 'enderman') {
        const oldX = actor.x, oldY = actor.y;
        this.move(actor, Math.cos(actor.angle) * 180, Math.sin(actor.angle) * 180);
        actor.swordDiscontinuous = true;
        actor.invulnerable = Math.max(actor.invulnerable, 0.75);
        this.effect('teleport', oldX, oldY, { radius: 40, ttl: 0.65, color: '#ca8cff' });
        this.effect('teleport', actor.x, actor.y, { radius: 40, ttl: 0.65, color: '#ca8cff' });
        this.cue('teleport', actor, actor);
      }
      return true;
    }

    damage(target, amount, source = null, options = {}) {
      if (target === this.player && this.cheats.invincible) return false;
      if(target.raidKind) return this.raid.hit(target,amount,source,options);
      if (!target.alive || target.totemUsedAt === this.time ||
          (target.invulnerable > 0 && !options.bypassInvulnerability)) return false;
      if (!options.burn && !options.poison) target.invulnerable = options.storm ? 0.1 : 0.48;
      target.hitFlash = 0.25;
      target.lastDamageBy = source ? source.id : null;
      if (source && options.knockback) {
        const origin = options.origin || source;
        const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
        target.vx += Math.cos(angle) * options.knockback;
        target.vy += Math.sin(angle) * options.knockback;
      }
      if (target.armor > 0 && !options.storm && !options.magic) {
        target.armor--;
        if (target.armor === 0) target.armorType = null;
        this.effect('block', target.x, target.y, { text: '格挡', color: '#d5e2eb', ttl: 0.65 });
        this.cue('block', target, target);
        if (target.isPlayer) this.addEvent((this.map==='ice' ? ITEM_NAMES.boots : ITEM_NAMES.helmet) + '挡住了一次攻击', 'block');
        return true;
      }
      const absorbed = options.poison ? 0 : Math.min(target.shield, amount);
      target.shield -= absorbed;
      const healthDamage = Math.min(target.hp, amount - absorbed);
      target.hp = Math.max(0, target.hp - healthDamage);
      if (healthDamage > 0) this.cue('hurt', target, target);
      else if (absorbed > 0) this.cue('block', target, target);
      if (source?.isPlayer && target !== source) this.stats.damageDealt += healthDamage + absorbed;
      if (target.isPlayer) this.stats.damageTaken += healthDamage + absorbed;
      this.effect('hit', target.x, target.y, { text: '-' + amount, color: absorbed === amount ? '#ffdf73' : '#ff8d7e', ttl: 0.65 });
      if (target.hp <= 0 && target.hasTotem) {
        target.hasTotem = false;
        target.totemUsedAt = this.time;
        target.hp = 1;
        target.invulnerable = Math.max(target.invulnerable, 0.48);
        this.effect('totem', target.x, target.y, { ttl: 0.8, color: '#ffe18c' });
        this.cue('totemUse', target, target);
        this.addEvent(target.name + ' 的不死图腾生效', 'block');
        return true;
      }
      if (target.hp <= 0) this.eliminate(target,source);
      return true;
    }

    eliminate(target,source,fell=false) {
        target.alive = false;
        target.blazeVolley = null;
        target.burnUntil = 0; target.burnNext = 0; target.burnSource = null;
        target.poisonUntil = 0; target.poisonNext = 0; target.poisonSource = null;
        this.cue('thunder', target, target);
        target.deathTime = this.time;
        target.rank = this.remaining + 1;
        if (source && source !== target) {
          source.kills++;
          if (source.isPlayer) this.stats.kills++;
        }
        this.effect('death', target.x, target.y, { radius: 40, color: target.color, ttl: 1.0 });
        this.addEvent((fell ? target.name+' 坠入了虚空' : (source ? source.name : '收缩边界') + ' 淘汰了 ' + target.name) + (target.isPlayer ? '（你）' : ''), 'kill');
        if (target.weapon !== 'fist') {
          if (!fell && target.weapon !== 'ironAxe' && !(this.raid && WITCH_POTIONS.includes(target.weapon)))
            this.spawnItem(target.weapon, target.x, target.y);
          this.equipWeapon(target, 'fist');
        }
        if (!fell && target.type === 'slime' && !target.isMiniSlime) this.splitSlime(target);
    }

    nearbyWeapons(actor) {
      return this.items.filter(item => isWeapon(item.type) && distance(actor, item) <= 29 && this.clearLine(actor, item));
    }

    setCheat(name, enabled) {
      if (!Object.hasOwn(this.cheats,name)) return;
      this.cheats[name]=!!enabled;
      if (name==='noCooldown' && enabled) this.player.skillCooldown=0;
    }

    grantItem(type) {
      const actor=this.player;
      if (this.finished || !actor.alive || !Object.hasOwn(ITEM_NAMES,type)) return false;
      this.applyItem(actor,type);
      if (isWeapon(type) || type==='ironAxe')
        actor.weaponPickupContacts=this.nearbyWeapons(actor).map(i=>i.id);
      this.addEvent('获得了 '+ITEM_NAMES[type],'pickup');
      return true;
    }

    applyItem(actor,type) {
      if (isWeapon(type) || type==='ironAxe') this.equipWeapon(actor,type);
      else if (type==='totem') actor.hasTotem=true;
      else if (isArmor(type)) {actor.armor=1; actor.armorType=type;}
      else if (type==='sharpBook') actor.meleeBonus+=0.25;
      else if (type==='powerBook') actor.rangedBonus+=0.25;
      else if (type==='regenPotion') {actor.regenTicks=8; actor.regenNext=this.time+1;}
      else if (snowHealing[type]) actor.hp=Math.min(actor.maxHp,actor.hp+snowHealing[type]);
      else {
        actor.hp=Math.min(actor.maxHp,actor.hp+(type==='enchanted'?3:1));
        actor.shield=Math.max(actor.shield,type==='enchanted'?2:1);
      }
    }

    pickUp(actor) {
      if (!actor.alive) return;
      // A pile can replace the hand once per entry, never once per frame. Contacts
      // release beyond 42px, so small movement at the 29px pickup edge cannot flicker.
      const contacts = new Set((actor.weaponPickupContacts || []).filter(id => {
        const item = this.items.find(candidate => candidate.id === id);
        return item && distance(actor, item) <= 42;
      }));
      // A just-summoned axe must not be replaced automatically underfoot in its casting frame.
      const nearbyWeapons = actor.weapon === 'ironAxe' ? [] : this.nearbyWeapons(actor);
      const candidates = nearbyWeapons.filter(item => !contacts.has(item.id))
        .sort((a, b) => distance(actor, a) - distance(actor, b) || a.id - b.id);
      const weaponToPick = candidates.find(item => item.id === actor.aiGoal?.itemId) || candidates[0];
      nearbyWeapons.forEach(item => contacts.add(item.id));
      actor.weaponPickupContacts = Array.from(contacts);
      for (let index = this.items.length - 1; index >= 0; index--) {
        const item = this.items[index];
        if (distance(actor, item) > 29 || !this.clearLine(actor, item)) continue;
        if (isWeapon(item.type) && item !== weaponToPick) continue;
        if (item.type === 'totem' && actor.hasTotem) continue;
        if (isArmor(item.type) && actor.armor >= 1) continue;
        if (item.type === 'apple' && actor.hp >= actor.maxHp && actor.shield >= 1) continue;
        if (item.type === 'enchanted' && actor.hp >= actor.maxHp && actor.shield >= 2) continue;
        if (snowHealing[item.type] && actor.hp >= actor.maxHp) continue;
        if (item.type === 'regenPotion' && actor.hp >= actor.maxHp) continue;
        this.applyItem(actor,item.type);
        this.items.splice(index, 1);
        const sound = isArmor(item.type) ? 'equip' : item.type === 'sharpBook' || item.type === 'powerBook' ? 'enchant'
          : item.type === 'regenPotion' ? 'drink'
          : item.type === 'apple' || item.type === 'enchanted' || snowHealing[item.type] ? 'eat' : 'pickup';
        this.cue(sound, actor, actor);
        this.effect('pickup', actor.x, actor.y - 22, { text: ITEM_NAMES[item.type], color: '#ffe596', ttl: 0.9 });
        if (actor.isPlayer) {
          this.stats.pickups++;
          this.addEvent('拾取了 ' + ITEM_NAMES[item.type], 'pickup');
        }
      }
    }

    advancePotion(bottle, dt) {
      const step = Math.min(bottle.speed * dt, bottle.remaining);
      const ux = Math.cos(bottle.angle), uy = Math.sin(bottle.angle);
      const pointAt = d => ({ x: bottle.x + ux * d, y: bottle.y + uy * d });
      const margin = WORLD.border + BOTTLE_RADIUS;
      const clearTo = d => {
        const end = pointAt(d);
        if (!this.terrain) return end.x >= margin && end.y >= margin &&
          end.x <= WORLD.width - margin && end.y <= WORLD.height - margin;
        return this.clearLine(bottle, end, BOTTLE_RADIUS);
      };
      let travel = step;
      let shattered = step === bottle.remaining;
      if (!clearTo(step)) {
        // Use the near face of the first wall so that its far side is shielded.
        let clear = 0, blocked = step;
        while (blocked - clear > 0.02) {
          const mid = (blocked + clear) / 2;
          if (clearTo(mid)) clear = mid;
          else blocked = mid;
        }
        travel = clear;
        shattered = true;
      }
      for (const actor of this.damageTargets) {
        if (!actor.alive) continue;
        const halfSize = actorRadius(actor) + BOTTLE_RADIUS;
        const dx = actor.x - bottle.x, dy = actor.y - bottle.y;
        if (actor.id === bottle.ownerId && !bottle.leftThrower) {
          if (Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize) continue;
          bottle.leftThrower = true;
        }
        // Intersect the moving bottle with the square head on each axis.
        if ((!ux && Math.abs(dx) > halfSize) || (!uy && Math.abs(dy) > halfSize)) continue;
        const tx1 = ux ? (dx - halfSize) / ux : -Infinity, tx2 = ux ? (dx + halfSize) / ux : Infinity;
        const ty1 = uy ? (dy - halfSize) / uy : -Infinity, ty2 = uy ? (dy + halfSize) / uy : Infinity;
        const hit = Math.max(0, Math.min(tx1, tx2), Math.min(ty1, ty2));
        if (hit <= Math.min(travel, Math.max(tx1, tx2), Math.max(ty1, ty2))) { travel = hit; shattered = true; }
      }
      bottle.x += ux * travel; bottle.y += uy * travel;
      bottle.remaining -= travel;
      bottle.ttl = shattered ? 0 : bottle.remaining / bottle.speed;
      if (shattered) this.splashPotion(bottle);
    }

    splashPotion(bottle) {
      const source = this.actors.find(actor => actor.id === bottle.ownerId);
      this.effect('potionSplash', bottle.x, bottle.y, { potionType: bottle.type, radius: POTION_RADIUS, ttl: 0.32 });
      this.cue('potionBreak', bottle, source);
      // A splash hits actors present at shatter; newly split children are born afterward.
      for (const actor of this.damageTargets.filter(candidate => candidate.alive && candidate.raidKind!=='crystal')) {
        const r = actorRadius(actor);
        const closest = { x: clamp(bottle.x, actor.x - r, actor.x + r), y: clamp(bottle.y, actor.y - r, actor.y + r) };
        if (distance(bottle, closest) > POTION_RADIUS || !this.clearLine(bottle, {...closest,raidKind:actor.raidKind})) continue;
        if (bottle.type === 'poisonSplash') {
          if (actor.poisonUntil <= this.time) actor.poisonNext = this.time + 1;
          actor.poisonUntil = this.time + 8;
          actor.poisonSource = bottle.ownerId;
        } else {
          this.damage(actor, 1.5, source, { magic: true, potion:true, bypassInvulnerability: true });
        }
      }
    }

    updateProjectiles(dt) {
      for (const projectile of this.projectiles) {
        if (isSplashPotion(projectile.type)) {
          this.advancePotion(projectile, dt);
          continue;
        }
        const oldX = projectile.x, oldY = projectile.y;
        projectile.x += Math.cos(projectile.angle) * projectile.speed * dt;
        projectile.y += Math.sin(projectile.angle) * projectile.speed * dt;
        projectile.ttl -= dt;
        const source = this.actors.find(actor => actor.id === projectile.ownerId);
        const start = {x:oldX, y:oldY};
        let victim = this.raid ? this.raid.firstProjectileTarget(start, projectile) : null;
        if (!victim && !this.clearLine(start, projectile, 2)) {
          if (arrowLike(projectile.type)) this.cue('arrowHit', {x:oldX,y:oldY}, source);
          projectile.ttl = 0;
          continue;
        }
        if (!this.raid) for (const actor of this.actors) {
          if (!actor.alive || actor.id === projectile.ownerId) continue;
          const dx = projectile.x - oldX, dy = projectile.y - oldY;
          const t = clamp(((actor.x - oldX) * dx + (actor.y - oldY) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(actor.x - oldX - dx * t, actor.y - oldY - dy * t) < actorRadius(actor) + (projectile.type === 'fireball' ? 8 : 4) && this.clearLine(projectile, actor)) { victim = actor; break; }
        }
        if (victim) {
          if (arrowLike(projectile.type)) this.cue('arrowHit', victim, source);
          if (projectile.type === 'fireball') {
            if(victim.raidKind==='crystal') this.damage(victim,1,source);
            else this.ignite(victim, projectile.ownerId);
          } else {
            const knockback = projectile.type === 'snowball' ? 340 : projectile.type === 'slowArrow' ? 0 : 100;
            const hit = this.damage(victim, projectile.damage, source, { knockback });
            if (projectile.type === 'slowArrow' && hit && victim.alive) victim.slowRemaining = 5;
            if (projectile.type === 'firework') {
              this.effect('explosion', victim.x, victim.y, { radius: 72, color: '#ff997d', ttl: 0.45 });
              for (const other of this.damageTargets) {
                if (other.alive && other !== victim && other !== source && distance(victim, other) < 72 && this.clearLine(victim, other))
                  this.damage(other, 0.5, source, { knockback: 145 });
              }
            }
          }
          projectile.ttl = 0;
        }
        const border = this.raid ? 0 : WORLD.border;
        if (projectile.x < border || projectile.x > WORLD.width - border || projectile.y < border || projectile.y > WORLD.height - border) {
          if (!victim && arrowLike(projectile.type)) this.cue('arrowHit', {x:oldX,y:oldY}, source);
          projectile.ttl = 0;
        }
      }
      this.projectiles = this.projectiles.filter(projectile => projectile.ttl > 0);
    }

    clearLine(from, to, radius = 0) {
      if(this.raid) {
        const support=p=>p.base || (p.raidKind==='dragon' ? this.terrain.supportAt(p.x,p.y) : null);
        return this.terrain.segmentClear(from.x,from.y,to.x,to.y,radius,support(from),support(to));
      }
      return !this.terrain || this.terrain.segmentClear(from.x, from.y, to.x, to.y, radius);
    }

    checkEnd() {
      if (this.finished) return;
      if(this.raid) {
        const won=!this.raid.dragon.alive;
        if(won || this.remaining===0) {
          this.finished=true;this.status=won?'won':'lost';this.winner=won?this.player:this.raid.dragon;
          if(won) this.player.rank=1;
          this.addEvent(won?'末影龙被击败 · 玩家阵营胜利':'队伍全灭 · 末影龙胜利',won?'win':'lose');
        } else if(!this.player.alive) this.status='spectating';
        return;
      }
      const survivors = this.actors.filter(actor => actor.alive);
      const playerHasAllies = this.player.type === 'slime' && survivors.some(actor => actor.type === 'slime');
      const slimeVictory = survivors.length > 0 && survivors.every(actor => actor.type === 'slime');
      if (survivors.length <= 1 || slimeVictory) {
        this.finished = true;
        this.winner = this.player.alive ? this.player : survivors[0] || null;
        for (const actor of survivors) actor.rank = 1;
        const won = this.player.alive || (slimeVictory && playerHasAllies);
        if (won) this.player.rank = 1;
        this.status = won ? 'won' : 'lost';
        const winnerName = this.winner?.type === 'slime' ? '史莱姆' : this.winner?.name;
        this.addEvent(winnerName ? winnerName + ' 获得了最终胜利！' : '竞技场平局', won ? 'win' : 'info');
      } else if (!this.player.alive) {
        const status = playerHasAllies ? 'spectating' : 'lost';
        if (this.status !== status) {
          this.status = status;
          this.addEvent(playerHasAllies ? '进入观战，其他小史莱姆仍在战斗' : '你已被淘汰 · 可以观战或再来一局', playerHasAllies ? 'info' : 'lose');
        }
      }
    }
  }

  const api = { Game, CHARACTERS, WORLD, ITEM_NAMES, inWater, isBlade, isRanged, isSplashPotion, POTION_RANGE, POTION_RADIUS,
    getSwordGeometry, swordIntersectsHead, getAxeGeometry, axeIntersectsHead: spriteEdgeIntersectsHead,
    getSpearGeometry, spearIntersectsHead: spriteEdgeIntersectsHead };
  root.ArenaEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
