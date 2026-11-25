(function(root) {
  'use strict';
  const images={};
  for(const [key,file] of Object.entries({dragon:'end-dragon',orb:'dragon-orb',tiles:'end-blocks'})) {
    images[key]=new Image();images[key].src='assets/'+file+'.png';
  }
  const loaded=img=>img.complete && img.naturalWidth;
  function terrain(c) {
    const {cell,spans,altar,pillars}=root.EndMap;
    c.fillStyle='#090811';c.fillRect(0,0,720,960);
    let state=19251;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    for(let i=0;i<750;i++){
      const x=Math.floor(random()*720),y=Math.floor(random()*960);
      c.fillStyle=['#383143','#6e6383','#c0afd1'][Math.floor(random()*3)];
      c.fillRect(x,y,random()<.85?1:2,1);
    }
    for(let row=0;row<spans.length;row++) {
      const [a,b]=spans[row];if(a===b) continue;
      c.fillStyle='#57513e';c.fillRect(a*cell,row*cell+4,(b-a)*cell,cell+4);
    }
    function tile(x,y,size,band,variant) {
      c.fillStyle=band?'#514e53':'#dedda4';c.fillRect(x,y,size,size);
      if(loaded(images.tiles)) c.drawImage(images.tiles,(variant%4)*16,band*16,16,16,x,y,size,size);
    }
    for(let row=0;row<spans.length;row++) for(let col=spans[row][0];col<spans[row][1];col++){
      const x=col*cell,y=row*cell;
      tile(x,y,cell,0,Math.floor(random()*4));
      c.fillStyle='rgba(223,222,171,.48)';c.fillRect(x,y,cell,cell);
      if(random()<.35){c.fillStyle='rgba(135,125,72,.045)';c.fillRect(x,y,cell,cell);}
    }
    function block(x,y,size,obsidian) {
      c.fillStyle='#27222ac0';c.fillRect(x+3,y+5,size,size);
      tile(x,y,size,1,Math.floor(random()*4));
      c.fillStyle=obsidian?'rgba(19,6,39,.83)':'rgba(31,30,42,.22)';c.fillRect(x,y,size,size);
      c.fillStyle=obsidian?'#514466':'#727174';c.fillRect(x,y,size,2);
      c.fillStyle=obsidian?'#332c4c':'#59585e';c.fillRect(x,y,2,size);
      c.fillStyle='#17151e';c.fillRect(x,y+size-3,size,3);
    }
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) if(Math.abs(i)+Math.abs(j)<2)
      block(altar.x-9+16*i,altar.y-9+16*j,18,false);
    block(altar.x-11,altar.y-11,22,false);
    for(const p of pillars)block(p.x-p.r,p.y-p.r,p.r*2,true);
  }
  function crystal(c,p,t) {
    const y=p.y-5+Math.sin(t*2.4+p.x)*2;
    c.save(); c.translate(p.x,y);
    const halo=c.createRadialGradient(0,0,1,0,0,25);
    halo.addColorStop(0,'#ed5bff9e');halo.addColorStop(1,'#b856ff00');
    c.fillStyle=halo;c.fillRect(-25,-25,50,50);
    for(const [s,color,fill,offset] of [[9,'#c760e2','#d040ccbd',.65],[15,'#b5fbff','#8bcefa26',0]]){
      const tilt=t*.8+p.x*.01+offset,vertices=[];
      for(let h=0;h<2;h++)for(let i=0;i<4;i++){
        const a=tilt+i*Math.PI/2;
        vertices.push([Math.cos(a)*s, Math.sin(a)*s*.53+(h?1:-1)*s*.56+Math.cos(a)*s*.19]);
      }
      c.lineWidth=s===9?1.8:1.4;c.strokeStyle=color;
      for(const ids of [[0,1,2,3],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]]){
        c.beginPath(); ids.forEach((id,j)=>j?c.lineTo(...vertices[id]):c.moveTo(...vertices[id]));
        c.closePath();c.fillStyle=fill;c.fill();c.stroke();
      }
    }
    c.fillStyle='#fff3ff';c.fillRect(-2,-4,4,6);c.restore();
  }
  function ground(c,raid,t) {
    for(const z of raid.clouds){
      const start=z.angle===null?0:z.angle-z.width/2, sweep=z.angle===null?2*Math.PI:z.width;
      c.save();c.translate(z.x,z.y);
      const gradient=c.createRadialGradient(0,0,0,0,0,z.r);
      gradient.addColorStop(0,'#9a37c88c');gradient.addColorStop(.74,'#bd53e56a');gradient.addColorStop(1,'#cd79f608');
      c.fillStyle=gradient;c.beginPath();c.moveTo(0,0);c.arc(0,0,z.r,start,start+sweep);c.closePath();c.fill();
      for(let i=0;i<72;i++){
        const angle=start+((i*.618034+t*.07)%1)*sweep,r=z.r*Math.sqrt((i*.381966+t*.14)%1);
        c.fillStyle=['#8a299bbb','#b646e9cd','#f09affd9'][i%3];
        c.fillRect(Math.cos(angle)*r,Math.sin(angle)*r,2+i%3,2+i%3);
      }
      c.restore();
    }
    for(const p of raid.crystals)if(p.alive)crystal(c,p,t);
  }
  function sky(c,raid,t) {
    const d=raid.dragon;
    if(d.alive){
      const link=raid.linkedCrystal;
      if(link){
        const a=Math.atan2(d.y-link.y,d.x-link.x),x=Math.sin(a),y=-Math.cos(a);
        c.fillStyle='#fff7ff60';c.beginPath();c.moveTo(link.x+2*x,link.y+2*y);c.lineTo(d.x+6*x,d.y+6*y);
        c.lineTo(d.x-6*x,d.y-6*y);c.lineTo(link.x-2*x,link.y-2*y);c.closePath();c.fill();
        c.strokeStyle='#fffaffbd';c.lineWidth=1.5;c.beginPath();c.moveTo(link.x,link.y);c.lineTo(d.x,d.y);c.stroke();
      }
      c.save();c.translate(d.x,d.y);c.fillStyle='#1811234a';c.beginPath();c.ellipse(3,raid.phase==='flight'?17:8,37,16,0,0,Math.PI*2);c.fill();
      c.rotate(d.angle-2.53);
      if(loaded(images.dragon)){
        const flap=raid.phase==='flight'?1+.035*Math.sin(8*t):1;
        c.drawImage(images.dragon,-53,-46,106,92*flap);
      }
      c.restore();
    }
    for(const o of raid.orbs)if(loaded(images.orb)){
      c.save();c.shadowColor='#bc49ff';c.shadowBlur=9;c.drawImage(images.orb,o.x-10,o.y-10,20,20);c.restore();
    }
  }
  root.EndArt={terrain,ground,sky,tiles:images.tiles};
})(globalThis);
