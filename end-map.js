// Terrain, movement and pathfinding use the same stepped outline.
(function(root) {
  'use strict';
  const cell = 20, columns = 36, rows = 48;
  const edge = [18,10,8,7,6,5,4,3,3,2,2,2,2,1,1,1];
  const spans = Array.from({length:rows}, (_,y) => {
    const inset = edge[Math.min(y, rows-1-y)] ?? 1;
    return [inset, columns-inset+(inset>1 && inset<18 && y%7===3 ? 1 : 0)];
  });
  const altar = {x:360,y:480,r:22};
  const pillars = [[283,186],[554,326],[546,634],[340,814],[141,551]].map(([x,y])=>({x,y,r:13}));
  const solids = [altar,...pillars];
  const supportAt = (x,y) => solids.find(s=>Math.abs(x-s.x)<=s.r && Math.abs(y-s.y)<=s.r);
  const spawns = [[255,720],[470,744],[186,405],[489,206],[596,482]].map(([x,y])=>({x,y}));
  const initialItems = [
    ['bow',238,664],['bow',513,709],['bow',211,361],['bow',439,238],['bow',584,427],
    ['sword',314,675],['sword',420,398],['sword',140,658],['apple',431,620],
    ['apple',231,284],['helmet',423,790],['helmet',158,463],['tnt',475,526],
    ['sharpBook',310,341],['powerBook',427,563]
  ].map(([type,x,y])=>({type,x,y}));
  function land(x,y) {
    const span=spans[Math.floor(y/cell)], col=Math.floor(x/cell);
    return !!span && col>=span[0] && col<span[1];
  }
  function touchesLand(x,y,r) {
    for(let row=Math.max(0,Math.floor((y-r)/cell));row<rows && row*cell<y+r;row++) {
      const [left,right]=spans[row];
      if(left<right && x+r>left*cell && x-r<right*cell) return true;
    }
    return false;
  }
  const blocked=(x,y,r)=>solids.some(s=>Math.abs(x-s.x)<s.r+r && Math.abs(y-s.y)<s.r+r);
  function canStand(x,y,r=16) {
    return !blocked(x,y,r) && [-r,r].every(dx=>[-r,r].every(dy=>land(x+dx,y+dy)));
  }
  const nodes=[];
  for(let y=cell/2;y<rows*cell;y+=cell) for(let x=cell/2;x<columns*cell;x+=cell)
    if(canStand(x,y)) nodes.push({x,y,id:Math.floor(y/cell)*columns+Math.floor(x/cell)});
  const byId=new Map(nodes.map(n=>[n.id,n]));
  function nearest(x,y) {
    let best=nodes[0], d=Infinity;
    for(const n of nodes){const dist=(x-n.x)**2+(y-n.y)**2;if(dist<d){d=dist;best=n;}}
    return best;
  }
  function safePosition(x,y) {return canStand(x,y)?{x,y}:nearest(x,y);}
  function moveActor(a,dx,dy,r=16) {
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8));
    for(let i=0;i<steps;i++){
      if(!blocked(a.x+dx/steps,a.y,r)) a.x+=dx/steps;
      if(!blocked(a.x,a.y+dy/steps,r)) a.y+=dy/steps;
      if(!touchesLand(a.x,a.y,r)) return;
    }
  }
  function segmentClear(x,y,tx,ty,r=0,ignoreA,ignoreB) {
    for(const s of solids) {
      if(s===ignoreA || s===ignoreB) continue;
      let near=0,far=1;
      for(const [start,delta,center] of [[x,tx-x,s.x],[y,ty-y,s.y]]) {
        const lo=center-s.r-r,hi=center+s.r+r;
        if(!delta) {if(start<=lo || start>=hi){near=2;break;} continue;}
        const a=(lo-start)/delta,b=(hi-start)/delta;
        near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      }
      if(near<far) return false;
    }
    return true;
  }
  function walkLine(a,b,r) {
    if(!segmentClear(a.x,a.y,b.x,b.y,r)) return false;
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/16));
    for(let i=1;i<=n;i++) if(!canStand(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,r)) return false;
    return true;
  }
  const flows=new Map();
  function nextWaypoint(a,goal,r=16) {
    const dest=safePosition(goal.x,goal.y);
    if(walkLine(a,dest,r)) return dest;
    const nodeAt=p=>byId.get(Math.floor(p.y/cell)*columns+Math.floor(p.x/cell)) || nearest(p.x,p.y);
    const source=nodeAt(a),end=nodeAt(dest);
    if(!flows.has(end.id)) {
      const next=new Map([[end.id,end]]), queue=[end];
      for(let i=0;i<queue.length;i++) {
        const node=queue[i];
        for(const stride of [1,-1,columns,-columns]) {
          const other=byId.get(node.id+stride);
          if(other && !next.has(other.id) && segmentClear(node.x,node.y,other.x,other.y,16)){
            next.set(other.id,node);queue.push(other);
          }
        }
      }
      if(flows.size>=32) flows.delete(flows.keys().next().value);
      flows.set(end.id,next);
    }
    return flows.get(end.id).get(source.id) || source;
  }
  const api={cell,spans,altar,pillars,spawns,initialItems,land,touchesLand,canStand,safePosition,moveActor,segmentClear,nextWaypoint,supportAt,isSlippery:()=>false};
  root.EndMap=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(globalThis);
