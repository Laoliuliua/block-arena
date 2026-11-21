// Offline sample playback. Physics and the random roster never depend on audio.
(function (root) {
  'use strict';
  const levels = {thunder:.55, explosion:.63, tntPrime:.72, hurt:.56, bow:.65, crossbow:.72,
    arrowHit:.40, swordHit:.48, pickup:.37, eat:.44, drink:.44, teleport:.56, block:.5,
    click:.32, win:.44, airdrop:.48, web:.4, potionThrow:.4, potionBreak:.65};
  class ArenaAudio {
    constructor(assets) {
      this.assets = assets;
      this.enabled = true;
      try { this.enabled = localStorage.getItem('block-arena.sound') !== 'off'; } catch (_) {}
      this.epoch = 0;
      this.buffers = new Map();
      this.active = new Set();
      this.timers = new Set();
      this.played = {};
      this.failures = new Set();
      this.nextThunder = 0;
      this.index = new Map();
    }
    setEnabled(value) {
      this.enabled = value;
      try { localStorage.setItem('block-arena.sound', value ? 'on' : 'off'); } catch (_) {}
      if (value) this.unlock(); else this.stop();
    }
    unlock() {
      if (!this.enabled || location.protocol === 'file:') return; // file:// plays the local Oggs directly.
      if (!this.ctx) {
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context) return;
        try {
          this.ctx = new Context();
          this.mix = this.ctx.createDynamicsCompressor();
          this.mix.threshold.value = -15; this.mix.ratio.value = 4;
          this.mix.connect(this.ctx.destination);
        } catch (_) { this.ctx = null; return; }
        for (const url of new Set(Object.values(this.assets).flat())) this.load(url);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
    }
    load(url) {
      if (!this.buffers.has(url)) {
        const pending = fetch(url).then(r => {
          if (!r.ok) throw Error(String(r.status));
          return r.arrayBuffer();
        }).then(bytes=>this.ctx.decodeAudioData(bytes)).catch(()=>null);
        this.buffers.set(url, pending);
      }
      return this.buffers.get(url);
    }
    stop() {
      ++this.epoch;
      this.nextThunder = 0;
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
      for (const voice of this.active) {
        if (voice.pause) voice.pause(); else { try { voice.stop(); } catch (_) {} }
      }
      this.active.clear();
    }
    status() { return {enabled:this.enabled, played:{...this.played}, failures:[...this.failures]}; }
    play(cue, listener) {
      if (!this.enabled) return;
      const type = cue.type;
      const specific = type + '.' + cue.actorType;
      const key = this.assets[specific] ? specific : type;
      if (!this.assets[key]) return;
      const clips = [].concat(this.assets[key]);
      let idx = this.index.get(key) ?? Math.floor(Math.random()*clips.length);
      const url = clips[idx];
      if (!url) return;
      this.index.set(key, (idx + 1) % clips.length);
      const spatial = listener && Number.isFinite(cue.x) && type !== 'thunder';
      const dist = spatial ? Math.hypot(cue.x-listener.x, cue.y-listener.y) : 0;
      const volume = (levels[type] ?? .5) / (1 + dist/390);
      const pan = spatial ? Math.max(-.62,Math.min(.62,(cue.x-listener.x)/640)) : 0;
      // Vanilla plays the shared bow sample at a much lower pitch for a thrown bottle.
      const pitch = key === 'potionThrow' ? .4 / (.8 + Math.random() * .4)
        : type === 'potionBreak' ? .9 + Math.random() * .1 : 1;
      // Separate the strikes when a single blast eliminates several fighters.
      const now = performance.now();
      const wait = type === 'thunder' ? Math.max(0,this.nextThunder-now) : 0;
      if (type === 'thunder') this.nextThunder = now + wait + 210;
      const epoch = this.epoch;
      const current = () => this.enabled && this.epoch === epoch;
      const started = () => { this.played[key] = (this.played[key] || 0) + 1; };
      const media = () => {
        if (!current()) return;
        const voice = new Audio(url);
        voice.volume = volume;
        if (pitch !== 1) { voice.preservesPitch = false; voice.playbackRate = pitch; }
        if (type === 'tntPrime') voice.ontimeupdate = () => { if (voice.currentTime >= 2) voice.pause(); };
        this.active.add(voice);
        const release = () => this.active.delete(voice);
        voice.onended = voice.onpause = release;
        voice.play().then(()=>{ if (current()) started(); }).catch(err=>{
          release(); if (current() && err.name !== 'AbortError') this.failures.add(key+': '+err.name);
        });
      };
      const run = async () => {
        if (!current()) return;
        if (!this.ctx || this.ctx.state !== 'running') { media(); return; }
        const buffer = await this.load(url);
        if (!current()) return;
        if (!buffer) { media(); return; }
        const ctx = this.ctx, source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = buffer; source.playbackRate.value = pitch; gain.gain.value = volume;
        source.connect(gain);
        const stereo = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (stereo) { stereo.pan.value = pan; gain.connect(stereo); stereo.connect(this.mix); }
        else gain.connect(this.mix);
        this.active.add(source);
        source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); if (stereo) stereo.disconnect(); };
        if (type === 'tntPrime') source.start(0,0,Math.min(2,buffer.duration)); else source.start();
        started();
      };
      const attempt = () => run().catch(err=>this.failures.add(key+': '+err.name));
      if (wait > 0) {
        const timer = setTimeout(()=>{this.timers.delete(timer); attempt();},wait);
        this.timers.add(timer);
      } else attempt();
    }
  }
  root.ArenaAudio = ArenaAudio;
})(globalThis);
