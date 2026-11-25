(function(root) {
  'use strict';
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const nearest=(from,group)=>group.reduce((best,p)=>!best||dist(from,p)<dist(from,best)?p:best,null);
  const radius = a=>a.isMiniSlime?10:16;
  function approach(a,goal,step) {
    const dx=goal.x-a.x,dy=goal.y-a.y,d=Math.hypot(dx,dy);
    if(d>0.01){ a.angle=Math.atan2(dy,dx); const f=Math.min(1,step/d);a.x+=f*dx;a.y+=f*dy; }
    return d<=step;
  }
  class EndEncounter {
    constructor(game) {
      this.game=game;
      this.dragon={id:'end-dragon',raidKind:'dragon',name:'末影龙',x:380,y:250,hp:30,maxHp:30,
        alive:true,hitRadius:33,angle:0,kills:0,burnUntil:0,poisonUntil:0};
      this.crystals=game.terrain.pillars.map((p,i)=>({id:'crystal-'+i,raidKind:'crystal',name:'末影水晶',
        x:p.x,y:p.y,base:p,alive:true,hp:1,hitRadius:18}));
      this.targets=[...this.crystals,this.dragon];
      this.orbs=[]; this.clouds=[]; this.contacts=new Set(); this.breathExposure=new Map();this.nextHeal=3;
      this.beginFlight();
    }
    get linkedCrystal() {
      return this.dragon.alive && this.dragon.hp<this.dragon.maxHp ? nearest(this.dragon,this.crystals.filter(c=>c.alive)) : null;
    }
    firstProjectileTarget(start, shot) {
      const dx=shot.x-start.x, dy=shot.y-start.y, length=Math.hypot(dx,dy);
      if (!length) return null;
      const ux=dx/length, uy=dy/length, shotRadius=shot.type==='fireball'?8:4;
      let nearestHit=Infinity, victim=null;
      for (const actor of this.game.damageTargets) {
        if (!actor.alive || actor.id===shot.ownerId) continue;
        const x=actor.x-start.x, y=actor.y-start.y, along=x*ux+y*uy;
        const offset=x*uy-y*ux, reach=(actor.hitRadius??radius(actor))+shotRadius;
        if (Math.abs(offset)>reach) continue;
        const halfChord=Math.sqrt(reach*reach-offset*offset);
        const hit=Math.max(0,along-halfChord);
        if (along+halfChord<0 || hit>length || hit>=nearestHit) continue;
        const impact={x:start.x+ux*hit,y:start.y+uy*hit};
        if (!this.game.clearLine(start,impact,2)) continue;
        nearestHit=hit; victim=actor;
      }
      return victim;
    }
    incomingShot(crystal) {
      return this.game.projectiles.some(shot=>{
        if (shot.type.endsWith('Splash')) return false;
        const dx=crystal.x-shot.x, dy=crystal.y-shot.y;
        const ux=Math.cos(shot.angle), uy=Math.sin(shot.angle);
        const forward=dx*ux+dy*uy;
        return forward>=0 && forward<Math.min(shot.ttl,.9)*shot.speed &&
          Math.abs(dx*uy-dy*ux)<crystal.hitRadius+4;
      });
    }
    beginFlight() {
      const g=this.game;
      this.phase='flight';this.phaseStart=g.time; this.phaseEnd=g.time+15+10*g.random();
      this.chargeAt=g.time+2+3*g.random();this.orbAt=g.time+7+3*g.random();
      this.charge=null;this.waypoint=null;this.contacts.clear();
    }
    perch() {
      const g=this.game, d=this.dragon, altar=g.terrain.altar;
      d.x=altar.x;d.y=altar.y;this.phase='perch';this.phaseStart=g.time;
      this.phaseEnd=g.time+5+5*g.random();this.fanAt=g.time+1+g.random()*2;
    }
    hit(target,amount,source,options) {
      if(!target.alive || amount<=0) return false;
      const g=this.game;
      if(target.raidKind==='crystal') {
        if(!source || source.raidKind || options.potion) return false;
        const linked=this.linkedCrystal===target;
        target.hp=0;target.alive=false;
        if(linked) this.hit(this.dragon,1.5,source,{});
        g.addEvent('末影水晶被摧毁'+(linked?' · 末影龙 −1.5':''),'kill');
        g.explode(target,140,source,'crystal');
        return true;
      }
      const loss=Math.min(target.hp,amount);
      target.hp-=loss;
      if(source?.isPlayer) g.stats.damageDealt+=loss;
      g.effect('hit',target.x,target.y-18,{text:'−'+loss,color:'#edb4ff',ttl:.55});
      if(target.hp===0) {
        target.alive=false;
        g.effect('death',target.x,target.y,{radius:78,color:'#dd99ff',ttl:1});
        g.cue('thunder',target);g.addEvent('末影龙被击败','win');
      }
      return true;
    }
    cloud(x,y,r,angle=null,width=0) {
      this.clouds.push({x,y,r,angle,width,until:this.game.time+5});
    }
    updateBreath(dt) {
      const g=this.game;
      for(const orb of this.orbs) if(approach(orb,orb.goal,330*dt)) {
        this.cloud(orb.goal.x,orb.goal.y,58);orb.burst=true;
      }
      this.orbs=this.orbs.filter(o=>!o.burst);
      for(const a of g.actors) {
        const inside=a.alive && this.clouds.some(zone=>{
          if(zone.until<g.time-1e-8) return false;
          const angle=Math.atan2(a.y-zone.y,a.x-zone.x);
          const delta=zone.angle===null?0:Math.atan2(Math.sin(angle-zone.angle),Math.cos(angle-zone.angle));
          return dist(a,zone)<=zone.r+radius(a) && Math.abs(delta)<=zone.width/2;
        });
        if(!inside){this.breathExposure.delete(a.id);continue;}
        let exposure=(this.breathExposure.get(a.id)||0)+dt;
        if(exposure>=.5-1e-8){
          exposure-=.5;
          g.damage(a,.5,this.dragon,{magic:true,bypassInvulnerability:true});
        }
        this.breathExposure.set(a.id,exposure);
      }
      this.clouds=this.clouds.filter(z=>z.until>g.time+1e-8);
    }
    update(dt) {
      const g=this.game,d=this.dragon,now=g.time;
      const living=g.actors.filter(a=>a.alive);
      if(!d.alive || !living.length) return;
      const choose=()=>living[Math.floor(g.random()*living.length)];
      if(this.phase==='flight') {
        if(now>=this.chargeAt) {
          const target=choose();
          this.charge={x:target.x,y:target.y,launch:now+.55};this.chargeAt=Infinity;
        }
        if(now>=this.orbAt) {
          const target=choose();
          this.orbs.push({x:d.x,y:d.y,angle:0,goal:{x:target.x,y:target.y}});this.orbAt=Infinity;
        }
        const toLand=this.phaseEnd-now;
        if(toLand<2/1.5) approach(d,g.terrain.altar,dist(d,g.terrain.altar)*dt/Math.max(dt,toLand+dt));
        else if(this.charge) {
          if(now>=this.charge.launch && approach(d,this.charge,780*dt)) this.charge=null;
        } else {
          if(!this.waypoint || dist(d,this.waypoint)<4) {
            const heading=d.angle+(g.random()-.5)*2.6;
            this.waypoint={x:Math.min(698,Math.max(22,d.x+320*Math.cos(heading))),
              y:Math.min(938,Math.max(22,d.y+320*Math.sin(heading)))};
            if(dist(d,this.waypoint)<95) this.waypoint={x:60+600*g.random(),y:70+820*g.random()};
          }
          approach(d,this.waypoint,202.5*dt);
        }
        for(const a of living) {
          if(dist(d,a)>d.hitRadius+radius(a)){this.contacts.delete(a.id);continue;}
          if(this.contacts.has(a.id)) continue;
          this.contacts.add(a.id);
          if(g.damage(a,1,d) && a.alive) {
            const angle=dist(d,a)<.01?d.angle:Math.atan2(a.y-d.y,a.x-d.x);
            g.move(a,64*Math.cos(angle),64*Math.sin(angle));
          }
        }
        if(now+1e-8>=this.phaseEnd) this.perch();
      } else {
        if(now>=this.fanAt) {
          const target=nearest(d,living);
          d.angle=Math.atan2(target.y-d.y,target.x-d.x);
          this.cloud(d.x,d.y,64*Math.sqrt(3),d.angle,(90+60*g.random())*Math.PI/180);
          this.fanAt=Infinity;
        }
        if(now+1e-8>=this.phaseEnd) this.beginFlight();
      }
      this.updateBreath(dt);
      for(const kind of ['burn','poison']) {
        if(d[kind+'Until']>0 && now+1e-8>=d[kind+'Next'] && d[kind+'Next']<=d[kind+'Until']+1e-8) {
          d[kind+'Next']+=1;
          this.hit(d,kind==='poison'?Math.max(0,Math.min(.25,d.hp-.25)):.25,g.actors.find(a=>a.id===d[kind+'Source']),{});
        }
        if(now>=d[kind+'Until']) d[kind+'Until']=0;
      }
      if(now+1e-8>=this.nextHeal){
        if(this.linkedCrystal) d.hp=Math.min(d.maxHp,d.hp+1);
        this.nextHeal+=3;
      }
    }
    control(a,dt) {
      const g=this.game;
      const crystals=this.crystals.filter(c=>c.alive);
      const visible=crystals.filter(c=>g.clearLine(a,c));
      const target=nearest(a,visible.length?visible:crystals)||this.dragon;
      const d=dist(a,target),range=a.weapon==='bow',bare=a.weapon==='fist';
      a.aiTargetId=target.id;
      const bow=g.items.filter(i=>i.type==='bow');
      const weapon=i=>['sword','ironSpear','bow','tnt'].includes(i.type);
      const supply=bare || (crystals.length && !range && bow.length);
      let goal=target;
      if(supply) goal=nearest(a,bow.length?bow:g.items.filter(weapon))||target;
      if(a.hp<=1.5) {
        const food=nearest(a,g.items.filter(i=>i.type==='apple'||i.type==='enchanted'));
        if(food && dist(food,a)<135) goal=food;
      }
      const sight=g.clearLine(a,target);
      const rangedSkill=['skeleton','stray','blaze'].includes(a.type);
      const unsafeShot=target.raidKind==='crystal' && d<158;
      const retreat=goal===target && unsafeShot && (range || (rangedSkill && a.skillCooldown<=0));
      if(retreat){
        const factor=170/(d||1);goal=g.terrain.safePosition(target.x+(a.x-target.x)*factor,target.y+(a.y-target.y)*factor);
      }
      const danger=g.bombs.find(b=>dist(a,b)<b.radius+12 && (b.ownerId===a.id || b.fuse<1)) ||
        crystals.find(c=>dist(a,c)<178 && this.incomingShot(c)) ||
        this.clouds.find(z=>dist(a,z)<z.r+12 && (z.angle===null || Math.cos(Math.atan2(a.y-z.y,a.x-z.x)-z.angle)>Math.cos(z.width/2)));
      if(danger){
        const flee=Math.atan2(a.y-danger.y,a.x-danger.x);
        goal=g.terrain.safePosition(a.x+135*Math.cos(flee),a.y+135*Math.sin(flee));
      }
      const stop=(goal===target && range && sight && d<355) ||
        (goal===target && !range && d<(a.weapon==='ironSpear'?75:48));
      const step=stop?a:g.terrain.nextWaypoint(a,goal,radius(a));
      const dx=step.x-a.x,dy=step.y-a.y,len=Math.hypot(dx,dy)||1;
      const lead=target===this.dragon && range && this.phase==='flight'?Math.min(.4,d/420)*100:0;
      const aimX=target.x+lead*Math.cos(target.angle||0),aimY=target.y+lead*Math.sin(target.angle||0);
      const skillReady=g.time>2 && a.skillCooldown<=0 && sight && !(unsafeShot && rangedSkill) &&
        d<(a.type==='creeper'?100:a.type==='enderman'?28:350);
      return {x:dx/len,y:dy/len,aimX,aimY,skill:skillReady,
        shoot:sight && ((range && !unsafeShot && d<420) || (a.weapon==='tnt' && d<105) ||
          (a.weapon==='healingPotion' && a.hp<a.maxHp) || (target===this.dragon && a.weapon.endsWith('Splash') && d<125)),
        dash:goal===target && a.weapon==='ironSpear' && d>105 && d<160 && sight && g.terrain.canStand(a.x+100*dx/len,a.y+100*dy/len)};
    }
  }
  root.EndEncounter=EndEncounter;
  if(typeof module!=='undefined' && module.exports) module.exports=EndEncounter;
})(globalThis);
