/* =====================================================================
 * SCROLL QUEST ENGINE  (shared by every level — rarely edited)
 * ---------------------------------------------------------------------
 * A level file defines one global `LEVEL` object and the page calls
 * SQ.start(LEVEL).  Everything here is generic: players, input,
 * physics, co-op, bubbles, armor, sound, HUD, quiz and results.
 * See GEMINI.md for the LEVEL contract and the full `api` reference.
 * ===================================================================== */
(function () {
  'use strict';

  const SQ = (window.SQ = {});
  SQ.VERSION = '2.0';

  /* -------------------------------------------------------------------
   * 0. ERROR BOX — any crash shows on screen instead of a frozen page
   * ----------------------------------------------------------------- */
  function showError(msg) {
    let box = document.getElementById('sq-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sq-error';
      box.style.cssText =
        'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#7f1d1d;color:#fff;' +
        'font:13px/1.4 monospace;padding:12px 14px;border-radius:10px;white-space:pre-wrap;max-height:40vh;overflow:auto';
      (document.body || document.documentElement).appendChild(box);
    }
    box.textContent = '⚠️ Game error (copy this into Gemini):\n' + msg;
  }
  SQ.showError = showError;
  window.addEventListener('error', (e) => {
    // "Script error." with no file = a browser extension or a hidden cross-file error; the game
    // loop catches its own errors with full details, so ignore these instead of scaring the kids
    if (!e.filename || e.message === 'Script error.') { console.warn('Ignored outside error:', e.message); return; }
    showError((e.message || 'Unknown error') + '\n' + e.filename.split('/').pop() + ':' + e.lineno);
  });

  /* -------------------------------------------------------------------
   * 1. CONSTANTS: roles, armor, tuning
   * ----------------------------------------------------------------- */
  const ROLES = [
    { id: 'shepherd', name: 'Shepherd', color: 0x3b82f6, css: '#3b82f6', speed: 10.5, jump: 12.0,
      trait: 'Calls animals from far away', callRadius: 14 },
    { id: 'fisherman', name: 'Fisherman', color: 0x10b981, css: '#10b981', speed: 11.5, jump: 12.0,
      trait: 'Fastest. Wades deeper & casts a net', callRadius: 5, wade: 2.0 },
    { id: 'scribe', name: 'Scribe', color: 0xa855f7, css: '#a855f7', speed: 10.0, jump: 13.0,
      trait: 'Jumps highest. Reads inscriptions', callRadius: 5 },
    { id: 'builder', name: 'Builder', color: 0xf59e0b, css: '#f59e0b', speed: 9.8, jump: 11.5,
      trait: 'Strong. Carries heavy loads & builds', callRadius: 5, strong: true }
  ];
  // The fifth friend joins in the New Testament (Worlds 6 to 8): the Apostle, in maroon. Talks with townspeople
  // for clues (they point the golden arrow to a hidden scroll piece) and visits homes, where families share bread
  // and everyone's hearts are refilled ("breaking bread from house to house", Acts 2:46).
  const APOSTLE = { id: 'apostle', name: 'Apostle', color: 0x8b1e3f, css: '#b4234f', speed: 10.5, jump: 12.0,
    trait: 'Talks with people for clues and visits homes', callRadius: 5 };
  const isNewTestament = (L) => { const m = /World\s+(\d+)/.exec((L && L.world) || ''); return !!m && +m[1] >= 6; };
  SQ.isNewTestament = isNewTestament;
  SQ.ROLES = ROLES;

  const ARMOR = {
    sandals: { name: 'Sandals of Peace', icon: '👟', ref: 'Ephesians 6:15',
      verse: 'And your feet shod with the preparation of the gospel of peace;',
      desc: 'Run faster and stride through mud!' },
    shield: { name: 'Shield of Faith', icon: '🛡️', ref: 'Ephesians 6:16',
      verse: 'Above all, taking the shield of faith, wherewith ye shall be able to quench all the fiery darts of the wicked.',
      desc: 'Blocks one falling hit, then is lost.' },
    helmet: { name: 'Helmet of Salvation', icon: '⛑️', ref: 'Ephesians 6:17',
      verse: 'And take the helmet of salvation, and the sword of the Spirit, which is the word of God:',
      desc: 'Protects you from one bump!' },
    sword: { name: 'Sword of the Spirit', icon: '📖', ref: 'Ephesians 6:17',
      verse: 'And take the helmet of salvation, and the sword of the Spirit, which is the word of God:',
      desc: 'The Word of God cuts through thorns!' },
    belt: { name: 'Belt of Truth', icon: '🎗️', ref: 'Ephesians 6:14',
      verse: 'Stand therefore, having your loins girt about with truth, and having on the breastplate of righteousness;',
      desc: 'Reveals hidden paths of truth for the whole team!' },
    breastplate: { name: 'Breastplate of Righteousness', icon: '🦺', ref: 'Ephesians 6:14',
      verse: 'Stand therefore, having your loins girt about with truth, and having on the breastplate of righteousness;',
      desc: 'Stops wind while equipped. Blocks one bump, then is lost.' }
  };
  const ARMOR_TYPES = Object.keys(ARMOR);

  // LEVEL.time presets. Night stays readable for kids: soft moonlight, stars, and a warm glow on each player.
  const TIMES = {
    day: { sky: 0xb3e1f7, skyTop: 0x4f8ff0, hemi: [0xfdf3dc, 0x5d6b45], ambient: 0.65, sun: 0xffe9c7, sunI: 0.95, fog: [60, 160] },
    sunset: { sky: 0xf8b47a, skyTop: 0x6d4aa8, hemi: [0xffe6cc, 0x5b4a3a], ambient: 0.62, sun: 0xffcf9e, sunI: 0.9, fog: [55, 150] },
    night: { sky: 0x1a2550, skyTop: 0x05081a, hemi: [0x8a9ae8, 0x262b40], ambient: 0.53, sun: 0xb4c0ff, sunI: 0.48, fog: [50, 140], stars: true, lamps: true, fill: 0x6d5bd0, fillI: 0.18 },
    storm: { sky: 0x6b7480, skyTop: 0x2f3640, hemi: [0xa3acb9, 0x2f3a2f], ambient: 0.7, sun: 0xd1d5db, sunI: 0.45, fog: [30, 110] }
  };
  function playerLamp(group) {
    if (!S.timeCfg || !S.timeCfg.lamps) return;
    const l = new THREE.PointLight(0xffe2b0, 1.35, 12, 2);
    l.position.y = 1.8; l.name = 'lamp'; group.add(l);
  }
  SQ.ARMOR = ARMOR;

  const T = {
    gravity: 32, fallMult: 1.6, jumpCut: 0.5, coyote: 0.15, jumpBuffer: 0.15, apexHang: 0.55, magnet: 0.9, edgeGuard: 1.2,
    stepUp: 0.6, maxSlope: 1.1, playerRadius: 0.55, accelGround: 14, accelAir: 8, landGrace: 0.35, runBoost: 1.45,
    bubbleWait: 6, regroupDist: 30, rescuePoints: 10, maxScoredRescues: 5
  };
  SQ.TUNING = T;

  // Family settings (set on the menu or in the pause menu; saved in this browser)
  const SETTING_DEFAULTS = { reader: 'p1', timer: '0', speak: '0', bigtext: '0', sound: 'loud', gentle: '0', outfit: 'plain', tilt: '1', challenge: 'adventure', records: '0', musicVolume:'100', effectsVolume:'100', voiceVolume:'100' };
  function setting(k) { try { const v = localStorage.getItem('scrollquest.' + k); return v === null ? SETTING_DEFAULTS[k] : v; } catch (e) { return (S.settings && S.settings[k]) || SETTING_DEFAULTS[k]; } }
  function setSetting(k, v) { S.settings = S.settings || {}; S.settings[k] = v; try { localStorage.setItem('scrollquest.' + k, v); } catch (e) { /* storage blocked */ } }
  SQ.setting = setting; SQ.setSetting = setSetting;
  function channelVolume(channel){const n=Number(setting(channel+'Volume'));return Number.isFinite(n)?Math.max(0,Math.min(1,n/100)):1;}
  const VOLUME_STEPS=['0','25','60','100'];
  function volumeName(key){return Math.round(channelVolume(key)*100)+'%';}

  // Read aloud: the computer's own voice reads story cards (works offline; KJV words exactly as written)
  const Speech = {
    ok() { return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'; },
    on() { return setting('speak') === '1'; },
    say(text) {
      S.lastSpoken = text;
      const serial=this.serial=(this.serial||0)+1;this.active=false;
      if (!this.ok()) return;
      try {window.speechSynthesis.cancel();if(!channelVolume('voice'))return;const u=new window.SpeechSynthesisUtterance(text);u.rate=.9;u.pitch=1.05;u.volume=channelVolume('voice');
        const end=()=>{if(this.serial===serial)this.active=false;};u.onstart=()=>{if(this.serial===serial)this.active=true;};u.onend=end;u.onerror=end;window.speechSynthesis.speak(u);
      } catch (e) {this.active=false;}
    },
    stop() {this.serial=(this.serial||0)+1;this.active=false;if (this.ok()) try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  };
  function spokenRef(ref) { return ref.replace(/(\d+):(\d+)[–-](\d+)/, '$1, verses $2 to $3').replace(/(\d+):(\d+)/, '$1, verse $2'); }
  const endStop = (t) => (/[.!?:;,'’"”)]$/.test(t) ? t : t + '.');
  function speakPage(pg) { if (pg) Speech.say((pg.bridge ? 'The story so far. '+pg.bridge.text+' '+spokenRef(pg.bridge.passage)+'. ' : '') + (pg.title ? endStop(pg.title) + ' ' : '') + endStop(pg.text) + (pg.ref ? ' ' + spokenRef(pg.ref) + '.' : '') + (pg.connection ? ' Bible connection. '+pg.connection.text+' '+spokenRef(pg.connection.passage)+'.' : '')); }
  SQ.Speech = Speech;

  /* -------------------------------------------------------------------
   * 2. AUDIO — original offline score, sound files and synthesized fallbacks
   * ----------------------------------------------------------------- */
  // Sound files: drop sounds/<name>.mp3 (or .ogg) next to the game and they are used instead of the
  // synthesized sound. Missing files are fine: the built-in sound plays. See sounds/README.md.
  const SFX_FILES = ['jump', 'land', 'step', 'step-grass', 'step-stone', 'step-wood', 'step-sand', 'coin', 'pickup', 'drop', 'fanfare', 'win', 'bubble', 'pop', 'hit', 'block', 'bleat', 'roar', 'call', 'error', 'door', 'build', 'splash', 'cheer', 'page', 'winch', 'bridge', 'rope', 'thunder'];
  const Audio = {
    ctx: null, master: null, muted: false, musicTimer: null, step: 0, files: {}, tried: false, musicEls: null,
    init() {
      this.muted = setting('sound') === 'off';
      this.loadFiles();
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = setting('sound') === 'quiet' ? 0.22 : 0.5;
        this.master.connect(this.ctx.destination);
        // a little room echo makes the built-in sounds rounder
        const len = Math.floor(this.ctx.sampleRate * 1.6), ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
        const verb = this.ctx.createConvolver(), wet = this.ctx.createGain(); verb.buffer = ir; wet.gain.value = 0.16;
        this.master.connect(verb); verb.connect(wet); wet.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    fileVol(channel='effects') { return (this.muted ? 0 : setting('sound') === 'quiet' ? 0.35 : 0.9)*channelVolume(channel); },
    // sounds/list.js names the files that exist (made by: node tests/make-sounds.js), so nothing is
    // requested that isn't there. No list: the built-in sounds only.
    have(name) { const l = window.SQ_SOUNDS || []; return l.find((f) => f.replace(/\.(mp3|ogg)$/, '') === name) || null; },
    variants(name) { const re = new RegExp('^' + name + '\\d*\\.(mp3|ogg)$'); return (window.SQ_SOUNDS || []).filter((f) => re.test(f)); },   // step.mp3, step2.mp3, step3.mp3 ...
    loadFiles() {
      if (this.tried) return; this.tried = true;
      const A = window.Audio;
      if (typeof A !== 'function' || (/jsdom/.test(navigator.userAgent || '') && !window.SQ_AUDIO_TEST)) return;
      const go = () => {
        this.listReady = true;
        SFX_FILES.forEach((n) => {
          this.variants(n).forEach((f) => {
            try { const a = new A(); a.preload = 'auto'; a.addEventListener('canplaythrough', () => { (this.files[n] = this.files[n] || []).push(a); }, { once: true }); a.src = 'sounds/' + f; } catch (e) { /* no file audio */ }
          });
        });
        if (this.wantMusic) this.startMusicFiles();
      };
      if (window.SQ_SOUNDS) { go(); return; }
      try { const sc = document.createElement('script'); sc.src = 'sounds/list.js'; sc.onload = go; document.head.appendChild(sc); } catch (e) { /* no list */ }
    },
    playFile(name, vol, rate) {               // true when a real recording played
      const list = this.files[name]; if (!list || !list.length || this.muted) return !!list && this.muted;
      const a = list.length > 1 ? list[(this.vk = ((this.vk || 0) + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length)] : list[0];   // a different take each time
      try {
        const c = a.cloneNode(); c.volume = Math.max(0, Math.min(1, this.fileVol() * (vol===undefined?1:vol)));
        if (rate) { c.preservesPitch = false; c.mozPreservesPitch = false; c.playbackRate = rate; }
        const pr = c.play(); if (pr && pr.catch) pr.catch(() => {});
        this.lastFile = name;
      } catch (e) { return false; }
      return true;
    },
    stepSound(surface) {                         // footsteps match the ground: grass, sand, stone, wood (only with recordings)
      if (!(surface && this.playFile('step-' + surface, 0.4, 0.92 + Math.random() * 0.16))) this.playFile('step', 0.35, 0.9 + Math.random() * 0.2);
    },
    chime(n) {                                   // leaves in a row climb the scale (like a coin chain)
      const semi = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][Math.min(n, 9)];
      if (this.playFile('coin', 0.8, Math.pow(2, semi / 12))) return;
      const f = 988 * Math.pow(2, semi / 12);
      this.tone(f, 0.08, 'triangle', 0.09); this.tone(f * 1.335, 0.2, 'sine', 0.08, null, 0.07);
    },
    tone(freq, dur, type, vol, slideTo, delay,channel='effects') {
      if (!this.ctx || this.muted || !channelVolume(channel) || !isFinite(freq) || freq <= 0) return;
      try { this._tone(freq, dur, type,(vol===undefined?.15:vol)*channelVolume(channel), slideTo, delay); } catch (e) { console.warn('sound', e); }
    },
    _tone(freq, dur, type, vol, slideTo, delay) {
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(Math.max(.0001,vol), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    noise(dur, vol) {
      if (!this.ctx || this.muted) return;
      try { this._noise(dur,(vol===undefined?.2:vol)*channelVolume('effects')); } catch (e) { console.warn('sound', e); }
    },
    _noise(dur, vol) {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.buffer = buf; src.connect(g); g.connect(this.master); src.start();
    },
    sfx(name) {
      if (this.playFile(name, 1, name === 'jump' || name === 'pop' || name === 'bleat' ? 0.94 + Math.random() * 0.12 : 0)) return;
      switch (name) {
        case 'jump': this.tone(300, 0.15, 'triangle', 0.1, 600); break;
        case 'land': this.tone(120, 0.06, 'triangle', 0.08); break;
        case 'coin': this.tone(988, 0.08, 'triangle', 0.09); this.tone(1319, 0.2, 'sine', 0.08, null, 0.07); break;
        case 'splash': this.noise(0.35, 0.18); this.tone(500, 0.25, 'sine', 0.08, 180); break;
        case 'cheer': [660, 880, 990].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.08, null, i * 0.06)); break;
        case 'pickup': this.tone(523, 0.1, 'triangle', 0.12); this.tone(784, 0.15, 'triangle', 0.12, null, 0.08); break;
        case 'drop': this.tone(200, 0.12, 'triangle', 0.12, 120); break;
        case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.13, null, i * 0.1)); break;
        case 'bubble': this.tone(400, 0.3, 'sine', 0.15, 900); break;
        case 'pop': this.tone(900, 0.08, 'sine', 0.15, 300); break;
        case 'hit': this.noise(0.15, 0.25); this.tone(150, 0.15, 'sawtooth', 0.1, 60); break;
        case 'block': this.tone(1500, 0.1, 'triangle', 0.08); this.tone(1100, 0.15, 'triangle', 0.08, null, 0.06); break;
        case 'bleat': this.tone(520, 0.25, 'sawtooth', 0.06, 480); break;
        case 'roar': this.tone(110, 0.4, 'sawtooth', 0.12, 70); break;
        case 'call': this.tone(660, 0.12, 'sine', 0.12); this.tone(880, 0.2, 'sine', 0.12, null, 0.12); break;
        case 'error': this.tone(180, 0.18, 'triangle', 0.09); break;
        case 'thunder': this.noise(1.2, .045); this.tone(58, 1.5, 'sine', .055, 38); break;
        case 'door': this.noise(0.5, 0.3); this.tone(70, 0.6, 'sine', 0.3, 40); break;
        case 'win': [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.13, null, i * 0.14)); break;
        case 'build': [300, 360, 420].forEach((f, i) => this.tone(f, 0.08, 'triangle', 0.1, null, i * 0.09)); break;
        default: break;
      }
    },
    // music: { bpm, notes: [midi numbers, 0 = rest], bass: [...] }
    // Recorded music: sounds/music-w<world>.mp3 (a loop), with optional -drum and -harp layers that fade in
    // as the work gets done. A level can name its own file with LEVEL.musicFile. Without files: the built-in tune.
    musicName(L) {
      const explicit = L.musicFile && L.musicFile.replace(/^sounds\//, '').replace(/\.(mp3|ogg)$/, '');
      if (explicit && this.have(explicit)) return explicit;
      const own = 'music-' + L.id;
      return this.have(own) ? own : 'music-w' + String(L.id || '1').split('-')[0];
    },
    ambienceName(L) {
      if (['3-4', '5-3', '8-8'].includes(L.id)) return 'ambience-water';
      if (L.time === 'night') return 'ambience-night';
      if (L.town) return L.id === '4-1' ? 'ambience-field' : 'ambience-courtyard';
      const world = Number(String(L.id).split('-')[0]);
      return [2, 3].includes(world) ? 'ambience-wind' : 'ambience-field';
    },
    // Optional, shared-screen river bed. Distance is measured to the family's centre,
    // not the leader, and never affects movement, tasks or the ordinary mix.
    waterBedGain(L,players) {
      const sources=L.soundscape&&L.soundscape.water;
      const ps=players.filter(p=>p.joined&&!p.bubble);if(!Array.isArray(sources)||!ps.length)return 0;
      const x=ps.reduce((n,p)=>n+p.pos.x,0)/ps.length,z=ps.reduce((n,p)=>n+p.pos.z,0)/ps.length;
      let gain=0;for(const source of sources){
        if(![source.x,source.z,source.range].every(Number.isFinite)||source.range<=0)continue;
        const dx=Math.max(0,Math.abs(x-source.x)-(source.halfWidth||0)),d=Math.hypot(dx,z-source.z),u=Math.max(0,Math.min(1,1-d/source.range));
        gain=Math.max(gain,u*u*(3-2*u));
      }
      return gain*.32;
    },
    startMusicFiles() {
      if (SQ.state.level && SQ.state.level.solemn) return;
      this.wantMusic = true;
      if (this.musicEls || !this.listReady) return;
      const A = window.Audio, L = SQ.state.level; if (typeof A !== 'function' || !L) return;
      const name = this.musicName(L);
      if (!this.have(name)) return;
      const els = this.musicEls = { main: null, drum: null, harp: null, finale: null, ambience: null, water: null, ready: 0 };
      [['main', ''], ['drum', '-drum'], ['harp', '-harp'], ['finale', '-finale'], ['ambience', null], ...(L.soundscape&&L.soundscape.water?[['water', null]]:[])].forEach(([k, suf]) => {
        const f = this.have(k === 'ambience' ? this.ambienceName(L) : k==='water'?'ambience-water':name + suf); if (!f) return;
        try {
          const a = new A(); a.loop = true; a.preload = 'auto'; a.volume = 0;
          a.addEventListener('canplaythrough', () => {
            if (!this.wantMusic || this.musicEls !== els) { a.pause(); return; }
            if (els[k]) return; els[k] = a;
            if (k === 'main') { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
            const t = k !== 'ambience' && k !== 'water' && els.main && els.main !== a ? els.main.currentTime : 0;
            try { a.currentTime = t; } catch (e) { /* not seekable yet */ }
            const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
          }, { once: true });
          a.src = 'sounds/' + f;
        } catch (e) { /* no file audio */ }
      });
      this.musicMix = setInterval(() => {
        const st = SQ.state, on = !this.muted && st.phase !== 'paused', lay = this.layer(), v = this.fileVol('music') * 0.55 * (st.phase === 'story'||Speech.active ? 0.24 : 1);
        [['main', 1], ['drum', lay >= 1 ? 1 : 0], ['harp', lay >= 2 ? 1 : 0], ['finale', lay >= 3 ? 1 : 0], ['ambience', 0.35], ['water',this.waterBedGain(L,st.players)]].forEach(([k, want]) => {
          const a = els[k]; if (!a) return;
          if (k !== 'main' && k !== 'ambience' && k !== 'water' && els.main && !els.main.paused) {        // keep the layers in step with the melody
            const mt = els.main.currentTime, d = Math.abs(a.currentTime - mt), len = els.main.duration || 0;
            if (d > 0.06 && (!len || (mt > 0.3 && mt < len - 0.3))) { try { a.currentTime = mt; } catch (e) { /* not seekable yet */ } }
          }
          if (on && a.paused && els.main && !els.main.paused) { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
          a.volume = Math.max(0, Math.min(1, a.volume + ((on ? want * v : 0) - a.volume) * 0.15));
        });
      }, 120);
    },
    scoreTone(...args){while(args.length<6)args.push(undefined);args[3]=(args[3]===undefined?.15:args[3])*((SQ.state.phase==='story'||Speech.active) ? .24 : 1);this.tone(...args,'music');},
    startMusic(music) {
      if (SQ.state.level && SQ.state.level.solemn) return;
      this.startMusicFiles();
      if (!this.ctx || this.musicTimer || (this.musicEls && this.musicEls.main)) return;
      const m = music || DEFAULT_MUSIC;
      const stepSec = 60 / (m.bpm || 120) / 2;
      const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
      this.musicTimer = setInterval(() => {
        if (this.muted || SQ.state.phase === 'paused') return;
        const n = m.notes[this.step % m.notes.length], lay = this.layer();
        if (n) this.scoreTone(midi(n), stepSec * 0.9, 'triangle', 0.045);
        // the band grows as the family works: a soft drum, then a harp, then a harmony
        if (lay >= 1 && this.step % 4 === 0) this.scoreTone(70, 0.09, 'sine', 0.09, 42);
        if (lay >= 1 && this.step % 4 === 2) this.scoreTone(2600, 0.015, 'triangle', 0.012);
        if (lay >= 2 && n && this.step % 2 === 0) this.scoreTone(midi(n + 12), stepSec * 1.6, 'sine', 0.022);
        if (lay >= 3 && n) this.scoreTone(midi(n + 4), stepSec * 0.9, 'sine', 0.02);
        if (m.bass && this.step % 2 === 0) {
          const b = m.bass[(this.step / 2) % m.bass.length];
          if (b) this.scoreTone(midi(b), stepSec * 1.8, 'sine', 0.06);
        }
        this.step++;
      }, stepSec * 1000);
    },
    layer() {                                    // 0..3 from how much of the level's work is done
      const st = SQ.state; if (!st || !st.level) return 0;
      if (st.finaleStarted || st.finaleDone) return 3;
      let c = 0, t = 0; for (const k in st.tasks) { c += Math.min(st.tasks[k].count, st.tasks[k].total); t += st.tasks[k].total; }
      const f = t ? c / t : 0;
      return f >= 0.67 ? 2 : f >= 0.34 ? 1 : 0;
    },
    stopMusic() {
      this.wantMusic = false;
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      if (this.musicEls) { ['main', 'drum', 'harp', 'finale', 'ambience','water'].forEach((k) => { const a = this.musicEls[k]; if (a) try { a.pause(); } catch (e) { /* ignore */ } }); clearInterval(this.musicMix); this.musicEls = null; }
    },
    toggleMute() { this.muted = !this.muted; return this.muted; }
  };
  const DEFAULT_MUSIC = {
    bpm: 112,
    notes: [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 67, 0,
            72, 0, 76, 79, 81, 0, 79, 76, 77, 0, 76, 74, 72, 0, 0, 0],
    bass: [48, 48, 53, 53, 48, 48, 43, 43, 48, 48, 53, 53, 55, 55, 48, 48]
  };
  SQ.audio = Audio;

  /* -------------------------------------------------------------------
   * 3. STATE
   * ----------------------------------------------------------------- */
  const S = (SQ.state = {
    level: null, phase: 'lobby', time: 0, homeInterior: null,
    scene: null, camera: null, renderer: null, sun: null,
    team: { rescues: 0, shares: 0, carries: 0 },
    players: [], platforms: [], circles: [], interactables: [], carryables: [], gatherables: [],
    followers: [], zones: [], hazards: [], muds: [], pickups: [], leaves: [], fragments: [],
    particles: [], tasks: {}, leafCount: 0, fragCount: 0, jars: [], teamPads: [],
    waterY: -999, waterMesh: null, rain: null, beacon: null, objective: null,
    finaleStarted: false, finaleT: 0, finaleDone: false, objectiveTimer: 0,
    movers: [], truthBoxes: [], lieBoxes: [], fadeables: [], crumbles: [], springs: [], sweepers: [], courses: [], gold: null, goldGot: false, decor: null, truthOn: false, truthAnnounced: false, story: null,
    camTarget: null, stats: { pages: 0, chars: 0, toasts: 0, bubbles: 0, msgs: [], cards: [] }
  });

  /* -------------------------------------------------------------------
   * 4. UI (all DOM is created here so level pages stay tiny)
   * ----------------------------------------------------------------- */
  const CSS = `
  *{box-sizing:border-box;user-select:none}
  html,body{margin:0;height:100%;overflow:hidden;background:#1e242b;font-family:Georgia,serif}
  canvas#sq-canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
  .sq-card{background:rgba(25,22,18,.82);border:2px solid #d4af37;border-radius:12px;color:#f9f1dc;box-shadow:0 4px 12px rgba(0,0,0,.45)}
  #sq-hud{position:fixed;top:12px;left:12px;z-index:10;padding:8px 10px;pointer-events:none;width:min(290px,calc(100vw - 24px));box-sizing:border-box}
  #sq-hud .t{font-weight:bold;color:#f3d266;font-size:17px;margin-bottom:6px}
  #sq-hud .row{font:bold 16px sans-serif;margin:3px 0;display:flex;gap:8px;align-items:center}
  #sq-hud .row.done{color:#86efac}
  #sq-hud .row.locked{opacity:.45}
  #sq-hud .sq-task-count{white-space:nowrap;flex-shrink:0}
  #sq-hud .small{font:13px sans-serif;color:#ddd2be;margin-top:6px}
  #sq-timer{position:fixed;top:50px;left:50%;transform:translateX(-50%);z-index:10;padding:4px 14px;font:bold 18px sans-serif;color:#fde68a;pointer-events:none;text-align:center}#sq-timer.hidden{display:none}#sq-timer .cd{color:#fca5a5}
  #sq-help{position:fixed;bottom:14px;right:12px;max-width:220px;z-index:10;padding:6px 12px;font:12px/1.45 sans-serif;color:#ddd2be;pointer-events:none;transition:opacity 1.2s}#sq-help.gone{opacity:0}
  #sq-actions{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:11;display:grid;gap:8px;grid-template-columns:repeat(var(--sq-action-columns,1),minmax(0,1fr));pointer-events:none}
  .sq-edge{position:fixed;z-index:13;transform:translate(-50%,-50%);border:2px solid var(--player-color);background:#251d17ed;color:#fff4d6;border-radius:20px;padding:4px 9px;font:bold 13px sans-serif;pointer-events:none;white-space:nowrap}.sq-edge[hidden]{display:none}
  #sq-actions.hidden{display:none}.sq-action-card{padding:9px 14px;min-width:0;font:15px/1.4 sans-serif;border-color:var(--player-color,#d4af37)}
  .sq-action-player{font:bold 12px sans-serif;color:#fff;margin-bottom:4px}.sq-action-line{color:#fff6df}.sq-action-key{display:inline-block;min-width:28px;padding:0 5px;border:1px solid #f3d266;border-radius:5px;background:#493a1c;text-align:center;color:#fde68a}
  .sq-action-hint{font:13px/1.35 sans-serif;color:#e8d9b2;margin-top:4px}.sq-action-progress{height:5px;background:#514b37;border-radius:3px;margin-top:7px;overflow:hidden}.sq-action-progress>div{height:100%;background:#86efac}
  .sq-action-players{display:flex;flex-wrap:wrap;gap:5px 9px;margin-top:4px}.sq-action-chip{display:inline-flex;align-items:center;gap:5px;border-left:3px solid var(--player-color);padding:2px 5px;background:rgba(0,0,0,.18);border-radius:4px;font:bold 13px/1.3 sans-serif;color:#fff}.sq-action-chip .sq-action-key{min-width:23px}.sq-action-title{font-weight:bold}.sq-action-utility{display:flex;align-items:center;justify-content:center;gap:10px;padding:5px 10px!important;font-size:13px!important}.sq-action-utility .sq-action-players{margin:0}#sq-help.sq-guide-covered{opacity:0}
  .sq-bigtext .sq-action-chip{font-size:15px}.sq-bigtext .sq-action-card{font-size:18px}.sq-bigtext .sq-action-player,.sq-bigtext .sq-action-hint{font-size:15px}
  @media(max-width:1000px){#sq-actions{grid-template-columns:repeat(var(--sq-action-narrow-columns,1),minmax(0,1fr))}}
  @media(max-width:700px){#sq-actions{bottom:18px;gap:5px}#sq-actions.sq-touch-space{bottom:138px}.sq-action-card{padding:6px 8px;font-size:14px}.sq-action-chip{font-size:12px}.sq-action-utility{flex-wrap:wrap}}
  #sq-tilt{position:fixed;left:0;right:0;top:0;height:30%;pointer-events:none;z-index:4;-webkit-backdrop-filter:blur(0.65px);backdrop-filter:blur(0.65px);-webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.55) 45%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.55) 45%,transparent 100%)}#sq-tilt.off{display:none}
  #sq-vignette{position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 60%,rgba(20,10,0,.28) 100%)}
  canvas.sq-graded{filter:saturate(1.28) contrast(1.07)}
  #sq-toasts{position:fixed;top:12px;right:12px;width:min(360px,calc(100vw - 24px));z-index:12;pointer-events:none}
  .sq-toast{background:rgba(25,20,14,.92);border:2px solid #f3d266;color:#fff6df;padding:9px 12px;border-radius:12px;font:bold 15px/1.35 sans-serif;text-align:left;transition:opacity .3s;overflow-wrap:anywhere}.sq-toast[hidden]{display:none}
  #sq-hud .t{font-size:15px;margin-bottom:4px}#sq-hud .small{margin-top:3px;font-size:12px}#sq-hud .sq-task-summary{font:11px sans-serif;color:#dbcda8;margin-top:4px}
  @media(max-width:700px){#sq-hud{width:min(260px,calc(100vw - 24px));padding:6px 8px}#sq-hud .t{font-size:14px}#sq-hud .row{font-size:14px}#sq-hud .checkpoint{display:none}#sq-toasts{width:min(310px,calc(100vw - 24px))}#sq-help{max-width:180px;font-size:11px}}
  #sq-verse{position:fixed;top:16%;left:50%;transform:translateX(-50%);max-width:640px;width:90%;z-index:15;padding:14px 22px;text-align:center;opacity:0;transition:opacity .3s;pointer-events:none}
  #sq-verse.show{opacity:1}
  #sq-verse .vt{font:bold 13px sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#facc15;margin-bottom:6px}
  #sq-verse .vx{font-size:19px;font-style:italic;line-height:1.45;color:#fff;margin-bottom:6px}
  #sq-verse .vr{font-weight:bold;color:#fde047;font-size:14px}
  #sq-labels{position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden}
  .sq-chips{margin-top:8px}.sq-chip{display:inline-block;margin:0 4px;padding:2px 10px;border:2px solid;border-radius:12px;font:bold 14px sans-serif;background:#fff8e7}
  .sq-readbar{height:4px;background:rgba(112,66,20,.15);border-radius:2px;margin:8px auto 0;max-width:240px}.sq-readbar>div{height:100%;width:0;background:#b5894c;border-radius:2px}
  .sq-act{font:bold 11px/1.35 sans-serif;color:#fde68a;text-align:center;margin-top:1px;white-space:pre-line}
  .sq-cheer{font:bold 14px sans-serif;color:#fff;background:#f59e0b;border-radius:10px;padding:2px 8px;margin-bottom:2px;text-align:center;animation:sq-pop .3s ease}
  .sq-label{text-align:center;position:absolute;max-width:calc(100vw - 12px);transform:translate(-50%,-100%);font:bold 12px sans-serif;color:#fff;background:rgba(15,18,24,.8);border:2px solid #fff;border-radius:10px;padding:2px 8px;white-space:nowrap}
  .sq-overlay{position:fixed;inset:0;background:rgba(12,15,20,.88);display:flex;align-items:center;justify-content:center;z-index:30;padding:16px}
  .sq-overlay.hidden{display:none}
  @media(min-width:1100px) and (min-height:600px){
    .sq-overlay.sq-scene-reading{justify-content:flex-end;padding:24px;background:linear-gradient(90deg,rgba(12,15,20,.12),rgba(12,15,20,.25) 52%,rgba(12,15,20,.68))}
    .sq-scene-reading>.sq-scroll{max-width:500px!important;width:43%}
  }
  .sq-scroll{max-width:860px;width:96%;max-height:94vh;overflow-y:auto;background:linear-gradient(180deg,#f6e7c1,#ebd59d 50%,#dec07c);border-top:16px solid #8c5828;border-bottom:16px solid #8c5828;border-radius:12px;padding:18px 24px;text-align:center;color:#2f1d0b;box-shadow:0 18px 45px rgba(0,0,0,.65)}
  .sq-tag{font:bold 11px sans-serif;letter-spacing:2px;text-transform:uppercase;color:#704214}
  .sq-h{font-size:26px;font-weight:bold;margin:4px 0 8px;color:#3d2208}
  .sq-v{font-size:16px;line-height:1.4;font-style:italic;margin:4px 0}
  .sq-r{font-size:13px;font-weight:bold;color:#5c330a;margin-bottom:8px}
  .sq-slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
  @media(max-width:700px){.sq-slots{grid-template-columns:repeat(2,1fr)}}
  .sq-slot{background:rgba(255,250,235,.6);border:2px dashed #a37843;border-radius:10px;padding:8px 6px;font-family:sans-serif;min-height:120px;display:flex;flex-direction:column;justify-content:space-between}
  .sq-slot.on{background:#fffdf7;border-style:solid;border-width:3px}
  .sq-slot .n{font-size:11px;font-weight:bold;text-transform:uppercase;color:#5c3b14}
  .sq-slot .r{font:bold 16px Georgia,serif;margin:4px 0}
  .sq-slot .tr{font-size:11px;color:#4a3520;min-height:28px}
  .sq-slot .dv{font-size:10px;color:#6e481f;background:rgba(140,88,40,.12);border-radius:6px;padding:3px;margin-top:4px}
  .sq-btn{font:bold 13px sans-serif;background:#7c4d1f;color:#fff6e5;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;margin:2px}
  .sq-big{font:bold 16px sans-serif;background:#6e3f14;color:#f7ebd2;border:none;border-radius:24px;padding:10px 26px;cursor:pointer;margin:6px}
  .sq-big:hover,.sq-btn:hover{background:#5c3713}
  .sq-help{font:12px/1.5 sans-serif;text-align:left;background:rgba(255,250,235,.7);border:1px solid #b5894c;border-radius:8px;padding:8px 12px;color:#3d2208}
  .sq-q{font-weight:bold;font-size:16px;margin:12px 0 6px;text-align:left}
  .sq-opt{display:block;width:100%;text-align:left;font:bold 14px sans-serif;background:rgba(255,250,235,.85);border:2px solid #b5894c;border-radius:8px;padding:8px 12px;margin:4px 0;cursor:pointer;color:#2f1d0b}
  .sq-focus{outline:4px solid #f3d266;outline-offset:2px}
  .sq-stars{display:flex;justify-content:center;gap:18px;margin:8px 0 4px}
  .sq-star{font-size:34px;opacity:.45;display:flex;flex-direction:column;align-items:center}
  .sq-star.on{opacity:1;animation:sq-pop .5s cubic-bezier(.3,1.6,.5,1) both}
  .sq-star.on:nth-child(2){animation-delay:.35s}.sq-star.on:nth-child(3){animation-delay:.7s}
  @keyframes sq-pop{0%{transform:scale(0) rotate(-30deg);opacity:0}100%{transform:scale(1);opacity:1}}
  .sq-overlay>.sq-scroll{animation:sq-unroll .38s cubic-bezier(.2,1.2,.4,1) both;transform-origin:50% 0}
  .sq-overlay>.sq-scroll.sq-turn{animation:sq-turn .28s ease-out both}
  @keyframes sq-unroll{0%{transform:scaleY(.15);opacity:0}100%{transform:scaleY(1);opacity:1}}
  @keyframes sq-turn{0%{transform:translateX(18px);opacity:.3}100%{transform:none;opacity:1}}
  .sq-big.sq-focus,.sq-opt.focus{animation:sq-wiggle .35s ease-out}
  @keyframes sq-wiggle{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}
  #sq-fade{position:fixed;inset:0;background:#120d07;z-index:60;pointer-events:none;opacity:1;transition:opacity .55s ease}
  #sq-fade.out{opacity:0}
  .sq-say{padding:10px 16px;background:#8b5e34}
  body.sq-bigtext .sq-v{font-size:25px!important;line-height:1.45}body.sq-bigtext .sq-h{font-size:30px}body.sq-bigtext .sq-toast{font-size:19px}
  body.sq-bigtext #sq-hud{font-size:120%}body.sq-bigtext #sq-hud .row span{font-size:16px!important}body.sq-bigtext .sq-big{font-size:19px}body.sq-bigtext .sq-q,body.sq-bigtext .sq-opt{font-size:18px}
  .sq-star small{font:bold 11px sans-serif;color:#5c3d22}
  .sq-opt.focus{border-color:#7c4d1f;box-shadow:0 0 0 3px rgba(124,77,31,.35)}
  .sq-opt.right{background:#bbf7d0;border-color:#22c55e}
  .sq-opt.wrong{background:#fecaca;border-color:#ef4444}
  .sq-fb{font-size:13px;font-style:italic;color:#5c330a;min-height:18px;text-align:left}
  .sq-scores{background:rgba(255,250,235,.85);border:2px solid #b5894c;border-radius:10px;padding:10px;font:14px/1.6 sans-serif;margin:8px 0}
  `;

  const UI = {};
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function buildUI(L) {
    document.head.appendChild(el('style', null, CSS));
    document.title = 'Scroll Quest: ' + L.world + ' — ' + L.title;
    UI.canvas = el('canvas', { id: 'sq-canvas' });
    UI.hud = el('div', { id: 'sq-hud', class: 'sq-card' });
    UI.help = el('div', { id: 'sq-help', class: 'sq-card' }, 'A / Space: jump · X / Shift: run · Y / E: use · B: pick up / call · Right stick: camera · Start / Esc: all controls');
    UI.toasts = el('div', { id: 'sq-toasts' });
    UI.actions = el('div', { id:'sq-actions',class:'hidden','aria-label':'Nearby actions' });
    UI.timer = el('div', { id: 'sq-timer', class: 'sq-card hidden' });
    UI.fade = el('div', { id: 'sq-fade' });
    UI.verse = el('div', { id: 'sq-verse', class: 'sq-card' }, '<div class="vt"></div><div class="vx"></div><div class="vr"></div>');
    UI.labels = el('div', { id: 'sq-labels' });
    UI.lobby = el('div', { class: 'sq-overlay' });
    UI.pause = el('div', { class: 'sq-overlay hidden' });
    UI.results = el('div', { class: 'sq-overlay hidden' });
    UI.gameover = el('div', { class: 'sq-overlay hidden', id: 'sq-gameover' });
    UI.gameover.onclick = e => { const b=e.target.closest('button');if(!b)return;if(b.dataset.act==='retry')SQ.restart();else if(b.dataset.act==='menu')goMenu(); };
    UI.story = el('div', { class: 'sq-overlay hidden' });
    UI.story.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.getAttribute('data-act') === 'speak') { if (S.story) speakPage(S.story.pages[S.story.i]); return; }
      storyClick();
    });
    UI.vignette = el('div', { id: 'sq-vignette' });
    UI.tilt = el('div', { id: 'sq-tilt', class: setting('tilt') === '0' ? 'off' : '' });
    [UI.canvas, UI.tilt, UI.vignette, UI.hud, UI.help, UI.timer, UI.fade, UI.toasts, UI.actions, UI.verse, UI.labels, UI.lobby, UI.pause, UI.results, UI.gameover, UI.story].forEach((e) => document.body.appendChild(e));
    buildLobby(L);
    buildPause();
    setTimeout(() => UI.fade.classList.add('out'), 60);              // fade in from the menu
    if (setting('bigtext') === '1') document.body.classList.add('sq-bigtext');
  }

  // One readable notice at a time; Scripture remains on its own paused story cards.
  function toast(msg, ms) {
    const queue = S.notices || (S.notices = []);
    if (queue.some(n => n.msg === msg)) return;
    if (S.stats) { S.stats.toasts++; if (S.stats.msgs.length < 200) S.stats.msgs.push(msg); }
    const history = S.noticeHistory || (S.noticeHistory = []); history.push(msg); if (history.length > 8) history.shift();
    const node = el('div', { class: 'sq-toast', role: 'status' }); node.textContent = msg; node.hidden = queue.length > 0; UI.toasts.appendChild(node);
    queue.push({ msg, node, left: Math.max(ms || 0, 3500) / 1000 });
    if (queue.length > 4) { const old = queue.splice(1, 1)[0]; old.node.remove(); }
    S.noticeLayoutTick = 0;
  }
  const rectOverlap = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  function noticePosition(width,height,screen,blocks,current) {
    const gap=12,right=Math.max(gap,screen.width-width-gap),bottom=Math.max(gap,screen.height-height-gap-(screen.touch?130:0));
    const ys=[gap,Math.min(bottom,screen.hudBottom+gap),bottom],xs=[right,gap];
    const score=p=>blocks.reduce((n,b)=>n+rectOverlap({left:p.x,top:p.y,right:p.x+width,bottom:p.y+height},b)*(b.weight||1),0);
    if(current&&current.x>=gap&&current.x<=right&&current.y>=gap&&current.y<=bottom&&score(current)===0)return current;
    let best=null,cost=Infinity;for(const y of ys)for(const x of xs){const p={x,y},n=score(p);if(n<cost){cost=n;best=p;}}return best;
  }
  function updateNotices(dt) {
    const queue=S.notices||[],active=queue[0]; UI.toasts.style.display=S.phase==='play'?'':'none';if(!active)return;
    if(S.phase!=='play')return;
    active.left-=dt;if(active.left<=0){active.node.remove();queue.shift();if(queue[0])queue[0].node.hidden=false;S.noticeLayoutTick=0;return;}
    S.noticeLayoutTick=(S.noticeLayoutTick||0)-dt;if(S.noticeLayoutTick>0)return;S.noticeLayoutTick=.3;
    const blocks=[],hud=UI.hud.getBoundingClientRect();
    const uiNodes=[UI.hud,UI.actions,UI.timer,UI.help];if(touchUI&&touchUI.shown)uiNodes.push(...touchUI.root.querySelectorAll('.tb'));
    for(const node of uiNodes){const r=node.getBoundingClientRect();if(r.width&&r.height&&!node.classList.contains('hidden')&&!node.classList.contains('gone'))blocks.push({left:r.left-8,right:r.right+8,top:r.top-8,bottom:r.bottom+8,weight:10});}
    const protect=(x,y,z,r)=>{const v=new THREE.Vector3(x,y,z).project(S.camera);if(v.z<1&&Math.abs(v.x)<1.2&&Math.abs(v.y)<1.2){const a=(v.x*.5+.5)*window.innerWidth,b=(-v.y*.5+.5)*window.innerHeight;blocks.push({left:a-r,right:a+r,top:b-r,bottom:b+r,weight:20});}};
    api.players().forEach(p=>{for(const dy of [.1,1.3,2.8])protect(p.pos.x,p.pos.y+dy,p.pos.z,35);});
    if(S.gold&&!S.goldGot)protect(S.gold.x,S.gold.g.position.y,S.gold.z,30);
    const r=UI.toasts.getBoundingClientRect(),p=noticePosition(r.width||Math.min(360,window.innerWidth-24),r.height||70,{width:window.innerWidth,height:window.innerHeight,touch:!!(touchUI&&touchUI.shown),hudBottom:hud.bottom},blocks,S.noticePosition);
    S.noticePosition=p;UI.toasts.style.left=p.x+'px';UI.toasts.style.top=p.y+'px';UI.toasts.style.right='auto';
  }
  SQ._noticePosition=noticePosition;
  // Scripture cards pause the game and wait for A / Space / E, so kids can read them together
  // remember a Scripture ref as read; a range (John 13:14–15) also counts each verse in it
  function markShown(ref) {
    if (!ref) return;
    const R = S.shownRefs = S.shownRefs || {};
    R[ref] = true;
    const m = /^(.*\d+):(\d+)[–-](\d+)$/.exec(ref);
    if (m) for (let v = +m[2]; v <= +m[3]; v++) R[m[1] + ':' + v] = true;
  }
  function verse(title, text, ref) {
    const page = { art: '📜', title, text, ref };
    if (S.phase === 'story' && S.story) { S.story.pages.push(page); markShown(ref); renderStory(); return; }
    if (S.phase !== 'play') return;
    showStory([page]);
  }

  function renderHUD() {
    S.players.forEach(syncTools);
    const L = S.level;
    let h = '<div class="t">' + esc(L.world + ': ' + L.title) + '</div>';
    const tasks=L.tasks||[],current=tasks.find(t=>!taskComplete(t.id)&&(!t.lockedUntil||taskComplete(t.lockedUntil)));
    tasks.filter(t=>t===current).forEach((t) => {
      const st = S.tasks[t.id];
      const locked = t.lockedUntil && !taskComplete(t.lockedUntil);
      const done = st.count >= st.total;
      h += '<div class="row ' + (done ? 'done' : locked ? 'locked' : '') + '"><span class="sq-task-count">' + t.icon + ' ' +
        (locked ? '🔒' : st.count + '/' + st.total) + '</span><span style="font-weight:normal;font-size:13px">' + esc(t.label) + '</span></div>';
    });
    if(tasks.length)h+='<div class="sq-task-summary">Tasks '+tasks.filter(t=>taskComplete(t.id)).length+'/'+tasks.length+' · Pause for all</div>';
    const fr = '●'.repeat(S.fragCount) + '○'.repeat(Math.max(0, S.fragments.length - S.fragCount));
    if (S.waiting) h += '<div class="row" style="color:#fde68a">🐾 ' + S.waiting + ' waiting behind <span style="font-weight:normal;font-size:12px">(look for the light)</span></div>';
    h += '<div class="small">' + (L.leafIcon || '🌿') + ' ' + S.leafCount + ' &nbsp; 📜 ' + fr + (S.gold ? ' &nbsp; ' + (S.goldGot ? '🌟' : '☆') : '') + '</div>';
    if(S.runStarted) {
      h += '<div class="small">'+(S.lifeMode==='practice'?'🌱 Practice · unlimited retries':'♥ Team lives: '+S.teamLives)+' · '+api.players().map(p=>'P'+(p.slot+1)+' '+(S.lifeMode==='practice'?'':('♥'.repeat(Math.max(0,p.health))+'♡'.repeat(Math.max(0,2-p.health))))+(p.tools&&p.tools.rope?' 🪢':'')).join(' · ')+'</div>';
      if(S.checkpointLabel)h+='<div class="small checkpoint">⚑ '+esc(S.checkpointLabel)+'</div>';
    }
    h += supplyHUD();
    if (S.finaleStarted && !S.finaleDone && S.finishMarker) {
      const ps = api.players(), n = ps.filter((p) => !p.bubble && L.finale.inZone(p)).length;
      h += '<div class="row">📜 Gather at the scroll: ' + n + '/' + ps.length + '</div>';
    }
    UI.hud.innerHTML = h;
  }

  // ---- Lobby ----
  function deviceName(d) {
    if (d === 'kb1') return 'Keys: WASD • Shift run • Space jump • E action • Q share';
    if (d === 'kb2') return 'Keys: Arrows • R-Ctrl run • Enter jump • R-Shift action • / share';
    if (d && d.indexOf('gp') === 0) return 'Controller ' + (+d.slice(2) + 1) + ': A jump • hold X run • Y use / special • B pick up / call animals • LB / RB characters • LT cheer • RT share • L3 catch up • right stick camera • R3 recenter';
    if (d === 'vpt') return 'Touch screen: ' + (touchMode() === 'tap' ? 'tap where to go' : 'stick + JUMP / ACT');
    if (d && d.indexOf('vpn') === 0) return '📱 Phone: JUMP jump • ACT action • 👋 share';
    return 'Press A on a controller, E (WASD keys) or Enter (arrow keys) to join';
  }
  function buildLobby(L) {
    const intro = (L.intro || []).map((v) => '<div class="sq-v">“' + esc(v.text) + '”</div><div class="sq-r">— ' + esc(v.ref) + ' (KJV)</div>').join('');
    UI.lobby.innerHTML =
      '<div class="sq-scroll"><div class="sq-tag">Scroll Quest • ' + esc(L.world) + '</div><div class="sq-h">' + esc(L.title) + '</div>' + intro +
      '<div class="sq-slots"></div><div class="sq-phones" style="display:none;gap:14px;align-items:center;margin:8px 0;font-size:14px"></div>' +
      '<div class="sq-help"><b>Join:</b> press A on a controller (the first controller becomes Player 1). Keyboard players join with <b>E</b> (WASD) or <b>Enter</b> (arrows). <b>Change character:</b> ◀ ▶ (A/D, ←/→ or D-pad). ' +
      '<b>In game:</b> A jumps. Hold X to run. Y uses nearby puzzles and character actions. B picks up / puts down items; with nothing to pick up, B calls the animals near you (or lifts / throws a friend). LT cheers; RT shares equipment. Keyboard / phone ACTION still does the nearest job. ' +
      'Solve supply-cache clues for equipment: one copy per player. Gather at the scroll-and-lantern marker to finish. '+
      'Right stick orbits/tilts the shared camera; R3 recenters. Player 1’s connected gamepad controls the view, or the first joined gamepad when Player 1 uses keys. '+
      'LB / RB cycle characters backward / forward; Tab / Shift+Tab work on keys. L3 catches up with friends. Back rereads the story.</div>' +
      '<div class="sq-tag" style="text-transform:none;letter-spacing:0;margin:8px 0">Adventure: 2 hearts, 5 shared lives + 1 per teammate. Hits use up equipment; pits cost a life. Checkpoints restore hearts. Practice gives unlimited retries.</div>'+
      '<button class="sq-big" data-act="challenge" '+(L.practice?'disabled':'')+'>'+(L.practice||setting('challenge')==='practice'?'🌱 Practice: unlimited retries':'♥ Adventure: hearts and shared lives')+'</button><br>'+
      '<button class="sq-big" data-act="start">▶ Start (Space / Start)</button> <button class="sq-big" data-act="menu">Menu</button></div>';
    UI.lobby.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      Audio.init();
      const a = b.getAttribute('data-act');
      const i = +b.getAttribute('data-i');
      if (a === 'challenge') {setSetting('challenge',setting('challenge')==='practice'?'adventure':'practice');b.textContent=setting('challenge')==='practice'?'🌱 Practice: unlimited retries':'♥ Adventure: hearts and shared lives';renderLobby();}
      if (a === 'start') startPlay();
      else if (a === 'menu') goMenu();
      else if (a === 'join') joinSlot(i, i === 1 ? 'kb2' : 'click');
      else if (a === 'leave') leaveSlot(i);
      else if (a === 'prev') cycleRole(S.players[i], -1);
      else if (a === 'next') cycleRole(S.players[i], 1);
    });
  }
  function renderLobby() {
    const box = UI.lobby.querySelector('.sq-slots');
    if (!box) return;
    box.innerHTML = S.players.map((p, i) => {
      const r = p.role;
      return '<div class="sq-slot ' + (p.joined ? 'on' : '') + '" style="' + (p.joined ? 'border-color:' + r.css : '') + '">' +
        '<div><div class="n">Player ' + (i + 1) + (p.joined ? ' ✓' : '') + '</div>' +
        '<div class="r" style="color:' + r.css + '">' + r.name + '</div><div class="tr">' + r.trait + '</div></div>' +
        '<div><div class="dv">' + deviceName(p.joined ? p.device : null) + '</div>' +
        '<button class="sq-btn" data-act="prev" data-i="' + i + '">◀</button><button class="sq-btn" data-act="next" data-i="' + i + '">▶</button>' +
        (i > 0 ? (p.joined ? '<button class="sq-btn" data-act="leave" data-i="' + i + '">Leave</button>' : '<button class="sq-btn" data-act="join" data-i="' + i + '">Join</button>') : '') +
        '</div></div>';
    }).join('');
  }

  // ---- Pause ----
  // Who turns story pages: 'any' player, or 'p1' (a reader controls the pages). Saved in this browser.
  // 'all' (default): every player presses to say "ready", 'p1': Player 1 turns the pages, 'any': anyone can.
  function readerMode() { const m = setting('reader'); return m === 'all' || m === 'any' ? m : 'p1'; }
  // a joined player who can actually press a button right now (a controller that was unplugged can't)
  function present(p) { if (!p.joined) return false; if (isPad(p.device)) { const g = gpNow[padKey(p.device)]; return !!(g && g.on); } return true; }
  function setReaderMode(m) { setSetting('reader', m); }
  // ---- Timer: always counted, only shown if the family turns it on (pause menu). No level ever fails on time. ----
  function timerOn() { return setting('timer') === '1'; }
  function setTimerOn(v) { setSetting('timer', v ? '1' : '0'); }
  function fmtTime(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function renderTimer() {
    if (!UI.timer) return;
    const cd = S.countdown && !S.countdown.over ? S.countdown : null;
    const show = (timerOn() && !S.level.solemn) || cd;
    UI.timer.classList.toggle('hidden', !show || S.phase === 'lobby' || !!S.homeInterior);
    if (!show) return;
    const rec=loadProgress().levels[S.level.id]||{},key=teamRecordKey();
    const best=setting('records')==='1'&&rec.teamRecords&&rec.teamRecords[key]?rec.teamRecords[key].seconds:null;
    UI.timer.innerHTML = (timerOn() && !S.level.solemn ? '⏱️ ' + fmtTime(S.runTime) + (best ? ' <span style="font-weight:normal;font-size:13px">best ' + fmtTime(best) + '</span>' : '') : '') +
      (cd ? '<div class="cd">' + esc(cd.label) + ' ' + fmtTime(cd.left) + '</div>' : '');
  }
  function buildPause() {
    UI.pause.innerHTML = '<div class="sq-scroll" style="max-width:440px"><div class="sq-h">Paused</div>' +
      '<button class="sq-big" data-act="resume">Resume</button><br><div data-pause-tasks class="sq-help"></div>' +
      '<button class="sq-big" data-act="reread">Read the last story again (R)</button><br>' +
      '<button class="sq-big" data-act="reader"></button><br>' +
      '<button class="sq-big" data-act="timer"></button><br>' +
      '<button class="sq-big" data-act="records"></button><br>' +
      '<button class="sq-big" data-act="speak"></button><br>' +
      ['music','effects','voice'].map(k=>'<button class="sq-big" data-act="volume-'+k+'"></button><br>').join('') +
      '<button class="sq-big" data-act="restart">Restart level</button><br>' +
      '<button class="sq-big" data-act="respawn">Return to checkpoint</button><br>' +
      '<button class="sq-big" data-act="mute">Toggle sound (M)</button><br>' +
      '<button class="sq-big" data-act="menu">Back to menu</button>' +
      '<div class="sq-tag" style="margin-top:6px">▲ ▼ to choose • Space / A to press</div>' +
      '<div class="sq-tag" data-pause-controls style="margin-top:4px;text-transform:none;letter-spacing:0">Right stick camera • R3 recenter • LB / RB previous / next character • hold X run • Y use / special • B pick up / call animals • LT cheer • RT share • L3 catch up • Tab / Shift+Tab characters • Shift run • E action • Q share / cheer • C catch up • R / Back read again • M mute</div></div>';
    UI.pause.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) pauseAct(b.getAttribute('data-act'));
    });
  }
  function pauseAct(a) {
    if(S.homeInterior&&a==='respawn'){togglePause();exitHomeInterior();return;}
    if(S.homeInterior&&a==='reread'){togglePause();toast('Explore the loft ledger, share bread at the table, and return outside together.',3500);return;}
    if(a&&a.indexOf('volume-')===0){const key=a.slice(7);if(!['music','effects','voice'].includes(key))return;const old=String(Math.round(channelVolume(key)*100)),next=VOLUME_STEPS[(VOLUME_STEPS.indexOf(old)+1)%VOLUME_STEPS.length];setSetting(key+'Volume',next);if(key==='voice')Speech.stop();renderPause();return;}
    if (a === 'resume') togglePause();
    else if (a === 'reread') { togglePause(); if (S.phase === 'play') reread(); }
    else if (a === 'reader') { setReaderMode({ p1: 'all', all: 'any', any: 'p1' }[readerMode()]); renderPause(); if (S.story) renderStory(); }
    else if(a==='records'){setSetting('records',setting('records')==='1'?'0':'1');renderPause();renderTimer();}
    else if (a === 'timer') { setTimerOn(!timerOn()); renderPause(); renderTimer(); }
    else if (a === 'speak') { setSetting('speak', Speech.on() ? '0' : '1'); renderPause(); if (Speech.on()) Speech.say('Read aloud is on.'); else Speech.stop(); }
    else if (a === 'restart') SQ.restart();
    else if (a === 'respawn') {if(S.pauseFrom==='story')return;togglePause();const p=S.players[S.pauseOwner||0]||api.players()[0];if(p&&!p.bubble)enterBubble(p,true,'Return to checkpoint');}
    else if (a === 'mute') toast(Audio.toggleMute() ? '🔇 Sound off' : '🔊 Sound on');
    else if (a === 'menu') goMenu();
  }
  function renderPause() {
    const checklist=UI.pause.querySelector('[data-pause-tasks]');if(checklist)checklist.innerHTML='<b>Level tasks</b><br>'+(S.level.tasks||[]).map(t=>(taskComplete(t.id)?'✓ ':((S.tasks[t.id]||{}).count||0)+'/'+t.total+' ')+esc(t.label)).join('<br>')+((S.noticeHistory||[]).length?'<br><br><b>Latest notice</b><br>'+esc(S.noticeHistory.at(-1)):'');
    const directions=UI.pause.querySelector('[data-act="reread"]');if(directions)directions.textContent=S.homeInterior?'Read room directions (R)':'Read the last story again (R)';
    const controls=UI.pause.querySelector('[data-pause-controls]');if(controls){if(!controls.outdoorText)controls.outdoorText=controls.textContent;controls.textContent=S.homeInterior?'Move • A / Space jump • X / Shift run • Y / E / ACT use • B returns outside • Fixed shared room view • Start / Esc resume':controls.outdoorText;}
    for(const key of ['music','effects','voice']){const b=UI.pause.querySelector('[data-act="volume-'+key+'"]');if(b)b.textContent=({music:'🎵 Music',effects:'🔔 Sound effects',voice:'🗣️ Narration'}[key])+': '+volumeName(key);}
    const btns = UI.pause.querySelectorAll('button');
    const respawn=UI.pause.querySelector('[data-act="respawn"]');if(respawn){respawn.textContent=S.homeInterior?'Return outside':'Return P'+((S.pauseOwner||0)+1)+' to checkpoint ('+(S.lifeMode==='practice'?'free':'costs 1 team life')+')';respawn.disabled=S.pauseFrom==='story';}
    const rb = UI.pause.querySelector('[data-act="reader"]');
    const recordsBtn=UI.pause.querySelector('[data-act="records"]');if(recordsBtn)recordsBtn.textContent='⏱️ Team records: '+(setting('records')==='1'?'on':'off (no rush)');
    const tb = UI.pause.querySelector('[data-act="timer"]');
    if (tb) tb.textContent = timerOn() ? '⏱️ Timer: shown (beat your best!)' : '⏱️ Timer: hidden (no rush)';
    const sb = UI.pause.querySelector('[data-act="speak"]');
    if (sb) sb.textContent = Speech.on() ? '🔊 Read story cards aloud: on' : '🔈 Read story cards aloud: off';
    if (rb) rb.textContent = { all: '📖 Story pages: everyone says ready', p1: '📖 Story pages: Player 1 turns them', any: '📖 Story pages: anyone can turn them' }[readerMode()];
    btns.forEach((b, k) => b.classList.toggle('sq-focus', k === (S.pauseSel || 0)));
    const selected=btns[S.pauseSel||0];if(S.phase==='paused'&&selected&&typeof selected.scrollIntoView==='function')selected.scrollIntoView({block:'nearest'});
  }
  function pauseInput(inp) {
    const n = UI.pause.querySelectorAll('button').length;
    if (inp.up) { S.pauseSel = ((S.pauseSel || 0) + n - 1) % n; renderPause(); }
    if (inp.down) { S.pauseSel = ((S.pauseSel || 0) + 1) % n; renderPause(); }
    if (inp.jumpP) { const b = UI.pause.querySelectorAll('button')[S.pauseSel || 0]; if (b) pauseAct(b.getAttribute('data-act')); }
  }
  function togglePause() {
    if (S.phase === 'play' || S.phase === 'story') { S.pauseFrom = S.phase; S.phase = 'paused'; S.pauseSel = 0; renderPause(); UI.pause.classList.remove('hidden'); }
    else if (S.phase === 'paused') { S.phase = S.pauseFrom || 'play'; UI.pause.classList.add('hidden'); if (S.story && S.phase === 'story') renderStory(); }
  }
  // reopen the last story cards (for anyone who missed them)
  function reread() {
    if (S.phase !== 'play' || !S.lastStory) { if (S.phase === 'play') toast('No story cards yet.', 2000); return; }
    showStory(S.lastStory.slice(), null, true);
  }
  function leave(url) { if (UI.fade) UI.fade.classList.remove('out'); setTimeout(() => { if (url) location.href = url; else location.reload(); }, 380); }   // a soft fade, then go
  SQ.restart = function () {saveSetup();leave();};
  function goMenu() { leave('index.html'); }
  function goNext() { saveSetup(); leave(window.SQ_BUILD&&SQ_BUILD.edition==='demo'?'index.html':'index.html?next=' + encodeURIComponent(S.level.id)); }
  // the family's player setup carries over to the next level in this browser tab
  function saveSetup() {
    try { sessionStorage.setItem('scrollquest.setup', JSON.stringify(S.players.map((p) => (p.joined ? { device: p.device, role: p.roleIdx } : null)))); } catch (e) { /* storage blocked */ }
  }
  function loadSetup() {
    try { return JSON.parse(sessionStorage.getItem('scrollquest.setup')) || []; } catch (e) { return []; }
  }
  function restoreSetup() {
    const setup = loadSetup();
    setup.forEach((st, i) => {
      if (!st) return;
      if (i === 0) return;                                                     // Player 1 got their character in joinSlot
      if (st.device === 'kb1' || st.device === 'kb2') joinSlot(i, st.device);   // keyboards rejoin; controllers press A
    });
  }

  /* -------------------------------------------------------------------
   * 5. INPUT (keyboard x2 + up to 4 gamepads)
   * ----------------------------------------------------------------- */
  const keys = {};
  const pressedKeys = {};
  const gpPrev = {};
  const gpNow = {};
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
    if (!keys[e.code]) pressedKeys[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Virtual controllers: the touch screen ('vpt') and phones used as controllers ('vpn1', 'vpn2', ...).
  // Each one looks exactly like a gamepad to the rest of the engine: ax = stick, b = buttons in gamepad order
  // (0 jump, 2 action, 3 share, 4 catch up, 5 character, 9 start). world: true = the stick is a map direction
  // (tap-to-move steers by the map, not by the camera).
  const vpads = {};
  SQ._vpads = vpads;
  function pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      gpPrev[i] = gpNow[i] || { b: [], ax: [0, 0] };
      const gp = pads && pads[i];
      if (gp && gp.connected) {
        gpNow[i] = { b: gp.buttons.map((b) => b.pressed), ax: [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0], on: true, id: gp.id || '' };
      } else gpNow[i] = { b: [], ax: [0, 0], on: false };
    }
    for (const k in vpads) {
      const v = vpads[k];
      gpPrev[k] = gpNow[k] || { b: [], ax: [0, 0] };
      gpNow[k] = { b: (v.b || []).slice(), ax: [(v.ax && v.ax[0]) || 0, (v.ax && v.ax[1]) || 0,(v.camera&&v.camera[0])||0,(v.camera&&v.camera[1])||0], on: v.on !== false, id: k, world: !!v.world };
    }
  }
  function isPad(d) { return !!d && (d.indexOf('gp') === 0 || d.indexOf('vp') === 0); }
  function padKey(d) { return d.indexOf('gp') === 0 ? +d.slice(2) : d; }
  function gpDown(i, b) { return !!(gpNow[i] && gpNow[i].b[b]); }
  function gpPressed(i, b) { return gpDown(i, b) && !(gpPrev[i] && gpPrev[i].b[b]); }

  // Read one device into a common shape
  function readInput(dev) {
    const r = { mx: 0, mz: 0, cameraX: 0, cameraY: 0, cameraReset: false, jump: false, jumpP: false, act: false, call: false, carry: false, run: false, cheer: false, split: false, share: false, swap: false, swapBack: false, left: false, right: false, pause: false, up: false, down: false };
    if (dev === 'kb1') {
      if (keys.KeyA) r.mx -= 1; if (keys.KeyD) r.mx += 1; if (keys.KeyW) r.mz -= 1; if (keys.KeyS) r.mz += 1;
      r.jump = !!keys.Space; r.jumpP = !!pressedKeys.Space; r.run = !!(keys.ShiftLeft || keys.ShiftRight);
      r.act = !!(pressedKeys.KeyE || pressedKeys.KeyF); r.share = !!pressedKeys.KeyQ; r.swapBack = !!pressedKeys.Tab && !!(keys.ShiftLeft || keys.ShiftRight); r.swap = !!pressedKeys.Tab && !r.swapBack;
      r.left = !!pressedKeys.KeyA; r.right = !!pressedKeys.KeyD; r.up = !!pressedKeys.KeyW; r.down = !!pressedKeys.KeyS;
      r.pause = !!pressedKeys.Escape; r.reread = !!pressedKeys.KeyR; r.catchup = !!pressedKeys.KeyC;
    } else if (dev === 'kb2') {
      if (keys.ArrowLeft) r.mx -= 1; if (keys.ArrowRight) r.mx += 1; if (keys.ArrowUp) r.mz -= 1; if (keys.ArrowDown) r.mz += 1;
      r.jump = !!keys.Enter; r.jumpP = !!pressedKeys.Enter; r.run = !!keys.ControlRight;
      r.act = !!pressedKeys.ShiftRight; r.share = !!pressedKeys.Slash; r.catchup = !!pressedKeys.Period;
      r.left = !!pressedKeys.ArrowLeft; r.right = !!pressedKeys.ArrowRight; r.up = !!pressedKeys.ArrowUp; r.down = !!pressedKeys.ArrowDown;
    } else if (isPad(dev)) {
      const i = padKey(dev);
      const g = gpNow[i];
      if (g && g.on) {
        r.world = !!g.world;
        if (dev.indexOf('gp') === 0 || dev==='vpt') {
          const x=g.ax[2]||0,y=g.ax[3]||0,length=Math.hypot(x,y);
          if(length>.22){const scale=Math.min(1,(length-.22)/.78)/length;r.cameraX=x*scale;r.cameraY=y*scale;}
          r.cameraReset=gpPressed(i,11); // standard-mapped R3: press the right stick
        }
        const ax = Math.abs(g.ax[0]) > 0.2 ? g.ax[0] : 0;
        const az = Math.abs(g.ax[1]) > 0.2 ? g.ax[1] : 0;
        r.mx = ax + (gpDown(i, 15) ? 1 : 0) - (gpDown(i, 14) ? 1 : 0);
        r.mz = az + (gpDown(i, 13) ? 1 : 0) - (gpDown(i, 12) ? 1 : 0);
        r.jump = gpDown(i, 0); r.jumpP = gpPressed(i, 0);
        if (dev.indexOf('gp') === 0) {
          r.split = true; r.run = gpDown(i, 2); r.act = gpPressed(i, 3); r.carry = gpPressed(i, 1);   // hold X to run; Y = main action; B = pick up or call animals
          r.swapBack = gpPressed(i, 4); r.swap = gpPressed(i, 5); r.cheer = gpPressed(i, 6); r.share = gpPressed(i, 7); r.catchup = gpPressed(i, 10);
        } else { // Compact touch/phone controllers retain their single contextual ACT button.
          r.run = dev==='vpt'&&gpDown(i,6); r.act = gpPressed(i, 2) || gpPressed(i, 1); r.share = gpPressed(i, 3); r.swap = gpPressed(i, 5); r.catchup = gpPressed(i, 4);
        }
        r.pause = gpPressed(i, 9); r.reread = gpPressed(i, 8);
        const pl = gpPrev[i] ? gpPrev[i].ax[0] : 0;
        const pv = gpPrev[i] ? gpPrev[i].ax[1] : 0;
        r.left = gpPressed(i, 14) || (g.ax[0] < -0.6 && pl >= -0.6);
        r.right = gpPressed(i, 15) || (g.ax[0] > 0.6 && pl <= 0.6);
        r.up = gpPressed(i, 12) || (g.ax[1] < -0.6 && pv >= -0.6);
        r.down = gpPressed(i, 13) || (g.ax[1] > 0.6 && pv <= 0.6);
      }
    }
    const len = Math.hypot(r.mx, r.mz);
    if (len > 1) { r.mx /= len; r.mz /= len; }
    return r;
  }

  /* -------------------------------------------------------------------
   * 5b. TOUCH SCREENS AND PHONES
   *   Touch: 'stick' mode (a floating stick under the left thumb + buttons) or 'tap' mode (tap where to go;
   *   tap a ledge to jump onto it; tap a thing to use it). Phones: tools/serve.js passes their buttons here.
   * ----------------------------------------------------------------- */
  function isTouchDevice() {
    if (window.SQ_TOUCH !== undefined) return !!window.SQ_TOUCH;
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches)); } catch (e) { return false; }
  }
  function touchMode() {
    const v = setting('touchMode');
    if (v === 'tap' || v === 'stick') return v;
    return Math.min(window.screen ? screen.width : 800, window.screen ? screen.height : 800) >= 600 ? 'tap' : 'stick';   // tablets tap, phones use the stick
  }
  const TB = { jump: 0, act: 2, cheer: 3, catch: 4, swap: 5, run:6,pause:9,recenter:11 };
  let touchUI = null;
  const tap = { target: null, act: false, jumpT: 0, stuckT: 0, lastD: 0, actT: 0 };
  function initTouch() {
    if (touchUI || !isTouchDevice() || !document.body) return;
    vpads.vpt = { ax: [0, 0], b: [false, false, false, false, false, false, false, false, false, false], on: true, world: false };
    const css = el('style', {}, '#sq-touch{position:fixed;inset:0;z-index:30;touch-action:none;-webkit-user-select:none;user-select:none}' +
      '#sq-touch .tb{position:fixed;border-radius:50%;display:flex;align-items:center;justify-content:center;font:bold 18px Georgia,serif;color:#fff8e7;' +
      'background:rgba(28,25,23,.38);border:3px solid rgba(255,248,231,.55);text-shadow:0 1px 2px #000}#sq-touch .tb.on{background:rgba(245,158,11,.85)}' +
      '#sq-touch .jump{width:104px;height:104px;right:22px;bottom:26px;font-size:20px}#sq-touch .act{width:78px;height:78px;right:138px;bottom:20px}' +
      '#sq-touch .sm{width:50px;height:50px;font-size:22px}#sq-touch .swap{right:30px;bottom:146px}#sq-touch .cheer{right:92px;bottom:116px}' +
      '#sq-touch .pause{right:12px;top:12px}#sq-touch .mode{right:70px;top:12px}' +
      '#sq-touch .run{left:22px;bottom:172px;width:68px;height:54px;border-radius:16px;font: bold 14px sans-serif}#sq-touch .look{right:22px;bottom:220px;width:76px;height:66px;border-radius:16px;font:bold 13px sans-serif}#sq-touch .recenter{right:112px;bottom:229px;width:52px;height:48px;border-radius:14px;font:bold 12px sans-serif}' +
      '#sq-touch .tb{margin-bottom:env(safe-area-inset-bottom,0px)}' +
      '#sq-touch .base,#sq-touch .knob{position:fixed;border-radius:50%;pointer-events:none;display:none}' +
      '#sq-touch .base{width:120px;height:120px;margin:-60px 0 0 -60px;border:3px solid rgba(255,248,231,.5);background:rgba(28,25,23,.18)}' +
      '#sq-touch .knob{width:54px;height:54px;margin:-27px 0 0 -27px;background:rgba(255,248,231,.75)}');
    document.head.appendChild(css);
    const root = el('div', { id: 'sq-touch' });
    root.innerHTML = '<div class="base"></div><div class="knob"></div>' +
      '<div class="tb jump" data-b="jump">JUMP</div><div class="tb act" data-b="act">ACT</div>' +
      '<button class="tb run" data-b="run" aria-label="Toggle running" aria-pressed="false">RUN</button><button class="tb look" data-b="look" aria-label="Drag to turn the camera">LOOK<br>drag</button><button class="tb recenter" data-b="recenter" aria-label="Recenter camera">CENTER</button>' +
      '<div class="tb sm swap" data-b="swap">🔄</div><div class="tb sm cheer" data-b="cheer">👋</div>' +
      '<div class="tb sm pause" data-b="pause">⏸</div><div class="tb sm mode" data-b="mode"></div>';
    document.body.appendChild(root);
    touchUI = { root, base: root.querySelector('.base'), knob: root.querySelector('.knob'), mode: root.querySelector('.mode'), sid: null, ox: 0, oy: 0, shown: null };
    const setModeIcon = () => { touchUI.mode.textContent = touchMode() === 'tap' ? '🕹️' : '👆'; touchUI.mode.title = touchMode() === 'tap' ? 'Switch to the stick' : 'Switch to tap to move'; };
    setModeIcon();
    root.querySelectorAll('.tb').forEach((b) => {
      const name = b.getAttribute('data-b');
      if(name==='look'){
        let pointer=null,origin=[0,0];
        b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();pointer=e.pointerId;origin=[e.clientX,e.clientY];vpads.vpt.touched=true;try{b.setPointerCapture(pointer);}catch(x){}});
        b.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;e.preventDefault();e.stopPropagation();vpads.vpt.camera=[Math.max(-1,Math.min(1,(e.clientX-origin[0])/55)),Math.max(-1,Math.min(1,(e.clientY-origin[1])/55))];});
        touchUI.stopLook=()=>{pointer=null;vpads.vpt.camera=[0,0];};
        const end=e=>{if(e.pointerId!==pointer)return;pointer=null;vpads.vpt.camera=[0,0];};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);return;
      }
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); Audio.init();
        if (name === 'mode') {
          setSetting('touchMode', touchMode() === 'tap' ? 'stick' : 'tap'); setModeIcon(); tap.target = null; vpads.vpt.ax = [0, 0];
          toast(touchMode() === 'tap' ? '👆 Tap where to go. Tap a ledge to jump onto it.' : '🕹️ Left thumb: move. JUMP and ACT on the right.', 3500);
          return;
        }
        if(name==='run'){const on=!vpads.vpt.b[6];vpads.vpt.b[6]=on;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));vpads.vpt.touched=true;return;}
        vpads.vpt.b[TB[name]] = true; b.classList.add('on'); vpads.vpt.touched = true;
      });
      const up = (e) => { if (name === 'mode'||name==='run') return; e.preventDefault(); vpads.vpt.b[TB[name]] = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    });
    // the screen itself: a stick under the left thumb (stick mode), or tap where to go (tap mode)
    root.addEventListener('pointerdown', (e) => {
      if (e.target !== root) return;
      e.preventDefault(); Audio.init(); vpads.vpt.touched = true;
      if (touchMode() === 'tap') { touchTapAt(e.clientX, e.clientY); return; }
      if (e.clientX > window.innerWidth * 0.55 || touchUI.sid !== null) return;
      touchUI.sid = e.pointerId; touchUI.ox = e.clientX; touchUI.oy = e.clientY;
      touchUI.base.style.left = touchUI.knob.style.left = e.clientX + 'px'; touchUI.base.style.top = touchUI.knob.style.top = e.clientY + 'px';
      touchUI.base.style.display = touchUI.knob.style.display = 'block';
      try { root.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== touchUI.sid) return;
      let dx = e.clientX - touchUI.ox, dy = e.clientY - touchUI.oy; const d = Math.hypot(dx, dy), R = 55;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      touchUI.knob.style.left = (touchUI.ox + dx) + 'px'; touchUI.knob.style.top = (touchUI.oy + dy) + 'px';
      vpads.vpt.ax = [dx / R, dy / R];
    });
    const release = (e) => { if (e.pointerId !== touchUI.sid) return; touchUI.sid = null; vpads.vpt.ax = [0, 0]; touchUI.base.style.display = touchUI.knob.style.display = 'none'; };
    root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);
    function clearTouchInput(){
      vpads.vpt.ax=[0,0];vpads.vpt.camera=[0,0];vpads.vpt.b.fill(false);tap.target=null;tap.act=false;tap.jumpT=tap.actT=0;
      touchUI.sid=null;if(touchUI.stopLook)touchUI.stopLook();touchUI.base.style.display=touchUI.knob.style.display='none';
      root.querySelectorAll('.tb.on').forEach(b=>b.classList.remove('on'));root.querySelector('.run').setAttribute('aria-pressed','false');if(tap.ring)tap.ring.visible=false;
    }
    touchUI.clear=clearTouchInput;window.addEventListener('blur',clearTouchInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTouchInput();});
    if (UI.help) UI.help.style.display = 'none';                       // (the keyboard help would sit under the buttons)
    // a lighter start on phones and tablets (the automatic quality takes it from there)
    if (S.renderer && (S.quality || 0) < 1) applyQuality(1);
    tap.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.7, 24), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.8, depthWrite: false }));
    tap.ring.rotation.x = -Math.PI / 2; tap.ring.visible = false; S.scene.add(tap.ring);
  }
  // where on the ground (or on top of a platform) a tap lands: walk along the camera ray until it meets the ground
  function screenToGround(cx, cy) {
    const cam=S.homeInterior?S.homeInterior.camera:S.camera,atGround=S.homeInterior?homeGroundAt:groundAt;
    const v = new THREE.Vector3((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1, 0.5).unproject(cam);
    const o = cam.position.clone(), dir = v.sub(o).normalize();
    let prev = o.clone();
    for (let t = 0.5; t < 140; t += 0.25) {
      const q = o.clone().addScaledVector(dir, t);
      const g = atGround(q.x, q.z, q.y);
      if (q.y <= g) {
        let a = prev, b = q;                                   // refine between the last point above and this one
        for (let k = 0; k < 8; k++) { const m = a.clone().add(b).multiplyScalar(0.5); if (m.y <= atGround(m.x, m.z, m.y)) b = m; else a = m; }
        return new THREE.Vector3(b.x, atGround(b.x, b.z, b.y + 0.05), b.z);
      }
      prev = q;
    }
    return null;
  }
  function touchTapAt(cx, cy) {
    if (S.phase !== 'play') return;
    const hit = screenToGround(cx, cy);
    if (!hit) return;
    setTapTarget(hit.x, hit.y, hit.z);
  }
  // also used by the tests: tap a spot in the world
  function setTapTarget(x, y, z) {
    if(S.homeInterior){
      const t=homeActions().find(t=>Math.hypot(t.x-x,t.z-z)<1.5);
      tap.target={x:Math.max(-5.2,Math.min(5.2,t?t.x:x)),y:t?t.y:y,z:Math.max(-4.2,Math.min(4.1,t?t.z:z))};
      tap.act=!!t;tap.stuckT=0;tap.lastD=1e9;return;
    }
    const near = (list, r) => list.find((o) => Math.hypot(o.x - x, o.z - z) < r);
    const inter = S.interactables.find((it) => it.alive && it.x !== undefined && Math.hypot(it.x - x, it.z - z) < 1.6);
    const fol = S.followers.find((f) => f.state === 'idle' && Math.hypot(f.pos.x - x, f.pos.z - z) < 1.6);
    tap.target = { x, y, z };
    tap.act = !!(inter || fol || near(S.carryables.filter((c) => !c.holder && !c.delivered), 1.6));
    if (inter) { tap.target.x = inter.x; tap.target.z = inter.z; }
    tap.stuckT = 0; tap.lastD = 1e9;
    if (tap.ring) { tap.ring.visible = true; tap.ring.position.set(tap.target.x, y + 0.06, tap.target.z); }
  }
  SQ._tapAt = setTapTarget;
  SQ._screenToGround = screenToGround;
  // tap mode, every frame: steer toward the target; jump onto a ledge or over a gap; use the thing on arrival
  function updateTouch(dt) {
    const v = vpads.vpt;
    if (!v) return;
    if (touchUI) {
      const show = S.phase === 'play';
      if (touchUI.shown !== show) { touchUI.shown = show; touchUI.root.style.display = show ? '' : 'none';if(UI.actions)UI.actions.classList.toggle('sq-touch-space',show);if(!show&&touchUI.clear)touchUI.clear(); }
    }
    if (tap.actT > 0) { tap.actT -= dt; if (tap.actT <= 0) v.b[2] = false; }
    if (touchMode() !== 'tap' || !tap.target) { v.world = false; if (touchMode() === 'tap' && !tap.target) v.ax = [0, 0]; if (tap.jumpT > 0) { tap.jumpT -= dt; if (tap.jumpT <= 0) v.b[0] = false; } return; }
    const owner = S.players.find((q) => q.joined && q.device === 'vpt');
    const p=S.homeInterior?S.homeInterior.avatars.find(a=>a.player===owner):owner;
    if (!p || S.phase !== 'play') return;
    if (p.bubble) { tap.target = null; v.ax = [0, 0]; if (tap.ring) tap.ring.visible = false; return; }
    const T0 = tap.target, dx = T0.x - p.pos.x, dz = T0.z - p.pos.z, d = Math.hypot(dx, dz);
    if (tap.jumpT > 0) { tap.jumpT -= dt; if (tap.jumpT <= 0) v.b[0] = false; }
    if (d < (tap.act ? 1.1 : 0.35) && p.onGround) {
      v.ax = [0, 0]; v.world = false;
      if (tap.act) { v.b[2] = true; tap.actT = 0.1; }
      tap.target = null; if (tap.ring) tap.ring.visible = false;
      return;
    }
    v.world = true;
    const k = Math.min(1, d / 1.0);
    v.ax = [dx / d * k, dz / d * k];
    // stuck (a wall, a ledge too high): give up after a while
    if (d < tap.lastD - 0.02) { tap.lastD = d; tap.stuckT = 0; } else tap.stuckT += dt;
    if (tap.stuckT > 1.6) { tap.target = null; v.ax = [0, 0]; if (tap.ring) tap.ring.visible = false; return; }
    if (!p.onGround || tap.jumpT > 0) return;
    // look ahead: a step too high to walk up, or a gap before ground that is not lower than the target
    const ux = dx / d, uz = dz / d, la = Math.min(1.1, d);
    const atGround=S.homeInterior?homeGroundAt:groundAt;
    const aheadY = atGround(p.pos.x + ux * la, p.pos.z + uz * la, p.pos.y + 2.6);
    const gapY = atGround(p.pos.x + ux * Math.min(1.6, d), p.pos.z + uz * Math.min(1.6, d), p.pos.y + 0.5);
    const up = aheadY > p.pos.y + 0.45 && T0.y > p.pos.y + 0.3;
    const gap = gapY < p.pos.y - 0.9 && T0.y > p.pos.y - 0.6 && d > 1.2;
    if (up || gap) { v.b[0] = true; tap.jumpT = 0.3; }
  }
  SQ._updateTouch = updateTouch;

  // ---- phones as controllers (only when the game is served by tools/serve.js) ----
  let net = null;
  function netSend(o) { if (net && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(o)); }
  function netTell(dev) {
    const i = S.players.findIndex((q) => q.joined && q.device === dev);
    if (i < 0) return;
    const p = S.players[i];
    S.netTold = (S.netTold || 0) + 1;                                 // (counted for the tests)
    netSend({ t: 'to', id: +dev.slice(3), msg: { t: 'you', slot: i + 1, color: p.role.css, role: p.role.name } });
  }
  function netMessage(m) {
    if (m.t === 'pad') {
      const k = 'vpn' + m.id;
      const was = vpads[k];
      vpads[k] = { ax: m.ax || [0, 0], b: m.b || [], on: true };
      if (!was || was.on === false) { const p = S.players.find((q) => q.joined && q.device === k); if (p) netTell(k); else if (!was && S.phase !== 'lobby') toast('📱 A phone is here: press JUMP on it to join!', 3500); }   // (a phone that comes back is told its player again)
    } else if (m.t === 'gone') { const k = 'vpn' + m.id; if (vpads[k]) vpads[k].on = false; }
  }
  SQ._netMessage = netMessage;
  // the connection to the phone server dropped: every phone stops (no runaway players) and counts as away
  function netLost() { for (const k in vpads) if (k.indexOf('vpn') === 0) { vpads[k].ax = [0, 0]; vpads[k].b = []; vpads[k].on = false; } }
  SQ._netLost = netLost;
  function initNet() {
    if(window.SQ_BUILD&&SQ_BUILD.phoneControllers===false)return;
    if (net || !/^https?:$/.test(location.protocol) || typeof WebSocket === 'undefined') return;
    if (/jsdom/i.test(navigator.userAgent || '') && !window.SQ_NET) return;            // (the headless tests talk to SQ._netMessage instead)
    net = { ws: null };
    const connect = () => {
      let ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { return; }
      net.ws = ws;
      ws.onopen = () => { net.ok = true; ws.send(JSON.stringify({ t: 'hello', role: 'game' })); showPhoneJoin(); };
      ws.onmessage = (e) => { try { netMessage(JSON.parse(e.data)); } catch (x) { /* ignore */ } };
      ws.onclose = () => { netLost(); if (net.ok) setTimeout(connect, 3000); };   // only keep trying where the phone server answered once
    };
    connect();
  }
  // the lobby shows a QR code and the address for phones
  function showPhoneJoin() {
    const box = UI.lobby && UI.lobby.querySelector('.sq-phones');
    if (!box || box.getAttribute('data-done')) return;
    box.setAttribute('data-done', '1');
    fetch('/sq-info').then((r) => r.json()).then((info) => {
      const url = ((info.urls && info.urls[0]) || (location.protocol + '//' + location.host)) + '/pad';
      box.innerHTML = '<div class="sq-qr" style="width:118px;height:118px;flex:none;background:#fff;border-radius:6px"></div><div><b>📱 Phones can be controllers!</b><br>On the same Wi-Fi, scan this or open<br><code>' + esc(url) + '</code><br>then press JUMP to join.</div>';
      box.style.display = 'flex';
      const draw = () => {
        try {
          const q = window.qrcode(0, 'M'); q.addData(url); q.make();
          box.querySelector('.sq-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
        } catch (e) { /* no QR: the address is there */ }
      };
      if (window.qrcode) draw();
      else { const sc = document.createElement('script'); sc.src = 'tools/qrcode.js'; sc.onload = draw; document.head.appendChild(sc); }
    }).catch(() => { /* not the phone server */ });
  }

  /* -------------------------------------------------------------------
   * 6. WORLD HELPERS (terrain, platforms, collisions)
   * ----------------------------------------------------------------- */
  // Tiny, locally generated normal/roughness maps; no image downloads or runtime dependencies.
  const surfaceCache = {}, surfaceMaterials = new Set(), TERRAIN_DETAIL = {value:1};
  const SURFACES = {
    wood: { roughness: .81, metalness: 0, strength: .30 },
    bark: { roughness: .96, metalness: 0, strength: .42 },
    cloth: { roughness: .98, metalness: 0, strength: .16 },
    wool: { roughness: 1, metalness: 0, strength: .13 },
    fur: { roughness: .96, metalness: 0, strength: .12 },
    stone: { roughness: .97, metalness: 0, strength: .22 },
    brick: { roughness: .98, metalness: 0, strength: .18 },
    paving: { roughness: .90, metalness: 0, strength: .19 },
    clay: { roughness: .91, metalness: 0, strength: .16 },
    weave: { roughness: .98, metalness: 0, strength: .23 },
    bronze: { roughness: .53, metalness: .63, strength: .13 },
    gold: { roughness: .43, metalness: .68, strength: .09 }
  };
  function surfaceMaps(kind) {
    if (surfaceCache[kind]) return surfaceCache[kind];
    const config = SURFACES[kind] || SURFACES.stone, N = 128;
    const height = canvasTex('height-' + kind, (ctx, n, rnd) => {
      const image = ctx.createImageData(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let h = .5 + (rnd() - .5) * .07;
        if (kind === 'cloth' || kind === 'weave') h += Math.sin(x * Math.PI / 2) * .13 + Math.sin(y * Math.PI / 2) * .13;
        else if (kind === 'wood' || kind === 'bark') h += Math.sin(y * .49 + Math.sin(x * .098) * 1.5) * .12;
        else if (kind === 'bronze' || kind === 'gold') h += Math.sin(y * Math.PI / 2) * .045;
        else h += Math.sin(x * .196 + Math.sin(y * .098)) * Math.cos(y * .196) * .07;
        const i = (y*n+x)*4, v = Math.max(0, Math.min(255, h*255));
        image.data[i] = image.data[i+1] = image.data[i+2] = v; image.data[i+3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    }, N);
    const out = { normal: null, roughness: null };
    if (height && height.image) {
      const ctx = height.image.getContext('2d'), data = ctx.getImageData(0,0,N,N).data;
      const h = (x,y) => data[(((y+N)%N)*N+(x+N)%N)*4]/255;
      out.normal = canvasTex('normal-'+kind, (c,n) => {
        const image=c.createImageData(n,n);
        for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
          let nx=(h(x-1,y)-h(x+1,y))*1.8, ny=(h(x,y-1)-h(x,y+1))*1.8;
          const inv=1/Math.sqrt(nx*nx+ny*ny+1), i=(y*n+x)*4;
          image.data[i]=(nx*inv*.5+.5)*255; image.data[i+1]=(ny*inv*.5+.5)*255; image.data[i+2]=(inv*.5+.5)*255; image.data[i+3]=255;
        }
        c.putImageData(image,0,0);
      },N);
      out.roughness=canvasTex('roughness-'+kind,(c,n)=>{
        const image=c.createImageData(n,n);
        for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
          // Worn stone centres catch a little more light than their dusty borders.
          const centre=kind==='paving' ? Math.exp(-Math.pow((x-n/2)/(n*.28),2)-Math.pow((y-n/2)/(n*.38),2))*.15 : 0;
          const v=(.88+(h(x,y)-.5)*.16-centre)*255, i=(y*n+x)*4;
          image.data[i]=image.data[i+1]=image.data[i+2]=v; image.data[i+3]=255;
        }
        c.putImageData(image,0,0);
      },N);
    }
    surfaceCache[kind]=out; return out;
  }
  function registerSurface(m, kind) {
    const config=SURFACES[kind]; if(!config) return m;
    const maps=surfaceMaps(kind);
    m.userData.surface=kind;
    m.normalMap=(S.quality||0)>=3 ? null : maps.normal; m.normalScale=new THREE.Vector2(config.strength,config.strength);
    if(m.isMeshStandardMaterial) m.roughnessMap=(S.quality||0)>=3 ? null : maps.roughness;
    surfaceMaterials.add(m); return m;
  }
  function surfaceQuality(q) {
    TERRAIN_DETAIL.value=q>=3 ? 0 : 1;
    surfaceMaterials.forEach(m=>{
      const maps=surfaceCache[m.userData.surface]; if(!maps) return;
      const normal=q>=3 ? null : maps.normal, rough=q>=3 ? null : maps.roughness;
      if(m.normalMap!==normal || (m.isMeshStandardMaterial && m.roughnessMap!==rough)) {
        m.normalMap=normal; if(m.isMeshStandardMaterial) m.roughnessMap=rough; m.needsUpdate=true;
      }
    });
  }
  // Blur small colour-grid variations, preserving the authored blue water and broad paths.
  function paintedGround(L,x,z,h) {
    const sample=(a,b) => new THREE.Color(L.groundColor ? L.groundColor(a,b,L.terrain ? L.terrain(a,b) : h) : 0x5a9a4a);
    const base=sample(x,z), water=c=>c.b>c.r*1.18 && c.b>c.g*1.03;
    if(water(base)) return base;
    const sum=base.clone().multiplyScalar(2); let weight=2;
    for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) {
      if(!a&&!b) continue;
      const c=sample(x+a*1.15,z+b*1.15); if(water(c)) continue;
      const w=a&&b ? .7 : 1; sum.add(c.multiplyScalar(w)); weight+=w;
    }
    base.lerp(sum.multiplyScalar(1/weight),.84);
    const brush=1+Math.sin(x*.27+Math.sin(z*.19))*Math.cos(z*.23-x*.07)*.025;
    return base.multiplyScalar(brush);
  }
  function makePaintedTerrain(map) {
    const m=new THREE.MeshLambertMaterial({vertexColors:true,map:map||null});
    m.userData.paintedTerrain=true; m.userData.mapping='triplanar';
    const strength=S.level.artDirection&&S.level.artDirection.textureStrength;
    const textureStrength={value:typeof strength==='number'?Math.max(0,Math.min(1,strength)):1};
    m.userData.textureStrength=textureStrength.value;
    const soil=TEX.ground(), grass=canvasTex('brush-grass',(c,n,r)=>{
      c.fillStyle='#e9e9e5';c.fillRect(0,0,n,n);
      for(let i=0;i<1100;i++) {const x=r()*n,y=r()*n;c.strokeStyle='rgba(60,75,45,'+(.035+r()*.065)+')';c.lineWidth=.8;c.beginPath();c.moveTo(x,y);c.lineTo(x+2,y-3-r()*3);c.stroke();}
    },256), rock=TEX.stone();
    m.onBeforeCompile=sh=>{
      sh.uniforms.sqTextureStrength=textureStrength; sh.uniforms.sqGroundDetail=TERRAIN_DETAIL; sh.uniforms.sqSoil={value:soil}; sh.uniforms.sqGrass={value:grass}; sh.uniforms.sqRock={value:rock};
      sh.vertexShader='varying vec3 sqWorld; varying vec3 sqWorldNormal;\n'+sh.vertexShader;
      sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsqWorld=(modelMatrix*vec4(transformed,1.0)).xyz; sqWorldNormal=normalize(mat3(modelMatrix)*normal);');
      sh.fragmentShader='varying vec3 sqWorld; varying vec3 sqWorldNormal; uniform sampler2D sqSoil; uniform sampler2D sqGrass; uniform sampler2D sqRock; uniform float sqGroundDetail; uniform float sqTextureStrength;\n'+sh.fragmentShader;
      sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`
        vec3 sqW=pow(abs(normalize(sqWorldNormal)),vec3(4.0)); sqW/=max(dot(sqW,vec3(1.0)),.001);
        vec3 sqSo=texture2D(sqSoil,sqWorld.zy/5.0).rgb*sqW.x+texture2D(sqSoil,sqWorld.xz/5.0).rgb*sqW.y+texture2D(sqSoil,sqWorld.xy/5.0).rgb*sqW.z;
        vec3 sqTexture=sqSo;
        if(sqGroundDetail>.5){
        vec3 sqGr=texture2D(sqGrass,sqWorld.zy/4.0).rgb*sqW.x+texture2D(sqGrass,sqWorld.xz/4.0).rgb*sqW.y+texture2D(sqGrass,sqWorld.xy/4.0).rgb*sqW.z;
        vec3 sqSt=texture2D(sqRock,sqWorld.zy/3.0).rgb*sqW.x+texture2D(sqRock,sqWorld.xz/3.0).rgb*sqW.y+texture2D(sqRock,sqWorld.xy/3.0).rgb*sqW.z;
        float sqGreen=0.0;
        #ifdef USE_COLOR
          sqGreen=smoothstep(.98,1.18,vColor.g/max(vColor.r,.01))*smoothstep(1.0,1.2,vColor.g/max(vColor.b,.01));
        #endif
        float sqSlope=smoothstep(.2,.65,1.0-abs(normalize(sqWorldNormal).y));
        sqTexture=mix(mix(sqSo,sqGr,sqGreen),sqSt,sqSlope*.65);
        }
        diffuseColor.rgb*=mix(vec3(1.0),sqTexture,sqTextureStrength);
      `);
    };
    m.customProgramCacheKey=()=> 'painted-triplanar-v2'; return m;
  }
  SQ._paintedGround=paintedGround; SQ._surfaceQuality=surfaceQuality;

  const matCache = {};
  function mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) {
      const o = Object.assign({ color }, opts || {});
      if (o.emissive === undefined) o.emissive = new THREE.Color(color).multiplyScalar(0.13).getHex();   // soft, pastel shading
      matCache[key] = [0xb87333,0xb08d4a].includes(color)
        ? registerSurface(new THREE.MeshStandardMaterial(Object.assign({},o,{roughness:SURFACES.bronze.roughness,metalness:SURFACES.bronze.metalness,emissive:new THREE.Color(color).multiplyScalar(.035).getHex()})), 'bronze')
        : new THREE.MeshLambertMaterial(o);
    }
    return matCache[key];
  }
  // A box with softly rounded edges (toy-like: the edges catch the light). Cached by size.
  const roundCache = {};
  function roundedBox(w, h, d, r) {
    r = Math.min(r, w * 0.3, h * 0.3, d * 0.3);
    const key = [w, h, d, r].map((v) => v.toFixed(3)).join(',');
    if (roundCache[key]) return roundCache[key];
    const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), pa = g.attributes.position;
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const map = (c, half) => { const a = Math.abs(c), sg = Math.sign(c); return a > 0.49 ? sg * half : a > 0.2 ? sg * (half - r) : 0; };
    const v = new THREE.Vector3(), inner = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.set(map(pa.getX(i), hx), map(pa.getY(i), hy), map(pa.getZ(i), hz));
      inner.set(Math.max(-hx + r, Math.min(hx - r, v.x)), Math.max(-hy + r, Math.min(hy - r, v.y)), Math.max(-hz + r, Math.min(hz - r, v.z)));
      const off = v.clone().sub(inner); if (off.lengthSq() > 1e-9) v.copy(inner).add(off.normalize().multiplyScalar(r));
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    roundCache[key] = g;
    return g;
  }
  SQ.roundedBox = roundedBox;
  // Small painted textures (woven cloth, wool, fur), drawn once in the browser: cloth looks like cloth.
  const texCache = {};
  function canvasTex(key, draw, size) {
    if (key in texCache) return texCache[key];
    texCache[key] = null;
    if (/jsdom/.test(navigator.userAgent || '') || typeof THREE.CanvasTexture !== 'function') return null;
    try {
      const N = size || 128;
      const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); if (!x) return null;
      let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // the same pattern every time
      draw(x, N, rnd);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      texCache[key] = t;
    } catch (e) { texCache[key] = null; }
    return texCache[key];
  }
  const TEX = {
    cloth: () => canvasTex('cloth', (x, n, r) => {
      x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 2) { x.fillStyle = 'rgba(0,0,0,' + (0.035 + r() * 0.03) + ')'; x.fillRect(0, y, n, 1); }
      for (let xx = 0; xx < n; xx += 2) { x.fillStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.05) + ')'; x.fillRect(xx, 0, 1, n); }
      for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(0,0,0,' + r() * 0.05 + ')'; x.fillRect(r() * n, r() * n, 2, 1); }
    }),
    wool: () => canvasTex('wool', (x, n, r) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 260; i++) { const cx = r() * n, cy = r() * n, rr = 3 + r() * 5; x.strokeStyle = 'rgba(120,110,90,' + (0.12 + r() * 0.12) + ')'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, rr, r() * 6, r() * 6 + 4); x.stroke(); }
    }),
    fur: () => canvasTex('fur', (x, n, r) => {
      x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 1400; i++) { const px = r() * n, py = r() * n, d = r() > 0.5; x.strokeStyle = d ? 'rgba(0,0,0,' + r() * 0.12 + ')' : 'rgba(255,255,255,' + r() * 0.25 + ')'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 2, py + 3 + r() * 3); x.stroke(); }
    })
  };
  // ---- surface textures (mostly grey, so every surface keeps its colour and gains detail) ----
  const dots = (x, n, r, count, minR, maxR, col) => { for (let i = 0; i < count; i++) { x.fillStyle = col(r()); const cx = r() * n, cy = r() * n, rr = minR + r() * (maxR - minR); for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.arc(cx + ox, cy + oy, rr, 0, 6.283); x.fill(); } } };   // drawn wrapped, so it tiles with no seams
  const path = (x, n, pts) => { for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.moveTo(pts[0][0] + ox, pts[0][1] + oy); for (let k = 1; k < pts.length; k++) x.lineTo(pts[k][0] + ox, pts[k][1] + oy); x.stroke(); } };
  Object.assign(TEX, {
    metal: () => canvasTex('brushed-metal',(c,n,r)=>{
      c.fillStyle='#eeeeec';c.fillRect(0,0,n,n);
      for(let y=0;y<n;y++){c.fillStyle='rgba(80,70,50,'+(r()*.035)+')';c.fillRect(0,y,n,1);}
      dots(c,n,r,40,1,3,()=> 'rgba(70,60,40,0.025)');
    }),
    ground: () => canvasTex('ground', (x, n, r) => {          // soft speckles, tiny blades and pebbles
      x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, n, n);
      dots(x, n, r, 900, 2, 9, (v) => 'rgba(' + (v > 0.5 ? '255,255,255,0.10' : '0,0,0,0.07') + ')');
      for (let i = 0; i < 1400; i++) { const px = 3 + r() * (n - 6), py = 7 + r() * (n - 8); x.strokeStyle = 'rgba(0,0,0,' + (0.06 + r() * 0.08) + ')'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 4); x.stroke(); }
      dots(x, n, r, 120, 1, 2.5, () => 'rgba(90,80,70,0.22)');
    }, 256),
    wood: () => canvasTex('wood', (x, n, r) => {             // boards with seams, grain and a few knots
      x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, n, n);
      const bh = n / 4;
      for (let b = 0; b < 4; b++) {
        x.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.06) + ')'; x.fillRect(0, b * bh, n, bh);
        for (let g = 0; g < 9; g++) { x.strokeStyle = 'rgba(70,40,10,' + (0.06 + r() * 0.08) + ')'; x.lineWidth = 1; x.beginPath(); const y0 = b * bh + r() * bh; x.moveTo(0, y0); for (let xx = 0; xx <= n; xx += 16) x.lineTo(xx, y0 + Math.sin(xx * 0.05 + g) * 1.5); x.stroke(); }
        x.fillStyle = 'rgba(40,20,5,0.35)'; x.fillRect(0, b * bh, n, 2);
        const kx = r() * n; x.strokeStyle = 'rgba(60,30,10,0.25)'; x.beginPath(); x.ellipse(kx, b * bh + bh / 2, 5, 3, 0, 0, 6.283); x.stroke();
        x.fillStyle = 'rgba(40,20,5,0.3)'; x.fillRect((r() * n) | 0, b * bh, 2, bh);          // board ends
      }
    }),
    brick: () => canvasTex('brick', (x, n, r) => {            // sun-dried mud bricks, softly plastered
      x.fillStyle = '#ececec'; x.fillRect(0, 0, n, n);
      const bh = n / 8, bw = n / 4;
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const ox = (row % 2) * bw / 2 + col * bw;
        x.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255,' + r() * 0.12 : '0,0,0,' + r() * 0.08) + ')'; x.fillRect(ox + 1, row * bh + 1, bw - 2, bh - 2);
      }
      x.strokeStyle = 'rgba(60,40,20,0.22)'; x.lineWidth = 1.5;
      for (let row = 0; row <= 8; row++) { x.beginPath(); x.moveTo(0, row * bh); x.lineTo(n, row * bh); x.stroke(); }
      for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) { const ox = (row % 2) * bw / 2 + col * bw; x.beginPath(); x.moveTo(ox, row * bh); x.lineTo(ox, row * bh + bh); x.stroke(); }
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {   // worn edges: a lit top edge, a shaded bottom, a few chipped corners
        const ox = (row % 2) * bw / 2 + col * bw, oy = row * bh;
        x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(ox + 2, oy + 1.5, bw - 4, 1.2);
        x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(ox + 2, oy + bh - 2.5, bw - 4, 1.2);
        if (r() < 0.35) { const cx = ox + (r() < 0.5 ? 1 : bw - 1), cy = oy + (r() < 0.5 ? 1 : bh - 1), k = 2 + r() * 3; x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (cx > ox + 2 ? -k : k), cy); x.lineTo(cx, cy + (cy > oy + 2 ? -k : k)); x.fill(); }
      }
      dots(x, n, r, 500, 0.5, 1.6, (v) => 'rgba(0,0,0,' + v * 0.12 + ')');
    }),
    stone: () => canvasTex('stone', (x, n, r) => {            // speckled stone with a few cracks
      x.fillStyle = '#efeeeb'; x.fillRect(0, 0, n, n);
      dots(x, n, r, 400, 2, 10, (v) => 'rgba(' + (v > 0.5 ? '255,255,255,0.045' : '0,0,0,0.035') + ')');
      dots(x, n, r, 700, 0.5, 1.4, (v) => 'rgba(0,0,0,' + v * 0.08 + ')');
      for (let i = 0; i < 6; i++) {                           // cracks, each with a worn, lighter lip beside it
        let px = r() * n, py = r() * n; const pts = [[px, py]]; for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 18; py += (r() - 0.5) * 18; pts.push([px, py]); }
        x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = 1; path(x, n, pts);
        x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1.5; path(x, n, pts.map(([a, b]) => [a + 1.2, b + 1.2]));
      }
    }),
    paving: () => canvasTex('paving', (x, n, r) => {          // flagstones for the tops of stone blocks
      x.fillStyle = '#ebebeb'; x.fillRect(0, 0, n, n);
      const q = n / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.07) + ')'; x.fillRect(i * q + 2, j * q + 2, q - 4, q - 4); }
      x.strokeStyle = 'rgba(50,40,30,0.3)'; x.lineWidth = 2; x.strokeRect(1, 1, n - 2, n - 2); x.beginPath(); x.moveTo(q, 0); x.lineTo(q, n); x.moveTo(0, q); x.lineTo(n, q); x.stroke();
      dots(x, n, r, 300, 0.5, 1.5, (v) => 'rgba(0,0,0,' + v * 0.12 + ')');
      const worn=x.createRadialGradient(n*.5,n*.5,n*.06,n*.5,n*.5,n*.4);worn.addColorStop(0,'rgba(255,250,233,0.21)');worn.addColorStop(1,'rgba(255,250,233,0)');x.fillStyle=worn;x.fillRect(0,0,n,n);
    }),
    bark: () => canvasTex('bark', (x, n, r) => {
      x.fillStyle = '#e2e2e2'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 70; i++) { const px = r() * n; x.strokeStyle = 'rgba(0,0,0,' + (0.1 + r() * 0.2) + ')'; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= n; y += 8) x.lineTo(px + Math.sin(y * 0.08 + i) * 3, y); x.stroke(); }
      for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1; const px = r() * n; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + 2, n); x.stroke(); }
    }),
    leaves: () => canvasTex('leaves', (x, n, r) => {          // clusters of leaves in light and shade
      x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 700; i++) { const px = r() * n, py = r() * n, a = r() * 6.28, lt = r() > 0.5, rx = 2.5 + r() * 2, ry = 1.3 + r(); x.fillStyle = lt ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.08)'; for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.ellipse(px + ox, py + oy, rx, ry, a, 0, 6.283); x.fill(); } }
    }),
    water: () => canvasTex('water', (x, n, r) => {            // soft ripples and glints
      x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 90; i++) { const px = r() * n, py = r() * n, w = 8 + r() * 20; x.strokeStyle = 'rgba(255,255,255,' + (0.12 + r() * 0.25) + ')'; x.lineWidth = 1 + r(); x.beginPath(); x.ellipse(px, py, w, w * 0.18, 0, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
    }),
    clay: () => canvasTex('clay', (x, n, r) => {              // potter's wheel lines and speckles
      x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 4) { x.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.05) + ')'; x.fillRect(0, y, n, 1.5); }
      x.fillStyle = 'rgba(255,240,220,0.35)'; x.fillRect(0, n * 0.3, n, 6);                          // a painted band
      dots(x, n, r, 400, 0.5, 1.2, (v) => 'rgba(0,0,0,' + v * 0.15 + ')');
    }),
    weave: () => canvasTex('weave', (x, n, r) => {            // basket weave
      x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, n, n);
      const k = n / 8;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        x.fillStyle = (i + j) % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)';
        if ((i + j) % 2) x.fillRect(i * k + 1, j * k + 3, k - 2, k - 6); else x.fillRect(i * k + 3, j * k + 1, k - 6, k - 2);
      }
    }),
    rings: () => canvasTex('rings', (x, n) => {               // tree rings for the tops of stumps
      x.fillStyle = '#ececec'; x.fillRect(0, 0, n, n);
      for (let rr = 4; rr < n / 2; rr += 5) { x.strokeStyle = 'rgba(90,50,20,' + (rr % 15 < 5 ? 0.35 : 0.18) + ')'; x.lineWidth = 1.5; x.beginPath(); x.arc(n / 2, n / 2, rr, 0, 6.283); x.stroke(); }
    }),
    mud: () => canvasTex('mud', (x, n, r) => {                // cracked, wet mud
      x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, n, n);
      dots(x, n, r, 40, 8, 20, () => 'rgba(160,180,210,0.14)');                       // wet patches
      dots(x, n, r, 300, 1, 3, (v) => 'rgba(' + (v > 0.5 ? '255,255,255,0.10' : '0,0,0,0.10') + ')');
      x.strokeStyle = 'rgba(0,0,0,0.13)'; x.lineWidth = 1;
      for (let i = 0; i < 18; i++) { let px = r() * n, py = r() * n; const pts = [[px, py]]; for (let k = 0; k < 3; k++) { px += (r() - 0.5) * 16; py += (r() - 0.5) * 16; pts.push([px, py]); } path(x, n, pts); }
    })
  });
  // A plain colour with a texture: the look for walls, wood, stone, bark (cached by colour and texture)
  const texMatCache = {};
  function texMat(color, tex, opts) {
    const key = color + ':' + tex + JSON.stringify(opts || {});
    if (texMatCache[key]) return texMatCache[key];
    const map = TEX[tex] ? TEX[tex]() : tex === 'bronze' || tex === 'gold' ? TEX.metal() : null;
    const config = SURFACES[tex];
    if (!config) return mat(color, opts);
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, map, roughness:config.roughness, metalness:config.metalness, emissive:new THREE.Color(color).multiplyScalar(.035).getHex() }, opts || {}));
    registerSurface(m,tex); texMatCache[key] = m; return m;
  }

  // texture coordinates in metres, projected along each face, so a long wall gets more bricks (not stretched ones)
  function worldUV(geo, per) {
    const pa = geo.attributes.position, na = geo.attributes.normal, uv = geo.attributes.uv; if (!uv || !na) return geo;
    for (let i = 0; i < pa.count; i++) {
      const ax = Math.abs(na.getX(i)), ay = Math.abs(na.getY(i)), az = Math.abs(na.getZ(i)), x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      if (ay >= ax && ay >= az) uv.setXY(i, x / per, z / per); else if (ax >= az) uv.setXY(i, z / per, y / per); else uv.setXY(i, x / per, y / per);
    }
    uv.needsUpdate = true; return geo;
  }
  function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; if (!uv) return geo; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; }
  // which texture a plain box gets: brown = wood, tall = mud brick walls and houses, the rest = stone
  function boxTex(color, h) {
    const hsl = {}; new THREE.Color(color).getHSL(hsl);
    if (hsl.s > 0.22 && hsl.h > 0.04 && hsl.h < 0.13 && hsl.l < 0.62) return 'wood';
    return h > 2.5 ? 'brick' : 'stone';
  }
  SQ.TEX = TEX; SQ.texMat = texMat;

  // ---- Glow: a soft halo of light on things that shine (scrolls, stars, lamps, windows, torches, the sun).
  //      Drawn as a camera-facing sprite that adds light; hidden on the two slower quality steps. ----
  function glowTex() {
    return canvasTex('glow', (x, n) => {
      const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,0.55)'); g.addColorStop(0.55, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.clearRect(0, 0, n, n); x.fillStyle = g; x.fillRect(0, 0, n, n);
    });
  }
  function glow(color, size, opacity) {
    const map = glowTex(); if (!map || typeof THREE.Sprite !== 'function') return null;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: opacity === undefined ? 0.6 : opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.scale.set(size, size, 1); sp.name = 'glow'; sp.userData.baseOpacity = sp.material.opacity;
    sp.visible = (S.quality || 0) < 2;
    (S.glows = S.glows || []).push(sp);
    return sp;
  }
  function addGlow(parent, color, size, opacity, y) { const g = glow(color, size, opacity); if (g) { if (y) g.position.y = y; parent.add(g); } return g; }
  SQ.glow = glow;
  let starMap=null;
  function starMaterial(options={}) {
    if(!starMap){
      const n=32,data=new Uint8Array(n*n*4);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){const r=Math.hypot((x+.5-n/2)/(n/2),(y+.5-n/2)/(n/2)),a=Math.max(0,Math.min(1,(Math.exp(-r*r*75)+.28*Math.exp(-r*r*8))*(1-Math.min(1,r)**4))),k=(y*n+x)*4;data[k]=data[k+1]=data[k+2]=255;data[k+3]=Math.round(a*255);}
      starMap=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);starMap.magFilter=starMap.minFilter=THREE.LinearFilter;starMap.needsUpdate=true;
    }
    return new THREE.PointsMaterial(Object.assign({map:starMap,color:0xfff5df,size:1,transparent:true,opacity:1,depthWrite:false,fog:false,alphaTest:.005,toneMapped:false},options));
  }
  // Characters get a soft sheen and a bright rim along their edges (they pop off the background)
  const charCache = {};
  function charMat(color, tex) {
    const key = color + (tex ? ':' + tex : '');
    if (charCache[key]) return charCache[key];
    const map = tex ? TEX[tex]() : null;
    if (tex && !map) return charMat(color);
    const m = new THREE.MeshPhongMaterial({ color, specular:tex === 'cloth' ? 0x111111 : 0x202020, shininess:tex === 'cloth' ? 6 : tex === 'wool' ? 5 : 18, emissive:new THREE.Color(color).multiplyScalar(.085).getHex(), map:map||null });
    if(tex) registerSurface(m,tex);
    m.userData.illustrated=true;
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader=sh.fragmentShader.replace('#include <envmap_fragment>',`#include <envmap_fragment>
        float sqLight=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))/max(.05,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
        float sqBand=.68+.18*smoothstep(.32,.46,sqLight)+.20*smoothstep(.75,.95,sqLight);
        outgoingLight=mix(outgoingLight,diffuseColor.rgb*sqBand+totalEmissiveRadiance+reflectedLight.directSpecular*.4,.32);
        float sqEdge=1.0-max(dot(normalize(vViewPosition),normal),0.0);
        float sqInk=smoothstep(.78,.97,sqEdge)*.32;
        outgoingLight*=1.0-sqInk;
        outgoingLight+=vec3(1.0,.94,.81)*pow(sqEdge,3.0)*.055;
      `);
    };
    m.customProgramCacheKey=()=> 'illustrated-soft-bands-v1';
    charCache[key] = m;
    return m;
  }
  // ---- Real models (CC0, Quaternius), packed into models/*.js by tools/pack_models.mjs. Loaded before the level
  //      starts; if anything is missing the game uses its built-in shapes, so nothing ever breaks. ----
  const Assets = { gltf: {}, tex: {}, tried: false };
  function loadAssets(done) {
    if (Assets.tried || /jsdom/.test(navigator.userAgent || '') || window.SQ_NO_MODELS) { done(); return; }
    Assets.tried = true;
    const files = ['models/addons.js', 'models/nature.js'];
    let i = 0, finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); done(); };
    const timer = setTimeout(finish, 9000);                          // never wait long: built-in shapes are fine
    const parseAll = () => {
      if (!THREE.GLTFLoader || !window.SQ_GLB) { finish(); return; }
      const names = Object.keys(window.SQ_GLB); let left = names.length;
      if (!left) { finish(); return; }
      const one = () => { if (--left === 0) finish(); };
      names.forEach((n) => {
        try {
          const bin = atob(window.SQ_GLB[n]), buf = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
          new THREE.GLTFLoader().parse(buf.buffer, '', (g) => { Assets.gltf[n] = g; one(); }, () => one());
        } catch (e) { one(); }
      });
    };
    const next = () => {
      if (i >= files.length) { parseAll(); return; }
      const sc = document.createElement('script'); sc.src = files[i++]; sc.onload = next; sc.onerror = next; document.head.appendChild(sc);
    };
    next();
  }
  function modelTex(name) {                                        // the shared leaf / bark / rock pictures
    if (Assets.tex[name] !== undefined) return Assets.tex[name];
    const uri = window.SQ_TEX && window.SQ_TEX[name];
    if (!uri) return (Assets.tex[name] = null);
    const t = new THREE.TextureLoader().load(uri); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (Assets.tex[name] = t);
  }
  const modelMatCache = {};
  function prepModel(name) {                                       // once per model: our materials, size, base at the ground
    const g = Assets.gltf[name]; if (!g) return null;
    if (g.prep) return g.prep;
    const skinned = !!(g.animations && g.animations.length);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = !skinned;
      const conv = (m) => {
        const texName = (window.SQ_MATTEX || {})[m.name];
        const c = m.color ? m.color.clone() : new THREE.Color(0xffffff); if (c.convertLinearToSRGB) c.convertLinearToSRGB();   // model colours are stored linear
        const key = name.split('_')[0] + ':' + m.name + ':' + c.getHex() + (skinned ? ':s' : '');
        if (modelMatCache[key]) return modelMatCache[key];
        const map = texName ? modelTex(texName) : null;
        const leafy = !!texName && /Leaf|Leaves|Flower|Grass|Petal/.test(texName);
        const nm = skinned ? new THREE.MeshPhongMaterial({ color: c, specular: 0x181818, shininess: 14, skinning: true, emissive: c.clone().multiplyScalar(0.1) })
          : new THREE.MeshLambertMaterial({ color: c, map, emissive: c.clone().multiplyScalar(map ? 0.06 : 0.12) });
        if (leafy || m.alphaTest > 0) { nm.alphaTest = 0.45; nm.side = THREE.DoubleSide; }
        if (m.vertexColors) nm.vertexColors = true;                     // (the models' own shading: darker trunks near the roots)
        return (modelMatCache[key] = nm);
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3());
    return (g.prep = { skinned, box, h: size.y || 1, w: Math.max(size.x, size.z) || 1 });
  }
  // a fresh copy of a model, `height` tall (or `width` wide), standing on the ground at the group's origin
  function modelInstance(name, height, width) {
    const p = prepModel(name); if (!p) return null;
    const g = Assets.gltf[name];
    const inst = p.skinned && THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(g.scene) : g.scene.clone();
    const k = width ? width / p.w : height / p.h;
    inst.scale.setScalar(k);
    inst.position.set(-(p.box.min.x + p.box.max.x) / 2 * k, -p.box.min.y * k, -(p.box.min.z + p.box.max.z) / 2 * k);
    const wrap = new THREE.Group(); wrap.add(inst); wrap.userData.model = name;
    if (p.skinned) {
      const mixer = new THREE.AnimationMixer(inst), actions = {};
      g.animations.forEach((a) => { actions[a.name] = mixer.clipAction(a); });
      wrap.userData.anim = { mixer, actions, cur: null };
      playAnim(wrap, 'Idle');
      mixer.update(Math.random() * 2);                            // not all in step
    }
    return wrap;
  }
  function playAnim(obj, name, fade) {
    const A = obj.userData.anim; if (!A || A.cur === name || !A.actions[name]) return;
    const next = A.actions[name]; next.reset().play();
    if (A.cur && A.actions[A.cur]) A.actions[A.cur].crossFadeTo(next, fade === undefined ? 0.3 : fade, false);
    A.cur = name;
  }
  const hash2 = (x, z) => Math.abs(Math.floor(x * 7.3) * 31 + Math.floor(z * 3.1) * 17);
  SQ.models = Assets; SQ._loadAssets = loadAssets;

  // Merge a model's still parts into one piece per material (far fewer draw calls, same look).
  // Parts named in `keep` (legs, wings) and the first `skip` children stay separate.
  function mergeStatic(root, keep, skip) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert ? new THREE.Matrix4().copy(root.matrixWorld).invert() : new THREE.Matrix4().getInverse(root.matrixWorld);
    const groups = new Map(), drop = [];
    root.children.forEach((c, idx) => {
      if (idx < (skip || 0) || keep.indexOf(c.name) >= 0) return;
      c.traverse((o) => {
        if (!o.isMesh || keep.indexOf(o.name) >= 0) return;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        if (!g.attributes.uv) return;
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        if (!groups.has(o.material)) groups.set(o.material, []);
        groups.get(o.material).push(g);
      });
      drop.push(c);
    });
    drop.forEach((c) => root.remove(c));
    groups.forEach((list, m) => {
      const out = new THREE.BufferGeometry();
      ['position', 'normal', 'uv'].forEach((k) => {
        const size = list[0].attributes[k].itemSize, n = list.reduce((t, g) => t + g.attributes[k].count, 0), arr = new Float32Array(n * size);
        let off = 0; list.forEach((g) => { arr.set(g.attributes[k].array, off); off += g.attributes[k].array.length; });
        out.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
      });
      const mesh = new THREE.Mesh(out, m); mesh.castShadow = !m.transparent; root.add(mesh);
    });
    return root;
  }
  function glossy(color) { return new THREE.MeshPhongMaterial({ color, specular: 0x666666, shininess: 90 }); }   // eyes, noses: a wet shine
  function shineUp(obj) {        // swap plain matte materials for the soft-sheen version
    obj.traverse((o) => { if (o.isMesh && o.material && o.material.type === 'MeshLambertMaterial' && !o.material.transparent && !o.material.map) o.material = charMat(o.material.color.getHex()); });
    return obj;
  }
  function terrain(x, z) { const h = S.level.terrain ? S.level.terrain(x, z) : 0; return S.rimOn ? h + rimAt(x, z, h) : h; }
  // The edge of the world, with a visible island edge: just outside the level's bounds the ground ends in a rocky
  // cliff, with water far below, so everyone can see where the level stops (the edge itself still holds you;
  // nobody falls off). None over the sea. LEVEL.rim: false turns it off; LEVEL.rim: 'bank' keeps the old
  // rising bank instead.
  function applyRim() {                                                  // (after build: the water is known by then)
    const L = S.level; if (L.rim === false || !L.bounds || !S.groundMesh) return;
    const B = L.bounds; findWaters();
    const wet = (x, z) => {                                              // sea, lake or river at this edge spot: no bank there
      const h = L.terrain ? L.terrain(x, z) : 0;
      if (S.waterY !== undefined && h < S.waterY + 0.3) return true;
      for (const w of S.waters || []) if (x > w.minX - 3 && x < w.maxX + 3 && z > w.minZ - 3 && z < w.maxZ + 3) return true;
      if (L.groundColor) { const c = new THREE.Color(L.groundColor(x, z, h)), hsl = {}; c.getHSL(hsl); if (hsl.h > 0.5 && hsl.h < 0.7 && hsl.s > 0.4) return true; }
      return false;
    };
    const row = (fx, a0, a1) => { const out = []; for (let a = a0; a <= a1 + 1.999; a += 2) { const aa = Math.min(a, a1); out.push(!wet(...fx(aa, 0)) && !wet(...fx(aa, 3))); } return out; };   // (on the edge and just outside)
    S.rimEdges = {
      minX: row((a, o) => [B.minX - o, a], B.minZ, B.maxZ), maxX: row((a, o) => [B.maxX + o, a], B.minZ, B.maxZ),
      minZ: row((a, o) => [a, B.minZ - o], B.minX, B.maxX), maxZ: row((a, o) => [a, B.maxZ + o], B.minX, B.maxX)
    };
    S.rimOn = true; S.island = L.rim !== 'bank';
    if (S.island) {                                                      // the water lies well below the lowest ground; the cliffs reach under it
      let low = Infinity; for (let k = 0; k <= 10; k++) for (let j = 0; j <= 10; j++) low = Math.min(low, L.terrain ? L.terrain(B.minX + (B.maxX - B.minX) * k / 10, B.minZ + (B.maxZ - B.minZ) * j / 10) : 0);
      S.islandSeaY = Math.min(low, 0) - 14; S.islandFloor = S.islandSeaY - 6;
    }
    const geo = S.groundMesh.geometry, pos = geo.attributes.position, col = geo.attributes.color, c = new THREE.Color();
    const sp = L.spawn || [0, 0], hill = new THREE.Color(isGreenAt(sp[0], sp[1]) ? 0x6b9a48 : 0xb8996c);
    const night = !!(S.timeCfg && S.timeCfg.lamps), rock = new THREE.Color(night ? 0x3b3226 : 0x8a6a48), deep = new THREE.Color(night ? 0x1c1712 : 0x5a4330);
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), base = L.terrain ? L.terrain(x, z) : 0, r = rimAt(x, z, base);
      if (r === 0) continue;
      pos.setY(i, base + r); n++;
      if (r > 0) c.copy(paintedGround(L,x,z,base)).lerp(hill, Math.min(1, r / 1.5) * 0.6);
      else c.copy(rock).lerp(deep, Math.min(1, (base - (base + r)) / 20)).lerp(paintedGround(L,x,z,base), Math.max(0, 1 + r / 0.8) * 0.5);   // rocky cliff face
      col.setXYZ(i, c.r, c.g, c.b);
    }
    if (S.island && n) {                                                   // the water far below the island
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: night ? 0x16264a : 0x4f93bf }));
      sea.rotation.x = -Math.PI / 2; sea.position.set((B.minX + B.maxX) / 2, S.islandSeaY, (B.minZ + B.maxZ) / 2); S.scene.add(sea); S.islandSea = sea;
    }
    if (!n) return;
    pos.needsUpdate = true; col.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  function rimAt(x, z, h) {
    const B = S.level.bounds, E = S.rimEdges; if (!B || !E) return 0;
    const dx0 = B.minX - x, dx1 = x - B.maxX, dz0 = B.minZ - z, dz1 = z - B.maxZ, d = Math.max(dx0, dx1, dz0, dz1);
    if (d <= 0) return 0;
    const at = (list, a, a0) => list[Math.max(0, Math.min(list.length - 1, Math.round((a - a0) / 2)))];
    const cx = Math.max(B.minX, Math.min(B.maxX, x)), cz = Math.max(B.minZ, Math.min(B.maxZ, z));
    const ok = d === dx0 ? at(E.minX, cz, B.minZ) : d === dx1 ? at(E.maxX, cz, B.minZ) : d === dz0 ? at(E.minZ, cx, B.minX) : at(E.maxZ, cx, B.minX);
    if (S.island) { const he = S.level.terrain ? S.level.terrain(cx, cz) : 0; return he - h - Math.min(he - S.islandFloor, d * 4 + d * d * 1.6); }   // the island's cliff edge (from the edge's own height)
    // Rivers may meet the edge, but the original hillside must still end there.
    // Skipping wet rays leaves tall fins between the neighbouring cliff vertices.
    if (!ok) return 0;
    return Math.min(d === dz1 ? 1.4 : 4.0 + Math.sin(z * 0.09 + x * 0.11) * 0.45, d * 1.3 + d * d * 0.12);    // low on the camera's side (+z)
  }


  // Highest walkable surface at (x,z) that is not above footY + stepUp
  function groundInfo(x, z, footY, grace) {
    let h = terrain(x, z), on = null;
    const lim = footY === undefined ? Infinity : footY + T.stepUp;
    const m = grace || 0;                   // landing grace: a falling player still lands when just past the edge
    for (const pl of S.platforms) {
      if (!pl.on) continue;
      if (x >= pl.minX - m && x <= pl.maxX + m && z >= pl.minZ - m && z <= pl.maxZ + m && pl.top <= lim && pl.top >= h) { h = pl.top; on = pl; }
    }
    return { h, pl: on };
  }
  function groundAt(x, z, footY) { return groundInfo(x, z, footY).h; }

  // The level's collectible looks like its icon: ⭐ a star, 🐚 a shell, 🪙 a coin, 💧 a drop, 🍞 a loaf...
  const LEAF_SHAPES = { '⭐': 'star', '🐚': 'shell', '🪙': 'coin', '💧': 'drop', '🫒': 'olive', '🐑': 'wool', '🐐': 'wool', '🍞': 'bread', '🔥': 'flame',
    '🕯️': 'candle', '👑': 'crown', '🧱': 'brick', '🧺': 'basket', '🎵': 'note', '📜': 'scroll', '📯': 'horn', '🌸': 'flower', '🌰': 'nut', '🐟': 'fish',
    '🌾': 'grain', '🍎': 'round', '🍑': 'round', '🌿': 'leaf' };
  let leafTpl = null;
  function leafModel() {
    if (leafTpl && leafTpl.userData.level === S.level) return leafTpl;
    const L = S.level, shape = L.leafModel || LEAF_SHAPES[L.leafIcon] || (L.leafShape === 'round' ? 'round' : 'leaf');
    const DEF = { star: 0xfde047, shell: 0xfbcfe8, coin: 0xfacc15, drop: 0x60a5fa, olive: 0x65a30d, wool: 0xf5f5f4, bread: 0xd6a35c, flame: 0xfb923c, candle: 0xfef3c7,
      crown: 0xfacc15, brick: 0xb45309, basket: 0xc8a165, note: 0xfbbf24, scroll: 0xf5e6c4, horn: 0xeab308, flower: 0xf9a8d4, nut: 0x8b5a2b, fish: 0x93c5fd, grain: 0xeab308, round: 0xef4444, leaf: 0x84cc16 };
    const col = L.leafColor || DEF[shape] || 0x84cc16;
    const shiny = (c) => mat(c, { emissive: new THREE.Color(c).multiplyScalar(0.3).getHex() });
    const g = new THREE.Group(), M = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); g.add(o); return o; };
    const flame = (y, s2) => { const f = M(new THREE.ConeGeometry(0.07 * s2, 0.2 * s2, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }), 0, y, 0); return f; };
    if (shape === 'star') {
      const sh = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 0.14 : 0.34; if (k) sh.lineTo(Math.cos(a) * r, -Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); geo.center();
      M(geo, shiny(col));
    } else if (shape === 'shell') {
      const fan = M(new THREE.CircleGeometry(0.32, 7, 0, Math.PI), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.3), side: THREE.DoubleSide }), 0, -0.1, 0);
      for (let k = 1; k < 7; k++) { const a = k / 7 * Math.PI; M(new THREE.BoxGeometry(0.02, 0.3, 0.03), shiny(new THREE.Color(col).multiplyScalar(0.85).getHex()), Math.cos(a) * 0.16, -0.1 + Math.sin(a) * 0.16, 0.01).rotation.z = a - Math.PI / 2; }
      M(new THREE.BoxGeometry(0.14, 0.07, 0.05), shiny(col), 0, -0.12, 0); fan.position.y = -0.12;
    } else if (shape === 'coin') {
      M(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 20), shiny(col)).rotation.x = Math.PI / 2;
      M(new THREE.TorusGeometry(0.2, 0.025, 6, 20), shiny(new THREE.Color(col).multiplyScalar(0.8).getHex()), 0, 0, 0.03);
    } else if (shape === 'drop') {
      M(new THREE.SphereGeometry(0.2, 14, 10), shiny(col), 0, -0.05, 0); M(new THREE.ConeGeometry(0.17, 0.26, 14), shiny(col), 0, 0.17, 0);
    } else if (shape === 'olive') {
      M(new THREE.SphereGeometry(0.17, 12, 8), shiny(col)).scale.set(1, 1.35, 1);
      M(new THREE.SphereGeometry(0.12, 8, 6), mat(0x22c55e), 0.12, 0.25, 0).scale.set(1, 0.3, 0.5);
    } else if (shape === 'wool') {
      [[0, 0, 0, 0.2], [0.16, 0.05, 0, 0.15], [-0.15, 0.04, 0.03, 0.15], [0, 0.17, 0, 0.14]].forEach(([x, y, z, r]) => M(new THREE.SphereGeometry(r, 10, 8), shiny(col), x, y, z));
    } else if (shape === 'bread') {
      M(new THREE.SphereGeometry(0.3, 14, 10), shiny(col)).scale.set(1.1, 0.55, 0.75);
      [-0.12, 0, 0.12].forEach((x) => M(new THREE.BoxGeometry(0.03, 0.02, 0.24), mat(0xa4723a), x, 0.15, 0));
    } else if (shape === 'flame') {
      M(new THREE.ConeGeometry(0.17, 0.45, 10), new THREE.MeshBasicMaterial({ color: col })); M(new THREE.ConeGeometry(0.09, 0.26, 8), new THREE.MeshBasicMaterial({ color: 0xfde047 }), 0, -0.07, 0.02);
    } else if (shape === 'candle') {
      M(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12), shiny(col)); flame(0.28, 1);
    } else if (shape === 'crown') {
      M(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 18, 1, true), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.3), side: THREE.DoubleSide }));
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; M(new THREE.ConeGeometry(0.05, 0.14, 6), shiny(col), Math.cos(a) * 0.2, 0.13, Math.sin(a) * 0.2); }
    } else if (shape === 'brick') {
      M(roundedBox(0.44, 0.2, 0.22, 0.03), shiny(col));
    } else if (shape === 'basket') {
      M(new THREE.CylinderGeometry(0.22, 0.16, 0.22, 14), shiny(col)); M(new THREE.TorusGeometry(0.22, 0.03, 6, 14), mat(0x8a6a3a), 0, 0.11, 0).rotation.x = Math.PI / 2;
    } else if (shape === 'note') {
      M(new THREE.SphereGeometry(0.12, 12, 8), shiny(col), 0, -0.12, 0).scale.set(1.25, 0.9, 0.8); M(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), shiny(col), 0.12, 0.08, 0);
      M(new THREE.BoxGeometry(0.14, 0.05, 0.03), shiny(col), 0.18, 0.26, 0).rotation.z = -0.5;
    } else if (shape === 'scroll') {
      M(new THREE.BoxGeometry(0.34, 0.24, 0.02), shiny(col)); [-0.17, 0.17].forEach((x) => M(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), mat(0x8b5a2b), x, 0, 0));
    } else if (shape === 'horn') {
      const h = M(new THREE.ConeGeometry(0.12, 0.5, 12, 1, true), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.3), side: THREE.DoubleSide })); h.rotation.z = Math.PI / 2.4;
    } else if (shape === 'flower') {
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; M(new THREE.SphereGeometry(0.11, 8, 6), shiny(col), Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0); }
      M(new THREE.SphereGeometry(0.08, 8, 6), shiny(0xfde047), 0, 0, 0.04);
    } else if (shape === 'nut') {
      M(new THREE.SphereGeometry(0.18, 12, 8), shiny(col), 0, -0.04, 0).scale.set(1, 1.15, 1); M(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5b3a1e), 0, 0.06, 0);
    } else if (shape === 'fish') {
      M(new THREE.SphereGeometry(0.26, 12, 8), shiny(col)).scale.set(1, 0.55, 0.35);
      M(new THREE.ConeGeometry(0.13, 0.2, 4), shiny(col), -0.3, 0, 0).rotation.z = -Math.PI / 2;
      M(new THREE.SphereGeometry(0.03, 6, 4), mat(0x1c1c1c), 0.16, 0.04, 0.08);
    } else if (shape === 'grain') {
      M(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), mat(0x9a7b2a), 0, -0.05, 0);
      for (let k = 0; k < 6; k++) M(new THREE.SphereGeometry(0.06, 6, 4), shiny(col), (k % 2 ? 0.05 : -0.05), 0.05 + k * 0.05, 0).scale.set(1, 1.6, 1);
    } else if (shape === 'round') {
      const geo = new THREE.SphereGeometry(0.3, 12, 10); M(geo, shiny(col));
      M(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 4), mat(0x5b3a1e), 0, 0.33, 0);
      M(geo, mat(0x22c55e), 0.1, 0.38, 0).scale.set(0.35, 0.12, 0.5);
    } else {
      M(new THREE.SphereGeometry(0.22, 10, 8), shiny(col)).scale.set(1, 0.5, 1.6);
    }
    g.userData = { shape, level: L };
    leafTpl = g;
    return g;
  }

  // Scene-local effects: no full-screen pass, camera state, collision or gameplay changes.
  // Shared immutable textures survive resets; every owned material/geometry is disposed.
  let softContactMap = null;
  const softContactMaterials=new Set();
  function softShadowMaterial(options){const material=new THREE.MeshBasicMaterial(options);softContactMaterials.add(material);return material;}
  function contactMap() {
    if (softContactMap) return softContactMap;
    if(!S.gfxReady || /jsdom/.test(navigator.userAgent || ''))return null;
    const n=64, data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const r=Math.hypot((x+.5-n/2)/(n/2),(y+.5-n/2)/(n/2));
      const a=Math.pow(Math.max(0,1-r*r),2), i=(y*n+x)*4;
      data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(a*255);
    }
    softContactMap=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
    softContactMap.magFilter=softContactMap.minFilter=THREE.LinearFilter;softContactMap.needsUpdate=true;
    return softContactMap;
  }
  const ScrollQuestGFX = (() => {
    const effects=[], shadows=[], point=new THREE.Vector3();
    let rayMap=null;
    function radialMap(){return contactMap();}
    function track(object, parent, kind, options){
      parent.add(object);effects.push({object,kind,options});return object;
    }
    function attachBloomHalo(target, opts={}){
      // A local additive halo, rather than screen-space bloom. Parent visibility is inherited.
      const existing=effects.find(e=>e.kind==='halo'&&e.object.parent===target);
      if(existing)return existing.object;
      const o=Object.assign({color:0xffcc88,scale:2.8,opacity:.32,offsetY:0,pulseSpeed:2},opts);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:radialMap(),color:o.color,opacity:o.opacity,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true}));
      sprite.name='sq-miracle-halo';sprite.position.y=o.offsetY;sprite.scale.set(o.scale,o.scale,1);
      return track(sprite,target,'halo',o);
    }
    function createGodRay(scene, opts={}){
      const o=Object.assign({height:10,topRadius:.15,bottomRadius:2.4,color:0xfff0c2,opacity:.13,tiltZ:0,tiltX:0},opts);
      if(!rayMap){
        const n=64,data=new Uint8Array(n*n*4);
        for(let y=0;y<n;y++)for(let x=0;x<n;x++){
          const i=(y*n+x)*4,u=(x+.5)/n,v=(y+.5)/n;
          data[i]=data[i+1]=data[i+2]=255;
          data[i+3]=Math.round(255*Math.pow(Math.sin(Math.PI*u),2)*Math.sin(Math.PI*v));
        }
        rayMap=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);rayMap.magFilter=rayMap.minFilter=THREE.LinearFilter;rayMap.needsUpdate=true;
      }
      const geo=new THREE.CylinderGeometry(o.topRadius,o.bottomRadius,o.height,16,1,true);geo.translate(0,-o.height/2,0);
      const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:rayMap,color:o.color,opacity:o.opacity,transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true}));
      mesh.name='sq-light-shaft';if(o.position)mesh.position.copy(o.position);mesh.rotation.set(o.tiltX,0,o.tiltZ);
      return track(mesh,scene,'ray',o);
    }
    function registerContactShadow(scene,target,opts={}){
      const existing=shadows.find(e=>e.target===target);if(existing)return existing;
      const o=Object.assign({radius:.65,maxDrop:8,opacity:.26,footOffset:0},opts);
      const decal=new THREE.Mesh(new THREE.PlaneGeometry(o.radius*2,o.radius*2),new THREE.MeshBasicMaterial({map:contactMap(),color:0x000000,transparent:true,opacity:o.opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      decal.rotation.x=-Math.PI/2;decal.name='sq-contact-shadow';decal.visible=false;scene.add(decal);
      const entry={scene,target,decal,options:o};shadows.push(entry);return entry;
    }
    function update(scene,dt){
      const t=S.time||0,quality=S.quality||0;
      for(const e of effects){
        e.object.visible=quality<2;
        if(quality>=2)continue;
        const pulse=Math.sin(t*(e.options.pulseSpeed||.9));
        e.object.material.opacity=e.options.opacity*(.94+.06*pulse);
        if(e.kind==='halo'){const k=e.options.scale*(1+.035*pulse);e.object.scale.set(k,k,1);}
      }
      for(const e of shadows){
        const {target,decal,options:o}=e;
        let visible=true,attached=false;for(let n=target;n;n=n.parent){if(!n.visible)visible=false;if(n===scene)attached=true;}visible=visible&&attached;
        decal.visible=visible;if(!visible)continue;
        target.getWorldPosition(point);const feet=point.y+o.footOffset;
        // Use the same moving-platform/ramp/terrain query as player feet, avoiding expensive scene raycasts.
        const h=groundAt(point.x,point.z,feet+.05),drop=Math.max(0,feet-h),k=Math.max(0,1-drop/o.maxDrop);
        decal.visible=Number.isFinite(h)&&h<=feet+.1&&k>0;
        decal.position.set(point.x,h+.028,point.z);decal.scale.setScalar(.45+.55*k);decal.material.opacity=o.opacity*k*k;
      }
    }
    function clear(){
      for(const e of effects){e.object.removeFromParent?e.object.removeFromParent():e.object.parent&&e.object.parent.remove(e.object);if(e.object.isMesh)e.object.geometry.dispose();e.object.material.dispose();}
      for(const e of shadows){if(e.decal.parent)e.decal.parent.remove(e.decal);e.decal.geometry.dispose();e.decal.material.dispose();}
      effects.length=0;shadows.length=0;
    }
    return {attachBloomHalo,createGodRay,registerContactShadow,update,clear};
  })();
  SQ.GFX=ScrollQuestGFX;

  // a soft round shadow on the ground under something floating: shows how high it is and where it is
  let blobGeo = null, blobMat = null;
  function blobShadow(r) {
    if (!blobGeo) { blobGeo = new THREE.CircleGeometry(1, 16); blobMat = softShadowMaterial({ map: contactMap(), color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }); }
    const m = new THREE.Mesh(blobGeo, blobMat); m.rotation.x = -Math.PI / 2; m.scale.setScalar(r); m.renderOrder = 1; S.scene.add(m); return m;
  }
  function groundBlob(x, z, r, y) {   // a soft dark patch where something meets the ground
    const b = blobShadow(r); b.material = blobMat2(); b.position.set(x, (y !== undefined ? y : groundAt(x, z)) + 0.025, z); return b;
  }
  let bm2 = null;
  function blobMat2() { if (!bm2) bm2 = softShadowMaterial({ map: contactMap(), color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }); return bm2; }
  function placeBlob(sh, x, y, z) {
    const g = groundAt(x, z, y - 0.9);
    sh.position.set(x, g + 0.03, z);
    const k = Math.max(0.45, 1 - (y - g) * 0.12); sh.scale.setScalar(0.32 * k);
  }

  // what's underfoot (for footsteps): a platform's material, or grass / sand from the ground colour
  function surfaceAt(p) {
    const pl = p.standingOn;
    if (pl) return pl.tex === 'wood' ? 'wood' : 'stone';
    const L = S.level; if (!L.groundColor) return 'grass';
    const c = new THREE.Color(L.groundColor(p.pos.x, p.pos.z, p.pos.y));
    return c.g > c.r * 1.05 && c.g > c.b * 1.1 ? 'grass' : 'sand';
  }

  // ---- House kit: in town levels (LEVEL.town), plain mud-brick blocks that look like houses get doors,
  //      windows with shutters, a cornice, roof-beam ends, awnings, hanging cloths and pots by the door.
  //      All decoration: nothing to bump into, nothing to climb, so no puzzle changes. At night the windows
  //      glow and torches burn by the doors. A box can opt in or out with { house: true | false }. ----
  const DOORS = [0x2f6f73, 0x2b5c8a, 0x5a6b3c, 0x7a4a26, 0x8a3b2a, 0x3b4f7a];
  const CLOTHS = [0xb91c1c, 0x1d4ed8, 0xd97706, 0x15803d, 0x7e22ce, 0xe7e5e4];
  function houseLike(o, h) {
    if (o.house === false || o.truth || o.lie) return false;
    if (o.house === true) return true;
    if (!S.level.town || (o.tex !== undefined && o.tex !== 'brick') || boxTex(o.color || 0x9c6b36, o.h) !== 'brick') return false;
    const a = Math.min(o.w, o.d), b = Math.max(o.w, o.d);
    return o.h >= 2.6 && o.h <= 6.5 && a >= 2.9 && b <= 13 && b / a <= 3.2;
  }
  function decorateHouses() {
    const list = S.houseBoxes || []; if (!list.length) return;
    const L = S.level, night = !!(S.timeCfg && S.timeCfg.lamps), sp = L.spawn || [0, 0];
    let torches = 0;
    list.forEach(({ o, mesh, platform }, idx) => {
      const H = o.h, base = mesh.position.y - H / 2, hsh = hash2(o.x * 1.7 + idx, o.z * 1.3);
      const wallC = new THREE.Color(o.color || 0xd8c39c), trimC = wallC.clone().lerp(new THREE.Color(0xffffff), 0.28).getHex();
      const doorColors=L.artDirection&&L.artDirection.doorColors||DOORS,clothColors=L.artDirection&&L.artDirection.clothColors||CLOTHS;
      const doorC = doorColors[hsh % doorColors.length], clothC = clothColors[(hsh >> 3) % clothColors.length];
      const deco = new THREE.Group(), keep = new THREE.Group();
      const B = (w, h, d, m, x, y, z, ry) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); if (ry) b.rotation.y = ry; deco.add(b); return b; };
      const faces = [[1, 0, o.d / 2, o.w / 2], [-1, 0, o.d / 2, o.w / 2], [0, 1, o.w / 2, o.d / 2], [0, -1, o.w / 2, o.d / 2]].map(([nx, nz, hw, hd]) => {
        const px = o.x + nx * (hd + 0.75), pz = o.z + nz * (hd + 0.75);
        let blocked = false;
        for (const pl of S.platforms) if (pl !== platform && pl.on && px > pl.minX - 0.2 && px < pl.maxX + 0.2 && pz > pl.minZ - 0.2 && pz < pl.maxZ + 0.2 && pl.top > base + 0.9 && pl.bottom < base + 1.8) { blocked = true; break; }
        const toward = (sp[0] - o.x) * nx + (sp[1] - o.z) * nz;
        return { nx, nz, hw, hd, blocked, toward, ry: Math.atan2(nx, nz) };
      });
      const at = (f, u, out) => [f.nx * (f.hd + out) + -f.nz * u, f.nz * (f.hd + out) + f.nx * u];   // a point on a face (u along it), local to the house centre
      const yAt = (above) => -H / 2 + above;                                                    // local height from the ground
      // cornice round the top (flush with the roof, so nothing new to stand on) and roof-beam ends
      faces.forEach((f) => {
        const [cx, cz] = at(f, 0, 0.05); B(f.hw * 2 + 0.22, 0.16, 0.12, texMat(trimC, 'stone'), cx, H / 2 - 0.08, cz, f.ry);
      });
      faces.filter((f) => f.hw >= f.hd).forEach((f) => {
        const n = Math.max(2, Math.floor(f.hw * 2 / 1.1));
        for (let k = 0; k < n; k++) { const u = -f.hw + 0.55 + k * (f.hw * 2 - 1.1) / Math.max(1, n - 1); const [bx, bz] = at(f, u, 0.14); const v = B(0.16, 0.16, 0.3, texMat(0x5c3d22, 'wood'), bx, H / 2 - 0.36, bz, f.ry); }
      });
      // the door on the open face nearest the start
      const open = faces.filter((f) => !f.blocked).sort((a, b) => b.toward - a.toward);
      const front = open[0];
      let doorU = 0; const dh = Math.min(2.1, H - 0.9), dw = 1.1;
      if (front) {
        doorU = front.hw > 2.2 ? ((hsh % 3) - 1) * Math.min(1.1, front.hw - 1.2) : 0;
        let [x, z] = at(front, doorU, 0.03); B(dw + 0.26, dh + 0.14, 0.07, texMat(trimC, 'stone'), x, yAt((dh + 0.14) / 2), z, front.ry);
        [x, z] = at(front, doorU, 0.07); B(dw, dh, 0.06, texMat(doorC, 'wood'), x, yAt(dh / 2), z, front.ry);
        { const [sx2, sz2] = at(front, doorU, 0.9); (S.doors = S.doors || []).push({ x: mesh.position.x + sx2, z: mesh.position.z + sz2, y: base, visited: false, interior:o.interior||null }); }
        [x, z] = at(front, doorU, 0.1); B(dw + 0.7, 0.18, 0.16, texMat(0x5c3d22, 'wood'), x, yAt(dh + 0.18), z, front.ry);   // lintel beam
        [x, z] = at(front, doorU + dw * 0.3, 0.13); B(0.08, 0.08, 0.06, mat(0x2b2118), x, yAt(dh * 0.5), z, front.ry);      // handle
        if (hsh % 2 === 0 && H >= dh + 0.75) {                                          // a cloth awning over the door
          [x, z] = at(front, doorU, 0.42);
          const aw = B(dw + 1.1, 0.04, 0.9, charMat(clothC, 'cloth'), x, yAt(dh + 0.42), z, front.ry);
          aw.rotation.x = 0; aw.rotateOnAxis(new THREE.Vector3(1, 0, 0), 0.32);
          [x, z] = at(front, doorU, 0.86); B(dw + 1.1, 0.12, 0.03, charMat(new THREE.Color(clothC).multiplyScalar(0.8).getHex(), 'cloth'), x, yAt(dh + 0.22), z, front.ry);   // its scalloped edge
        }
        [-1, 1].forEach((sd, k) => {                                                     // clay pots by the door
          if ((hsh >> (k + 2)) % 3 === 0) return;
          const [px, pz] = at(front, doorU + sd * (dw / 2 + 0.55), 0.32);
          const pot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), texMat(k ? 0xb4643a : 0xc2703d, 'clay')); pot.scale.y = 1.15; pot.position.set(px, yAt(0.26), pz); deco.add(pot);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14), texMat(0xa85a33, 'clay')); rim.rotation.x = Math.PI / 2; rim.position.set(px, yAt(0.53), pz); deco.add(rim);
          if (k === 1) [[0, 0.65, 0], [0.09, 0.6, 0.05], [-0.08, 0.62, -0.05]].forEach(([dx, dy, dz]) => { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), texMat(0x3f8a3a, 'leaves')); lf.position.set(px + dx, yAt(dy), pz + dz); deco.add(lf); });
        });
        if (night && torches < 14) {                                                     // a torch by the door
          torches++;
          const [tx, tz] = at(front, doorU - dw / 2 - 0.35, 0.18);
          B(0.08, 0.5, 0.08, texMat(0x5c3d22, 'wood'), tx, yAt(dh + 0.05), tz, front.ry);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), new THREE.MeshBasicMaterial({ color: 0xffa53a }));
          fl.position.set(tx, yAt(dh + 0.45), tz); fl.name = 'flame'; keep.add(fl);
          const gl = glow(0xffa53a, 2.4, 0.7); if (gl) { gl.position.copy(fl.position); keep.add(gl); }
          (S.flames = S.flames || []).push({ fl, gl, ph: hsh % 7 });
        }
      }
      // windows (shutters on some), on every open face, kept clear of the door
      const winY = Math.max(1.75, Math.min(H * 0.62, H - 0.8));
      const winM = night ? new THREE.MeshBasicMaterial({ color: 0xffc46b }) : mat(0x2b1e15, { emissive: 0x120c08 });
      faces.forEach((f) => {
        if (f.blocked) return;
        const n = Math.max(1, Math.min(3, Math.floor(f.hw * 2 / 2.8)));
        for (let k = 0; k < n; k++) {
          const u = n === 1 ? (f === front ? (doorU > 0 ? -1 : 1) * Math.min(f.hw - 0.7, 1.4) : 0) : -f.hw + f.hw * 2 * (k + 0.5) / n;
          if (f === front && Math.abs(u - doorU) < dw / 2 + 0.75) continue;
          if (Math.abs(u) > f.hw - 0.55) continue;
          let [x, z] = at(f, u, 0.03); const w = B(0.62, 0.66, 0.05, winM, x, yAt(winY), z, f.ry);
          [x, z] = at(f, u, 0.07); B(0.84, 0.08, 0.16, texMat(trimC, 'stone'), x, yAt(winY - 0.38), z, f.ry);          // sill
          if ((hsh + k) % 3 !== 0) [-1, 1].forEach((sd) => {                                                              // open shutters
            const [sx, sz] = at(f, u + sd * 0.48, 0.06); const sh = B(0.3, 0.66, 0.04, texMat(doorC, 'wood'), sx, yAt(winY), sz, f.ry + sd * 0.35);
          });
          if (night) { const gl = glow(0xffb347, 2.0, 0.5); if (gl) { const [gx, gz] = at(f, u, 0.25); gl.position.set(gx, yAt(winY), gz); keep.add(gl); } }
        }
      });
      // a cloth hanging over the roof edge on a side
      const side = faces.find((f) => f !== front && !f.blocked);
      if (side && hsh % 3 === 1) {
        const [x, z] = at(side, ((hsh >> 4) % 2 ? 0.6 : -0.6) * Math.min(1, side.hw - 0.8), 0.04);
        B(0.9, 1.25, 0.03, charMat(clothC, 'cloth'), x, H / 2 - 0.82, z, side.ry);
        const [x2, z2] = at(side, ((hsh >> 4) % 2 ? 0.6 : -0.6) * Math.min(1, side.hw - 0.8), 0.06); B(0.9, 0.08, 0.04, charMat(new THREE.Color(clothC).multiplyScalar(0.75).getHex(), 'cloth'), x2, H / 2 - 1.38, z2, side.ry);
      }
      mergeStatic(deco, []);
      deco.name = 'house'; mesh.add(deco); if (keep.children.length) mesh.add(keep);
      mesh.userData.house = true;
    });
  }

  // ---- Themed bonus courses: the same steps (same size, same jumps), dressed for the place:
  //      town = market-stall canopies and brick pillars, green = floating meadow islands and tree stumps,
  //      sand = sandstone slabs with rugs and pillars, water = log rafts and mossy rocks. LEVEL.courseTheme picks one. ----
  // Water the level made itself (flat blue planes and pools): found once, used for course themes and shorelines
  function findWaters() {
    S.waters = [];
    S.scene.children.forEach((o) => {
      if (!o.isMesh || !o.geometry || !o.material || o === S.waterMesh || o === S.islandSea || o.userData.seaHorizon) return;   // decorative open sea has no gameplay shore
      const t = o.geometry.type; if (t !== 'PlaneGeometry' && t !== 'CircleGeometry' && t !== 'PlaneBufferGeometry' && t !== 'CircleBufferGeometry') return;
      if (Math.abs(Math.abs(o.rotation.x) - Math.PI / 2) > 0.05 || !o.material.color) return;
      const hsl = {}; o.material.color.getHSL(hsl); if (hsl.h < 0.52 || hsl.h > 0.7 || hsl.s < 0.4) return;
      o.updateMatrixWorld(true); o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z); if (area < 12) return;
      S.waters.push({ mesh: o, y: o.position.y, minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, round: t.indexOf('Circle') === 0, sea: hsl.l < 0.42 && area > 600 });
    });
  }
  // ---- Shorelines for the level's own water: rippling, shiny water, wet darker ground at the edge, a soft
  //      line of foam where water meets land, and (on green levels, not the open sea) reeds and lily pads. ----
  // Softer, deeper surfaces: walls and houses sit IN the ground instead of on it. The ground darkens softly
  // around each wall (baked into its colours), and each tall box gets one small see-through piece (a child,
  // so it hides, moves and falls with the box): darkening at the foot of the wall, a shadow under a house's
  // roof edge, and moss at the foot of old walls in green places. One shared material; a tiny fade texture.
  function fadeTex() {
    const t = canvasTex('fade', (x, n, r) => {
      x.clearRect(0, 0, n, n);
      const h = n / 2;                                         // left half: a smooth fade; right half: blotchy (moss)
      for (let yy = 0; yy < n; yy++) {
        const k = yy / (n - 1);                                // canvas top = v 1 (faint), bottom = v 0 (strong)
        x.fillStyle = 'rgba(255,255,255,' + (Math.pow(k, 1.6) * 0.8).toFixed(3) + ')'; x.fillRect(0, yy, h, 1);
      }
      for (let i = 0; i < 260; i++) {
        const py = n - Math.pow(r(), 1.6) * n, px = h + 5 + r() * (h - 10), k = (1 - (n - py) / n) * Math.sin(Math.PI * (px - h) / h);   // (fades out at the sides too)
        x.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.5) * k + ')'; x.beginPath(); x.arc(px, py, 1.5 + r() * 3, 0, 6.3); x.fill();
      }
    }, 64);
    if (t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    return t;
  }
  let groundingMat = null;
  function buildGrounding() {
    const list = S.groundBoxes || []; if (!list.length) return;
    if (!groundingMat) groundingMat = new THREE.MeshLambertMaterial({ map: fadeTex(), vertexColors: true, transparent: true, opacity: fadeTex() ? 1 : 0.25, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    groundingMat.visible = (S.quality || 0) < 3;
    const houses = new Set((S.houseBoxes || []).map((hb) => hb.mesh));
    const dark = new THREE.Color(0x000000), moss = new THREE.Color(0x2f4a12);
    let made = 0;
    list.forEach(({ o, mesh, y }) => {
      const P = [], UV = [], C = [];
      const cy = y + o.h / 2, lo = -o.h / 2;
      // a quad: a, b on the strong edge; c, d on the faint edge (positions local to the box centre)
      const quad = (a, b, c, d, u0, u1, v0, col) => {
        [a, b, c, a, c, d].forEach((p) => P.push(p[0], p[1], p[2]));
        [[u0, v0], [u1, v0], [u1, 1], [u0, v0], [u1, 1], [u0, 1]].forEach((uv) => UV.push(uv[0], uv[1]));
        for (let k = 0; k < 6; k++) C.push(col.r, col.g, col.b);
      };
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([nx, nz]) => {
        const hd = nx ? o.w / 2 : o.d / 2, hw = nx ? o.d / 2 : o.w / 2, tx = -nz, tz = nx, e = 0.012;
        const w0 = [nx * (hd + e) - tx * hw, 0, nz * (hd + e) - tz * hw], w1 = [nx * (hd + e) + tx * hw, 0, nz * (hd + e) + tz * hw];
        const at = (p, yy) => [p[0], yy, p[2]];
        quad(at(w0, lo), at(w1, lo), at(w1, lo + 0.8), at(w0, lo + 0.8), 0, 0.5, 0.25, dark);           // darker at the foot of the wall
        const dust = paintedGround(S.level,o.x+nx*(hd+.5),o.z+nz*(hd+.5),y).lerp(new THREE.Color(0xbca380),.38);
        // Uneven pale dust near the base, beneath the existing moss and roof shadows.
        quad(at(w0,lo+.015),at(w1,lo+.015),at(w1,lo+.46),at(w0,lo+.46),.5,1,.45,dust);
        // Narrow, irregular worn corners. These stay well inside the original box silhouette.
        const edgeC = new THREE.Color(o.color || 0xc8b99a).lerp(new THREE.Color(0xf2e9d4),.32);
        [-1,1].forEach(sd=>{
          const u=sd*(hw-.04), v=sd*(hw-.12);
          const a=[nx*(hd+.018)+tx*u,lo+.12,nz*(hd+.018)+tz*u], b=[a[0],-lo-.12,a[2]];
          const c=[nx*(hd+.018)+tx*v,-lo-.12,nz*(hd+.018)+tz*v], d=[c[0],lo+.12,c[2]];
          quad(a,b,c,d,.5,1,.6,edgeC);
        });
        const faceX=o.x+nx*hd,faceZ=o.z+nz*hd;
        const water=(S.waters||[]).find(w=>faceX>w.minX-1.2&&faceX<w.maxX+1.2&&faceZ>w.minZ-1.2&&faceZ<w.maxZ+1.2&&w.y>y-.25&&w.y<y+o.h);
        if(water){ const band=water.y-cy; quad(at(w0,band-.15),at(w1,band-.15),at(w1,Math.min(-lo,band+.42)),at(w0,Math.min(-lo,band+.42)),.5,1,.35,new THREE.Color(0x52665e)); }
        if (houses.has(mesh)) quad(at(w0, -lo), at(w1, -lo), at(w1, -lo - 0.7), at(w0, -lo - 0.7), 0, 0.5, 0.55, dark);   // under the roof edge
        if (isGreenAt(o.x + nx * (hd + 1), o.z + nz * (hd + 1)) && hash2(o.x * 3 + nx, o.z * 3 + nz) % 3 !== 0) {
          const n = Math.max(1, Math.round(hw * 2 / 0.7)), off = nx * (hd + e * 2), offz = nz * (hd + e * 2);
          for (let k = 0; k < n; k++) {                          // moss at the foot of old walls, in patches
            if (hash2(o.x * 7 + k * 3.1 + nx, o.z * 5 + k * 1.7 + nz) % 5 < 2) continue;
            const u0 = -hw + hw * 2 * k / n, u1 = -hw + hw * 2 * (k + 1) / n;
            const m0 = [off + tx * u0, 0, offz + tz * u0], m1 = [off + tx * u1, 0, offz + tz * u1];
            quad(at(m0, lo), at(m1, lo), at(m1, lo + 0.55), at(m0, lo + 0.55), 0.5, 1, 0, moss);
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, groundingMat); m.name = 'grounding'; m.userData.weathered=true; m.renderOrder = 1;
      mesh.add(m); made++;
    });
    S.groundingCount = made;
    // the ground darkens softly around the foot of every wall (baked into the ground's colours: free to draw)
    const gm = S.groundMesh; if (!gm || !gm.geometry.attributes.color) return;
    const pos = gm.geometry.attributes.position, col = gm.geometry.attributes.color, R = 1.7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), gyv = pos.getY(i);
      let k = 1;
      for (const { o, y } of list) {
        const dx = Math.max(0, Math.abs(x - o.x) - o.w / 2), dz = Math.max(0, Math.abs(z - o.z) - o.d / 2);
        if (dx > R || dz > R || gyv > y + o.h || gyv < y - 1) continue;
        const d = Math.hypot(dx, dz); if (d >= R) continue;
        k = Math.min(k, 1 - 0.3 * Math.pow(1 - d / R, 1.5));
      }
      if (k < 1) col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
    }
    col.needsUpdate = true;
  }
  SQ._buildGrounding = buildGrounding;

  function buildShores() {
    const L = S.level; if (L.shore === false || !(S.waters || []).length) return;
    S.shores = { foam: [], ripples: [], reedBeds: [] };
    const gm = S.groundMesh, gp = gm && gm.geometry.attributes.position, gc = gm && gm.geometry.attributes.color;
    const inside = (W, x, z) => W.round ? Math.hypot(x - (W.minX + W.maxX) / 2, z - (W.minZ + W.maxZ) / 2) < (W.maxX - W.minX) / 2 - 0.05 : x > W.minX + 0.05 && x < W.maxX - 0.05 && z > W.minZ + 0.05 && z < W.maxZ - 0.05;
    S.waters.forEach((W) => {
      const y = W.y, o = W.mesh, old = o.material;
      // 1. the water itself: ripples that drift, and a sheen
      const tex = TEX.water();
      if (tex && old.type !== 'MeshBasicMaterial') {
        const t = tex.clone(); t.needsUpdate = true; t.repeat.set((W.maxX - W.minX) / 7, (W.maxZ - W.minZ) / 7);
        o.material = new THREE.MeshPhongMaterial({ color: old.color, emissive: old.emissive || 0x000000, transparent: old.transparent, opacity: old.opacity, specular: 0x5577aa, shininess: 45, map: t, side: old.side });
        S.shores.ripples.push(t);
      }
      // 2. wet, darker ground along the edge (and under the water)
      if (gp && gc) {
        for (let i = 0; i < gp.count; i++) {
          const x = gp.getX(i), z = gp.getZ(i);
          if (x < W.minX - 3 || x > W.maxX + 3 || z < W.minZ - 3 || z > W.maxZ + 3) continue;
          const h = gp.getY(i), d = h - y;
          if (d > 0.8 || d < -3) continue;
          const k = d < 0 ? 0.68 : 1 - 0.3 * (1 - d / 0.8);
          gc.setXYZ(i, gc.getX(i) * k, gc.getY(i) * k, gc.getZ(i) * Math.min(1, k + 0.05));
        }
        gc.needsUpdate = true;
      }
      // 3. foam: trace where the ground meets the water (marching squares) and lay a soft white strip there
      const st = 0.5, segs = [];
      for (let x = W.minX - 2; x < W.maxX + 2; x += st) for (let z = W.minZ - 2; z < W.maxZ + 2; z += st) {
        const c = [[x, z], [x + st, z], [x + st, z + st], [x, z + st]].map(([a, b]) => [a, b, terrain(a, b) - y]);
        const pts = [];
        for (let e = 0; e < 4; e++) { const p0 = c[e], p1 = c[(e + 1) % 4]; if ((p0[2] < 0) !== (p1[2] < 0)) { const t = p0[2] / (p0[2] - p1[2]); pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); } }
        if (pts.length >= 2) { const mx = (pts[0][0] + pts[1][0]) / 2, mz = (pts[0][1] + pts[1][1]) / 2; if (inside(W, mx, mz)) segs.push(pts[0], pts[1]); }
      }
      if (segs.length) {
        const pos = [], idx = [], wdt = 0.16;
        for (let i = 0; i < segs.length; i += 2) {
          const [ax, az] = segs[i], [bx, bz] = segs[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * wdt, nz = dx / l * wdt, b = pos.length / 3;
          pos.push(ax - nx, y + 0.03, az - nz, ax + nx, y + 0.03, az + nz, bx + nx, y + 0.03, bz + nz, bx - nx, y + 0.03, bz - nz);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        const fm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
        fm.renderOrder = 2; S.scene.add(fm); S.shores.foam.push(fm);
      }
      // 4. reeds on the bank and lily pads on still water (green levels, not the open sea)
      if (W.sea || !isGreenAt((W.minX + W.maxX) / 2, W.maxZ + 2)) return;
      const reeds = [], pads = [];
      for (let i = 0; i < segs.length; i += 2) {
        if (((i * 7919) % 10) > 3) continue;
        const [ax, az] = segs[i], gx = terrain(ax + 0.3, az) - terrain(ax - 0.3, az), gz = terrain(ax, az + 0.3) - terrain(ax, az - 0.3), gl = Math.hypot(gx, gz) || 1;
        const rx = ax + gx / gl * 0.4, rz = az + gz / gl * 0.4;                                // a little way up the bank
        let clear = true; for (const pl of S.platforms) if (pl.on && rx > pl.minX - 0.4 && rx < pl.maxX + 0.4 && rz > pl.minZ - 0.4 && rz < pl.maxZ + 0.4) { clear = false; break; }
        const rh = terrain(rx, rz), B = L.bounds;
        // Reeds belong to shallow banks, not steep pit walls or the outside cliff.
        const bank = Math.abs(rh - y) < 1 && Math.abs(terrain(rx + .3, rz) - terrain(rx - .3, rz)) < .8 && Math.abs(terrain(rx, rz + .3) - terrain(rx, rz - .3)) < .8;
        if (clear && bank && (!B || (rx > B.minX + .3 && rx < B.maxX - .3 && rz > B.minZ + .3 && rz < B.maxZ - .3))) { reeds.push([rx, rh, rz]); S.shores.reedBeds.push({ x: rx, y: rh, z: rz, waterY: y }); }
      }
      for (let tries = 0; pads.length < 12 && tries < 400; tries++) {
        const x = W.minX + Math.random() * (W.maxX - W.minX), z = W.minZ + Math.random() * (W.maxZ - W.minZ);
        if (!inside(W, x, z) || terrain(x, z) > y - 0.3 || terrain(x, z) < y - 2.2) continue;
        let clear = true; for (const pl of S.platforms) if (pl.on && x > pl.minX - 1 && x < pl.maxX + 1 && z > pl.minZ - 1 && z < pl.maxZ + 1) { clear = false; break; }
        if (clear) pads.push([x, z]);
      }
      if (reeds.length) {
        const n = reeds.length * 4, stem = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 1.2, 4), swayMat(new THREE.MeshLambertMaterial({ color: 0x5f7f35, emissive: 0x111a08 }), 0.18, 0.6), n);
        const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 6), swayMat(new THREE.MeshLambertMaterial({ color: 0x6b4423 }), 0.18, 0.6 + 0.42), n);
        const d = new THREE.Object3D(); let k = 0;
        reeds.forEach(([x, h, z], r) => { for (let j = 0; j < 4; j++, k++) {
          const ox = x + Math.cos(j * 1.9 + r) * 0.18, oz = z + Math.sin(j * 1.9 + r) * 0.18, sc = 0.75 + ((r * 31 + j * 17) % 10) / 20;
          d.position.set(ox, h + 0.6 * sc, oz); d.rotation.set(0, j, 0); d.scale.set(1, sc, 1); d.updateMatrix(); stem.setMatrixAt(k, d.matrix);
          d.position.set(ox, h + 1.02 * sc, oz); d.updateMatrix(); head.setMatrixAt(k, d.matrix);
        } });
        S.scene.add(stem); S.scene.add(head);
      }
      pads.forEach(([x, z], i) => {
        const pad = api.model('Lilypad', null, 0.9 + (i % 3) * 0.2) || (() => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16, 0.3, Math.PI * 2 - 0.6), mat(0x3f8a3a)); m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); return g; })();
        pad.position.set(x, y + 0.02, z); pad.rotation.y = i * 2.1; S.scene.add(pad);
        if (i % 3 === 0) { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(0xf9a8d4)); fl.position.set(x + 0.1, y + 0.1, z); fl.scale.y = 0.7; S.scene.add(fl); }
      });
    });
  }
  function buildSeaHorizon() {
    const cfg=S.level.seaHorizon;if(!cfg)return;
    const W=(S.waters||[]).filter(w=>!w.round).sort((a,b)=>(b.maxX-b.minX)*(b.maxZ-b.minZ)-(a.maxX-a.minX)*(a.maxZ-a.minZ))[0];if(!W)return;
    const source=W.mesh,side=cfg.side<0?-1:1,shore=side<0?W.maxZ:W.minZ;
    const finish=material=>{
      material.onBeforeCompile=shader=>{
        shader.uniforms.sqSeaEdge={value:new THREE.Vector2(shore,side)};
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sqSeaWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nsqSeaWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 sqSeaWorld;uniform vec2 sqSeaEdge;').replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=smoothstep(0.0,3.0,(sqSeaWorld.z-sqSeaEdge.x)*sqSeaEdge.y);');
      };
      material.customProgramCacheKey=()=> 'sq-sea-horizon-v1';material.needsUpdate=true;
    };
    const material=source.material.clone();if(material.map){material.map=material.map.clone();material.map.repeat.set(900/7,900/7);if(S.shores)S.shores.ripples.push(material.map);}
    finish(material);source.material.visible=false;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(900,900),material);mesh.rotation.x=-Math.PI/2;mesh.position.set(0,source.position.y-.015,shore+side*450);mesh.userData.seaHorizon=true;mesh.name='open-sea-horizon';S.scene.add(mesh);
    // A single continuous surface and seabed replace the visible water patch.
    // The original mesh/data remain for waves, story logic and water queries.
    const floorMat=new THREE.MeshLambertMaterial({color:0x1e3a5f,transparent:true});finish(floorMat);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(900,900),floorMat);floor.rotation.x=-Math.PI/2;floor.position.copy(mesh.position);floor.position.y=(S.level.terrain?S.level.terrain((W.minX+W.maxX)/2,(W.minZ+W.maxZ)/2):-2.2)+.003;floor.renderOrder=-1;floor.userData.seaHorizon=true;floor.name='open-sea-bed';S.scene.add(floor);S.openSea={mesh,floor,source,localBounds:W,shore,side};
  }
  function courseTheme(x, z) {
    const L = S.level;
    if (L.courseTheme) return L.courseTheme;
    if (L.town) return 'town';
    // Choose the setting of the route, rather than a river merely visible nearby.
    const steps = (S.courses || []).flat(), samples = steps.length ? steps : [{ x, z }];
    const wet = samples.filter((st) => (S.waters || []).some((w) => st.x > w.minX - 1.5 && st.x < w.maxX + 1.5 && st.z > w.minZ - 1.5 && st.z < w.maxZ + 1.5 && (L.terrain ? L.terrain(st.x, st.z) : 0) <= w.y + 0.8));
    if (wet.length > samples.length / 2) return 'water';
    return isGreenAt(x, z) ? 'green' : 'sand';
  }
  const HIDE = new THREE.MeshBasicMaterial({ visible: false });
  function themeCourses() {
    const parts = S.courseParts || []; if (!parts.length || S.level.courseTheme === 'plain') return;
    const theme = courseTheme(parts[0].st.x, parts[0].st.z);
    S.courseThemeUsed = theme;
    const CL = CLOTHS;
    parts.forEach((pt, i) => {
      const g = new THREE.Group(), M = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
      if (pt.k === 'float') {
        const mesh = pt.h.mesh, top = 0.2;                                          // local: the box is 1.8 x 0.4 x 1.8, centred
        if (theme === 'tree') {                                                      // a big branch: a limb with a flat top and leaves
          const lb = M(scaleUV(new THREE.CylinderGeometry(0.42, 0.5, 2.1, 12), 2, 2), texMat(0x6b4a2b, 'bark'), 0, -0.05, 0); lb.rotation.z = Math.PI / 2;
          M(roundedBox(1.8, 0.14, 1.6, 0.05), texMat(0x8a5a33, 'wood'), 0, top - 0.07, 0);
          [[-0.7, 0.75], [0.75, -0.7], [0.2, 0.85]].forEach(([x, z]) => { const lf = M(new THREE.SphereGeometry(0.42, 10, 8), texMat(0x3f8a3a, 'leaves'), x, top - 0.2, z); lf.scale.y = 0.6; });
        } else if (theme === 'town') {                                               // a market-stall canopy: striped cloth on a wooden frame
          const c1 = CL[i % CL.length], c2 = 0xf5f0e6;
          for (let k = 0; k < 6; k++) M(new THREE.BoxGeometry(0.3, 0.12, 1.86), charMat(k % 2 ? c2 : c1, 'cloth'), -0.75 + k * 0.3, top - 0.06, 0);
          [[-0.93, 0], [0.93, 0]].forEach(([x]) => M(new THREE.BoxGeometry(0.1, 0.16, 1.9), texMat(0x6b4423, 'wood'), x, top - 0.1, 0));
          [[0, -0.93], [0, 0.93]].forEach(([, z]) => M(new THREE.BoxGeometry(1.9, 0.16, 0.1), texMat(0x6b4423, 'wood'), 0, top - 0.1, z));
          for (let k = 0; k < 6; k++) M(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10, 1, false, 0, Math.PI), charMat(k % 2 ? c2 : c1, 'cloth'), -0.75 + k * 0.3, top - 0.2, 0.95).rotation.x = Math.PI / 2;   // scalloped edge
          if (pt.h.platform) { pt.h.platform.bouncy = 0.42; (S.bouncers = S.bouncers || []).push({ pl: pt.h.platform, g }); }   // cloth gives a little when you land
        } else if (theme === 'green') {                                              // a floating meadow island
          M(roundedBox(1.84, 0.16, 1.84, 0.06), texMat(0x4caf3e, 'ground'), 0, top - 0.08, 0);
          const lump = M(new THREE.SphereGeometry(0.95, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), texMat(0x8a5a33, 'mud'), 0, top - 0.14, 0); lump.scale.set(1, 0.7, 1);
          [[-0.5, 0.4], [0.45, -0.3], [0.1, 0.55]].forEach(([x, z]) => M(new THREE.ConeGeometry(0.06, 0.22, 4), mat(0x3f9a3a), x, top + 0.1, z));
        } else if (theme === 'water') {                                              // a raft of logs tied with rope
          for (let k = 0; k < 5; k++) { const lg = M(scaleUV(new THREE.CylinderGeometry(0.19, 0.19, 1.9, 10), 1, 2), texMat(0x7a5230, 'bark'), -0.72 + k * 0.36, top - 0.19, 0); lg.rotation.x = Math.PI / 2; }
          [-0.6, 0.6].forEach((z) => M(new THREE.BoxGeometry(1.86, 0.06, 0.08), mat(0xd6c49a), 0, top - 0.01, z));
        } else {                                                                     // a sandstone slab with a woven rug
          M(roundedBox(1.84, 0.4, 1.84, 0.08), texMat(0xcfb486, 'stone'), 0, 0, 0);
          M(new THREE.BoxGeometry(1.3, 0.02, 1.3), charMat(CL[i % CL.length], 'cloth'), 0, top + 0.01, 0);
          M(new THREE.BoxGeometry(1.0, 0.025, 1.0), charMat(0xf5f0e6, 'cloth'), 0, top + 0.012, 0);
          M(new THREE.BoxGeometry(0.7, 0.03, 0.7), charMat(CL[(i + 2) % CL.length], 'cloth'), 0, top + 0.014, 0);
        }
        mergeStatic(g, []); mesh.material = HIDE; const cap = mesh.getObjectByName('cap'); if (cap) cap.visible = false; mesh.add(g);
      } else if (pt.k === 'block') {
        const mesh = pt.h.mesh; mesh.geometry.computeBoundingBox(); const H = mesh.geometry.boundingBox.max.y * 2, top = H / 2;
        if (theme === 'tree') { M(roundedBox(1.8, H, 1.8, 0.35), texMat(0x6b4a2b, 'bark'), 0, 0, 0); M(new THREE.CylinderGeometry(0.85, 0.85, 0.03, 24), texMat(0xd6b07a, 'rings'), 0, top + 0.005, 0); }
        else if (theme === 'town') { M(roundedBox(1.8, H, 1.8, 0.06), texMat(0xd8c39c, 'brick'), 0, 0, 0); M(new THREE.BoxGeometry(2.0, 0.18, 2.0), texMat(0xece0c4, 'stone'), 0, top - 0.09, 0); M(new THREE.BoxGeometry(1.8, 0.02, 1.8), texMat(0xe6d6b4, 'paving'), 0, top + 0.002, 0); }
        else if (theme === 'green') { M(scaleUV(new THREE.CylinderGeometry(0.98, 1.08, H, 18), 3, Math.max(1, H / 1.5)), texMat(0x7a5230, 'bark'), 0, 0, 0); M(new THREE.CylinderGeometry(0.97, 0.97, 0.03, 24), texMat(0xd6b07a, 'rings'), 0, top + 0.005, 0); }
        else if (theme === 'water') { M(roundedBox(1.8, H, 1.8, 0.2), texMat(0x8a8f86, 'stone'), 0, 0, 0); M(roundedBox(1.84, 0.12, 1.84, 0.05), texMat(0x4f7a3a, 'leaves'), 0, top - 0.04, 0); }
        else { M(roundedBox(1.8, H, 1.8, 0.1), texMat(0xcfb486, 'stone'), 0, 0, 0); M(new THREE.BoxGeometry(2.04, 0.2, 2.04), texMat(0xe0c99a, 'stone'), 0, top - 0.1, 0); }
        mergeStatic(g, []); mesh.material = HIDE; const cap = mesh.getObjectByName('cap'); if (cap) cap.visible = false; mesh.add(g);
      } else if (pt.k === 'spring' && pt.sp && pt.sp.g) {                           // the red pad stays (red = bounce); its base changes
        const sg = pt.sp.g; if (sg.children[0]) sg.children[0].visible = false; if (sg.children[1]) sg.children[1].visible = false;
        const post = pt.sp.o._post; if (post) { post.material = texMat({ town: 0xd8c39c, green: 0x7a5230, tree: 0x6b4a2b, water: 0x8a8f86, sand: 0xcfb486 }[theme] || 0x8b8178, { town: 'brick', green: 'bark', tree: 'bark', water: 'stone', sand: 'stone' }[theme] || 'stone'); worldUV(post.geometry, 1.6); }
        if (theme === 'tree') { M(new THREE.CylinderGeometry(0.78, 0.86, 0.5, 16), texMat(0x6b4a2b, 'bark'), 0, -0.3, 0); }
        else if (theme === 'town') { M(new THREE.CylinderGeometry(0.72, 0.78, 0.5, 16), texMat(0x8b5a2b, 'wood'), 0, -0.3, 0); [-0.42, -0.14].forEach((y) => M(new THREE.TorusGeometry(0.76, 0.03, 6, 20), mat(0x3f3a36), 0, y, 0).rotation.x = Math.PI / 2); }
        else if (theme === 'green') { M(new THREE.CylinderGeometry(0.78, 0.86, 0.5, 16), texMat(0x7a5230, 'bark'), 0, -0.3, 0); }
        else if (theme === 'water') { const r = M(new THREE.DodecahedronGeometry(0.85, 1), texMat(0x8a8f86, 'stone'), 0, -0.5, 0); r.scale.set(1, 0.55, 1); }
        else { M(scaleUV(new THREE.CylinderGeometry(0.8, 0.7, 0.5, 18), 3, 1), texMat(0xc8a165, 'weave'), 0, -0.3, 0); }
        mergeStatic(g, []); sg.add(g);
      }
    });
  }

  // ---- Jars & baskets: bump to tip over, 2 leaves spill out ----
  function makeJar(x, z, kind) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    if (kind === 'basket') {
      const b = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 16), 3, 1), texMat(0xb08850, 'weave')); b.position.y = 0.3; body.add(b);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), mat(0x8a6a3a)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; body.add(rim);
      const bread = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(0xe0b070)); bread.scale.y = 0.5; bread.position.y = 0.6; body.add(bread);
    } else {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 14), texMat(0xc2703d, 'clay')); b.scale.y = 1.15; b.position.y = 0.42; body.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.26, 10), mat(0xa85d30)); neck.position.y = 0.9; body.add(neck);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12), mat(0xa85d30)); lip.rotation.x = Math.PI / 2; lip.position.y = 1.03; body.add(lip);
    }
    const y = groundAt(x, z);
    g.position.set(x, y, z); S.scene.add(g);
    const j0blob = groundBlob(x, z, 0.6, y);
    const inside = api.leaves([[x, z, y + 1], [x, z, y + 1]]);
    inside.forEach((lf) => { lf.hidden = true; lf.mesh.visible = false; });
    const j = { mesh: g, body, x, z, y, kind, tipped: false, t: 0, inside, blob: j0blob };
    S.jars.push(j);
    return j;
  }
  function tipJar(j, p) {
    j.tipped = true; j.t = 0;
    const dx = j.x - p.pos.x, dz = j.z - p.pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    j.mesh.rotation.y = Math.atan2(ux, uz);
    Audio.sfx('pop'); spawnPuff(j.x, j.y + 0.4, j.z, j.kind === 'basket' ? 0xe0c48a : 0xd9a07a, 6);
    j.inside.forEach((lf, k) => {                                     // spill to either side, a little ahead
      const sd = k ? 1 : -1;
      lf.x = j.x + ux * 1.2 - uz * 0.8 * sd; lf.z = j.z + uz * 1.2 + ux * 0.8 * sd;
      lf.y = groundAt(lf.x, lf.z, j.y + 0.6) + 1.0;
      lf.mesh.position.set(lf.x, lf.y, lf.z); lf.hidden = false; lf.mesh.visible = true; lf.popT = 0.3;
    });
  }
  function updateJars(dt) {
    const act = S.players.filter((q) => q.joined && !q.bubble);
    for (const j of S.jars) {
      if (j.tipped) { if (j.t < 1) { j.t = Math.min(1, j.t + dt * 4); j.body.rotation.x = j.t * 1.45; j.body.position.y = Math.sin(j.t * Math.PI) * 0.15; } continue; }
      for (const p of act) if (Math.hypot(p.pos.x - j.x, p.pos.z - j.z) < 0.95 && Math.abs(p.pos.y - j.y) < 1.5) { tipJar(j, p); break; }
    }
    for (const lf of S.leaves) if (lf.popT > 0) { lf.popT = Math.max(0, lf.popT - dt); lf.mesh.scale.setScalar(1 - lf.popT * 2.5); }
  }

  // ---- Guides placed by the engine: a short leaf trail from the start toward the first goal, and a few jars
  //      near the places where the family gathers (zones, things to use). Levels opt out with trails:false / props:false.
  function clearSpot(x, z, near) {
    const B = S.level.bounds;                                            // never outside the level's edges (out of reach)
    if (B && (x < B.minX + 1.5 || x > B.maxX - 1.5 || z < B.minZ + 1.5 || z > B.maxZ - 1.5)) return false;
    const t = terrain(x, z), gi = groundInfo(x, z);
    if (gi.pl && gi.h > t + 0.3) return false;                        // on or inside a building / platform
    if (S.waterY - t > 0.2) return false;
    for (const h of S.hazards) if (h.on !== false && inShape(h, x, z)) return false;
    for (const m of S.muds) if (inShape(m, x, z)) return false;
    for (const pl of S.platforms) if (pl.on && x > pl.minX - 0.8 && x < pl.maxX + 0.8 && z > pl.minZ - 0.8 && z < pl.maxZ + 0.8) return false;
    for (const q of near || []) if (Math.hypot(q[0] - x, q[1] - z) < q[2]) return false;
    return true;
  }
  function autoGuides() {
    const L = S.level;
    if (L.solemn) return;
    const sp = L.spawn || [0, 0], taken = [];
    S.interactables.forEach((it) => taken.push([it.x, it.z, 2.2]));
    S.leaves.forEach((lf) => taken.push([lf.x, lf.z, 1.2]));
    S.followers.forEach((f) => taken.push([f.pos.x, f.pos.z, 1.5]));
    if (L.trails !== false && L.objective) {
      let obj = null; try { obj = L.objective(api); } catch (e) { obj = null; }
      if (obj) {
        const dx = obj[0] - sp[0], dz = obj[2] - sp[1], d = Math.hypot(dx, dz), pts = [];
        let prevH = terrain(sp[0], sp[1]);
        for (let s2 = 3; s2 < Math.min(d - 2, 3 + 2.2 * 6); s2 += 2.2) {
          const x = sp[0] + dx / d * s2, z = sp[1] + dz / d * s2, h = terrain(x, z);
          if (Math.abs(h - prevH) > 0.8 || !clearSpot(x, z, taken)) break;
          pts.push([x, z]); prevH = h;
        }
        if (pts.length >= 2) { api.leaves(pts); pts.forEach((q) => taken.push([q[0], q[1], 1.2])); }
      }
    }
    autoTeamStone(taken);
    if (L.props === false) return;
    const spots = S.zones.map((zn) => [zn.x, zn.z, zn.r + 1.6]).concat(S.interactables.filter((it) => !it.item).map((it) => [it.x, it.z, 2.6]));
    let n = 0;
    S.zones.forEach((zn) => taken.push([zn.x, zn.z, zn.r + 0.8]));
    taken.push([sp[0], sp[1], 2.5]);
    for (let k = 0; k < spots.length && n < 6; k++) {
      const [cx, cz, r] = spots[k];
      for (let a = 0; a < 6; a++) {
        const ang = k * 2.4 + a * 1.05, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        if (!clearSpot(x, z, taken)) continue;
        makeJar(x, z, n % 2 ? 'basket' : 'jar'); taken.push([x, z, 3]); n++; break;
      }
    }
  }

  // ---- Role spots: a glowing ring in a character's colour where only that character can help (role-specific) ----
  const ROLE_BADGE = { Shepherd: '🐑', Fisherman: '🎣', Scribe: '📜', Builder: '🔨' };
  function roleBadge(role) {
    if (/jsdom/.test(navigator.userAgent || '')) return null;          // (tests: no canvas drawing)
    try {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext && c.getContext('2d');
      if (!x || typeof THREE.CanvasTexture !== 'function') return null;
      x.fillStyle = role.css; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
      x.font = '34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ROLE_BADGE[role.name] || '★', 32, 35);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.scale.set(1.2, 1.2, 1.2); return sp;
    } catch (e) { return null; }
  }
  function neededRole(it, act) {
    if (!it.alive) return null;
    if (it.item) return it.item.heavy && !it.item.holder && !it.item.delivered && it.item.mesh.visible ? 'Builder' : null;
    if (!it.can) return null;
    let need = null, other = false;
    for (const p of act) {
      let r; try { r = it.can(p); } catch (e) { r = null; }
      const m = typeof r === 'string' && r.match(/\b(Builder|Scribe|Fisherman|Shepherd)\b/);
      if (m && m[1] !== p.role.name) need = m[1];
      if (p.role.name !== it.needRole) other = true;
    }
    if (need) it.needRole = need;
    else if (other) it.needRole = null;      // someone else asked and nothing is needed now (if only that character plays, keep showing it)
    return it.needRole || null;
  }
  function updateRoleSpots(dt) {
    S.roleT = (S.roleT || 0) - dt;
    const probe = S.roleT <= 0; if (probe) S.roleT = 0.5;
    const act = S.players.filter((q) => q.joined && !q.bubble);
    for (const it of S.interactables) {
      if (probe) it.spotRole = act.length ? neededRole(it, act) : null;
      const role = it.spotRole && ROLES.find((r) => r.name === it.spotRole);
      if (!role) { if (it.spot) it.spot.visible = false; continue; }
      if (!it.spot || it.spot.userData.role !== role.name) {
        if (it.spot) S.scene.remove(it.spot);
        const g = new THREE.Group(); g.userData.role = role.name;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 28), new THREE.MeshBasicMaterial({ color: role.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.name = 'ring'; g.add(ring);
        const b = roleBadge(role); if (b) { b.position.y = 2.6; b.name = 'badge'; g.add(b); }
        it.spot = g; S.scene.add(g);
      }
      const at = it.item ? it.item.mesh.position : null;
      it.spot.position.set(at ? at.x : it.x, (at ? it.item.y : it.y) + 0.07, at ? at.z : it.z);
      it.spot.visible = true;
      const k = 1 + Math.sin(S.time * 4) * 0.08; it.spot.getObjectByName('ring').scale.set(k, k, k);
      const bd = it.spot.getObjectByName('badge'); if (bd) bd.position.y = 2.6 + Math.sin(S.time * 3) * 0.12;
    }
  }

  // ---- Team pads: "Two are better than one" (Ecclesiastes 4:9). Two players stand on the two pads together.
  //      Playing alone, one pad is enough (nobody is ever stuck). ----
  const TWO = { text: 'Two are better than one; because they have a good reward for their labour.', ref: 'Ecclesiastes 4:9' };
  function makeTeamPads(o) {
    const t = { pads: o.pads.map((q) => ({ x: q[0], z: q[1], y: groundAt(q[0], q[1]), on: null })), open: false, hold: 0, onOpen: o.onOpen, told: false };
    t.pads.forEach((pd) => {
      pd.mat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
      pd.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 24), pd.mat); pd.ring.rotation.x = -Math.PI / 2;
      pd.ring.position.set(pd.x, pd.y + 0.06, pd.z); S.scene.add(pd.ring);
      const hand = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.5 }));
      hand.rotation.x = -Math.PI / 2; hand.position.set(pd.x, pd.y + 0.05, pd.z); S.scene.add(hand); pd.fill = hand;
    });
    S.teamPads.push(t);
    return t;
  }
  function updateTeamPads(dt) {
    const act = S.players.filter((q) => q.joined && !q.bubble);
    for (const t of S.teamPads) {
      if (t.open) continue;
      const used = new Set();
      t.pads.forEach((pd) => {
        pd.on = act.find((q) => !used.has(q) && Math.hypot(q.pos.x - pd.x, q.pos.z - pd.z) < 1.0 && Math.abs(q.pos.y - pd.y) < 1.2) || null;
        if (pd.on) used.add(pd.on);
        pd.mat.color.setHex(pd.on ? 0x22c55e : 0xf97316);
      });
      const n = t.pads.filter((pd) => pd.on).length;
      const ready = n >= t.pads.length || (act.length === 1 && n >= 1);
      if (n && !ready && !t.told) { t.told = true; toast('🤝 Two are better than one! A friend stands on the other ring.', 2600); }
      t.hold = ready ? t.hold + dt : 0;
      t.pads.forEach((pd) => pd.fill.scale.setScalar(0.3 + Math.min(1, t.hold / 0.8) * 0.7));
      if (t.hold >= 0.8) {
        t.open = true; Audio.sfx('fanfare');
        const who = t.pads.map((pd) => pd.on).filter(Boolean);
        who.forEach((q) => addServant(q, 3));
        t.pads.forEach((pd) => { pd.ring.visible = false; pd.fill.visible = false; spawnPuff(pd.x, pd.y + 0.3, pd.z, 0x4ade80, 6); });
        if (t.onOpen) t.onOpen(who);
        verse(who.length > 1 ? '🤝 Together you did it!' : '💪 You did it!', TWO.text, TWO.ref);
      }
    }
  }
  // The engine puts one "heavy stone lid" in each level: two pads either side; lifted together, 5 leaves spill out.
  function autoTeamStone(taken) {
    const L = S.level;
    if (L.solemn || L.teamPads === false) return;
    const sp = L.spawn || [0, 0];
    let toward = 0; try { const o = L.objective && L.objective(api); if (o) toward = Math.atan2(o[2] - sp[1], o[0] - sp[0]); } catch (e) { /* no goal yet */ }
    const sides = [Math.PI / 2, -Math.PI / 2, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3, 0.35, -0.35];   // off to the side of the way ahead, not in the opening view
    for (let r = 9; r <= 18; r += 3) for (const sd of sides) {
      const ang = toward + sd, x = sp[0] + Math.cos(ang) * r, z = sp[1] + Math.sin(ang) * r;
      const pads = [[x - 1.9, z], [x + 1.9, z]];
      if (![[x, z], [x, z + 2.4], [x - 1.5, z + 0.9], [x + 1.5, z + 0.9]].concat(pads).every((q) => clearSpot(q[0], q[1], taken))) continue;   // (the leaves spill round it too)
      if (Math.abs(terrain(pads[0][0], z) - terrain(pads[1][0], z)) > 0.5) continue;
      const y = groundAt(x, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.3, 16), mat(0x8b8178)); base.position.set(x, y + 0.15, z); S.scene.add(base);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 16), mat(0xb8b0a2)); lid.position.set(x, y + 0.42, z); S.scene.add(lid);
      const hidden = api.leaves([0, 1, 2, 3, 4].map((k) => [x + Math.cos(k * 1.257) * 1.4, z + 0.9 + Math.sin(k * 1.257) * 1.4]));
      hidden.forEach((lf) => { lf.hidden = true; lf.mesh.visible = false; });
      const t = makeTeamPads({ pads, onOpen: () => {
        lid.position.set(x, y + 0.2, z + 1.4); lid.rotation.x = 0.35;
        hidden.forEach((lf) => { lf.hidden = false; lf.mesh.visible = true; lf.popT = 0.3; });
      } });
      t.stone = { x, z, lid, leaves: hidden };
      taken.push([x, z, 4.5]);
      return;
    }
  }

  // ---- Cheer: LT on gamepads; Q on keys when there's no armor to share. A happy hop and a word of encouragement. ----
  const CHEERS = ['🙌 Well done!', '👏 Great job!', '💛 Thank you!', '🎉 Hooray!', '😊 You can do it!'];
  function cheer(p) {
    if (p.cheerT > 0.4) return;
    p.cheerT = 1.6; p.cheerN = (p.cheerN || 0) + 1; p.happyT = 1.2;
    if (p.onGround && !p.holding && !p.carrying) { p.vel.y = 7; p.onGround = false; p.squash = 1.2; }
    if (!p.labelCheer) { p.labelCheer = el('div', { class: 'sq-cheer' }); p.label.insertBefore(p.labelCheer, p.label.firstChild); }
    p.labelCheer.textContent = CHEERS[(p.slot + p.cheerN) % CHEERS.length]; p.labelCheer.style.display = '';
    Audio.sfx('cheer');
    const mates = S.players.filter((q) => q !== p && q.joined && !q.bubble && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 7);
    mates.forEach((q) => { q.squash = 1.18; spawnPuff(q.pos.x, q.pos.y + 1.8, q.pos.z, 0xfde047, 5); });
    if (mates.length && S.time - (p.cheerPtsAt || -99) > 12 && (p.cheerPts || 0) < 5) {
      p.cheerPtsAt = S.time; p.cheerPts = (p.cheerPts || 0) + 1;
      addServant(p, 1, 'for cheering on P' + (mates[0].slot + 1) + '!');
    }
  }

  // ---- A light unto my path (Psalm 119:105): fall in the same spot 3 times and a glowing walkway
  //      appears across that gap for 25 seconds. The level stays the same for everyone else. ----
  const LAMP = { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' };
  S.falls = {};
  function noteFall(p) {
    const sx = p.lastSafe.x, sz = p.lastSafe.z, key = Math.round(sx / 4) + ',' + Math.round(sz / 4);
    const f = S.falls[key] = S.falls[key] || { n: 0 };
    f.n++; f.fx = p.pos.x; f.fz = p.pos.z;
    if (f.n >= 3 && !f.lit) { if (lightPath(p.lastSafe.clone(), f.fx, f.fz)) { f.lit = true; f.n = 0; setTimeout(() => { f.lit = false; }, 26000); } }
  }
  function lightPath(safe, fx, fz) {
    let dx = fx - safe.x, dz = fz - safe.z; const d0 = Math.hypot(dx, dz);
    if (d0 < 0.3) return false;
    if (Math.abs(dx) > Math.abs(dz)) { dx = Math.sign(dx); dz = 0; } else { dz = Math.sign(dz); dx = 0; }   // straight along x or z, so the walkway is exactly where it glows
    const wet = (x, z) => S.waterY - terrain(x, z) > 0.4 || S.hazards.some((h) => h.on !== false && inShape(h, x, z));
    let end = 0;
    for (let s2 = Math.max(1, d0 * 0.5); s2 <= 10; s2 += 0.5) {
      const x = safe.x + dx * s2, z = safe.z + dz * s2, g = groundAt(x, z, safe.y + 0.6);
      if (s2 > d0 && Math.abs(g - safe.y) < 0.7 && !wet(x, z)) { end = s2 + 1; break; }
    }
    if (!end) return false;
    const cx = safe.x + dx * end / 2, cz = safe.z + dz * end / 2, top = safe.y;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, end), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.55, depthWrite: false }));
    box.position.set(cx, top - 0.08, cz); box.rotation.y = Math.atan2(dx, dz); S.scene.add(box);
    const ext = dx ? end / 2 : 0.9, ezt = dz ? end / 2 : 0.9;
    const pl = addPlatform(cx - ext, cx + ext, cz - ezt, cz + ezt, top - 0.15, top);
    pl.light = { box, t: 25, dx, dz, cx, cz, end };
    S.lights = S.lights || []; S.lights.push(pl);
    Audio.sfx('fanfare'); spawnPuff(cx, top + 0.5, cz, 0xfde68a, 14);
    toast('💡 “' + LAMP.text + '” ' + LAMP.ref, 4200);
    return true;
  }
  function updateLights(dt) {
    for (const pl of S.lights || []) {
      if (!pl.on) continue;
      pl.light.t -= dt; pl.light.box.material.opacity = pl.light.t < 4 ? 0.14 * pl.light.t : 0.45 + Math.sin(S.time * 4) * 0.1;
      if (pl.light.t <= 0) { pl.on = false; pl.light.box.visible = false; }
    }
  }

  // ---- A friendly world: townspeople turn and hop when the family walks by; animals look up. ----
  S.people = [];
  function updatePeople(dt) {
    const wp = new THREE.Vector3();
    for (const r of S.people) {                                   // everyone stands in a soft shadow
      if (!r.g.parent) { if (r.blob) r.blob.visible = false; continue; }
      if (!r.blob) r.blob = groundBlob(0, 0, 0.55);
      r.g.getWorldPosition(wp); r.blob.visible = r.g.visible; r.wx = wp.x; r.wy = wp.y; r.wz = wp.z;
      r.blob.position.set(wp.x, groundAt(wp.x, wp.z, wp.y + 0.5) + 0.025, wp.z);
      if (r.eyes === undefined) r.eyes = r.g.getObjectByName('eyes') || null;     // blinking, every few seconds
      if (r.eyes) {
        r.blinkT = (r.blinkT === undefined ? 1 + (S.people.indexOf(r) % 7) * 0.6 : r.blinkT) - dt;
        if (r.blinkT < 0) r.blinkT = 2.5 + vrand() * 3.5;
        const asleep = Math.abs(r.g.rotation.z) > 1 || r.g.rotation.x > 0.25;         // (someone lying down or nodding off keeps them shut)
        r.eyes.scale.y = asleep || r.blinkT < 0.12 ? 0.15 : 1;
      }
    }
    for (const f of S.followers) {
      if (!f.pos || !f.mesh) continue;
      if (!f.blob) f.blob = groundBlob(0, 0, 0.6);
      f.blob.visible = f.mesh.visible && f.mesh.parent === S.scene;
      f.blob.position.set(f.pos.x, groundAt(f.pos.x, f.pos.z, f.pos.y + 0.5) + 0.025, f.pos.z);
    }
    if (S.level.reactive === false || S.level.solemn) return;
    const act = S.players.filter((q) => q.joined && !q.bubble);
    const v = new THREE.Vector3();
    for (const r of S.people) {
      const g = r.g;
      if (r.moved || !g.parent || !g.visible || Math.abs(g.rotation.x) + Math.abs(g.rotation.z) > 0.3) continue;   // (someone lying down or leaning stays put)
      if (r.bx === undefined) { r.bx = g.position.x; r.by = g.position.y; r.bz = g.position.z; r.ry = g.rotation.y; r.hop = 0; continue; }
      if (Math.abs(g.position.x - r.bx) > 0.001 || Math.abs(g.position.z - r.bz) > 0.001 || Math.abs(g.position.y - r.by - r.hop) > 0.001) { r.moved = true; continue; }   // the level moves this one: leave it be
      g.getWorldPosition(v);
      let near = null, nd = 4.5;
      for (const p of act) { const d = Math.hypot(p.pos.x - v.x, p.pos.z - v.z); if (d < nd) { nd = d; near = p; } }
      if (near && !r.greeted) { r.greeted = true; r.hopT = 0.5; }
      if (!near && r.greeted && Math.hypot(act[0] ? act[0].pos.x - v.x : 99, act[0] ? act[0].pos.z - v.z : 99) > 8) r.greeted = false;
      const want = near ? Math.atan2(near.pos.x - v.x, near.pos.z - v.z) : r.ry;
      let d = want - g.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * Math.min(1, dt * 4);
      r.hopT = Math.max(0, (r.hopT || 0) - dt);
      r.hop = r.hopT > 0 ? Math.sin((0.5 - r.hopT) / 0.5 * Math.PI) * 0.3 : 0;
      g.position.y = r.by + r.hop;
    }
    // idle animals: a little hop when someone comes close (not too often)
    for (const f of S.followers) {
      if (f.state !== 'idle' || !f.pos) continue;
      if (S.time - (f.lookAt || -99) < 8) continue;
      if (act.some((p) => Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < 3.5)) { f.lookAt = S.time; f.joyT = S.time; }
    }
  }

  // Soft bump: walking into an animal or a townsperson nudges you apart (they shuffle aside, you slow a
  // little) but never blocks the way: the push per frame is smaller than a step, so you can always get by.
  function softBump(p) {
    if (p.carrying || p.carriedBy) return;
    const bump = (x, z, r, y, cap, slide) => {
      if (Math.abs(p.pos.y - y) > 1.4) return null;
      const dx = p.pos.x - x, dz = p.pos.z - z, d = Math.hypot(dx, dz), min = T.playerRadius + r;
      if (d >= min || d < 1e-4) return null;
      const k = Math.min(min - d, cap) / d; p.pos.x += dx * k; p.pos.z += dz * k;
      const nx = dx / d, nz = dz / d, sd = (p.vel.x * nz - p.vel.z * nx) >= 0 ? 1 : -1, side = slide * (1 - d / min);   // and slide around them
      p.pos.x += nz * sd * side; p.pos.z -= nx * sd * side;
      return [nx, nz];
    };
    for (const f of S.followers) {
      if (!f.pos || !f.mesh || !f.mesh.visible || f.mesh.parent !== S.scene || f.carriedBy || f.state === 'parked' || f.state === 'delivered') continue;   // (safely home: leave them be)
      const n = bump(f.pos.x, f.pos.z, 0.45, f.pos.y, 0.06, 0.07);
      if (n) { f.pos.x -= n[0] * 0.05; f.pos.z -= n[1] * 0.05; }   // the animal shuffles aside
    }
    if (p.armor.breastplate) return;                              // standing firm: people don't move you
    for (const r of S.people) if (r.wx !== undefined && !r.moved && r.g.visible && r.g.parent) bump(r.wx, r.wz, 0.4, r.wy, 0.04, 0.035);   // (crowds the level moves push in their own way)
  }

  // Landing magnet: falling just short of a platform (within T.magnet of its edge, and not pushing away),
  // you drift gently onto it. Only for platforms below your feet and not far below.
  function landingMagnet(p, inp, dt) {
    const x = p.pos.x, z = p.pos.z, under = groundInfo(x, z, p.pos.y);
    if (under.pl) return;                                           // already over a platform
    let best = null, bd = T.magnet, bx = 0, bz = 0;
    for (const pl of S.platforms) {
      if (!pl.on || pl.top > p.pos.y - 0.05 || p.pos.y - pl.top > 4 || pl.top < under.h + 0.3) continue;
      const cx = Math.max(pl.minX + 0.3, Math.min(x, pl.maxX - 0.3)), cz = Math.max(pl.minZ + 0.3, Math.min(z, pl.maxZ - 0.3));
      const ex = Math.max(pl.minX - x, 0, x - pl.maxX), ez = Math.max(pl.minZ - z, 0, z - pl.maxZ);
      const d = Math.hypot(ex, ez);
      if (!(d > 0 && d < bd)) continue;
      const dx = cx - x, dz = cz - z, n = Math.hypot(dx, dz) || 1;
      if (inp.mx * dx / n + inp.mz * dz / n < -0.2) continue;       // pushing away from this one: you meant to miss it
      bd = d; best = pl; bx = dx / n; bz = dz / n;
    }
    if (!best) return;
    const toward = p.vel.x * bx + p.vel.z * bz;
    if (toward < 5) { const a = Math.min(5 - toward, 30 * dt); p.vel.x += bx * a; p.vel.z += bz * a; }
  }

  function addPlatform(minX, maxX, minZ, maxZ, bottom, top) {
    const pl = { minX, maxX, minZ, maxZ, bottom, top, on: true };
    S.platforms.push(pl);
    return pl;
  }

  // push a circle (player) out of solid sides
  function resolveSides(pos, r, footY) {
    for (const pl of S.platforms) {
      if (!pl.on) continue;
      if (footY >= pl.top - T.stepUp || footY + 1.8 <= pl.bottom) continue;
      const cx = Math.max(pl.minX, Math.min(pos.x, pl.maxX));
      const cz = Math.max(pl.minZ, Math.min(pos.z, pl.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: exit by shortest side
        const opts = [[pos.x - pl.minX, -1, 0], [pl.maxX - pos.x, 1, 0], [pos.z - pl.minZ, 0, -1], [pl.maxZ - pos.z, 0, 1]];
        opts.sort((a, b) => a[0] - b[0]);
        const o = opts[0];
        if (o[1]) pos.x = o[1] < 0 ? pl.minX - r : pl.maxX + r;
        else pos.z = o[2] < 0 ? pl.minZ - r : pl.maxZ + r;
      }
    }
    for (const c of S.circles) {
      if (!c.on) continue;
      if (footY >= c.top - T.stepUp) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = r + c.r;
      if (d < min && d > 1e-4) { pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
    }
    const B = S.level.bounds;
    if (B) {
      pos.x = Math.max(B.minX, Math.min(B.maxX, pos.x));
      pos.z = Math.max(B.minZ, Math.min(B.maxZ, pos.z));
    }
  }

  // Steep hillsides are walls: nobody walks or jumps up ground steeper than about 48 degrees (T.maxSlope,
  // rise over run). You slide along the hill instead, and anyone standing on a steep bit slides back down.
  // Gentle slopes and anything standing on a platform are not affected. LEVEL.climbHills: true turns it off.
  function slopeAt(x, z) {
    const e = 0.4;
    return Math.hypot(terrain(x + e, z) - terrain(x - e, z), terrain(x, z + e) - terrain(x, z - e)) / (2 * e);
  }
  // a hill wall: steep here AND it keeps climbing (over 3.2 m in the next 3 m). A short steep bank, like a
  // stream bank, a shore or a ditch edge, is fine.
  // (looking ahead, the ground past the level's edge counts as the edge itself: nobody can go there, and the
  //  island cliff beyond must not make a hill at the edge look climbable)
  function tIn(x, z) { const B = S.level.bounds; if (B) { x = Math.max(B.minX, Math.min(B.maxX, x)); z = Math.max(B.minZ, Math.min(B.maxZ, z)); } return terrain(x, z); }
  function hillWall(x, z) {
    if (slopeAt(x, z) <= T.maxSlope) return false;
    const e = 0.4, gx = tIn(x + e, z) - tIn(x - e, z), gz = tIn(x, z + e) - tIn(x, z - e), L = Math.hypot(gx, gz) || 1;
    return tIn(x + gx / L * 3, z + gz / L * 3) - tIn(x, z) > 3.2 || (tIn(x + gx / L * 3, z + gz / L * 3) === tIn(x + gx / L * 0.8, z + gz / L * 0.8) && tIn(x + gx / L * 0.8, z + gz / L * 0.8) - tIn(x, z) > 0.9);
  }
  // the same test along one direction of travel: walking across a slope, or out of a dip the easy way, is fine
  function wallAlong(x, z, ux, uz) {
    const e = 0.4;
    if ((tIn(x + ux * e, z + uz * e) - tIn(x - ux * e, z - uz * e)) / (2 * e) <= T.maxSlope) return false;
    const far = tIn(x + ux * 3, z + uz * 3), near = tIn(x + ux * 0.8, z + uz * 0.8);
    return far - tIn(x, z) > 3.2 || (far === near && near - tIn(x, z) > 0.9);   // (a steep slope that runs into the edge is a wall too)
  }
  SQ._wallAlong = (x, z, ux, uz) => wallAlong(x, z, ux, uz);
  function steepHill(p, ox, oz, prevY, dt) {
    if (S.level.climbHills) return;
    const tooSteep = (x, z) => {                                       // moving from (ox, oz) to here climbs a hill wall?
      const dx = x - ox, dz = z - oz, L = Math.hypot(dx, dz); if (L < 1e-5) return false;
      return terrain(x, z) > prevY + 0.02 && wallAlong(x, z, dx / L, dz / L) && !groundInfo(x, z, prevY + T.stepUp).pl;
    };
    if (tooSteep(p.pos.x, p.pos.z)) {
      p.wallT = S.time;                                                // (remember: pushing at a hill wall just now)
      const nx = p.pos.x, nz = p.pos.z;
      if (!tooSteep(nx, oz)) { p.pos.z = oz; p.vel.z = 0; }           // slide along the hill
      else if (!tooSteep(ox, nz)) { p.pos.x = ox; p.vel.x = 0; }
      else { p.pos.x = ox; p.pos.z = oz; p.vel.x = 0; p.vel.z = 0; }
    }
    if (p.onGround && !p.standingOn && S.time - (p.wallT || -99) < 1.5 && hillWall(p.pos.x, p.pos.z)) {   // hopped up onto a hill wall: slide back down
      p.wallT = S.time;
      const e = 0.4, gx = terrain(p.pos.x + e, p.pos.z) - terrain(p.pos.x - e, p.pos.z), gz = terrain(p.pos.x, p.pos.z + e) - terrain(p.pos.x, p.pos.z - e);
      const L = Math.hypot(gx, gz) || 1;
      p.pos.x -= gx / L * 6 * dt; p.pos.z -= gz / L * 6 * dt;
    }
  }
  SQ._hillWall = (x, z) => hillWall(x, z);
  SQ._slopeAt = (x, z) => slopeAt(x, z);

  SQ._inShape = (s, x, z) => inShape(s, x, z);
  // Where a leaf on the way rests: on the ground, or on a deck, plank or bridge over it (even one the level
  // shows later). Over a gap above water or a pit, it floats at jumping height between the platforms either
  // side, never down where it can't be reached.
  function leafRestY(x, z) {
    let y = groundAt(x, z), covered = false;
    for (const pl of S.platforms) if (x >= pl.minX && x <= pl.maxX && z >= pl.minZ && z <= pl.maxZ && pl.top > y && pl.top - y < 4) { y = pl.top; covered = true; }
    if (covered) return y;
    const wet = S.hazards.some((h) => h.on !== false && h.maxY !== undefined && inShape(h, x, z) && y <= h.maxY + 0.05);
    if (!wet) return y;
    let best = -Infinity;
    for (const pl of S.platforms) {
      const dx = Math.max(pl.minX - x, 0, x - pl.maxX), dz = Math.max(pl.minZ - z, 0, z - pl.maxZ);
      if (Math.hypot(dx, dz) < 2.6 && pl.top > y) best = Math.max(best, pl.top);
    }
    return best > -Infinity ? best + 0.6 : y;
  }
  function inShape(s, x, z) {
    if (s.r !== undefined) return Math.hypot(x - s.x, z - s.z) <= s.r;
    return Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2;
  }

  /* -------------------------------------------------------------------
   * 7. MESH BUILDERS (players, animals, props)
   * ----------------------------------------------------------------- */
  // Outfits earned with stars (chosen in Family settings): plain clothes of the time, nothing magic
  const OUTFITS = [
    { id: 'plain', name: 'Plain robe', icon: '👕', stars: 0 },
    { id: 'garland', name: 'Flower garland', icon: '🌸', stars: 3 },
    { id: 'tassels', name: 'Blue tassels on the hem', icon: '🧵', stars: 8 },
    { id: 'sash', name: 'Golden sash', icon: '✨', stars: 15 },
    { id: 'cloak', name: 'Travel cloak', icon: '🧥', stars: 25 }
  ];
  SQ.OUTFITS = OUTFITS;
  function totalStars() { try { const a = loadProgress(); return Object.values(a.levels || {}).reduce((t, l) => t + (l.stars || 0), 0); } catch (e) { return 0; } }
  function currentOutfit() {
    const id = setting('outfit'), o = OUTFITS.find((x) => x.id === id);
    return o && totalStars() >= o.stars ? o.id : 'plain';
  }
  function addOutfit(body, role, id, profile) {
    if (id === 'garland') {
      const cols = [0xf9a8d4, 0xffffff, 0xfde047];
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, f = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(cols[k % 3])); f.position.set(Math.sin(a) * 0.41, 1.22 - Math.max(0, Math.cos(a)) * 0.05, Math.cos(a) * 0.41); body.add(f); }
    } else if (id === 'tassels') {
      const hem = new THREE.Mesh(new THREE.TorusGeometry(profile[1]-.01, 0.045, 6, 24), mat(0xe8d9a8)); hem.rotation.x = Math.PI / 2; hem.position.y = profile[3]-profile[2]/2+.1; body.add(hem);
      [0.6, 2.2, 3.8, 5.4].forEach((a) => { const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), mat(0x1e40af)); t.rotation.x = Math.PI; t.position.set(Math.sin(a)*(profile[1]+.01),profile[3]-profile[2]/2+.08,Math.cos(a)*(profile[1]+.01)); body.add(t); });
    } else if (id === 'sash') {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.0, 0.05), mat(0xfacc15, { emissive: 0x6b4f00 })); sash.position.set(0, 0.86, 0.47); sash.rotation.set(-0.3, 0, 0.7); body.add(sash);
    } else if (id === 'cloak') {
      const c = new THREE.Color(role.color).multiplyScalar(0.6).getHex();
      const cloak = new THREE.Mesh(new THREE.CylinderGeometry(profile[0]+.08,profile[1]+.08,1.1,20,1,true,Math.PI*.6,Math.PI*.8), mat(c, { side: THREE.DoubleSide })); cloak.position.y = 0.68; body.add(cloak);
    }
  }
  let playerSkinCache;
  function playerSkinMaterial() {
    if(!playerSkinCache)playerSkinCache=new THREE.MeshPhongMaterial({color:0xf1c9a0,specular:0x17120e,shininess:9,emissive:0x19130d});
    return playerSkinCache;
  }
  function buildPlayerMesh(role) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const feet=[],arms=[],hands=[];
    const skin=playerSkinMaterial();
    g.add(body);
    // Readable role profiles, including at low quality. Physics keeps its shared capsule.
    const profiles={shepherd:[.4,.64,1.25,.62],fisherman:[.4,.55,1.05,.73],scribe:[.33,.49,1.28,.64],builder:[.49,.65,1.2,.64],apostle:[.39,.58,1.25,.62]};
    const profile=profiles[role.id]||profiles.shepherd;
    const robeGeometry=new THREE.CylinderGeometry(profile[0],profile[1],profile[2],28,4),rp=robeGeometry.attributes.position;
    for(let i=0;i<rp.count;i++){const fall=.5-rp.getY(i)/profile[2],fold=1+Math.cos(Math.atan2(rp.getZ(i),rp.getX(i))*12)*.022*fall;rp.setX(i,rp.getX(i)*fold);rp.setZ(i,rp.getZ(i)*fold);}robeGeometry.computeVertexNormals();
    const robe = new THREE.Mesh(robeGeometry, charMat(role.color, 'cloth'));
    robe.position.y = profile[3]; robe.castShadow = true; body.add(robe);
    const hemC = new THREE.Color(role.color).multiplyScalar(0.72).getHex();
    const hem = new THREE.Mesh(new THREE.TorusGeometry(profile[1]-.01, 0.035, 6, 28), charMat(hemC)); hem.rotation.x = Math.PI / 2; hem.position.y = profile[3]-profile[2]/2+.035; body.add(hem);
    addOutfit(body, role, currentOutfit(), profile);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 14), mat(0x5c3d22));
    belt.position.y = 0.75; body.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), skin);
    head.position.y = 1.55; head.castShadow = true; head.name='player-head';body.add(head);
    const headParts=[head];const headwearStart=body.children.length;
    // headwear: each role has its own, so kids can tell them apart at a glance
    const dark = new THREE.Color(role.color).multiplyScalar(0.7).getHex();
    if (role.id === 'shepherd') {                                  // a head cloth with a band, hanging down the back
      const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), charMat(0xf5ecd7, 'cloth')); cloth.position.y = 1.58; body.add(cloth);   // (stops above the eyes)
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.38, Math.PI * 0.3), new THREE.MeshPhongMaterial({ color: 0xf5ecd7, side: THREE.DoubleSide, map: TEX.cloth() || null, shininess: 20 })); hood.position.y = 1.58; body.add(hood);   // the sides, open at the face
      const drape = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.6, 0.08), mat(0xf5ecd7)); drape.position.set(0, 1.35, -0.36); drape.rotation.x = 0.15; body.add(drape);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 24), mat(role.color)); band.rotation.x = Math.PI / 2; band.position.y = 1.74; body.add(band);
    } else if (role.id === 'fisherman') {                          // a wide straw sun hat
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 24), mat(0xe2c27a)); brim.position.y = 1.9;brim.rotation.x=-.1;brim.name='straw-brim';body.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.28, 20), mat(0xd4ae62)); crown.position.y = 2.04; body.add(crown);
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.07, 20), mat(role.color)); ribbon.position.y = 1.94; body.add(ribbon);
    } else if (role.id === 'scribe') {                             // a tall soft cap and a quill behind the ear
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.42, 20), mat(dark)); cap.position.y = 1.9; body.add(cap);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(dark)); top.position.y = 2.1; body.add(top);
      const quill = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), mat(0xffffff)); quill.position.set(0.4, 1.75, -0.05); quill.rotation.z = -0.5; body.add(quill);
    } else if (role.id === 'apostle') {                            // a cream travel hood with a maroon band
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.47, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), charMat(0xefe3c8, 'cloth')); hood.position.y = 1.56; body.add(hood);
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.55, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8), charMat(0xefe3c8, 'cloth')); drape.position.y = 1.35; body.add(drape);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.055, 8, 24), mat(role.color)); band.rotation.x = Math.PI / 2; band.position.y = 1.77;band.name='apostle-headband';body.add(band);
    } else {                                                       // the Builder: a work headband and a leather apron
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.37,.425,.12,24,1,true), mat(0x7c4a1e)); band.position.y = 1.76;band.name='builder-headband';body.add(band);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mat(0x3b2412)); hair.position.y = 1.57; body.add(hair);
      const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 20, 1, true, -0.9, 1.8), mat(0x8b5a2b)); apron.position.y = 0.55;apron.name='builder-apron';body.add(apron);
    }
    if (role.id !== 'builder') {                                   // hair showing under the hat or head cloth: locks by the temples, and at the back
      const hM = mat({ shepherd: 0x5a3a1e, fisherman: 0x7a4a22, scribe: 0x2a1a0e }[role.id] || 0x3b2412);
      [-1, 1].forEach((sd) => {
        const lock = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), hM); lock.scale.set(0.55, 1.4, 0.5);
        lock.position.set(sd * Math.sin(1.02) * 0.425, 1.63, Math.cos(1.02) * 0.425); body.add(lock);
      });
      if (role.id !== 'shepherd') {                                 // (the shepherd's cloth covers the back)
        const back = new THREE.Mesh(new THREE.SphereGeometry(0.435, 20, 8, Math.PI / 2 + 1.1, Math.PI * 2 - 2.2, Math.PI * 0.3, Math.PI * 0.26), hM); back.position.y = 1.55; body.add(back);
      }
    }
    headParts.push(...body.children.slice(headwearStart).filter(o=>o.name!=='builder-apron'));
    const clothing=new THREE.Group();clothing.name='role-clothing';body.add(clothing);
    const cloth=charMat(role.id==='apostle'?dark:role.color,'cloth');
    const panel=(x,y,z,w,h,d,c)=>{const m=new THREE.Mesh(roundedBox(w,h,d,.025),c||cloth);m.position.set(x,y,z);clothing.add(m);return m;};
    if(role.id==='shepherd'){
      // Open shoulder mantle leaves the face, hands and blue robe clear.
      const mantle=new THREE.Mesh(new THREE.CylinderGeometry(.39,.55,.36,18,1,true,.65,Math.PI*2-1.3),charMat(0xd8ceb2,'cloth'));
      mantle.position.set(0,1.14,-.03);clothing.add(mantle);
      panel(-.47,.75,.12,.17,.44,.15,charMat(0x8b6b42,'cloth'));
    }else if(role.id==='fisherman'){
      [-1,1].forEach(sd=>panel(sd*.4,1,.19,.18,.43,.12,charMat(0xe6d5ad,'cloth')));
      const cord=new THREE.Mesh(new THREE.TorusGeometry(.15,.04,6,12),mat(0xc3a773));cord.position.set(-.51,.7,.12);clothing.add(cord);
    }else if(role.id==='scribe'){
      [-1,1].forEach(sd=>panel(sd*.22,.93,.37,.12,.68,.05,charMat(0xe5d5b0,'cloth')));
      panel(-.4,.68,.12,.14,.33,.13,mat(0x4a3525));
    }else if(role.id==='builder'){
      [-1,1].forEach(sd=>panel(sd*.28,1.13,.47,.12,.36,.055,charMat(0x8b5a2b,'cloth')));
      panel(-.49,.63,.06,.2,.32,.18,mat(0x67462b));
    }else if(role.id==='apostle'){
      const cloak=new THREE.Mesh(new THREE.CylinderGeometry(.43,.68,1.05,20,1,true,.72,Math.PI*2-1.44),cloth);
      cloak.position.set(0,.77,-.04);clothing.add(cloak);
      panel(.2,1.2,.44,.12,.36,.055,charMat(0xe5d5b7,'cloth'));
    }
    mergeStatic(clothing,[]);
    const faceStart=body.children.length;
    const eyeM = glossy(0x1c1c1c), shineM = new THREE.MeshBasicMaterial({ color: 0xffffff }), browM = mat(0x4a3020);
    [-0.15, 0.15].forEach((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12), eyeM); e.scale.set(1, 1.18, 0.7);
      e.position.set(x, 1.6, 0.37); e.name = 'eye'; body.add(e);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), shineM);
      sh.position.set(x + 0.024, 1.635, 0.43); sh.name = 'eye'; body.add(sh);
      const sh2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), shineM);
      sh2.position.set(x - 0.022, 1.575, 0.43); sh2.name = 'eye'; body.add(sh2);
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), browM); brow.rotation.z = Math.PI / 2 + (x < 0 ? -0.15 : 0.15);
      brow.position.set(x, 1.73, 0.36); brow.name = 'brow'; brow.userData.side = x < 0 ? -1 : 1; body.add(brow);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf4a3a3, transparent: true, opacity: 0.7 }));
      cheek.scale.set(1, 0.6, 0.4); cheek.position.set(x * 1.65, 1.5, 0.35); body.add(cheek);
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12, Math.PI), mat(0x5b2a1a));
    smile.rotation.z = Math.PI; smile.position.set(0, 1.46, 0.4); smile.name = 'smile'; body.add(smile);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xe8b48c)); nose.position.set(0, 1.53, 0.42); body.add(nose);
    const oh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0x5b2a1a)); oh.scale.set(1, 1.25, 0.5);   // an "o" mouth for jumps and falls
    oh.position.set(0, 1.44, 0.4); oh.name = 'oh'; oh.visible = false; body.add(oh);
    headParts.push(...body.children.slice(faceStart));
    const headRig=new THREE.Group();headRig.name='player-head-rig';headRig.position.y=1.55;body.add(headRig);
    headParts.forEach(o=>{body.remove(o);o.position.y-=1.55;headRig.add(o);});
    robe.name = 'robe';
    // arms (they swing when walking) and feet
    [-1, 1].forEach((sd) => {
      const arm = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.6, 14), charMat(role.color, 'cloth'));
      sleeve.position.y = -0.28; arm.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 6, 14), charMat(hemC)); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.58; arm.add(cuff);
      const hand=new THREE.Group();hand.name=sd<0?'handL':'handR';hand.position.y=-.62;arm.add(hand);
      const palm=new THREE.Mesh(new THREE.SphereGeometry(.095,12,8),skin);palm.scale.set(.85,1,.68);hand.add(palm);
      const fingers=new THREE.Mesh(roundedBox(.13,.08,.11,.035),skin);fingers.position.set(0,-.055,.015);hand.add(fingers);
      const thumb=new THREE.Mesh(new THREE.SphereGeometry(.042,8,6),skin);thumb.scale.set(1,1.25,.9);thumb.position.set(-sd*.074,.018,.028);hand.add(thumb);
      mergeStatic(hand,[]);arm.userData.playerLimb={sleeve,cuff,hand,length:.62};arms.push(arm);hands.push(hand);
      arm.position.set(sd * 0.48, 1.2, 0); arm.rotation.z = sd * 0.18;
      arm.name = sd < 0 ? 'armL' : 'armR';
      body.add(arm);
      const foot = new THREE.Mesh(roundedBox(0.2, 0.1, 0.36, 0.04), mat(0x6b4a2b));
      const step=new THREE.Group();step.name=sd<0?'footL':'footR';step.position.set(sd*.2,0,.1);g.add(step);
      foot.position.y=.05;step.add(foot);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.05), mat(0x3f2a16)); strap.position.set(0,.1,.08);step.add(strap);
      if(role.id==='fisherman'){const calf=new THREE.Mesh(new THREE.CylinderGeometry(.1,.085,.23,10),skin);calf.position.y=.22;step.add(calf);}
      feet.push({group:step,side:sd});
    });
    // see-through silhouette: drawn only where a wall or hill hides the player
    // shown (drawn on top) only while something really hides the player: see updateGhosts()
    const ghostM = new THREE.MeshBasicMaterial({ color: role.color, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
    // (inside the body group, a little bigger than the body, so it moves with it and never shows on the player's own face)
    const ghost = new THREE.Group(); ghost.visible = false; ghost.name = 'ghost';
    const gRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.64, 1.28, 14), ghostM); gRobe.position.y = 0.62; gRobe.renderOrder = 20; ghost.add(gRobe);
    const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 10), ghostM); gHead.position.y = 1.56; gHead.renderOrder = 20; ghost.add(gHead);
    body.add(ghost);
    // Role tools stow while hands are occupied by an item or mechanism.
    const roleTool=new THREE.Group();roleTool.name='role-tool';body.add(roleTool);
    if (role.id === 'shepherd') {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), mat(0x6e4720));
      st.position.set(0.62, 1.0, 0.1); roleTool.add(st);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10, Math.PI), mat(0x6e4720));
      hook.position.set(0.62, 2.0, 0.1); roleTool.add(hook);
    } else if (role.id === 'fisherman') {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), mat(0x9c6b36));
      h.position.set(0.6, 1.0, 0.15); roleTool.add(h);
      const net = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xd1fae5, wireframe: true }));
      net.position.set(0.6, 1.8, 0.15); net.rotation.x = Math.PI; roleTool.add(net);
    } else if (role.id === 'scribe') {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10), mat(0xf5e6c8));
      sc.rotation.z = Math.PI / 2; sc.position.set(0, 1.0, 0.5); roleTool.add(sc);
    } else if (role.id === 'apostle') {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), mat(0x7a5230)); st.position.set(0.62, 0.95, 0.1); roleTool.add(st);
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.14), mat(0x7c4a1e)); bag.position.set(-0.5, 0.75, 0.12); roleTool.add(bag);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 20), mat(0x5c3d22)); strap.position.set(-0.05, 1.05, 0); strap.rotation.set(0, Math.PI / 2, 0.75); roleTool.add(strap);
    } else if (role.id === 'builder') {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), mat(0x9c6b36));
      h.position.set(0.6, 1.0, 0.15); roleTool.add(h);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), mat(0x6e4720));
      m.position.set(0.6, 1.5, 0.15); roleTool.add(m);
    }
    // armor pieces (hidden until equipped)
    const gold = mat(0xfacc15, { emissive: 0x6b4f00 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), gold);
    helmet.position.y = .07;headRig.add(helmet);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16), gold);
    shield.rotation.set(0, 0, Math.PI / 2);shield.position.set(-.14,-.25,.1);arms[0].add(shield);
    const sandals = new THREE.Group();
    [-0.2, 0.2].forEach((x) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.5), gold);
      s.position.set(x, 0.06, 0.12); sandals.add(s);
    });
    g.add(sandals);
    const book = new THREE.Group();
    [-1, 1].forEach((s) => {
      const pg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.4), mat(0xfff7d6, { emissive: 0xb59a2a }));
      pg.position.set(s * 0.15, 0, 0); pg.rotation.z = s * -0.35; book.add(pg);
    });
    book.position.set(0, 2.45, 0); body.add(book);
    const beltG = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 20), gold);
    beltG.rotation.x = Math.PI / 2; beltG.position.y = 0.75; body.add(beltG);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.2), gold);
    plate.position.set(0, 1.0, 0.36); plate.rotation.x = -0.15; body.add(plate);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 14), new THREE.MeshLambertMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.45 }));
    bubble.position.y = 1.0; bubble.visible = false; g.add(bubble);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), softShadowMaterial({ map: contactMap(), color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    headRig.updateWorldMatrix(true,true);const headBounds=new THREE.Box3().setFromObject(headRig).applyMatrix4(headRig.matrixWorld.clone().invert());
    g.userData = { body, head:headRig, headBounds, arms, hands, motion:{weight:0}, feet, roleTool, profile:profile.slice(), armor: { helmet, shield, sandals, sword: book, belt: beltG, breastplate: plate }, bubble };
    Object.values(g.userData.armor).forEach((m) => (m.visible = false));
    return { group: g, shadow };
  }

  const ANIMALS = {
    sheep: { body: 0xfafaf9, head: 0x2f2a27, legs: 0x2f2a27, s: 0.85 },
    lamb: { body: 0xfffbeb, head: 0xf1d3c6, legs: 0xf1d3c6, s: 0.66 },
    goat: { body: 0xd8c9b3, head: 0xd8c9b3, legs: 0x8a7a66, s: 0.88, horns: 0x8b8174 },
    lion: { body: 0xe39a3b, head: 0xe39a3b, legs: 0xc9852f, s: 1.05, mane: 0x8a3f12 },
    bear: { body: 0x6b4423, head: 0x6b4423, legs: 0x4a2d16, s: 1.2 },
    deer: { body: 0xb98552, head: 0xb98552, legs: 0x8a5f37, s: 1.0, antlers: 0xeadcc4 },
    rabbit: { body: 0xb7aea6, head: 0xb7aea6, legs: 0x9a918a, s: 0.75, ears: true },
    donkey: { body: 0x9a948e, head: 0x9a948e, legs: 0x857f79, s: 1.0 },
    horse: { body: 0xa0663a, head: 0xa0663a, legs: 0x8a5530, s: 1.15, mane: 0x3b2414 },
    ox: { body: 0x8a5a33, head: 0x8a5a33, legs: 0x734a2a, s: 1.2 },
    camel: { body: 0xd8b07a, head: 0xd8b07a, legs: 0xc9a06a, s: 1.15 },
    cow: { body: 0xfbfbf9, head: 0xfbfbf9, legs: 0xfbfbf9, s: 1.15 },
    dove: { bird: true, body: 0xffffff, s: 0.85 }
  };
  // Animals: round and friendly, with the details that make each one itself (wool, mane, horns, antlers,
  // long ears, spots), glossy eyes, a muzzle, and legs that walk (named 'leg', swung while they follow).
  function animalMesh(kind, opts) {
    const a = ANIMALS[kind] || ANIMALS.sheep;
    const s = a.s;
    const g = new THREE.Group();
    const M = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); (parent || g).add(o); return o; };
    const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14);
    const eyeM = glossy(0x141414), shine = new THREE.MeshBasicMaterial({ color: 0xffffff }), blush = new THREE.MeshLambertMaterial({ color: 0xf2a0a0, transparent: true, opacity: 0.55 });
    const eyes = (parent, x, y, z, r) => [-1, 1].forEach((sd) => {
      const e = M(sph(r, 14, 10), eyeM, sd * x, y, z, parent); e.scale.set(1, 1.15, 0.75);
      M(sph(r * 0.34, 8, 6), shine, sd * x + r * 0.32, y + r * 0.38, z + r * 0.6, parent);
      M(sph(r * 0.16, 6, 4), shine, sd * x - r * 0.28, y - r * 0.3, z + r * 0.62, parent);
    });
    if (a.bird) {
      const bm = charMat(a.body, 'fur');
      M(sph(0.3 * s, 22, 16), bm, 0, 0.32 * s, 0).scale.set(0.95, 0.85, 1.35);
      const h = M(sph(0.19 * s, 20, 14), bm, 0, 0.55 * s, 0.3 * s);
      const beak = M(new THREE.ConeGeometry(0.045 * s, 0.13 * s, 10), mat(0xf59e0b), 0, 0.53 * s, 0.5 * s); beak.rotation.x = Math.PI / 2;
      eyes(g, 0.085 * s, 0.58 * s, 0.43 * s, 0.035 * s);
      [-1, 1].forEach((sd) => {
        const w = M(sph(0.26 * s, 16, 10), charMat(0xf1f5f9, 'fur'), sd * 0.27 * s, 0.38 * s, -0.02 * s); w.scale.set(0.35, 0.14, 1.0); w.rotation.z = sd * 0.25; w.name = 'wing';
        const foot = M(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.12 * s, 5), mat(0xf59e0b), sd * 0.08 * s, 0.06 * s, 0.02 * s);
      });
      const tail = M(new THREE.ConeGeometry(0.16 * s, 0.32 * s, 12), bm, 0, 0.34 * s, -0.45 * s); tail.rotation.x = -Math.PI / 2 - 0.25; tail.scale.set(1, 1, 0.3);
      g.userData.bird = true;
      return mergeStatic(g, ['wing']);
    }
    const woolly = kind === 'sheep' || kind === 'lamb';
    const bodyM = woolly ? charMat(a.body, 'wool') : charMat(a.body, 'fur'), headM = woolly ? charMat(a.head) : charMat(a.head, 'fur');
    const P = { sheep: [0.9, 0.8, 1.15], lamb: [0.85, 0.8, 1.1], goat: [0.78, 0.78, 1.2], lion: [0.82, 0.78, 1.3], bear: [0.95, 0.88, 1.25], deer: [0.72, 0.74, 1.25], rabbit: [0.8, 0.8, 1.0], cow: [0.9, 0.82, 1.4],
      donkey: [0.74, 0.78, 1.28], horse: [0.74, 0.8, 1.42], ox: [0.98, 0.88, 1.42], camel: [0.76, 0.8, 1.35] }[kind] || [0.85, 0.75, 1.15];
    const legH = { deer: 0.5, goat: 0.42, cow: 0.42, rabbit: 0.22, bear: 0.34, donkey: 0.46, horse: 0.6, ox: 0.4, camel: 0.72 }[kind] || 0.36;
    const neck = { donkey: 0.28, horse: 0.42, camel: 0.6 }[kind] || 0;
    const by = (legH + 0.3) * s;
    const body = M(sph(0.5 * s, 28, 20), bodyM, 0, by, 0); body.scale.set(P[0], P[1], P[2]); body.castShadow = true;
    if (woolly) {                                                    // fluffy wool all over
      [[-0.24, 0.2, 0.25], [0.24, 0.2, 0.25], [0, 0.3, 0], [-0.26, 0.15, -0.3], [0.26, 0.15, -0.3], [0, 0.25, 0.4], [0, 0.2, -0.45], [-0.32, -0.05, 0], [0.32, -0.05, 0], [0, 0.32, -0.25]].forEach(([x, y, z]) => {
        M(sph(0.25 * s, 14, 10), bodyM, x * s, by + y * s, z * s);
      });
    }
    if (kind === 'cow') [[0.3, 0.1, 0.2, 0.17], [-0.32, 0.05, -0.25, 0.2], [0.2, 0.25, -0.4, 0.14], [-0.15, 0.3, 0.3, 0.12]].forEach(([x, y, z, r]) => {
      const sp = M(sph(r * s, 12, 8), charMat(0x26211e, 'fur'), x * s, by + y * s, z * s); sp.scale.set(1, 0.6, 1.1); });
    if (kind === 'deer') [[0.18, 0.28, 0.1], [-0.16, 0.3, -0.1], [0.05, 0.33, 0.3], [-0.05, 0.31, -0.3]].forEach(([x, y, z]) => M(sph(0.045 * s, 8, 6), mat(0xf3e7d3), x * s, by + y * s, z * s));
    if (kind === 'camel') M(sph(0.36 * s, 20, 14), bodyM, 0, by + 0.38 * s, -0.05 * s).scale.set(0.9, 0.85, 1.1);    // the hump
    // head (on a neck for the donkey, horse and camel)
    const hz = (P[2] * 0.5 + 0.12 + neck * 0.35) * s, hy = by + (0.32 + neck) * s;
    if (neck) {
      const nb = new THREE.Vector3(0, by + 0.18 * s, P[2] * 0.42 * s), nt = new THREE.Vector3(0, hy - 0.08 * s, hz - 0.12 * s), len = nb.distanceTo(nt);
      const nk = M(new THREE.CylinderGeometry((kind === 'camel' ? 0.19 : 0.15) * s, (kind === 'camel' ? 0.27 : 0.22) * s, len, 16), bodyM, 0, (nb.y + nt.y) / 2, (nb.z + nt.z) / 2);
      nk.rotation.x = Math.atan2(nt.z - nb.z, nt.y - nb.y);
      if (a.mane || kind === 'donkey') for (let k = 0; k < 7; k++) { const t = k / 6; M(sph((a.mane ? 0.12 : 0.08) * s, 10, 8), charMat(a.mane || 0x5c5650, 'fur'), 0, nb.y + (nt.y - nb.y) * t + 0.16 * s, nb.z + (nt.z - nb.z) * t - 0.13 * s).scale.set(0.65, 1.4, 1.1); }
    }
    const head = new THREE.Group(); head.position.set(0, hy, hz); g.add(head); head.name = 'head';
    const hr = (kind === 'rabbit' ? 0.3 : kind === 'bear' || kind === 'lion' ? 0.32 : 0.27) * s;
    M(sph(hr, 26, 20), headM, 0, 0, 0, head);
    const muzC = { sheep: 0x3f3936, lamb: 0xf6dfd6, goat: 0xe9ddca, lion: 0xf3c787, bear: 0xb98a5c, deer: 0xe6cfae, rabbit: 0xe9e3dd, cow: 0xf2b8b0, donkey: 0xece6df, horse: 0x7a4a2a, ox: 0xe8c9a8, camel: 0xe9cfa0 }[kind] || a.head;
    const longFace = kind === 'horse' || kind === 'donkey' || kind === 'camel';
    const muz = M(sph(hr * 0.62, 18, 12), charMat(muzC), 0, -hr * 0.35, hr * (longFace ? 0.85 : 0.68), head); muz.scale.set(1.15, 0.8, kind === 'cow' || kind === 'ox' ? 1.05 : longFace ? 1.35 : 0.85);
    const noseC = kind === 'lion' || kind === 'bear' || kind === 'deer' || kind === 'horse' ? 0x2b1a10 : kind === 'cow' || kind === 'ox' ? 0x9b5a52 : kind === 'donkey' || kind === 'camel' ? 0x6b5a50 : woolly ? 0xc98f8f : 0xd77f8f;
    const nose = M(sph(hr * 0.17, 12, 8), glossy(noseC), 0, -hr * 0.22, hr * (longFace ? 1.52 : 1.2), head); nose.scale.set(1.3, 0.85, 0.8);
    M(new THREE.TorusGeometry(hr * 0.15, hr * 0.03, 5, 10, Math.PI), mat(0x3b2412), 0, -hr * 0.55, hr * 1.08, head).rotation.z = Math.PI;
    eyes(head, hr * 0.42, hr * 0.18, hr * 0.84, hr * 0.15);
    [-1, 1].forEach((sd) => { const c = M(sph(hr * 0.16, 8, 6), blush, sd * hr * 0.62, -hr * 0.2, hr * 0.7, head); c.scale.set(1, 0.6, 0.4); });
    // ears
    [-1, 1].forEach((sd) => {
      if (kind === 'donkey' || kind === 'horse' || kind === 'camel') {                 // donkey: long ears; horse: pointed; camel: small and round
        const L2 = kind === 'donkey' ? 2.4 : kind === 'horse' ? 1.5 : 0.8;
        const e = M(sph(hr * 0.26, 14, 10), headM, sd * hr * 0.42, hr * (0.7 + L2 * 0.22), -hr * 0.25, head); e.scale.set(0.55, L2, 0.4); e.rotation.z = sd * -0.25;
        if (kind === 'donkey') { const inn = M(sph(hr * 0.18, 12, 8), mat(0xf0b8b8), sd * hr * 0.42, hr * (0.7 + L2 * 0.22), -hr * 0.17, head); inn.scale.set(0.45, L2 * 0.85, 0.2); inn.rotation.z = sd * -0.25; }
        if (kind === 'donkey') M(sph(hr * 0.1, 8, 6), mat(0x4a4440), sd * hr * (0.42 + L2 * 0.06), hr * (0.7 + L2 * 0.45), -hr * 0.25, head);
      } else if (kind === 'rabbit') {
        const e = M(sph(hr * 0.3, 14, 10), headM, sd * hr * 0.38, hr * 1.25, -hr * 0.1, head); e.scale.set(0.55, 2.3, 0.35); e.rotation.z = sd * -0.12;
        const inn = M(sph(hr * 0.22, 12, 8), mat(0xf4b6c2), sd * hr * 0.38, hr * 1.25, -hr * 0.0, head); inn.scale.set(0.45, 2.0, 0.2); inn.rotation.z = sd * -0.12;
      } else if (kind === 'bear' || kind === 'lion') {
        M(sph(hr * 0.3, 12, 10), headM, sd * hr * 0.68, hr * 0.72, -hr * 0.1, head).scale.set(1, 1, 0.55);
        M(sph(hr * 0.17, 10, 8), mat(muzC), sd * hr * 0.68, hr * 0.72, hr * 0.02, head).scale.set(1, 1, 0.4);
      } else {
        const droop = woolly ? 0.9 : kind === 'cow' ? 0.4 : kind === 'goat' ? 0.55 : 0.1;
        const e = M(sph(hr * 0.32, 14, 10), headM, sd * hr * 0.95, hr * (woolly ? 0.2 : 0.55), -hr * 0.1, head); e.scale.set(1.1, 0.42, 0.62); e.rotation.z = sd * -droop;
        const inn = M(sph(hr * 0.22, 10, 8), mat(0xf0b8b8), sd * hr * 0.98, hr * (woolly ? 0.2 : 0.55), -hr * 0.04, head); inn.scale.set(1.0, 0.3, 0.3); inn.rotation.z = sd * -droop;
      }
    });
    if (woolly) M(sph(hr * 0.75, 14, 10), bodyM, 0, hr * 0.75, -hr * 0.15, head).scale.set(1, 0.6, 0.9);   // a wool tuft on top
    if (a.horns) [-1, 1].forEach((sd) => {                          // horns that sweep back
      const hn = M(new THREE.ConeGeometry(hr * 0.13, hr * 0.85, 10), mat(a.horns), sd * hr * 0.32, hr * 1.05, -hr * 0.3, head);
      hn.rotation.set(-0.85, 0, sd * -0.22); });
    if (kind === 'goat') { const b2 = M(new THREE.ConeGeometry(hr * 0.16, hr * 0.5, 8), headM, 0, -hr * 1.0, hr * 0.62, head); b2.rotation.x = Math.PI; }
    if (kind === 'cow') [-1, 1].forEach((sd) => { const hn = M(new THREE.ConeGeometry(hr * 0.09, hr * 0.42, 8), mat(0xeadcc4), sd * hr * 0.55, hr * 0.85, -hr * 0.2, head); hn.rotation.z = sd * -0.8; });
    if (kind === 'ox') [-1, 1].forEach((sd) => {                   // big horns: out to the side, then up
      const base = M(new THREE.CylinderGeometry(hr * 0.13, hr * 0.17, hr * 0.85, 10), mat(0xeadcc4), sd * hr * 0.95, hr * 0.62, -hr * 0.1, head); base.rotation.z = sd * Math.PI / 2;
      const tip = M(new THREE.ConeGeometry(hr * 0.13, hr * 0.75, 10), mat(0xeadcc4), sd * hr * 1.42, hr * 0.95, -hr * 0.1, head); tip.rotation.z = sd * -0.3; });
    if (kind === 'horse') { const bl = M(sph(hr * 0.2, 10, 8), mat(0xffffff), 0, hr * 0.35, hr * 0.92, head); bl.scale.set(0.6, 1.4, 0.3); }     // a white blaze
    if (a.antlers) [-1, 1].forEach((sd) => {
      const am = mat(a.antlers), base = new THREE.Group(); base.position.set(sd * hr * 0.4, hr * 0.85, -hr * 0.2); base.rotation.z = sd * -0.35; head.add(base);
      M(new THREE.CylinderGeometry(hr * 0.05, hr * 0.07, hr * 1.1, 6), am, 0, hr * 0.55, 0, base);
      [[0.35, 0.6], [0.7, -0.5], [0.95, 0.5]].forEach(([y, rz]) => { const t = M(new THREE.CylinderGeometry(hr * 0.035, hr * 0.045, hr * 0.5, 5), am, sd * hr * 0.12, hr * (0.2 + y), 0, base); t.rotation.z = sd * rz; });
    });
    if (a.mane && kind === 'lion') {                                 // a big fluffy mane: a ring of soft puffs
      const mm = charMat(a.mane, 'fur');
      for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI * 2; M(sph(hr * 0.42, 12, 8), mm, Math.cos(an) * hr * 0.95, Math.sin(an) * hr * 0.95, -hr * 0.3, head); }
      for (let k = 0; k < 10; k++) { const an = k / 10 * Math.PI * 2; M(sph(hr * 0.36, 10, 8), mm, Math.cos(an) * hr * 0.6, Math.sin(an) * hr * 0.6, -hr * 0.55, head); }
    }
    // tail (it wags): a pivot at the rump
    const tailG = new THREE.Group(); tailG.position.set(0, by + 0.12 * s, -P[2] * 0.48 * s); tailG.name = 'tail'; g.add(tailG);
    if (kind === 'horse') {
      const t = M(new THREE.CylinderGeometry(0.06 * s, 0.11 * s, 0.75 * s, 10), charMat(a.mane, 'fur'), 0, -0.3 * s, -0.16 * s, tailG); t.rotation.x = -0.45;
    } else if (['lion', 'cow', 'ox', 'donkey', 'camel'].indexOf(kind) >= 0) {
      const t = M(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.6 * s, 6), headM, 0, -0.17 * s, -0.15 * s, tailG); t.rotation.x = -0.6;
      M(sph(0.08 * s, 10, 8), kind === 'lion' ? charMat(a.mane, 'fur') : charMat(kind === 'camel' ? 0x8a6a45 : 0x3b302a, 'fur'), 0, -0.42 * s, -0.33 * s, tailG);
    } else {
      M(sph((kind === 'rabbit' ? 0.13 : 0.09) * s, 12, 10), kind === 'rabbit' || kind === 'deer' ? charMat(0xffffff, 'fur') : bodyM, 0, -0.04 * s, 0, tailG);
    }
    // legs that walk: a pivot at the hip, the leg, and a hoof or paw
    const hoofC = { sheep: 0x1c1917, lamb: 0xd8b8aa, goat: 0x4a4038, deer: 0x3b2a1c, cow: 0x3b302a, donkey: 0x3f3a36, horse: 0x2b1d14, ox: 0x2f241c, camel: 0x9a7a52 }[kind];
    const lx = P[0] * 0.27 * s, lz = P[2] * 0.3 * s, front = kind === 'rabbit' ? 0.7 : 1;
    [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]].forEach(([sx, sz, ph]) => {
      const hip = new THREE.Group(); hip.position.set(sx * lx, by - 0.12 * s, sz * lz); hip.name = 'leg'; hip.userData.phase = ph; g.add(hip);
      const len = legH * s * (sz > 0 ? front : 1) + 0.12 * s;
      M(new THREE.CylinderGeometry(0.075 * s, 0.09 * s, len, 12), charMat(a.legs, woolly ? null : 'fur'), 0, -len / 2, 0, hip);
      if (hoofC) M(new THREE.CylinderGeometry(0.085 * s, 0.09 * s, 0.07 * s, 12), glossy(hoofC), 0, -len + 0.02 * s, 0, hip);
      else M(sph(0.1 * s, 12, 8), charMat(a.legs, 'fur'), 0, -len + 0.03 * s, 0.03 * s, hip).scale.set(1, 0.6, 1.25);
    });
    if (kind === 'rabbit') [-1, 1].forEach((sd) => M(sph(0.15 * s, 12, 8), bodyM, sd * 0.2 * s, 0.1 * s, -0.12 * s).scale.set(0.7, 0.6, 1.4));   // big hind feet
    g.userData.animal = kind; g.userData.back = by + 0.5 * s * P[1] * 0.92 + (kind === 'camel' ? 0.25 * s : 0);
    if (opts && opts.kneel) {                                         // resting: legs folded under, body on the ground
      const drop = legH * s + 0.05 * s;
      g.children.forEach((c) => {
        if (c.name === 'leg') { c.position.y -= drop * 0.9; c.rotation.x = c.position.z > 0 ? 1.45 : -1.45; c.name = 'leg-folded'; }
        else c.position.y -= drop;
      });
      g.userData.back -= drop;
    }
    mergeStatic(head, []);
    return mergeStatic(g, ['leg', 'leg-folded', 'head', 'tail']);
  }

  // A real tree model when the models loaded: palms on sand, leafy trees and pines on grass
  function isGreenAt(x, z) {
    const L = S.level; if (!L.groundColor) return true;
    const c = new THREE.Color(L.groundColor(x, z, terrain(x, z))); return c.g > c.r * 1.05 && c.g > c.b * 1.1;
  }
  function modelTree(x, z, scale, round) {
    let g = 0; for (let k = 0; k < 8; k++) if (isGreenAt(x + Math.cos(k * 0.785) * 4, z + Math.sin(k * 0.785) * 4)) g++;
    const h = hash2(x, z), green = g >= 3;                                 // the area around it (a tree on a path is still a garden tree)
    const pick = green ? (round ? ['CommonTree_1', 'CommonTree_3', 'CommonTree_5'][h % 3] : ['Pine_1', 'Pine_2'][h % 2]) : ['PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'PalmTree_4'][h % 4];
    const t = modelInstance(pick, (green ? (round ? 6.2 : 6.8) : 6.6) * scale * (0.9 + (h % 5) * 0.05));
    if (t) t.rotation.y = (h % 628) / 100;
    return t;
  }
  function treeMesh(scale, leafColor, round) {
    const g = new THREE.Group();
    if (round) {
      const t = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 3.6 * scale, 10), 2, 2), texMat(0x6b4a2b, 'bark'));
      t.position.y = 1.8 * scale; t.castShadow = true; g.add(t);
      const c = new THREE.Color(leafColor || 0x3f8f3a);
      [[0, 4.6, 0, 2.0], [-1.2, 4.0, 0.4, 1.4], [1.2, 4.1, -0.3, 1.5], [0.2, 5.6, -0.2, 1.4]].forEach(([x, y, z, r], i) => {
        const shade = c.clone().offsetHSL(0, 0, (i % 2 ? 0.04 : -0.02));
        const b = new THREE.Mesh(scaleUV(new THREE.IcosahedronGeometry(r * scale, 1), 3, 3), texMat(shade.getHex(), 'leaves'));
        b.position.set(x * scale, y * scale, z * scale); b.castShadow = true; g.add(b);
      });
      return g;
    }
    const t = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(0.4 * scale, 0.6 * scale, 3.4 * scale, 10), 2, 2), texMat(0x5c3d22, 'bark'));
    t.position.y = 1.7 * scale; t.castShadow = true; g.add(t);
    const c1 = new THREE.Mesh(scaleUV(new THREE.ConeGeometry(2.3 * scale, 4 * scale, 8), 4, 2), texMat(leafColor || 0x2f5e2e, 'leaves'));
    c1.position.y = 4.3 * scale; c1.castShadow = true; g.add(c1);
    const c2 = new THREE.Mesh(scaleUV(new THREE.ConeGeometry(1.7 * scale, 3.2 * scale, 8), 3, 2), texMat(leafColor ? leafColor + 0x0a0a0a : 0x3d7337, 'leaves'));
    c2.position.y = 6.2 * scale; c2.castShadow = true; g.add(c2);
    return g;
  }

  /* -------------------------------------------------------------------
   * 8. LEVEL-FACING API  (everything a LEVEL may call)
   * ----------------------------------------------------------------- */
  // a friendly round person: [0] robe, [1] head, [2] head cloth, then eyes, cheeks and arms
  // o (optional): { age: 'elder'|'child', beard: true|colour, hair: colour, stripes: colour, belt: colour, band: colour, cane: true }
  function personMesh(robe, scarf, s, o) {
    o = o || {};
    s = (s || 1) * (o.age === 'child' ? 0.72 : 1);
    const g = new THREE.Group();
    if (S.people && o.register !== false) S.people.push({ g });
    g.userData.shine = true; g.userData.talkHeight = 2.05 * s;
    const skin = o.skin || 0xd9a274, elder = o.age === 'elder';   // look.skin: e.g. 0x7a4a2a for the Ethiopian (8-3)
    const hairC = o.hair !== undefined ? o.hair : elder ? 0xe7e5e4 : 0x3b2412;
    const hs = o.age === 'child' ? 1.12 : 1;                  // children: a bigger head for their size
    // [0] robe, [1] head, [2] head cloth: levels may recolour these by index, so they stay first
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.46 * s, 0.98 * s, 24), charMat(robe, 'cloth')); body.position.y = 0.49 * s; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33 * s * hs, 22, 16), mat(skin)); head.position.y = 1.26 * s; head.castShadow = true; g.add(head);
    const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s * hs, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), charMat(scarf, 'cloth')); cloth.position.y = 1.3 * s; g.add(cloth);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.36 * s, 0.4 * s, 18, 1, true, Math.PI * 0.55, Math.PI * 0.9), new THREE.MeshPhongMaterial({ color: scarf, side: THREE.DoubleSide, map: TEX.cloth() || null, shininess: 20 }));
    drape.position.y = 1.08 * s; g.add(drape);                                        // the cloth hangs down the back
    const sides = new THREE.Mesh(new THREE.SphereGeometry(0.37 * s * hs, 22, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.38, Math.PI * 0.3), drape.material); sides.position.y = 1.3 * s; g.add(sides);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34 * s * hs, 0.03 * s, 6, 22), mat(o.band !== undefined ? o.band : new THREE.Color(scarf).multiplyScalar(0.7).getHex())); band.rotation.x = Math.PI / 2; band.position.y = 1.42 * s; g.add(band);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.36 * s, (o.belt !== undefined ? 0.05 : 0.04) * s, 6, 22), mat(o.belt !== undefined ? o.belt : new THREE.Color(robe).multiplyScalar(0.62).getHex())); sash.rotation.x = Math.PI / 2; sash.position.y = 0.58 * s; g.add(sash);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.455 * s, 0.025 * s, 6, 24), mat(new THREE.Color(robe).multiplyScalar(0.75).getHex())); hem.rotation.x = Math.PI / 2; hem.position.y = 0.02; g.add(hem);
    if (o.stripes !== undefined) {                            // a striped robe: a few soft bands down the front and back
      const stM = charMat(o.stripes, 'cloth');
      [-0.5, 0.5, Math.PI - 0.5, Math.PI + 0.5].forEach((a) => {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.265 * s, 0.465 * s, 0.94 * s, 4, 1, true, a - 0.12, 0.24), stM); st.position.y = 0.5 * s; g.add(st);
      });
    }
    const hairM = mat(hairC), F = 1.26 * s, R = 0.33 * s * hs;
    [-1, 1].forEach((sd) => {                                 // hair showing under the head cloth, by the temples
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), hairM); lock.scale.set(0.55, 1.4, 0.5);
      lock.position.set(sd * Math.sin(1.0) * R * 1.02, F + 0.08 * s, Math.cos(1.0) * R * 1.02); g.add(lock);
    });
    if (o.beard) {                                            // a round beard along the jaw and a moustache over the smile
      const bM = mat(o.beard === true ? hairC : o.beard);
      const beard = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 18, 8, Math.PI / 2 - 1.35, 2.7, Math.PI * 0.64, Math.PI * 0.3), bM);
      beard.position.y = F; g.add(beard);
      const chin = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), bM); chin.scale.set(1.2, 0.8, 0.8); chin.position.set(0, F - 0.25 * s, 0.2 * s); g.add(chin);
      const mous = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), bM); mous.scale.set(1.9, 0.5, 0.6); mous.position.set(0, F - 0.065 * s, 0.315 * s * hs); g.add(mous);
    }
    if (o.cane) {                                             // a walking stick in the right hand
      const cM = mat(0x7c5a3a);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 1.0 * s, 6), cM); st.position.set(0.5 * s, 0.5 * s, 0.12 * s); g.add(st);
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.025 * s, 6, 10, Math.PI), cM); top.position.set(0.5 * s - 0.07 * s, 1.0 * s, 0.12 * s); g.add(top);
    }
    const eyeM = glossy(0x1c1c1c), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyes = new THREE.Group(); eyes.name = 'eyes'; eyes.position.y = 1.28 * s; g.add(eyes);   // kept apart so they can blink
    const ez = 0.29 * s * hs;
    [-1, 1].forEach((sd) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 12, 10), eyeM); e.scale.set(1, 1.15, 0.7); e.position.set(sd * 0.11 * s, 0, ez); eyes.add(e);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s, 6, 4), shine); sh.position.set(sd * 0.11 * s + 0.014 * s, 0.02 * s, ez + 0.04 * s); eyes.add(sh);
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.08 * s, 5), mat(elder ? 0xd6d3d1 : 0x3b2412)); brow.rotation.z = Math.PI / 2 + sd * 0.15; brow.position.set(sd * 0.11 * s, 1.37 * s, ez); g.add(brow);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf0a0a0, transparent: true, opacity: 0.6 })); ch.scale.set(1, 0.6, 0.4); ch.position.set(sd * 0.19 * s, 1.18 * s, 0.27 * s * hs); g.add(ch);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.11 * s, 0.5 * s, 12), charMat(robe, 'cloth')); arm.position.set(sd * 0.36 * s, 0.68 * s, 0); arm.rotation.z = sd * 0.35; g.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 12, 8), mat(skin)); hand.position.set(sd * 0.45 * s, 0.45 * s, 0); g.add(hand);
      const foot = new THREE.Mesh(roundedBox(0.14 * s, 0.07 * s, 0.24 * s, 0.03 * s), mat(0x6b4a2b)); foot.position.set(sd * 0.14 * s, 0.035 * s, 0.12 * s); g.add(foot);
    });
    mergeStatic(eyes, [], 0);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), mat(0xc98d62)); nose.position.set(0, 1.22 * s, 0.32 * s * hs); g.add(nose);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05 * s, 0.011 * s, 5, 10, Math.PI), mat(0x5b2a1a)); mouth.rotation.z = Math.PI; mouth.position.set(0, 1.15 * s, 0.31 * s * hs); g.add(mouth);
    return mergeStatic(shineUp(g), ['eyes'], 3);        // (robe, head and cloth stay separate: levels may recolour them)
  }
  // Reusable opt-in scenery and articulated people. Existing personMesh is unchanged.
  function storyPersonMesh(robe,scarf,scale=1,look={}) {
  const T=THREE,g=new T.Group();
  scale*=look.age==='child'?.72:1;
  if(look.register!==false)S.people.push({g});g.userData.shine=true;g.userData.talkHeight=2.05*scale;
  const rig=new T.Group();rig.scale.setScalar(scale);g.add(rig);
  const skin=api.mat(look.skin||0xd9a274),cloth=api.texMat(robe,'cloth'),headCloth=api.texMat(scarf,'cloth'),wood=api.texMat(0x765637,'wood');
  const mesh=(parent,geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const body=new T.Group();rig.add(body);
  const robeGeo=new T.CylinderGeometry(.26,.46,.98,20,4),rp=robeGeo.attributes.position,rc=[];
  for(let i=0;i<rp.count;i++){const angle=Math.atan2(rp.getZ(i),rp.getX(i)),fall=.5-rp.getY(i)/.98,fold=1+Math.sin(angle*10)*.035*fall;rp.setXYZ(i,rp.getX(i)*fold,rp.getY(i),rp.getZ(i)*fold);const shade=.97+Math.cos(angle*10)*.03*fall;rc.push(shade,shade,shade);}
  robeGeo.setAttribute('color',new T.Float32BufferAttribute(rc,3));robeGeo.computeVertexNormals();
  const robeMat=registerSurface(cloth.clone(),'cloth');robeMat.vertexColors=true;
  mesh(body,robeGeo,robeMat,0,.5,0);
  const belt=mesh(body,new T.TorusGeometry(.365,.035,6,18),wood,0,.59,0);belt.rotation.x=Math.PI/2;
  const hem=mesh(body,new T.TorusGeometry(.45,.025,6,20),api.mat(new T.Color(robe).multiplyScalar(.75).getHex()),0,.035,0);hem.rotation.x=Math.PI/2;
  const head=new T.Group();head.position.y=1.04;body.add(head);
  mesh(head,new T.SphereGeometry(.33,16,12),skin,0,.22,0);
  mesh(head,new T.SphereGeometry(.36,16,10,0,Math.PI*2,0,Math.PI*.4),headCloth,0,.27,0);
  const drape=mesh(head,new T.CylinderGeometry(.3,.36,.42,14,1,true,Math.PI*.55,Math.PI*.9),headCloth,0,.05,0);
  drape.material=headCloth.clone();drape.material.side=T.DoubleSide;
  const band=mesh(head,new T.TorusGeometry(.34,.025,6,18),api.mat(new T.Color(scarf).multiplyScalar(.7).getHex()),0,.39,0);band.rotation.x=Math.PI/2;
  const brows=[];
  const eyes=new T.Group();eyes.name='eyes';eyes.position.set(0,.24,.296);head.add(eyes);
  [-1,1].forEach(sd=>{
    const e=mesh(eyes,new T.SphereGeometry(.045,10,8),api.mat(0x221d18),sd*.11,0,0);e.scale.set(1,1.15,.7);
    mesh(eyes,new T.SphereGeometry(.012,6,4),api.mat(0xfff8e6),sd*.11+.012,.016,.035);
    const brow=mesh(head,new T.CylinderGeometry(.012,.012,.085,6),api.mat(look.age==='elder'?0xd4c7b4:0x4d3022),sd*.11,.34,.29);brow.rotation.z=Math.PI/2+sd*.12;brows.push(brow);
  });
  mesh(head,new T.SphereGeometry(.038,8,6),skin,0,.17,.32);
  const smile=mesh(head,new T.TorusGeometry(.05,.012,6,12,Math.PI),api.mat(0x68412c),0,.1,.31);smile.rotation.z=Math.PI;
  const mouthOpen=mesh(head,new T.TorusGeometry(.045,.013,6,14),api.mat(0x68412c),0,.1,.31);mouthOpen.scale.y=1.2;mouthOpen.visible=false;
  if(look.beard){const b=mesh(head,new T.SphereGeometry(.24,12,8),api.mat(look.beard===true?(look.age==='elder'?0xd9d2c3:look.hair??0x4d3022):look.beard),0,.015,.18);b.scale.set(1,.65,.55);}
  const arms=[],feet=[],hands=[];
  [-1,1].forEach(sd=>{
    const arm=new T.Group();arm.name=sd<0?'story-arm-left':'story-arm-right';arm.position.set(sd*.34,.84,0);body.add(arm);arms.push(arm);
    mesh(arm,new T.CylinderGeometry(.085,.11,.38,12),cloth,0,-.18,0);
    const hand=new T.Group();hand.position.y=-.4;arm.add(hand);hands.push(hand);
    const palm=mesh(hand,new T.SphereGeometry(.075,10,8),skin,0,0,0);palm.scale.set(.85,1,.7);
    const thumb=mesh(hand,new T.SphereGeometry(.035,8,6),skin,-sd*.055,.018,.025);thumb.scale.y=1.15;
    const foot=new T.Group();foot.position.set(sd*.14,.04,.08);rig.add(foot);feet.push(foot);
    const sandal=mesh(foot,new T.SphereGeometry(.115,10,8),wood,0,0,.03);sandal.scale.set(.8,.5,1.6);
  });
  if(look.cane||look.staff){
    const hand=arms[1],length=look.staff?1.6:1.0;
    const center=look.staff?-.04:-.36;
    mesh(hand,new T.CylinderGeometry(.025,.03,length,8),wood,.035,center,.08);
    if(look.staff){const crook=mesh(hand,new T.TorusGeometry(.11,.027,6,12,Math.PI),wood,-.075,center+length/2,.08);crook.rotation.z=.12;}
  }
  const actor={g,rig,body,head,arms,feet,hands,eyes,brows,smile,mouthOpen,phase:(S.people.length-1)*1.17,talkUntil:0};g.userData.storyActor=actor;
  return g;
}


  function clothTentMesh(o) {
  const {x,z,color=0xb9a583,distant=false,glow=false}=o;
  const T=api.THREE,g=new T.Group();g.position.set(x,api.terrain(x,z),z);g.name=distant?'distant-cloth-tent':'camp-cloth-tent';
  const cloth=api.texMat(color,'cloth').clone();cloth.side=T.DoubleSide;
  const edge=api.texMat(new T.Color(color).multiplyScalar(.75).getHex(),'cloth'),wood=api.texMat(0x746049,'wood');
  const panel=(pts)=>{const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts.flat(),3));geo.setAttribute('uv',new T.Float32BufferAttribute(pts.length===4?[0,0,1,0,1,1,0,1]:[0,0,1,0,.5,1],2));geo.setIndex(pts.length===4?[0,1,2,0,2,3]:[0,1,2]);geo.computeVertexNormals();const m=new T.Mesh(geo,cloth);m.castShadow=true;m.receiveShadow=true;g.add(m);};
  const bar=(a,b,r,mat)=>{const v=new T.Vector3(...b).sub(new T.Vector3(...a)),m=new T.Mesh(new T.CylinderGeometry(r,r,v.length(),6),mat);m.position.copy(new T.Vector3(...a).addScaledVector(v,.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());m.castShadow=true;g.add(m);};
  [-1,1].forEach(sd=>{
    panel([[sd*1.45,.12,1.45],[sd*1.45,.12,-1.45],[0,2.18,-1.45],[0,2.18,1.45]]);
    // Front flaps leave a dark, recognizable doorway rather than a solid triangle.
    panel([[sd*1.45,.12,1.45],[sd*.48,.12,1.45],[sd*.24,1.4,1.45],[0,2.18,1.45]]);
    bar([sd*1.45,.12,1.45],[0,2.18,1.45],.025,edge);
    bar([sd*1.45,.12,-1.45],[0,2.18,-1.45],.025,edge);
  });
  panel([[-1.45,.12,-1.45],[1.45,.12,-1.45],[0,2.18,-1.45]]);
  bar([0,2.18,-1.5],[0,2.18,1.5],.045,wood);
  bar([0,.04,-1.4],[0,2.18,-1.4],.045,wood);
  const floor=new T.Mesh(new T.PlaneGeometry(2.7,2.7),api.texMat(0x6e6552,'weave'));floor.rotation.x=-Math.PI/2;floor.position.y=.03;g.add(floor);
  api.scenery(g);api.fadeScenery(g,2.3);
  if(glow){const wick=new T.Mesh(new T.SphereGeometry(.065,8,6),new T.MeshBasicMaterial({color:0xffd394}));wick.position.set(.25,.24,1.18);wick.scale.y=1.4;g.add(wick);}
  return g;
}


  // Opt-in body pose. World position, facing and every gameplay rule remain with the level.
  function poseStoryPerson(g,o={}) {
    const a=g.userData.storyActor;if(!a)return false;
    const t=S.time,blend=Math.min(1,Math.max(0,o.dt||0)*6),stride=o.stride||0,talk=o.talking===undefined?a.talkUntil>t:o.talking;
    a.body.position.y=Math.sin(t*1.8+a.phase)*.012;
    a.body.rotation.z=Math.sin(t*7)*Math.abs(stride)*.025;
    const pitch=o.headPitch||0;
    a.head.rotation.x+=((pitch+(talk?Math.sin(t*5)*.045:Math.sin(t*1.3+a.phase)*.02))-a.head.rotation.x)*blend;
    a.feet.forEach((f,i)=>{f.position.z=.08+Math.sin(t*7+i*Math.PI)*Math.abs(stride)*.17;f.position.y=.04+Math.max(0,Math.sin(t*7+i*Math.PI))*.09*Math.abs(stride);});
    a.arms.forEach((arm,i)=>{
      const grip=o.grip&&o.grip[i];
      if(Array.isArray(grip)&&grip.length===3&&grip.every(Number.isFinite)){
        const v=new THREE.Vector3(...grip).sub(arm.position),length=v.length();
        if(length>.01){const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),v.normalize());arm.quaternion.slerp(q,blend);arm.scale.y+=(Math.max(.65,Math.min(1.4,length/.4))-arm.scale.y)*blend;}
      }else{
        const sd=i?1:-1,x=o.cheer?-.95+Math.sin(t*5+a.phase)*.12:talk&&i===1?-.6+Math.sin(t*4)*.12:Math.sin(t*7+i*Math.PI)*Math.abs(stride)*.25,z=o.cheer?-sd*.6:talk&&i===1?-.55:sd*.22;
        arm.rotation.x+=(x-arm.rotation.x)*blend;arm.rotation.y+=(0-arm.rotation.y)*blend;arm.rotation.z+=(z-arm.rotation.z)*blend;arm.scale.y+=(1-arm.scale.y)*blend;
      }
    });
    const expression=o.expression||'calm';a.expression=expression;
    a.brows.forEach((b,i)=>{const sd=i?1:-1,y=expression==='wonder'?.40:expression==='listen'?.365:.34,angle=Math.PI/2+sd*(expression==='worry'?-.28:expression==='wonder'?.04:.12);b.position.y+=(y-b.position.y)*blend;b.rotation.z+=(angle-b.rotation.z)*blend;});
    a.smile.visible=expression!=='wonder';a.mouthOpen.visible=expression==='wonder';
    return true;
  }

  // A varied look for someone in a crowd, the same every time for the same i: heights, ages, beards,
  // stripes, belts and headbands. Only for anonymous crowds: named people keep the look the story gives them.
  const CROWD_HAIR = [0x3b2412, 0x2a1a0e, 0x5a3a1e, 0x1c1917];
  function crowdLook(i) {
    const h = (n) => ((Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const age = i % 6 === 4 ? 'child' : i % 5 === 2 ? 'elder' : undefined;
    const o = { age, hair: age === 'elder' ? 0xe7e5e4 : CROWD_HAIR[i % 4], height: age ? 1 : 0.92 + h(1) * 0.16 };
    if (age !== 'child' && i % 2 === 0) o.beard = true;
    if (age === 'elder' && h(2) < 0.6) o.cane = true;
    if (h(3) < 0.4) o.stripes = [0xf5f5f4, 0x7c2d12, 0x1e3a8a, 0xca8a04][Math.floor(h(4) * 4)];
    if (h(5) < 0.5) o.belt = [0x6b4a2b, 0x92400e, 0x44403c][Math.floor(h(6) * 3)];
    if (h(7) < 0.35) o.band = [0xb91c1c, 0x0e7490, 0xca8a04][Math.floor(h(8) * 3)];
    return o;
  }
  SQ.crowdLook = crowdLook;
  SQ.personMesh = personMesh; SQ._playerMesh = (i) => buildPlayerMesh(ROLES[i || 0]);

  const api = {
    get THREE() { return THREE; },
    /** the family's settings a level may honour: { gentle } (gentler sneaking) */
    get settings() { return { gentle: setting('gentle') === '1' }; },
    /** a friendly round townsperson (robe colour, head-cloth colour, size, look). Children: [0] robe, [1] head, [2] cloth.
     *  look (optional): { age: 'elder'|'child', beard, hair, stripes, belt, band, cane } */
    person(robe, scarf, s, o) { return personMesh(robe, scarf, s, o); },
    /** Opt-in jointed person; userData.storyActor holds presentation joints. Same color/size/look arguments as person. */
    storyPerson(robe,scarf,s,o) { return storyPersonMesh(robe,scarf,s,o); },
    /** Animate a storyPerson's joints only: {dt,stride?,talking?,headPitch?,expression?:calm|listen|worry|wonder,cheer?}. */
    posePerson: poseStoryPerson,
    /** Batched, non-solid pitched tent {x,z,color?,distant?,glow?}; softens behind players. */
    clothTent: clothTentMesh,
    /** Soft round star points, with a shared small texture and an independent material. */
    starMaterial,
    /** Show/hide the finish placard; optional guide shows/hides its tall arrow. Scroll, zone and HUD remain. */
    finishCaption(show,guide) { const m=S.finishMarker;if(m){m.captionHidden=!show;if(guide!==undefined)m.guideHidden=!guide;if(m.label)m.label.visible=!!show&&m.ready;} },
    /** someone in a crowd: the i-th look of a varied set (heights, ages, beards, stripes). Same i, same look */
    crowdPerson(i, robe, scarf, s) { const o = crowdLook(i); return personMesh(robe, scarf, (s || 1) * o.height, o); },
    get scene() { return S.scene; },
    get time() { return S.time; },
    get roles() { return ROLES; },
    mat,
    terrain,
    groundAt,

    /** add any THREE object to the scene */
    add(obj) { S.scene.add(obj); return obj; },
    /** Batch a static scenery group; does not register collision or interactions. */
    scenery(obj) { mergeStatic(obj,[]);obj.traverse(m=>{if(m.isMesh)m.receiveShadow=true;});return api.add(obj); },
    /** Brief mesh-only gesture toward a world point; never moves the player. */
    gesture(p,kind,at,duration) { beginGesture(p,kind,at,duration); },
    /** Scenery such as a sail softens when it blocks a player, like the trees. */
    fadeScenery(obj,r) { S.fadeables.push({obj,x:obj.position.x,y:obj.position.y,z:obj.position.z,r:r||3,a:1}); return obj; },

    /** Eroded stone faces on an existing box footprint. The walkable cap stays flat. */
    rockBox(o) {
      const h=api.box(Object.assign({},o,{tex:'stone',house:false})),geo=new THREE.BoxGeometry(o.w,o.h,o.d,Math.max(2,Math.ceil(o.w/1.4)),Math.max(3,Math.ceil(o.h/.7)),Math.max(2,Math.ceil(o.d/1.4))),p=geo.attributes.position,colors=[];
      for(let i=0;i<p.count;i++){
        let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const f=Math.sin(Math.PI*(y/o.h+.5)),wave=.5+.5*Math.sin(x*2.3+z*1.7+y*3.1);
        if(Math.abs(x)>o.w/2-.001)x-=Math.sign(x)*Math.min(.22,o.w*.06)*f*(.35+.65*wave);
        if(Math.abs(z)>o.d/2-.001)z-=Math.sign(z)*Math.min(.22,o.d*.06)*f*(.35+.65*wave);
        p.setXYZ(i,x,y,z);const c=new THREE.Color(o.color||0x8b8178).multiplyScalar(.86+.1*Math.sin(y*4.7+Math.sin(x*.8+z*.6)*.6));colors.push(c.r,c.g,c.b);
      }
      geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));worldUV(geo,1.8);geo.computeVertexNormals();h.mesh.geometry=geo;h.mesh.material=texMat(0xffffff,'stone').clone();registerSurface(h.mesh.material,'stone');h.mesh.material.vertexColors=true;h.mesh.userData.landmark='layered-rock';const cap=h.mesh.getObjectByName('cap');if(cap)h.mesh.remove(cap);return h;
    },

    /** Uneven layered mountain scenery. No platform, item or route is created. */
    rockMass(o) {
      const pos=[],idx=[],colors=[],rings=[[0,1],[.16,.91],[.36,.73],[.59,.49],[.8,.28],[1,.025]],n=15;
      rings.forEach(([y,r],j)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2,noise=Math.sin(i*2.17+(o.seed||0))*.1+Math.cos(i*4.3+j*.6)*.045,rr=r*(1+noise),c=new THREE.Color(o.color||0x777064).multiplyScalar(.82+j*.025+(i%3)*.035);pos.push(Math.cos(a)*rr*o.w/2+(y*.12)*o.w, y*o.h,Math.sin(a)*rr*o.d/2);colors.push(c.r,c.g,c.b);if(j<rings.length-1){const a0=j*n+i,b=j*n+(i+1)%n,c0=b+n,d=a0+n;idx.push(a0,d,b,b,d,c0);}}});
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(idx);worldUV(geo,3);geo.computeVertexNormals();const material=texMat(0xffffff,'stone').clone();registerSurface(material,'stone');material.vertexColors=true;const mesh=new THREE.Mesh(geo,material);mesh.position.set(o.x,o.y||0,o.z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.landmark='rock-ridge';api.add(mesh);return mesh;
    },

    /** Solid box you can stand on. y = bottom (default: ground). Returns {mesh, platform, show(bool)} */
    box(o) {
      const y = o.y !== undefined ? o.y : terrain(o.x, o.z);
      const material = o.truth
        ? new THREE.MeshLambertMaterial({ color: o.color || 0xfde68a, emissive: 0x8a6d00, transparent: true, opacity: 0.15 })
        : o.lie ? new THREE.MeshLambertMaterial({ color: o.color || 0x9c6b36, transparent: true, opacity: 1 })
        : texMat(new THREE.Color(o.color || 0x9c6b36).multiplyScalar(o.h <= 2.5 ? 0.86 : 1).getHex(), o.tex === undefined ? boxTex(o.color || 0x9c6b36, o.h) : o.tex);
      const rr = o.truth || o.lie ? 0 : Math.min(0.12, Math.min(o.w, o.h, o.d) * 0.2);
      const bgeo = rr > 0.02 ? roundedBox(o.w, o.h, o.d, rr) : new THREE.BoxGeometry(o.w, o.h, o.d);
      if (!o.truth && !o.lie && !bgeo.userData.wuv) { worldUV(bgeo, boxTex(o.color || 0x9c6b36, o.h) === 'brick' ? 2.4 : 1.6); bgeo.userData.wuv = true; }
      const mesh = new THREE.Mesh(bgeo, material);
      if (!o.truth && !o.lie && o.h <= 2.5) {             // the top you stand on is lighter than the sides (easy to read where to land)
        const c = new THREE.Color(o.color || 0x9c6b36); c.lerp(new THREE.Color(0xffffff), 0.24);
        const tk = o.tex === undefined ? boxTex(o.color || 0x9c6b36, o.h) : o.tex;
        const capGeo = new THREE.PlaneGeometry(Math.max(0.1, o.w - rr * 2), Math.max(0.1, o.d - rr * 2)); scaleUV(capGeo, Math.max(0.1, o.w - rr * 2) / 1.6, Math.max(0.1, o.d - rr * 2) / 1.6);
        const cap = new THREE.Mesh(capGeo, tk ? texMat(c.getHex(), tk === 'stone' ? 'paving' : tk) : mat(c.getHex()));
        cap.rotation.x = -Math.PI / 2; cap.position.y = o.h / 2 + 0.006; cap.receiveShadow = true; cap.name = 'cap'; mesh.add(cap);
      }
      mesh.position.set(o.x, y + o.h / 2, o.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      S.scene.add(mesh);
      const platform = o.solid === false || o.lie ? null : addPlatform(o.x - o.w / 2, o.x + o.w / 2, o.z - o.d / 2, o.z + o.d / 2, y, y + o.h);
      if (platform) platform.tex = o.tex === undefined ? boxTex(o.color || 0x9c6b36, o.h) : o.tex;
      const h = {
        mesh, platform, color: o.color,
        show(v) { mesh.visible = v; if (platform) platform.on = v; }
      };
      if (o.hidden) h.show(false);
      if (houseLike(o)) (S.houseBoxes = S.houseBoxes || []).push({ o, mesh, platform });
      if (o.h >= 1.2 && !o.truth && !o.lie && !o.hidden && o.solid !== false && o.ao !== false && Math.min(o.w, o.d) >= 0.6 && Math.abs(y - terrain(o.x, o.z)) < 0.4)
        (S.groundBoxes = S.groundBoxes || []).push({ o, mesh, y });
      if (o.h > 2.5 && !o.truth && !o.lie)                // tall walls and houses fade when they hide a player
        S.fadeables.push({ obj: mesh, x: o.x, y: y + Math.min(o.h, 6) / 2, z: o.z, r: Math.min(4, Math.max(o.w, o.d) * 0.55), a: 1 });
      if (o.truth && platform) { platform.on = false; S.truthBoxes.push(h); }
      if (o.lie) S.lieBoxes.push(h);                      // looks solid, isn't; the Belt of Truth shows it
      return h;
    },

    /**
     * Crumbling platform: shakes when someone stands on it, falls after `delay` s, comes back after `respawn` s.
     * o = { x, z, top, w=1.8, d=1.8, delay=0.7, respawn=3 }
     */
    crumble(o) {
      const w = o.w || 1.8, d = o.d || 1.8, h = 0.4, y = o.top - h;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: o.color || 0xc8a46a }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      // cracks so kids can tell it apart
      const crack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.02, 0.06), mat(0x5c3d22));
      crack.position.y = h / 2 + 0.01; crack.rotation.y = 0.5; mesh.add(crack);
      const crack2 = crack.clone(); crack2.rotation.y = -0.7; mesh.add(crack2);
      mesh.position.set(o.x, y + h / 2, o.z);
      S.scene.add(mesh);
      const c = { o, mesh, y, h, t: 0, state: 'idle', delay: o.delay || 0.7, respawn: o.respawn || 3,
        platform: addPlatform(o.x - w / 2, o.x + w / 2, o.z - d / 2, o.z + d / 2, y, y + h) };
      S.crumbles.push(c);
      return c;
    },

    /** Spring pad: launches whoever lands on it. o = { x, z, top?, power=19 } (top = ground if omitted) */
    spring(o) {
      // on a slope, sit on the low side so you can always walk onto it (rise ≤ stepUp)
      const low = o.top !== undefined ? 0 : Math.min(...[[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].map(([dx, dz]) => terrain(o.x + dx, o.z + dz)));
      const top = o.top !== undefined ? o.top : low + 0.35;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.2, 14), mat(0x475569)); base.position.y = -0.25; g.add(base);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 14), mat(0x94a3b8)); coil.rotation.x = Math.PI / 2; coil.position.y = -0.1; g.add(coil);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 14), mat(0xef4444, { emissive: 0x5a0d0d })); pad.position.y = 0; g.add(pad);
      g.position.set(o.x, top - 0.06, o.z);
      S.scene.add(g);
      if (o.top !== undefined && o.top > terrain(o.x, o.z) + 0.6) {   // a raised spring stands on a post
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, top - terrain(o.x, o.z) - 0.35, 1.2), mat(0x8b8178));
        post.position.set(o.x, (top - 0.35 + terrain(o.x, o.z)) / 2, o.z); S.scene.add(post); o._post = post;
        addPlatform(o.x - 0.6, o.x + 0.6, o.z - 0.6, o.z + 0.6, terrain(o.x, o.z), top - 0.35);
      }
      const sp = { o, g, pad, power: o.power || 19, squash: 0,
        platform: addPlatform(o.x - 0.8, o.x + 0.8, o.z - 0.8, o.z + 0.8, top - 0.4, top) };
      S.springs.push(sp);
      return sp;
    },

    /**
     * Rotating log to jump over (a 'bump': knocks you back, no harm; the Breastplate stands firm).
     * o = { x, z, y? (bottom of the log, default ground), length=6, speed=1.4 (radians/s) }
     */
    sweeper(o) {
      const y = o.y !== undefined ? o.y : terrain(o.x, o.z);
      const L = o.length || 6;
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 10), mat(0x6b4a2b)); post.position.y = 0.6; g.add(post);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, L, 10), mat(0x8b5e34)); log.rotation.z = Math.PI / 2; log.position.y = 0.45; log.castShadow = true; g.add(log);
      [-1, 1].forEach((sd) => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), mat(0xfacc15)); cap.rotation.z = Math.PI / 2; cap.position.set(sd * L / 2, 0.45, 0); g.add(cap); });
      g.position.set(o.x, y, o.z);
      S.scene.add(g);
      S.circles.push({ x: o.x, z: o.z, r: 0.45, top: y + 1.2, on: true });
      const sw = { o, g, y, L, a: o.angle || 0, speed: o.speed || 1.4 };
      if(!S.level.solemn){
        const hint=new THREE.Mesh(new THREE.RingGeometry(Math.max(.5,L/2-.35),L/2+.4,24,1,0,Math.PI*.28),new THREE.MeshBasicMaterial({color:0xf5bd4d,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));
        hint.rotation.x=-Math.PI/2;hint.position.set(o.x,y+.035,o.z);const other=new THREE.Mesh(hint.geometry,hint.material);other.rotation.z=Math.PI;hint.add(other);S.scene.add(hint);sw.forecast=hint;
      }
      S.sweepers.push(sw);
      return sw;
    },

    /**
     * An angry animal to dodge, never to fight (a lion or bear by the flock, a wild ox). It wanders near home,
     * notices someone on the same level within `sight`, stamps and roars (`warn` seconds: a red ! shows), then
     * charges in a straight line. A hit costs a heart (a ridden animal takes it instead). After a charge it is
     * tired for a moment. Standing up on a box or ledge (1.4 higher) is always safe.
     * o = { kind, x, z, r: territory (8), sight (7), speed (9), warn (0.9), tired (1.8), scale, msg }
     * Frogs and other small hoppers: o.mode = 'hop' — they hop about and bump you back (no heart lost).
     */
    critter(o) { return makeCritter(o); },
    /**
     * Hail from the sky (Exodus 9:23): a shadow grows for a second, then a hailstone lands. A hit costs a heart
     * unless the Shield of Faith blocks it. Under a roof you are safe. Returns { on } (set on = false to stop).
     * o = { minX, maxX, minZ, maxZ, every: seconds between stones (0.35), near: aim near players (0.7), msg }
     */
    /** Darkness over the land (Exodus 10:22): 0 = the level's own light, 1 = very dark. Changes smoothly; every
     *  player carries a small lamp while it is dark. Place your own lamps (THREE.PointLight) to light a path. */
    darkness(k) { S.darkTarget = Math.max(0, Math.min(1, k)); },
    hail(o) { const h = Object.assign({ on: true, every: 0.35, near: 0.7, t: 0, stones: [] }, o); (S.hails = S.hails || []).push(h); return h; },

    /** Music on/off (e.g. api.music(false) for a quiet, solemn moment). */
    music(on) { if (on) Audio.startMusic(S.level.music); else Audio.stopMusic(); },

    /** The level's one Golden Scroll (third star). Usually at the end of api.course. */
    goldScroll(x, z, y) {
      const g = new THREE.Group();
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12), mat(0xfacc15, { emissive: 0x9a6b00 }));
      roll.rotation.z = Math.PI / 2; g.add(roll);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
      g.add(ring);
      addGlow(g, 0xfff3a0, 3.2, 0.6);
      const gy = y !== undefined ? y : groundAt(x, z) + 1.3;
      g.position.set(x, gy, z);
      S.scene.add(g);
      S.gold = { g, ring, x, y: gy, z };
      return S.gold;
    },

    /**
     * An optional challenge course ending in the Golden Scroll.
     * steps: [{ x, z, top, kind: 'block' | 'float' | 'crumble' | 'spring' }, ...]
     * Rules (the test plays every course): rise ≤ 1.2 per jump (≤ 4.5 from a spring),
     * gap ≤ 2.4 between platform edges. The scroll floats above the last step.
     */
    course(steps) {
      steps.forEach((st) => {
        const k = st.kind || 'float';
        if (k === 'block') (S.courseParts = S.courseParts || []).push({ k, st, h: api.box({ x: st.x, z: st.z, w: 1.8, d: 1.8, h: st.top - terrain(st.x, st.z), color: 0x9a8f80, house: false }) });
        else if (k === 'float') (S.courseParts = S.courseParts || []).push({ k, st, h: api.box({ x: st.x, z: st.z, w: 1.8, d: 1.8, h: 0.4, y: st.top - 0.4, color: 0xb59a6d }) });
        else if (k === 'crumble') api.crumble({ x: st.x, z: st.z, top: st.top });
        else if (k === 'spring') (S.courseParts = S.courseParts || []).push({ k, st, sp: api.spring({ x: st.x, z: st.z, top: st.top }) });
        else throw new Error('api.course: unknown step kind "' + k + '". Use block, float, crumble or spring.');
      });
      const last = steps[steps.length - 1];
      api.goldScroll(last.x, last.z, last.top + 1.3);
      S.courses.push(steps);
      if (!S.level.solemn && S.level.trails !== false) {         // leaf arcs show every jump (like coin lines)
        for (let i = 0; i + 1 < steps.length; i++) {
          const a = steps[i], b = steps[i + 1];
          if ((a.kind || 'float') === 'spring') api.leaves([[a.x, a.z, a.top + 2.4], [a.x, a.z, a.top + 3.8]]);
          else api.arc([a.x, a.z, a.top], [b.x, b.z, b.top], Math.hypot(b.x - a.x, b.z - a.z) > 3.2 ? 2 : 1);
        }
      }
    },

    /**
     * A bonus challenge corner with extra leaves. Needs about 6 units of open, flat ground.
     * o = { x, z, dir = 1 (the tower runs toward -z when 1, +z when -1), sweeper = true, tower = true, crumbles = true }
     *   sweeper: a spinning log at (x-3, z) guarding 5 leaves.
     *   tower:   a spring at (x+1.5, z+1.2*dir) bounces you onto a high ledge with 3 leaves;
     *            crumbling steps lead back down (one leaf on each).
     */
    challenge(o) {
      const s = o.dir || 1;
      if (o.sweeper !== false) {
        const sx = o.x - 3, sz = o.z;
        api.sweeper({ x: sx, z: sz, length: 5, speed: 1.5 });
        api.leaves([[sx, sz], [sx + 1.4, sz], [sx - 1.4, sz], [sx, sz + 1.4], [sx, sz - 1.4]]);
      }
      if (o.tower !== false) {
        const tx = o.x + 1.5, lz = o.z - 1.2 * s;
        const sp = api.spring({ x: tx, z: o.z + 1.2 * s });
        const top = sp.platform.top + 4.2;
        api.box({ x: tx, z: lz, w: 2.2, d: 2.2, h: 0.4, y: top - 0.4, color: 0xb59a6d });
        api.leaves([[tx - 0.6, lz, top + 0.9], [tx + 0.6, lz, top + 0.9], [tx, lz - 0.6 * s, top + 0.9]]);
        if (o.crumbles !== false) {
          [1, 2].forEach((k) => {
            const cz = lz - (0.2 + 2.2 * k) * s;
            api.crumble({ x: tx, z: cz, top: top - 1.2 * k });
            api.leaves([[tx, cz, top - 1.2 * k + 0.9]]);
          });
        }
      }
    },

    /**
     * Moving platform that carries whoever stands on it.
     * o = { w, h, d, color?, path: [[x,y,z], ...] (y = bottom), speed = 3, wait = 0.6, loop = false }
     *   or  path: (t) => [x, y, z]   for any custom motion (e.g. circles)
     * Returns { mesh, platform, pos }
     */
    mover(o) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat(o.color || 0xb0834c));
      mesh.castShadow = true; mesh.receiveShadow = true;
      S.scene.add(mesh);
      const m = { o, mesh, seg: 0, segT: 0, waitT: o.wait === undefined ? 0.6 : o.wait, dir: 1,
        pos: new THREE.Vector3(), platform: addPlatform(0, 0, 0, 0, 0, 0), t: 0 };
      const start = typeof o.path === 'function' ? o.path(0) : o.path[0];
      m.pos.set(start[0], start[1], start[2]);
      placeMover(m);
      S.movers.push(m);
      return m;
    },

    /** Push a player (wind, currents). vx/vz = units per second. The Breastplate of Righteousness stands firm. */
    push(p, vx, vz, dt) {
      if (!p || p.bubble || p.carriedBy || p.armor.breastplate) return;
      p.pos.x += vx * dt; p.pos.z += vz * dt;
      resolveSides(p.pos, T.playerRadius, p.pos.y);
    },

    /**
     * Story cards (game pauses). pages = [{ art: '🍎', title, text, ref? }]
     * With ref, text is shown as an exact KJV quote; without ref, as narration.
     */
    story(pages, onDone) { showStory(pages, onDone); },

    /** Stump (round platform) */
    stump(x, z, h, r) {
      r = r || 0.9; h = h || 1.0;
      const y = terrain(x, z);
      const m = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(r, r * 1.1, h, 14), 2, 1), texMat(0x7a5230, 'bark'));
      m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.02, 20), texMat(0xd6b07a, 'rings'));
      top.position.set(x, y + h + 0.01, z);
      S.scene.add(m); S.scene.add(top);
      groundBlob(x, z, r * 1.45, y);
      addPlatform(x - r * 0.8, x + r * 0.8, z - r * 0.8, z + r * 0.8, y, y + h);
      return m;
    },

    tree(x, z, scale, leafColor) {
      scale = scale || 1;
      const round = !!(S.level.artDirection&&S.level.artDirection.roundTrees) || ((Math.floor(x * 7.3) + Math.floor(z * 3.1)) % 3 + 3) % 3 === 0;   // about 1 in 3, stable
      const hsl = {}; if (leafColor) new THREE.Color(leafColor).getHSL(hsl);
      const special = leafColor && (hsl.h < 0.17 || hsl.h > 0.45);          // a tree with unusual leaves (purple, gold...) keeps its own look
      const t = (!special && modelTree(x, z, scale, round)) || treeMesh(scale, leafColor, round || special);   // (special trees are round and leafy)
      t.position.set(x, terrain(x, z), z);
      S.scene.add(t);
      groundBlob(x, z, 1.5 * scale, terrain(x, z));
      S.circles.push({ x, z, r: 0.6 * scale, top: terrain(x, z) + 99, on: true });
      S.fadeables.push({ obj: t, x, y: terrain(x, z) + 3.5 * scale, z, r: 2.4 * scale, a: 1 });
      return t;
    },

    rock(x, z, scale) {
      scale = scale || 1;
      const rm = modelInstance(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'][hash2(x, z) % 3], null, 2.5 * scale);
      const r = rm || new THREE.Mesh(scaleUV(new THREE.DodecahedronGeometry(1.2 * scale, 0), 2, 2), texMat(0x7c8085, 'stone'));
      if (rm) { r.position.set(x, terrain(x, z) - 0.1 * scale, z); r.rotation.y = x + z; }
      else { r.position.set(x, terrain(x, z) + 0.5 * scale, z); r.rotation.set(x, z, 0); r.castShadow = true; }
      S.scene.add(r);
      groundBlob(x, z, 1.5 * scale, terrain(x, z));
      S.circles.push({ x, z, r: 1.0 * scale, top: terrain(x, z) + 99, on: true });
      return r;
    },

    /** Small collectibles. points: [[x,z],[x,z,y]...]  (y optional, absolute) */
    leaves(points) {
      const tpl = leafModel();
      const out = [];
      const shines = ['star', 'flame', 'candle', 'coin', 'crown'].indexOf(tpl.userData.shape) >= 0;
      points.forEach((pt) => {
        const mesh = tpl.clone();
        if (shines) addGlow(mesh, tpl.userData.shape === 'flame' || tpl.userData.shape === 'candle' ? 0xffb347 : 0xfde68a, 1.3, 0.38);
        const y = pt[2] !== undefined ? pt[2] : leafRestY(pt[0], pt[1]) + 1.0;
        mesh.position.set(pt[0], y, pt[1]);
        S.scene.add(mesh);
        const lf = { mesh, x: pt[0], y, z: pt[1], got: false, shape: tpl.userData.shape };
        lf.shadow = blobShadow(0.32);
        S.leaves.push(lf); out.push(lf);
      });
      return out;
    },

    /** A trail of leaves along the ground through points [[x,z],...], one every `gap` (2.2). Shows kids the way. */
    trail(points, gap) {
      const g = gap || 2.2, pts = [];
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i], b = points[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(d / g));
        for (let k = i ? 1 : 0; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      return api.leaves(pts);
    },
    /** Leaves along a jump arc from a=[x,z,top] to b=[x,z,top] (where the feet go). Teaches the jump. */
    arc(a, b, n) {
      const pts = [], m = n || 2;
      for (let k = 1; k <= m; k++) {
        const t = k / (m + 1), y = a[2] + (b[2] - a[2]) * t + 4 * 1.1 * t * (1 - t);
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, y + 1.0]);
      }
      return api.leaves(pts);
    },
    /**
     * (api.teamPads({ pads: [[x,z],[x,z]], onOpen(players) }): rings two players stand on together; alone, one is enough.)
     * Clay jars or woven baskets that tip over when bumped and spill 2 hidden leaves (nothing breaks, nobody is hurt).
     * points: [[x,z],...]; kind: 'jar' | 'basket' (default: alternate). The engine also places a few by itself.
     */
    teamPads(o) { return makeTeamPads(o); },
    /**
     * A framed camera view for a tricky stretch with clear landing views: while the group is inside the rectangle,
     * the camera eases to this angle. o = { minX, maxX, minZ, maxZ, yaw = 0 (radians; 0 = from behind, +0.6 = from
     * the right), height = 10, back = 13, focus: [x, y, z] (a point to keep in view, e.g. the next landing), pull = 0.4 }
     */
    camZone(o) { (S.camZones = S.camZones || []).push(o); return o; },
    /** Safe shared respawn point. o={x,z,y?,label?}; invalid water/cliff positions are rejected. */
    checkpoint(o) {return setRunCheckpoint(new THREE.Vector3(o.x,o.y===undefined?groundAt(o.x,o.z):o.y,o.z),o.label||'Checkpoint');},
    /** a real model (CC0, packed in models/*.js): 'PalmTree_1'..'4', 'CommonTree_1/3/5', 'Pine_1/2', 'Willow_1/3', 'Wheat', 'Fern_1',
     *  'Flower_3_Group', 'Rock_Medium_1'..'3', 'WoodLog', 'Lilypad' ... height in metres. Returns null if models are not loaded (use a fallback). */
    model(name, height, width) { return modelInstance(name, height, width); },
    /** a colour with a texture: 'wood' | 'brick' | 'stone' | 'paving' | 'bark' | 'leaves' | 'clay' | 'weave' | 'cloth' | 'mud' | 'ground' */
    texMat(color, tex, opts) { return texMat(color, tex, opts); },
    jars(points, kind) {
      return points.map((pt, i) => makeJar(pt[0], pt[1], kind || (i % 2 ? 'basket' : 'jar')));
    },

    /** Scroll fragment. Touch to collect, or {net:true} = Fisherman action within 7 */
    fragment(o) {
      const g = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.5), mat(0xfde047, { emissive: 0x8a6d00 }));
      g.add(paper);
      [-0.38, 0.38].forEach((x) => {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 8), mat(0x6e4720));
        r.rotation.x = Math.PI / 2; r.position.x = x; g.add(r);
      });
      addGlow(g, 0xfde047, 1.7, 0.5);
      g.scale.setScalar(1.4);
      const y = o.y !== undefined ? o.y : groundAt(o.x, o.z) + 1.2;
      g.position.set(o.x, y, o.z);
      S.scene.add(g);
      const f = { mesh: g, x: o.x, y, z: o.z, got: false, net: !!o.net, baseY: y };
      S.fragments.push(f);
      if (f.net) {
        f.inter = api.interact({
          x: o.x, z: o.z, y, r: o.netReach || 7, vRange: 6,
          label: 'Cast net',
          can: (p) => (p.role.id === 'fisherman' ? true : 'Only the Fisherman can cast a net that far!'),
          use: (p) => { collectFragment(f, p); f.inter.remove(); }
        });
      }
      return f;
    },

    /** Armor of God pickup: type = sandals | shield | helmet | sword */
    armor(type, x, z, y) {
      const def = ARMOR[type];
      if (!def) throw new Error('api.armor: unknown type "' + type + '". Use one of: ' + ARMOR_TYPES.join(', '));
      const g = new THREE.Group();
      const gold = mat(0xfacc15, { emissive: 0x6b4f00 });
      let m;
      if (type === 'shield') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 18), gold); m.rotation.x = Math.PI / 2; }
      else if (type === 'helmet') m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), gold);
      else if (type === 'sandals') m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.7), gold);
      else if (type === 'belt') { m = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 8, 20), gold); m.rotation.x = Math.PI / 2; }
      else if (type === 'breastplate') m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.25), gold);
      else m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), mat(0xfff7d6, { emissive: 0xb59a2a }));
      g.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 24), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const gy = y !== undefined ? y : groundAt(x, z);
      ring.position.set(x, gy + 0.05, z);
      g.position.set(x, gy + 1.3, z);
      S.scene.add(g); S.scene.add(ring);
      const pk = { type, def, mesh: g, ring, x, y: gy, z, got: false, claimed: {} };
      g.visible = ring.visible = false; // earned through a supply puzzle, never a loose spawn pickup
      S.pickups.push(pk);
      return pk;
    },

    /**
     * Something you press ACTION near.
     * o = { x, z, y?, r=2.5, vRange=3, priority=0, can(p) -> true | 'hint text', use(p) }
     * When several are in reach, the highest priority wins, then the nearest.
     * Returns handle { remove(), pos }
     */
    interact(o) {
      const it = Object.assign({ r: 2.5, vRange: 3, alive: true }, o);
      if (it.y === undefined) it.y = groundAt(it.x, it.z);
      it.remove = () => { it.alive = false; };
      S.interactables.push(it);
      return it;
    },

    /** Optional, stationary or moving helper dialogue, available to every role.
     * { person: api.person mesh, label?, speaker?, clue(api,p) -> {text,at?} }
     * Lower priority than puzzles/items, usable while holding, no reward or task progress.
     * Returned interaction supports remove(). The clue function must only read state.
     */
    conversation(o) {
      const person=S.people.find(r=>r.g===o.person);
      if(!person||typeof o.clue!=='function')throw new Error('conversation needs a registered person and clue function');
      const world=new THREE.Vector3();
      const visible=()=>{let g=person.g;while(g&&g!==S.scene){if(!g.visible)return false;g=g.parent;}return g===S.scene;};
      const it=api.interact({x:0,z:0,y:0,r:2.3,vRange:1.5,priority:-1,whileHolding:true,talkPerson:person,
        label:o.label||'Ask the neighbor',
        available:p=>visible()&&!p.riding&&!p.seat&&!p.carrying&&(!o.available||o.available(p)),
        use(p){
          const clue=o.clue(api,p);if(!clue||!clue.text)return;
          const at=clue.at;
          if(Array.isArray(at)&&at.length===3&&at.every(Number.isFinite)){
            S.hint={at:at.slice(),t:18,route:true,getRoute:()=>o.clue(api,p)};S.objectiveTimer=0;
          }
          Audio.sfx('page');toast('💬 '+(o.speaker||'Neighbor')+' · Just for our game\n“'+clue.text+'”',5200);
          person.talked=true;it.spoken=true;
          const actor=person.g.userData.storyActor;if(actor){actor.talkUntil=S.time+3.5;actor.listener=p;}
        }
      });
      for(const [key,axis]of [['x','x'],['y','y'],['z','z']])Object.defineProperty(it,key,{get(){person.g.getWorldPosition(world);return world[axis];},configurable:true});
      return it;
    },

    /**
     * Pick-up-able item.
     * o = { x, z, mesh (THREE object), heavy, deliverTo:{x,z,r,y?}, onDeliver(p,item), label }
     * Heavy items: Builder carries at full speed; others drag slowly.
     */
    carryable(o) {
      const it = Object.assign({ heavy: false, holder: null, delivered: false, blocked: null }, o);
      it.y = groundAt(it.x, it.z);
      it.mesh.position.set(it.x, it.y + 0.3, it.z);
      S.scene.add(it.mesh);
      S.carryables.push(it);
      it.inter = api.interact({
        x: it.x, z: it.z, y: it.y, r: 2.2, item: it,
        label: (p) => o.label || ((it.heavy && !p.role.strong ? 'Drag ' : 'Pick up ') + (o.name || '') + (it.heavy && !p.role.strong ? ' (heavy)' : '')).replace(/ +/g, ' ').trim(),
        can: (p) => (it.blocked ? it.blocked(p) : true),
        use: (p) => pickUpItem(p, it)
      });
      return it;
    },

    /**
     * Animal / creature that follows whoever calls it (ACTION with nothing else nearby).
     * o = { x, z, kind, deliverTo:{x,z,r}, parkAt:[x,y,z] | fn, onDeliver(p, f), sound, callable?(p) -> true | 'hint',
     *       call: false (never answers a call: an animal that is just there, or that the level moves itself) }
     */
    follower(o) {
      const f = Object.assign({ state: 'idle', leader: null, wanderA: Math.random() * 6.28, wanderT: 0 }, o);
      f.mesh = o.mesh || shineUp(animalMesh(o.kind));
      f.pos = new THREE.Vector3(o.x, groundAt(o.x, o.z), o.z);
      f.home = f.pos.clone();
      f.mesh.position.copy(f.pos);
      S.scene.add(f.mesh);
      S.followers.push(f);
      if (o.ride) f.rideInter = api.interact({
        x: f.pos.x, z: f.pos.z, y: f.pos.y, r: 2.2, vRange: 1.6, label: 'Ride the ' + f.kind,
        available: (p) => !p.riding && !p.carrying && f.mesh.visible && (f.state === 'idle' || f.state === 'follow'),
        can: (p) => (f.rideWhen ? f.rideWhen(p) : true),
        use: (p) => mount(p, f)
      });
      return f;
    },

    /**
     * A story countdown for a few urgent moments (before dawn, before the ship breaks up).
     * Never fails the level: use onEnd to miss a bonus or change the story. o = {seconds, label, onEnd()}
     * Returns the countdown: .left (seconds), .over, .stop()
     */
    countdown(o) {
      const c = { left: o.seconds, label: o.label || '⏳', onEnd: o.onEnd, over: false };
      c.stop = () => { c.over = true; renderTimer(); };
      S.countdown = c; renderTimer();
      return c;
    },

    /** Stand-here zone; action optionally requires each helper to press the special-action button first. */
    zone(o) {
      const z = Object.assign({ r: 2.2, time: 4, progress: 0, done: false, visible: true, helpTime: {}, workers: {} }, o);
      if (z.y === undefined) z.y = groundAt(z.x, z.z);
      z.ringMat = new THREE.MeshBasicMaterial({ color: o.color || 0xf59e0b, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      z.ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.35, z.r, 28), z.ringMat);
      z.ring.rotation.x = -Math.PI / 2; z.ring.position.set(z.x, z.y + 0.06, z.z);
      z.fill = new THREE.Mesh(new THREE.CircleGeometry(z.r - 0.35, 28), new THREE.MeshBasicMaterial({ color: o.color || 0xf59e0b, transparent: true, opacity: 0.35 }));
      z.fill.rotation.x = -Math.PI / 2; z.fill.position.set(z.x, z.y + 0.05, z.z); z.fill.scale.setScalar(0.001);
      S.scene.add(z.ring); S.scene.add(z.fill);
      z.show = (v) => { z.visible = v; z.ring.visible = v; z.fill.visible = v; if(!v)z.workers={}; };
      if (o.hidden) z.show(false);
      if (z.action) z.inter = api.interact({
        x:z.x,z:z.z,y:z.y,r:z.r+.8,vRange:z.vRange === undefined ? 2.5 : z.vRange,
        label:z.action,available:p=>z.visible&&!z.done&&!z.workers[p.slot],
        can:p=>insideZone(p,z) ? true : 'Step inside the marked ring to begin.',
        use:p=>{if(insideZone(p,z))z.workers[p.slot]=true;}
      });
      S.zones.push(z);
      return z;
    },

    /** Area that bubbles players. shape {x,z,r} or {x,z,w,d}; o = {except(p)->bool, msg, minY?} */
    hazard(shape, o) {
      const h = Object.assign({ on: true }, shape, o || {});
      S.hazards.push(h);
      return h;
    },

    /** Slows players unless they wear the Sandals of Peace. shape {x,z,w,d} or {x,z,r} */
    mud(shape) {
      S.muds.push(shape);
      // the mud mesh hugs the ground so it works on slopes
      const geo = shape.r !== undefined ? new THREE.CircleGeometry(shape.r, 24, 0, Math.PI * 2)
        : new THREE.PlaneGeometry(shape.w, shape.d, Math.ceil(shape.w / 1.5), Math.ceil(shape.d / 1.5));
      geo.rotateX(-Math.PI / 2);
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, terrain(shape.x + pa.getX(i), shape.z + pa.getZ(i)) + 0.08);
      geo.computeVertexNormals();
      const cols = [], base = new THREE.Color(0x4a3219), dark = new THREE.Color(0x3a2814), wet = new THREE.Color(0x3b4a5a);
      for (let i = 0; i < pa.count; i++) {
        const wx = shape.x + pa.getX(i), wz = shape.z + pa.getZ(i);
        const puddle = Math.sin(wx * 0.9) * Math.cos(wz * 0.7) > 0.75;
        const c = puddle ? wet : base.clone().lerp(dark, 0.5 + 0.5 * Math.sin(wx * 0.6 + wz * 0.45));
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const mm = TEX.mud(); if (mm && geo.attributes.uv) { const uvA = geo.attributes.uv; for (let i = 0; i < pa.count; i++) uvA.setXY(i, pa.getX(i) / 3, pa.getZ(i) / 3); uvA.needsUpdate = true; }
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: mm || null }));
      m.position.set(shape.x, 0, shape.z);
      m.receiveShadow = true;
      S.scene.add(m);
    },

    /** Flood water level (y). Creates the water plane on first call. */
    water(y) {
      S.waterY = y;
      if (!S.waterMesh) {
        const wg = new THREE.PlaneGeometry(600, 600, 90, 90);
        const wmap = TEX.water(); if (wmap) { scaleUV(wg, 60, 60); }
        S.waterMesh = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x1d4ed8, specular: 0x3a5a88, shininess: 40, transparent: true, opacity: 0.66, map: wmap || null }));
        S.waterMesh.rotation.x = -Math.PI / 2;
        S.scene.add(S.waterMesh);
      }
      S.waterMesh.position.y = y;
    },
    get waterY() { return S.waterY; },

    rain(on) { setRain(on); },

    /** Hurt/knock a player. kind: 'falling' (Shield blocks) or 'bump'. */
    hit(p, fromX, fromZ, kind, msg) { hitPlayer(p, fromX, fromZ, kind, msg); },

    task(id, n) { addTask(id, n === undefined ? 1 : n); },
    taskCount(id) { return S.tasks[id] ? S.tasks[id].count : 0; },
    taskDone(id) { return taskComplete(id); },
    servant(p, pts, why) { addServant(p, pts, why); },

    toast, verse,
    /** true when a card with this Scripture ref has already been read this level (to skip a repeat) */
    shownRef(ref) { return !!(S.shownRefs || {})[ref]; },
    sfx(n) { Audio.sfx(n); },

    /** players currently in the game (joined) */
    players() { return S.players.filter((p) => p.joined); },
    /** joined players that are not in a bubble */
    activePlayers() { return S.players.filter((p) => p.joined && !p.bubble); },
    /** all carryable items / all followers (read-only use, e.g. for objective arrows) */
    carryables() { return S.carryables; },
    followers() { return S.followers; },
    /**
     * Something picked up just by running into it, on the way (no carrying back and forth).
     * o = { x, z, y?, mesh, task?, r=1.3, onGet(p) }. Counts toward `task` if given. Returns the item ({ got }).
     */
    gatherable(o) {
      const it = Object.assign({ r: 1.3, got: false }, o);
      if (it.y === undefined) it.y = groundAt(it.x, it.z);
      it.mesh.position.set(it.x, it.y + 0.4, it.z);
      S.scene.add(it.mesh);
      it.shadow = groundBlob(it.x, it.z, 0.5, it.y);
      S.gatherables.push(it);
      return it;
    },
    near(x, z, r) { return api.activePlayers().filter((p) => Math.hypot(p.pos.x - x, p.pos.z - z) <= r); },

    animalMesh, treeMesh,

    /** puff of particles */
    puff(x, y, z, color, n) { spawnPuff(x, y, z, color, n); }
  };
  SQ.api = api;

  // Shared traversal devices. Every required use has a solo alternative; no device awards faith or healing.
  api.teamLift = function(o) {
    const low=o.bottom,high=o.top;
    if(![o.x,o.z,low,high].every(Number.isFinite)||high<=low)throw new Error('teamLift needs x,z,bottom,top');
    const f={o,y:low,target:low,latched:false,moving:false,w:o.w||5,d:o.d||4.2};
    f.mover=api.mover({w:f.w,h:.35,d:f.d,color:0xb68a55,path:()=>[o.x,f.y-.35,o.z]});
    f.mover.platform.tex='wood';f.mover.mesh.material=texMat(0xb68a55,'wood');
    for(const x of [-1,1])for(const z of [-1,1]){
      const mark=new THREE.Mesh(new THREE.BoxGeometry(.24,.035,.65),mat(0xf5d879));mark.position.set(x*(f.w/2-.24),.195,z*(f.d/2-.5));f.mover.mesh.add(mark);
    }
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.18,high-low+3,.18),texMat(0x705031,'wood'));bar.position.set(o.x-f.w/2-.35,(low+high)/2+1,o.z);S.scene.add(bar);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.48,.075,6,20),mat(0x6f6250));wheel.position.set(o.x-f.w/2-.55,low+1,o.z);wheel.rotation.y=Math.PI/2;S.scene.add(wheel);f.wheel=wheel;
    f.above=p=>!p.bubble&&!p.carriedBy&&Math.abs(p.pos.x-o.x)<f.w/2-.1&&Math.abs(p.pos.z-o.z)<f.d/2-.1&&p.pos.y>=f.y-.2&&p.pos.y<f.y+3;
    f.riders=()=>api.players().filter(f.above);
    f.request=target=>{if(f.moving)return;f.target=target;f.moving=Math.abs(target-f.y)>.03;if(f.moving)Audio.sfx('winch');};
    f.frame=new THREE.Group();S.scene.add(f.frame);f.frame.add(bar);f.frame.add(wheel);wheel.name='winch-wheel';
    const ropePoints=[];f.ropeCorners=[];
    for(const dx of [-1,1])for(const dz of [-1,1]){
      const x=o.x+dx*(f.w/2+.25),z=o.z+dz*(f.d/2+.25),base=groundAt(x,z),height=Math.max(1,high+2.2-base);
      const post=new THREE.Mesh(new THREE.BoxGeometry(.13,height,.13),bar.material);post.position.set(x,base+height/2,z);post.castShadow=true;f.frame.add(post);
      const rx=o.x+dx*(f.w/2-.25),rz=o.z+dz*(f.d/2-.25);f.ropeCorners.push([rx,rz]);ropePoints.push(new THREE.Vector3(rx,high+2.1,rz),new THREE.Vector3(rx,low+.15,rz));
    }
    for(const dz of [-1,1]){const beam=new THREE.Mesh(new THREE.BoxGeometry(f.w+.65,.16,.18),bar.material);beam.position.set(o.x,high+2.2,o.z+dz*(f.d/2+.25));beam.castShadow=true;f.frame.add(beam);}
    f.ropes=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePoints),new THREE.LineBasicMaterial({color:0x9b784b}));f.ropes.name='lift-ropes';f.frame.add(f.ropes);mergeStatic(f.frame,['winch-wheel','lift-ropes']);
    const control=o.control||[o.x-f.w/2-1,low,o.z],release=o.release||[o.x+f.w/2+1,high,o.z];
    const latchMarker=new THREE.Group();latchMarker.position.set(release[0]+.5,release[1],release[2]+.5);f.frame.add(latchMarker);
    const latchPost=new THREE.Mesh(new THREE.BoxGeometry(.14,.8,.14),texMat(0x795735,'wood'));latchPost.position.y=.4;latchMarker.add(latchPost);
    f.releaseLever=new THREE.Mesh(new THREE.BoxGeometry(.12,.5,.12),mat(0xe4bc5c));f.releaseLever.position.set(0,.85,0);latchMarker.add(f.releaseLever);
    f.control=api.interact({x:control[0],y:control[1],z:control[2],r:1.7,vRange:.9,whileHolding:true,
      available:()=>f.mover.mesh.visible,label:()=>f.y>low+.1?'Call the lift':api.players().length===1?'Latch and raise the lift':'Raise the lift for a friend',
      status:()=>f.moving?'Lift moving…':null,
      can:()=>f.moving?true:f.y>low+.1?(f.riders().length?'Let riders step onto the landing.':true):(api.players().length===1||f.riders().some(p=>p.onGround&&p.standingOn===f.mover.platform)?true:'Let a friend land on the deck first.'),
      use(){if(f.y>low+.1){if(!f.riders().length)f.request(low);}else f.request(high);}
    });
    f.deck=api.interact({x:o.x,y:low,z:o.z,r:Math.min(f.w,f.d)/2,vRange:3.2,priority:1,whileHolding:true,available:p=>f.mover.mesh.visible&&f.above(p),
      label:()=>f.y<high-.1?'Ride the lift up':'Ride the lift down',status:()=>f.moving?'Lift moving…':null,
      can:p=>f.moving||p.onGround&&p.standingOn===f.mover.platform?true:'Land on the timber deck.',
      use(){f.request(f.y<high-.1?high:low);}
    });
    f.release=api.interact({x:release[0],y:release[1],z:release[2],r:1.65,vRange:.8,whileHolding:true,label:o.releaseLabel||'Open the return shortcut',available:()=>f.mover.mesh.visible&&!f.latched,
      can:p=>p.onGround?true:'Land beside the latch.',use(p){if(f.latched)return;f.latched=true;f.releaseLever.rotation.z=Math.PI/2;this.remove();Audio.sfx('bridge');if(o.onLatch)o.onLatch(p,f);toast('Shortcut open. Everyone can follow!',2600);}
    });
    (S.teamLifts||(S.teamLifts=[])).push(f);return f;
  };
  api.ropeKit = function(o) {
    const kit={o,coils:[]},g=new THREE.Group();g.position.set(o.x,o.y===undefined?groundAt(o.x,o.z):o.y,o.z);S.scene.add(g);
    const base=new THREE.Mesh(new THREE.BoxGeometry(2.5,.25,1.6),texMat(0x8c6943,'wood'));base.position.y=.125;g.add(base);
    for(let i=0;i<4;i++){
      const coil=new THREE.Mesh(new THREE.TorusGeometry(.28,.085,6,18),mat([0x66a4e3,0x6fba83,0xb78bdb,0xe2c466][i]));coil.rotation.x=Math.PI/2;coil.position.set((i%2-.5)*1.05,.35,(Math.floor(i/2)-.5)*.7);g.add(coil);kit.coils.push(coil);
    }
    kit.inter=api.interact({x:o.x,y:g.position.y,z:o.z,r:1.7,vRange:.8,priority:-2,whileHolding:true,label:'Take your rope coil',status:p=>p.tools&&p.tools.rope?'Rope ready':null,
      use(p){p.tools=p.tools||{};if(p.tools.rope)return;p.tools.rope=true;Audio.sfx('pickup');renderHUD();toast('🪢 Rope ready. Use the special action at a rope marker.',3200);}
    });
    (S.ropeKits||(S.ropeKits=[])).push(kit);return kit;
  };
  api.ropeAnchor = function(o) {
    if(!Array.isArray(o.from)||!Array.isArray(o.to)||o.from.length!==3||o.to.length!==3)throw new Error('ropeAnchor needs from/to [x,y,z]');
    const a={o,from:new THREE.Vector3(...o.from),to:new THREE.Vector3(...o.to)};
    a.pivot=new THREE.Vector3((o.from[0]+o.to[0])/2,Math.max(o.from[1],o.to[1])+(o.arc||2.8)+2,(o.from[2]+o.to[2])/2);
    for(const dx of [-1.5,1.5]){const base=groundAt(a.pivot.x+dx,a.pivot.z),h=Math.max(1,a.pivot.y-base);const support=new THREE.Mesh(new THREE.BoxGeometry(.16,h,.16),texMat(0x795735,'wood'));support.position.set(a.pivot.x+dx,base+h/2,a.pivot.z);support.castShadow=true;S.scene.add(support);}
    const crossbar=new THREE.Mesh(new THREE.BoxGeometry(3.3,.18,.2),texMat(0x795735,'wood'));crossbar.position.copy(a.pivot);crossbar.castShadow=true;S.scene.add(crossbar);
    const post=new THREE.Mesh(new THREE.BoxGeometry(.18,2,.18),texMat(0x795735,'wood'));post.position.set(o.from[0],o.from[1]+1,o.from[2]+.85);S.scene.add(post);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.28,.07,6,18),mat(0xe4b957));ring.position.set(o.from[0],o.from[1]+1.5,o.from[2]+.85);S.scene.add(ring);a.ring=ring;
    a.inter=api.interact({x:o.from[0],y:o.from[1],z:o.from[2],r:1.6,vRange:.75,whileHolding:true,label:o.label||'Swing across with your rope',
      can:p=>!p.tools||!p.tools.rope?'Take your rope coil from the timber stand.':p.carriedBy||p.carrying||p.riding||p.seat?'Stand on foot to use the rope.':!p.onGround?'Land beside the rope marker.':!safeStanding(p,{x:a.to.x,y:a.to.y,z:a.to.z})?'The landing is not clear.':true,
      use(p){
        if(p.ropeSwing||!p.tools||!p.tools.rope||!p.onGround||p.carriedBy||p.carrying||p.riding||p.seat)return;
        const offset=api.players().length>1?[(p.slot%2-.5)*.85,(Math.floor(p.slot/2)-.5)*.85]:[0,0];
        const end=safeStanding(p,{x:a.to.x+offset[0],y:a.to.y,z:a.to.z+offset[1]})||safeStanding(p,{x:a.to.x,y:a.to.y,z:a.to.z});if(!end)return;
        p.ropeSwing={anchor:a,start:p.pos.clone(),end,t:0};p.vel.set(0,0,0);p.onGround=false;p.standingOn=null;
        if(!p.ropeLine){p.ropeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.pivot,p.pos]),new THREE.LineBasicMaterial({color:0xb48b50}));S.scene.add(p.ropeLine);}
        p.ropeLine.visible=true;Audio.sfx('rope');
      }
    });
    (S.ropeAnchors||(S.ropeAnchors=[])).push(a);return a;
  };
  api.discovery = function(o) {
    if(!o.id)throw new Error('discovery needs a stable id');
    const d=Object.assign({r:1.8,vRange:1.2,y:groundAt(o.x,o.z),found:false},o);
    if((S.discoveries||[]).some(v=>v.id===d.id))throw new Error('duplicate discovery id '+d.id);
    (S.discoveries||(S.discoveries=[])).push(d);return d;
  };
  api.secretPocket = function(o) {
    const y=o.y===undefined?groundAt(o.x,o.z):o.y,w=o.w||6,d=o.d||5;
    const base=terrain(o.x,o.z);if(y-.3>base+.05)api.box({x:o.x,z:o.z,y:base,w,h:y-.3-base,d,color:0xc9b28b,tex:'brick',house:false});
    const floor=api.box({x:o.x,z:o.z,y:y-.3,w,h:.3,d,color:0xb59362,tex:'wood',house:false});
    // Cutaway front: the player can see the interior, the return path and every teammate.
    api.box({x:o.x,z:o.z-d/2,y,w,h:2.8,d:.25,color:0xc9b28b,house:false});
    for(const dx of [-w/2,w/2])api.box({x:o.x+dx,z:o.z,y,w:.25,h:2.8,d,color:0xc9b28b,house:false});
    for(const dx of [-w/2+.8,w/2-.8]){const crate=new THREE.Mesh(new THREE.BoxGeometry(.9,.8,.9),texMat(0x9b7446,'wood'));crate.position.set(o.x+dx,y+.4,o.z-d/2+.85);S.scene.add(crate);}
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffdf8e}));glow.position.set(o.x+w/2-.6,y+1.9,o.z-d/2+.5);S.scene.add(glow);
    const found=api.discovery({id:o.id,name:o.name||'A quiet storeroom',x:o.x,y,z:o.z,r:Math.min(w,d)/2-.5});
    if(o.fragment)api.fragment({x:o.x,z:o.z-1,y:y+1.3});
    return {floor,found};
  };
  api.teamTrial=function(o){
    if(!o.id||!o.start||!o.stages||!o.stages.length)throw new Error('teamTrial needs id,start,stages');
    const saved=loadProgress().levels[S.level.id]||{};
    const t={o,active:false,won:false,stage:0,elapsed:0,team:[],rings:[],bestTimes:Object.assign({},saved.trials&&saved.trials[o.id]||{})};
    for(const at of o.stages){const ring=new THREE.Mesh(new THREE.RingGeometry((at[3]||2)-.12,at[3]||2,28),new THREE.MeshBasicMaterial({color:0xf3c55f,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(at[0],at[1]+.04,at[2]);ring.visible=false;S.scene.add(ring);t.rings.push(ring);}
    const marker=new THREE.Group();marker.position.set(o.start[0]+.75,o.start[1],o.start[2]+.65);S.scene.add(marker);t.marker=marker;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.75,6),mat(0x735435));pole.position.y=.375;marker.add(pole);
    for(const y of [.78,1.12]){const rim=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.06,10),mat(0x89623d));rim.position.y=y;marker.add(rim);}
    for(const [y,rot]of [[.87,0],[1.03,Math.PI]]){const sand=new THREE.Mesh(new THREE.ConeGeometry(.16,.18,10),mat(0xe8c66e));sand.position.y=y;sand.rotation.z=rot;marker.add(sand);}
    t.inter=api.interact({x:o.start[0],y:o.start[1],z:o.start[2],r:o.r||1.7,vRange:.8,priority:-1,whileHolding:true,label:()=>{const key=(S.lifeMode||'adventure')+':'+api.players().filter(p=>present(p)).length,best=t.bestTimes[key];return(o.label||'Try the optional team dash')+(setting('records')==='1'&&Number.isFinite(best)?' · best '+best.toFixed(1)+'s':'');},available:p=>!o.available||o.available(p),status:()=>t.active?'Dash running — follow the gold rings':null,
      can:()=>S.countdown&&!S.countdown.over&&!t.active?'Finish the current timed activity first.':api.players().some(p=>present(p)&&(p.bubble||p.carriedBy||Math.hypot(p.pos.x-o.start[0],p.pos.z-o.start[2])>5||Math.abs(p.pos.y-o.start[1])>1.2))?'Gather the team near the dash marker.':true,
      use(){if(t.active)return;t.team=api.players().filter(p=>present(p));if(!t.team.length)return;t.active=true;t.stage=0;t.elapsed=0;t.cancelled=false;t.rings.forEach((r,i)=>{r.visible=i===0;r.material.color.setHex(0xf3c55f);});
        t.clock=api.countdown({seconds:o.seconds||24,label:'Optional team dash',onEnd(){if(!t.active)return;t.active=false;t.rings.forEach(r=>r.visible=false);toast('Time is up. Try the dash again whenever you like.',3000);}});Audio.sfx('rope');
      }
    });
    (S.trials||(S.trials=[])).push(t);return t;
  };
  function updateTrials(dt){
    for(const t of S.trials||[]){
      if(!t.active)continue;
      if(t.team.some(p=>!p.joined||!present(p))){t.active=false;t.cancelled=true;t.clock.stop();t.rings.forEach(r=>r.visible=false);toast('A controller left. Gather and try the dash again.',2800);continue;}
      t.elapsed+=dt;const a=t.o.stages[t.stage];
      if(!t.team.every(p=>!p.bubble&&!p.carriedBy&&p.onGround&&Math.hypot(p.pos.x-a[0],p.pos.z-a[2])<(a[3]||2)&&Math.abs(p.pos.y-a[1])<.65))continue;
      t.rings[t.stage].material.color.setHex(0x7abd82);t.rings[t.stage].visible=false;t.stage++;Audio.sfx('pickup');
      if(t.stage<t.o.stages.length){t.rings[t.stage].visible=true;continue;}
      t.active=false;t.won=true;t.clock.stop();const time=Math.round(t.elapsed*100)/100;toast('🎉 Team dash finished in '+time.toFixed(2)+' seconds!',3200);
      if(setting('records')==='1'&&!S.level.practice){try{
        const all=loadProgress(),prev=all.levels[S.level.id]||{},trials=Object.assign({},prev.trials||{}),by=Object.assign({},trials[t.o.id]||{}),key=(S.lifeMode||'adventure')+':'+t.team.length;
        by[key]=Math.min(Number.isFinite(by[key])?by[key]:1e9,time);t.bestTimes[key]=by[key];trials[t.o.id]=by;all.levels[S.level.id]=Object.assign({},prev,{trials});persistProgress(all);
      }catch(e){}}
      if(t.o.onWin)t.o.onWin(t);
    }
  }

  let ropeCoilGeometry=null,ropeCoilMaterial=null;
  function syncTools(p){
    if(!p.mesh)return;
    let coil=p.mesh.userData.ropeCoil;
    if(!coil&&p.tools&&p.tools.rope){
      ropeCoilGeometry=ropeCoilGeometry||new THREE.TorusGeometry(.21,.055,6,18);ropeCoilMaterial=ropeCoilMaterial||texMat(0xb9915d,'weave');
      coil=new THREE.Mesh(ropeCoilGeometry,ropeCoilMaterial);coil.position.set(0,.7,-.4);coil.castShadow=true;p.mesh.add(coil);p.mesh.userData.ropeCoil=coil;
    }
    if(coil)coil.visible=!!(p.tools&&p.tools.rope);
  }
  function stopRope(p,lose) {
    p.ropeSwing=null;if(p.ropeLine)p.ropeLine.visible=false;
    if(lose&&p.tools&&p.tools.rope){p.tools.rope=false;renderHUD();toast('🪢 P'+(p.slot+1)+' dropped the coil. Take another at a rope stand.',2800);}
  }
  function stepRope(p,dt) {
    const r=p.ropeSwing;if(!r)return;
    r.t=Math.min(1,r.t+dt/(r.anchor.o.duration||1.25));const t=r.t,k=t*t*(3-2*t);
    const wanted=r.start.clone().lerp(r.end,k);wanted.y+=Math.sin(Math.PI*t)*(r.anchor.o.arc||2.8);
    p.pos.copy(wanted);p.vel.set(0,0,0);p.onGround=false;p.standingOn=null;resolveSides(p.pos,T.playerRadius,p.pos.y);
    if(p.pos.distanceTo(wanted)>.35){stopRope(p,false);toast('The rope path is blocked. Try another route.',2600);return;}
    const attr=p.ropeLine.geometry.attributes.position;attr.setXYZ(0,r.anchor.pivot.x,r.anchor.pivot.y,r.anchor.pivot.z);attr.setXYZ(1,p.pos.x,p.pos.y+1.5,p.pos.z);attr.needsUpdate=true;p.ropeLine.geometry.computeBoundingSphere();
    if(t===1){
      const end=safeStanding(p,r.end);stopRope(p,false);
      if(end){p.pos.copy(end);p.onGround=true;p.standingOn=groundInfo(end.x,end.z,end.y).pl;p.fallPeak=end.y;p.fallPrev=p.pos.clone();p.lastSafe.copy(end);Audio.sfx('land');spawnPuff(end.x,end.y,end.z,surfacePuff(p),4);}
    }
  }
  function updateAdventure(dt) {
    for(const f of S.teamLifts||[]){
      f.frame.visible=f.mover.mesh.visible;if(!f.frame.visible)continue;
      const ropes=f.ropes.geometry.attributes.position;f.ropeCorners.forEach(([x,z],i)=>ropes.setXYZ(i*2+1,x,f.y+.15,z));ropes.needsUpdate=true;
      if(f.moving){const step=Math.min(Math.abs(f.target-f.y),(f.o.speed||2)*dt);f.y+=Math.sign(f.target-f.y)*step;f.wheel.rotation.x+=step*2;if(Math.abs(f.y-f.target)<.001){f.y=f.target;f.moving=false;}}
      f.deck.y=f.y;
      // After the passenger opens the shortcut and steps ashore, fetch the operator.
      if(f.latched&&!f.moving&&f.y>f.o.bottom+.1&&!f.riders().length)f.request(f.o.bottom);
    }
    for(const kit of S.ropeKits||[])kit.coils.forEach((m,i)=>{const p=S.players[i];m.visible=!p||!p.tools||!p.tools.rope;});
    for(const d of S.discoveries||[]){
      if(d.found)continue;
      const p=api.activePlayers().find(p=>!p.carriedBy&&Math.hypot(p.pos.x-d.x,p.pos.z-d.z)<d.r&&Math.abs(p.pos.y-d.y)<d.vRange);
      if(p){d.found=true;Audio.sfx('page');spawnPuff(d.x,d.y+1,d.z,0xf5d879,8);toast('🔎 '+d.name+' discovered!',2800);if(d.onFind)d.onFind(p);}
    }
  }
  function surfacePuff(p,platform) {
    const surface=platform?(platform.tex==='wood'?'wood':'stone'):surfaceAt(p);
    return {grass:0x9daf72,sand:0xd6c19a,stone:0xb8b7ad,wood:0xc49a6c}[surface]||0xd6c7a1;
  }


  /* -------------------------------------------------------------------
   * 9. GAME RULES (tasks, servant points, hits, items, bubbles)
   * ----------------------------------------------------------------- */
  function taskComplete(id) { const t = S.tasks[id]; return !!t && t.count >= t.total; }
  function addTask(id, n) {
    const t = S.tasks[id];
    if (!t) { showError('api.task: unknown task id "' + id + '"'); return; }
    if (t.count >= t.total) return;
    t.count = Math.min(t.total, t.count + n);
    if (t.count >= t.total) {Audio.sfx('fanfare');S.checkpointRequest={at:S.objective&&S.objective.slice(),label:t.label};}                       // (the board ticks it off)
    renderHUD();
  }
  function addServant(p, pts, why) {
    if (!p || !pts) return;
    p.servant += pts;
    if (why && p.label) {                                            // a little "+5 🤝" over the helper's head, not a pop-up
      if (!p.labelCheer) { p.labelCheer = el('div', { class: 'sq-cheer' }); p.label.insertBefore(p.labelCheer, p.label.firstChild); }
      p.labelCheer.textContent = '+' + pts + ' 🤝'; p.labelCheer.style.display = ''; p.cheerT = Math.max(p.cheerT || 0, 1.4);
    }
  }

  function collectFragment(f, p) {
    if (f.got) return;
    f.got = true; f.mesh.visible = false;
    S.fragCount++;
    Audio.sfx('fanfare');
    spawnPuff(f.x, f.y, f.z, 0xfde047, 14);
    renderHUD();                                                      // (the fanfare, the sparkle and the board say it: no pop-up)
    if (S.fragCount >= S.fragments.length && S.level.memoryVerse) {
      const mv = S.level.memoryVerse;
      if ((S.shownRefs || {})[mv.ref]) toast('📜 Memory verse complete: ' + mv.ref + ' (on the Scroll Shelf)', 2600);   // already read it as a card: no second card
      else setTimeout(() => { if (!(S.shownRefs || {})[mv.ref]) verse('Memory verse assembled!', mv.text, mv.ref); }, 600);   // (unless a card showed it meanwhile)
    }
    renderHUD();
  }

  // Checkpoints must be dry, stable, supported and clear of walls. A role exception is not dry land.
  function safeStanding(p,point) {
    if(!point||![point.x,point.y,point.z].every(Number.isFinite))return null;
    const B=S.level.bounds;if(point.x<B.minX+.5||point.x>B.maxX-.5||point.z<B.minZ+.5||point.z>B.maxZ-.5)return null;
    const gi=groundInfo(point.x,point.z,point.y+.6),y=gi.h;
    if(S.waterY-y>.25||y<(S.level.killY===undefined?-40:S.level.killY)+1)return null;
    if(S.hazards.some(h=>h.on!==false&&(h.maxY===undefined||y<=h.maxY)&&inShape(h,point.x,point.z)))return null;
    if(gi.pl&&(S.crumbles.some(c=>c.platform===gi.pl)||S.movers.some(m=>m.platform===gi.pl)||S.truthBoxes.some(b=>b.platform===gi.pl)))return null;
    if(!gi.pl&&slopeAt(point.x,point.z)>T.maxSlope)return null;
    if(S.circles.some(c=>c.on!==false&&y<c.top-T.stepUp&&Math.hypot(point.x-c.x,point.z-c.z)<c.r+.6))return null;
    if(S.platforms.some(pl=>pl.on&&point.x>pl.minX-.5&&point.x<pl.maxX+.5&&point.z>pl.minZ-.5&&point.z<pl.maxZ+.5&&pl.top>y+.2&&pl.bottom<y+1.9))return null;
    for(const [dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]])if(Math.abs(groundAt(point.x+dx,point.z+dz,y+.5)-y)>.7)return null;
    return new THREE.Vector3(point.x,y,point.z);
  }
  function safeReturn(p,want) {
    const sp=S.level.spawn||[0,0],spawn=new THREE.Vector3(sp[0],groundAt(sp[0],sp[1]),sp[1]);
    const anchors=[want,S.checkpoint,p.lastSafe,spawn].filter(Boolean);
    for(const a of anchors){
      const at=safeStanding(p,a);if(at)return at;
      for(let r=1;r<=8;r++)for(let i=0;i<16;i++){
        const angle=i*Math.PI/8,q=new THREE.Vector3(a.x+Math.cos(angle)*r,a.y,a.z+Math.sin(angle)*r),safe=safeStanding(p,q);
        if(safe)return safe;
      }
    }
    // A changing scene can flood the old checkpoint (for example, the ark finale).
    // Prefer stable deck/ledge surfaces before considering the original spawn again.
    const surfaces=S.platforms.filter(pl=>pl.on).map(pl=>new THREE.Vector3((pl.minX+pl.maxX)/2,pl.top,(pl.minZ+pl.maxZ)/2));
    const origin=want||S.checkpoint||spawn;surfaces.sort((a,b)=>a.distanceToSquared(origin)-b.distanceToSquared(origin));
    for(const q of surfaces){const safe=safeStanding(p,q);if(safe)return safe;}
    const B=S.level.bounds;
    for(let z=B.minZ+1;z<B.maxZ;z+=3)for(let x=B.minX+1;x<B.maxX;x+=3){const safe=safeStanding(p,new THREE.Vector3(x,groundAt(x,z),z));if(safe)return safe;}
    return spawn; // campaign spawn/recovery tests exercise every level

  }
  function setRunCheckpoint(point,label) {
    if(!S.runStarted)return false;
    const p=api.activePlayers()[0],at=safeStanding(p,point);if(!at)return false;
    if(S.checkpoint&&S.checkpoint.distanceTo(at)<2)return false;
    S.checkpoint=at;S.checkpointLabel=label||'Checkpoint';S.checkpointAt=S.time;
    if(!S.checkpointFlag){
      const g=new THREE.Group();g.name='checkpoint';
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.2,8),mat(0x806244));post.position.y=1.1;g.add(post);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.85,.5),mat(0x38bdf8,{side:THREE.DoubleSide}));flag.position.set(.45,1.85,0);g.add(flag);
      const sign=S.level.artDirection&&S.level.artDirection.checkpointSigns===false?null:worldSign(['Checkpoint'],2.8);if(sign){sign.position.y=2.8;g.add(sign);}S.scene.add(g);S.checkpointFlag=g;
      S.recovery=api.interact({x:at.x,z:at.z,y:at.y,r:1.4,vRange:.85,priority:1,label:'Reclaim earned equipment',available:p=>p.lifeEpoch>1&&p.recoveryUsed!==p.lifeEpoch&&recoveryStock(p).length>0,use:p=>{
        const stock=recoveryStock(p);stock.forEach(pk=>{pk.claimed[p.slot]=p.lifeEpoch;p.armor[pk.type]=true;});p.recoveryUsed=p.lifeEpoch;syncArmor(p);Audio.sfx('pickup');toast('P'+(p.slot+1)+' reclaimed earned equipment. One recovery pack this life.',2600);
      }});
    }
    S.checkpointFlag.position.copy(at);Object.assign(S.recovery,{x:at.x,y:at.y,z:at.z});
    api.activePlayers().forEach(q=>{q.health=2;});renderHUD();return true;
  }
  function recoveryStock(p) {
    const seen=new Set();return S.pickups.filter(pk=>{
      if(!S.earnedArmor||!S.earnedArmor[pk.type]||!pk.quest||!pk.quest.open||p.armor[pk.type]||pk.claimed[p.slot]===p.lifeEpoch||seen.has(pk.type))return false;
      seen.add(pk.type);return true;
    });
  }
  function initRun() {
    S.runStarted=true;S.earnedArmor={};S.lifeMode=S.level.practice||setting('challenge')==='practice'?'practice':'adventure';
    S.lifeJoined={};api.players().forEach(p=>{S.lifeJoined[p.slot]=true;});S.teamLives=5+Math.max(0,api.players().length-1);
    api.players().forEach(p=>{p.health=2;p.lifeEpoch=1;p.recoveryUsed=0;p.fallPeak=p.pos.y;p.fallPrev=p.pos.clone();});
    const p=api.players()[0];setRunCheckpoint(safeReturn(p,p.pos),'Start checkpoint');
  }
  function updateCheckpoints() {
    const r=S.checkpointRequest;if(!r)return;S.checkpointRequest=null;
    if(S.checkpointAt!==undefined&&S.time-S.checkpointAt<.1)return;
    const ps=api.activePlayers().slice();if(r.at)ps.sort((a,b)=>Math.hypot(a.pos.x-r.at[0],a.pos.z-r.at[2])-Math.hypot(b.pos.x-r.at[0],b.pos.z-r.at[2]));
    for(const p of ps)if(setRunCheckpoint(p.pos,r.label||'Objective checkpoint'))break;
  }
  function showGameOver() {
    S.phase='gameover';S.gameOverAge=0;S.gameOverSel=0;Audio.sfx('hit');
    UI.gameover.innerHTML='<div class="sq-scroll" style="max-width:500px"><div class="sq-h">Out of team lives</div><div class="sq-v">Restart this level with fresh lives and equipment puzzles. Completed levels and saved verses stay saved.</div><button class="sq-big sq-focus" data-act="retry">Try this level again</button><button class="sq-big" data-act="menu">Back to menu</button></div>';
    UI.gameover.classList.remove('hidden');renderHUD();
  }

  function hitPlayer(p, fx, fz, kind, msg) {
    if (!p || p.bubble || p.hitCd > 0 || S.phase==='gameover') return;
    p.hitCd = 1.2;stopRope(p,true);
    if (p.riding && kind !== 'landing') {
      const f = p.riding; dismount(p); Audio.sfx('bleat');
      const dx = p.pos.x - fx, dz = p.pos.z - fz, d = Math.hypot(dx, dz) || 1;
      p.vel.x = dx / d * 7; p.vel.z = dz / d * 7; p.vel.y = 7; p.onGround = false; p.stun = 0.35;
      toast('🐾 The ' + f.kind + ' took the bump and you hopped off. Climb back on!', 2200);
      return;
    }
    const guard=kind==='falling'?'shield':kind==='bump'?'breastplate':null;
    const keyArmor=S.level.keepArmor||[],piece=guard&&p.armor[guard]?guard:ARMOR_TYPES.find(t=>p.armor[t]&&keyArmor.indexOf(t)<0);
    if(piece){p.armor[piece]=false;syncArmor(p);Audio.sfx('block');toast(ARMOR[piece].icon+' P'+(p.slot+1)+' lost '+ARMOR[piece].name+' protecting this hit.',2200);return;}
    if(S.lifeMode!=='practice'){
      p.health=Math.max(0,p.health-1);renderHUD();
      if(p.health===0){enterBubble(p,true,'P'+(p.slot+1)+' was defeated. Back to the checkpoint.');return;}
    }
    Audio.sfx('hit');dropHeld(p);
    const dx=p.pos.x-fx,dz=p.pos.z-fz,d=Math.hypot(dx,dz)||1;
    p.vel.x=dx/d*9;p.vel.z=dz/d*9;p.vel.y=8;p.onGround=false;p.stun=.4;
    if(msg)toast(msg,1600);
  }

  // Riding (the animal absorbs the bump): the rider keeps their own physics, the animal walks underneath and takes one bump for them.
  function mount(p, f) {
    if (p.riding || f.state === 'ridden') return;
    if (f.state === 'follow' && f.leader && f.leader !== p) f.leader = null;
    f.state = 'ridden'; f.rider = p; p.riding = f; f.wasFollowing = false;
    p.pos.x = f.pos.x; p.pos.z = f.pos.z; p.facing = f.mesh.rotation.y;
    Audio.sfx('bleat'); toast('🐾 P' + (p.slot + 1) + ' rides the ' + f.kind + '! Press Y (or E) to get off.', 2200);
  }
  function dismount(p) {
    const f = p.riding; if (!f) return;
    p.riding = null; f.rider = null;
    f.state = f.call === false ? 'idle' : 'follow'; f.leader = f.state === 'follow' ? p : null;
    const sx = Math.cos(p.facing) * 1.1, sz = -Math.sin(p.facing) * 1.1;   // the animal steps to one side
    f.pos.x = p.pos.x + sx; f.pos.z = p.pos.z + sz; f.pos.y = groundAt(f.pos.x, f.pos.z, p.pos.y + 1); f.home.copy(f.pos);
  }
  SQ._mount = (p, f) => mount(p, f); SQ._dismount = (p) => dismount(p);

  function syncArmor(p) {
    const a = p.mesh.userData.armor;
    ARMOR_TYPES.forEach((t) => { a[t].visible = !!p.armor[t]; });
  }

  // Small things (up to about a metre across) are held in the hands; bigger loads go overhead.
  // Measured once: holdR = half the widest side, holdLow = how far the middle sits above the mesh's origin.
  function holdInHands(it) {
    if (it.holdR === undefined) {
      const rot = it.mesh.rotation.y; it.mesh.rotation.y = 0;
      const box = new THREE.Box3().setFromObject(it.mesh), sz = box.getSize(new THREE.Vector3());
      it.mesh.rotation.y = rot;
      const ok = isFinite(sz.x) && sz.x > 0;
      it.holdR = ok ? Math.max(sz.x, sz.z) / 2 : 0.3;
      it.holdLow = ok ? Math.max(-0.6, Math.min(0.6, box.min.y + sz.y / 2 - it.mesh.position.y)) : 0;
      it.holdBig = !ok || Math.max(sz.x, sz.y, sz.z) > 1.15;
    }
    return !it.holdBig;
  }

  function resetPlayerArms(p) {
    for(const arm of p.mesh.userData.arms||[]){const a=arm.userData.playerLimb;arm.userData.gripTarget=null;arm.position.y=1.2;a.sleeve.scale.y=1;a.sleeve.position.y=-.28;a.cuff.position.y=-.58;a.hand.position.y=-.62;a.length=.62;}
  }
  function playerLoadBounds(it) {
    if(!it.handBounds){it.mesh.updateWorldMatrix(true,true);const inverse=it.mesh.matrixWorld.clone().invert(),bounds=new THREE.Box3();it.mesh.traverse(o=>{if(!o.isMesh||!o.geometry)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.geometry.boundingBox)bounds.union(o.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));});it.handBounds=bounds;}
    return it.handBounds;
  }
  function clearPlayerHeadwear(p,it) {
    const art=p.mesh.userData;art.head.updateWorldMatrix(true,false);it.mesh.updateMatrix();
    const top=art.headBounds.clone().applyMatrix4(art.head.matrixWorld).max.y;
    const low=playerLoadBounds(it).clone().applyMatrix4(it.mesh.matrix).min.y;
    if(Number.isFinite(top)&&Number.isFinite(low))it.mesh.position.y+=Math.max(0,top+.05-low);
  }
  function posePlayerLoad(p) {
    const it=p.holding,friend=p.carrying;if(!it&&!friend)return;
    if(p.bubble||p.carriedBy||p.seat||p.riding||p.ropeSwing)return;
    const body=p.mesh.userData.body; body.updateWorldMatrix(true,false);
    let box,drag=false,front=false;
    if(it){
      it.mesh.updateWorldMatrix(true,false);box=playerLoadBounds(it).clone().applyMatrix4(body.matrixWorld.clone().invert().multiply(it.mesh.matrixWorld));
      drag=it.heavy&&!p.role.strong;front=!drag&&holdInHands(it);
    }else{
      // A teammate's soles follow the established +2.1 support height, independent of slot update order.
      box=new THREE.Box3(new THREE.Vector3(-.25,2.1,-.12),new THREE.Vector3(.25,2.2,.12));
      const transform=p.mesh.matrixWorld.clone().premultiply(body.matrixWorld.clone().invert());box.applyMatrix4(transform);
    }
    if(!box||box.isEmpty()||![box.min.x,box.max.x,box.min.y,box.max.y,box.min.z,box.max.z].every(Number.isFinite))return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    for(const [i,sd]of [[0,-1],[1,1]]){
      const arm=p.mesh.userData.arms[i],a=arm.userData.playerLimb;arm.position.y=front||drag?1.2:1.28;
      const x=front?center.x+sd*Math.max(.08,size.x*.5-.025):center.x+sd*Math.min(.42,size.x*.3);
      const y=front?box.min.y+Math.min(size.y*.45,.22):drag?Math.min(1,box.max.y-.08):box.min.y-.015;
      const z=drag?box.max.z-.025:center.z;
      const target=new THREE.Vector3(x,y,z),aim=target.clone().sub(arm.position),distance=aim.length();if(distance<.1)continue;
      const length=Math.max(.5,Math.min(1.15,distance));arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),aim.normalize());
      a.length=length;a.sleeve.scale.y=length/.62;a.sleeve.position.y=-length*.45;a.cuff.position.y=-length+.04;a.hand.position.y=-length;
      arm.userData.gripTarget=target;
    }
  }

  function pickUpItem(p, it) {
    if (p.holding || it.holder || it.delivered) return;
    it.holder = p; p.holding = it; it.inter.alive = false;
    Audio.sfx('pickup');
    if (it.heavy && !p.role.strong) toast('Heavy! Only the Builder carries this easily — you can drag it slowly.', 2400);
  }
  // A put-down must remain reachable: never inside a wall, down a pit, outside the island,
  // or stranded on a moving/temporary surface after the player lets go.
  function itemDropPoint(p,at) {
    if(at)return safeStanding(p,at)||safeReturn(p,at);
    const forward=new THREE.Vector3(p.pos.x+Math.sin(p.facing)*1.2,p.pos.y,p.pos.z+Math.cos(p.facing)*1.2);
    const points=[forward,p.pos];
    for(const side of [-1,1])points.push(new THREE.Vector3(p.pos.x+Math.cos(p.facing)*side*.8,p.pos.y,p.pos.z-Math.sin(p.facing)*side*.8));
    for(const point of points){const safe=safeStanding(p,point);if(safe&&Math.abs(safe.y-p.pos.y)<=T.stepUp)return safe;}
    return safeReturn(p,p.lastSafe);
  }
  function dropHeld(p, at) {
    const it=p.holding;if(!it)return;
    const safe=itemDropPoint(p,at);
    p.holding=null;it.holder=null;it.x=safe.x;it.y=safe.y;it.z=safe.z;
    it.mesh.position.set(it.x,it.y+.3,it.z);
    Object.assign(it.inter,{x:it.x,y:it.y,z:it.z,alive:true});
    Audio.sfx('drop');
  }

  function enterBubble(p, hazard, msg) {
    if (p.bubble || S.phase==='gameover') return;
    stopRope(p,!!hazard);
    const fatal=hazard&&S.lifeMode!=='practice'&&S.runStarted&&S.phase==='play';
    const safe=safeReturn(p,fatal?S.checkpoint:p.lastSafe);
    if(hazard){const keep=S.lifeMode==='practice'?Object.keys(p.armor):(S.level.keepArmor||[]),kept={};keep.forEach(t=>{if(p.armor[t])kept[t]=true;});p.armor=kept;syncArmor(p);p.lifeEpoch=(p.lifeEpoch||1)+1;p.health=0;S.stats.deaths=(S.stats.deaths||0)+1;}
    p.lastSafe.copy(safe);
    dropHeld(p, hazard ? safe : null);
    if (p.carrying) releaseCarried(p, false);
    if (p.carriedBy) releaseCarried(p.carriedBy, false);
    if (hazard && S.phase === 'play') noteFall(p);
    S.stats.bubbles++;
    p.bubble = { t: 0, hazard: !!hazard, death:!!fatal, x: safe.x, y: safe.y + 2.2, z: safe.z };
    p.vel.set(0, 0, 0);
    p.mesh.userData.bubble.visible = true;
    if (hazard) Audio.sfx('splash');
    Audio.sfx('bubble');
    if(fatal){S.teamLives=Math.max(0,S.teamLives-1);renderHUD();if(S.teamLives===0)showGameOver();}
    const said = S.saidBubble = S.saidBubble || {}, key = msg ? msg.replace(/P\d/g, 'P') : '';
    if (msg && !said[key]) { said[key] = true; toast(msg, 2200); }   // a fall's lesson is said once; after that the bubble says it
  }
  function popBubble(p, rescuer) {
    if (!p.bubble) return;
    const hz = p.bubble.hazard,death=p.bubble.death;
    // Free regrouping needs the same dry, supported landing check as a hazard rescue.
    // The leader may be wading as the Fisherman, jumping, or standing on a narrow moving raft.
    p.pos.copy(safeReturn(p,death?S.checkpoint:p.pos));p.lastSafe.copy(p.pos);
    p.fallPeak=p.pos.y;p.fallPrev=p.pos.clone();p.hitCd=Math.max(p.hitCd||0,hz?2:.75);
    if(hz){
      p.health=2;
      if(death&&S.checkpoint&&S.checkpoint.distanceTo(p.pos)>.5){S.checkpoint.copy(p.pos);if(S.checkpointFlag)S.checkpointFlag.position.copy(p.pos);if(S.recovery)Object.assign(S.recovery,{x:p.pos.x,y:p.pos.y,z:p.pos.z});}
    }
    p.bubble = null;
    p.mesh.userData.bubble.visible = false;
    p.vel.set(0, 3, 0); p.onGround = false;
    Audio.sfx('pop');
    if (rescuer && hz) {
      S.team.rescues++;
      if (rescuer.rescuesScored < T.maxScoredRescues) {
        rescuer.rescuesScored++;
        addServant(rescuer, T.rescuePoints, 'for rescuing P' + (p.slot + 1) + '!');
      } else toast('🫧 P' + (rescuer.slot + 1) + ' rescued P' + (p.slot + 1) + '!', 1500);
    }
  }

  // Carry & throw teammates (just for fun)
  function releaseCarried(carrier, thrown) {
    const q = carrier.carrying;
    if (!q) return;
    carrier.carrying = null; q.carriedBy = null;
    if (thrown) {
      q.vel.set(Math.sin(carrier.facing) * 10, 10, Math.cos(carrier.facing) * 10);
      Audio.sfx('jump');
    } else q.vel.set(0, 2, 0);
    q.onGround = false;
  }

  /* -------------------------------------------------------------------
   * 10. PLAYERS
   * ----------------------------------------------------------------- */
  function makePlayer(slot) {
    const role = ROLES[slot % ROLES.length];
    const m = buildPlayerMesh(role); shineUp(m.group);
    playerLamp(m.group);
    const sp = S.level.spawn || [0, 0];
    const p = {
      slot, joined: false, device: null, roleIdx: slot % ROLES.length, role,
      mesh: m.group, shadow: m.shadow,
      pos: new THREE.Vector3(sp[0] + (slot - 1.5) * 1.6, 0, sp[1]),
      vel: new THREE.Vector3(), onGround: false, coyote: 0, jumpBuf: 0, facing: Math.PI, squash: 1,
      armor: {}, health:2, lifeEpoch:1, recoveryUsed:0, holding: null, carrying: null, carriedBy: null, bubble: null, stun: 0, hitCd: 0,
      lastSafe: new THREE.Vector3(), safeT: 0, servant: 0, rescuesScored: 0, sharedTypes: {}, callT: 0,
      label: el('div', { class: 'sq-label' })
    };
    p.pos.y = groundAt(p.pos.x, p.pos.z);
    p.lastSafe.copy(p.pos);
    p.mesh.visible = false; p.shadow.visible = false; p.label.style.display = 'none';
    p.edge=el('div',{class:'sq-edge',hidden:true});UI.labels.appendChild(p.edge);
    S.scene.add(p.mesh); S.scene.add(p.shadow); UI.labels.appendChild(p.label);
    // call ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 28), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; S.scene.add(ring); p.callRing = ring;
    const tr = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
    tr.rotation.x = -Math.PI / 2; tr.renderOrder = 15; tr.visible = false; S.scene.add(tr); p.targetRing = tr;
    const dr = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.0, 40), new THREE.MeshBasicMaterial({ color: role.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false }));
    dr.rotation.x = -Math.PI / 2; dr.renderOrder = 15; dr.visible = false; S.scene.add(dr); p.destRing = dr;   // where the thing you carry goes
    updateLabel(p);
    return p;
  }
  function updateLabel(p) {
    p.label.style.borderColor = p.role.css;
    if (!p.labelName) {
      p.labelName = el('div', {}); p.labelAct = el('div', { class: 'sq-act' });
      p.label.appendChild(p.labelName); p.label.appendChild(p.labelAct);
    }
    p.labelName.textContent = 'P' + (p.slot + 1) + ' ' + p.role.name;
    p.promptStr = null;
  }
  const ACT_KEY = { kb1:'E',kb2:'R-Shift',click:'Tap' };
  function promptActions(p) {
    if(S.phase !== 'play' || p.bubble || p.carriedBy)return [];
    if(p.ropeSwing)return [['',resolveAction(p)]];
    return p.device && p.device.indexOf('gp') === 0
      ? [['Y',resolveAction(p,'use')],['B',resolveAction(p,'carry')]].filter(([,a])=>a.label)
      : [[ACT_KEY[p.device] || 'ACT',actionInfo(p)]].filter(([,a])=>a);
  }
  function updatePrompt(p) {
    const ready=S.phase === 'play' && !p.bubble && !p.carriedBy;
    const split=p.device && p.device.indexOf('gp') === 0;
    const actions=promptActions(p);
    const a=actions.length ? actions[0][1] : null;
    const carry=split && ready ? resolveAction(p,'carry') : a;
    const str=actions.map(([key,a])=>a.status||((a.ok ? '' : '🔒 ')+key+': '+a.label)).join('\n');
    // The primary prompt owns the target ring; a held item's destination remains visible independently.
    if (carry && carry.dest) { const d=carry.dest;p.destRing.visible=true;p.destRing.position.set(d.x,(d.y !== undefined ? d.y : groundAt(d.x,d.z))+.1,d.z);p.destRing.scale.setScalar(d.r || 3);p.destRing.material.opacity=.45+Math.sin(S.time*5)*.25; }
    else p.destRing.visible=false;
    if (a && a.at && !a.talkPerson) { p.targetRing.visible=true;p.targetRing.position.set(a.at[0],a.at[1]+.08,a.at[2]);p.targetRing.material.color.setHex(a.ok ? 0xfde047 : 0x9ca3af); }
    else p.targetRing.visible=false;
    // In co-op the shared guide owns instructions; the world tags identify players only.
    p.labelAct.style.display=str && api.players().length===1 ? '' : 'none';
    if (str === p.promptStr) return;
    p.promptStr=str;p.labelAct.textContent=str;
    p.labelAct.style.opacity=actions.length && actions.every(([,a])=>!a.ok) ? '0.7' : '1';
  }

  // One explanation per real target, with each nearby player's own device binding.
  // Presentation records never run actions or change which interaction the input resolver chooses.
  function renderActionGuide(records) {
    const useful=records.some(r=>!r.utility),groups=[];
    for(const r of records) {
      if(r.utility&&useful)continue;
      const target=r.target||r;
      let group=groups.find(g=>g.target===target&&g.label===r.label);
      if(!group){group={target,label:r.label,rows:[],utility:r.utility};groups.push(group);}
      group.rows.push(r);
    }
    const cards=groups.map(g=>{
      const rows=g.rows,work=rows.find(r=>r.work),shared=rows.length>1||g.utility;
      const pct=work?Math.min(99,Math.floor(work.work.progress*20)*5):null;
      const title=work?(work.work.working||g.label):(rows.find(r=>r.status)||{}).status||g.label;
      const chips=rows.map(r=>'<span class="sq-action-chip" style="--player-color:'+r.p.role.css+'">P'+(r.p.slot+1)+(r.work?' ✓':r.key&&!r.status?' <b class="sq-action-key">'+esc(r.key)+'</b>':'')+(!r.ok&&r.key?' 🔒 '+esc(r.detail||'Locked'):'')+'</span>').join('');
      let body='';
      if(shared)body='<div class="sq-action-line sq-action-title">'+esc(title)+(pct!==null?' · '+pct+'%':'')+'</div><div class="sq-action-players">'+chips+'</div>';
      else {
        const r=rows[0];
        body='<div class="sq-action-player">P'+(r.p.slot+1)+' · '+esc(r.p.role.name)+'</div><div class="sq-action-line">'+(r.work?esc(title)+' · '+pct+'%':r.status?esc(r.status):r.key?(r.ok?'Press ':'🔒 ')+'<b class="sq-action-key">'+esc(r.key)+'</b> — '+esc(r.detail||title):esc(title))+'</div>';
      }
      const hint=rows.find(r=>!r.ok&&r.hint);
      if(work)body+='<div class="sq-action-hint">Stay in the ring. Others can join.</div><div class="sq-action-progress"><div style="width:'+pct+'%"></div></div>';
      else if(hint)body+='<div class="sq-action-hint">'+esc(hint.hint)+'</div>';
      const color=rows.length===1?rows[0].p.role.css:'#d4af37';
      return '<div class="sq-action-card sq-card'+(g.utility?' sq-action-utility':'')+'" style="--player-color:'+color+'">'+body+'</div>';
    });
    const html=cards.join('');if(UI.actions.innerHTML!==html)UI.actions.innerHTML=html;
    UI.actions.classList.toggle('hidden',!cards.length||S.phase!=='play');
    UI.actions.style.setProperty('--sq-action-columns',cards.length>4?'4':cards.length>1?'2':'1');
    UI.actions.style.setProperty('--sq-action-narrow-columns',cards.length>1?'2':'1');
    UI.actions.style.width=cards.length>1?'min(1040px,calc(100vw - 24px))':'min(620px,calc(100vw - 24px))';
    UI.help.classList.toggle('sq-guide-covered',cards.length>0&&api.players().length>1&&S.phase==='play');
    const height=cards.length&&S.phase==='play'?UI.actions.getBoundingClientRect().height+(window.innerWidth<=700?140:20):0;
    document.body.style.setProperty('--sq-action-height',height+'px');
  }
  // A quiet world-space cue for a real, currently available conversation. Reuse the
  // same resolved actions as the guide: a nearby puzzle or held item still takes priority.
  let talkCueMap = null;
  function talkCueTexture() {
    if(talkCueMap)return talkCueMap;
    const w=128,h=96,data=new Uint8Array(w*h*4);
    const rounded=(x,y,l,t,r,b,rad)=>{
      const cx=Math.max(l+rad,Math.min(r-rad,x)),cy=Math.max(t+rad,Math.min(b-rad,y));
      return Math.hypot(x-cx,y-cy)<=rad;
    };
    const triangle=(x,y,a,b,c)=>{
      const side=(u,v)=>(x-v[0])*(u[1]-v[1])-(u[0]-v[0])*(y-v[1]);
      const d=[side(a,b),side(b,c),side(c,a)];return d.every(v=>v>=0)||d.every(v=>v<=0);
    };
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let red=0,green=0,blue=0,alpha=0;
      for(const dx of [.25,.75])for(const dy of [.25,.75]){
        const px=x+dx,py=y+dy;
        if(!rounded(px,py,10,8,118,68,17)&&!triangle(px,py,[38,60],[34,83],[64,60]))continue;
        const inside=rounded(px,py,15,13,113,63,12)||triangle(px,py,[43,59],[40,72],[58,59]);
        const dot=[43,64,85].some(cx=>Math.hypot(px-cx,py-38)<5.5);
        const c=inside&&!dot?[255,241,205]:[104,31,58];
        red+=c[0];green+=c[1];blue+=c[2];alpha++;
      }
      if(alpha){const i=(y*w+x)*4;data[i]=red/alpha;data[i+1]=green/alpha;data[i+2]=blue/alpha;data[i+3]=alpha*255/4;}
    }
    talkCueMap=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
    talkCueMap.flipY=true;talkCueMap.magFilter=THREE.LinearFilter;talkCueMap.minFilter=THREE.LinearFilter;talkCueMap.needsUpdate=true;
    return talkCueMap;
  }
  function updateTalkCues(people) {
    const cues=S.talkCues||(S.talkCues=[]);
    const targets=S.phase==='play'&&!S.homeInterior&&!S.level.solemn?[...new Set(people)].slice(0,4):[];
    if(!targets.length){for(const cue of cues){cue.visible=false;cue.userData.person=null;}return;}
    const tags=targets.length?api.players().filter(p=>p.label.style.display!=='none').map(p=>p.label.getBoundingClientRect()).filter(r=>r.width&&r.height).sort((a,b)=>b.top-a.top):[];
    const up=new THREE.Vector3(0,1,0).applyQuaternion(S.camera.quaternion);
    for(let i=0;i<Math.max(cues.length,targets.length);i++){
      if(!cues[i]){
        const material=new THREE.SpriteMaterial({map:talkCueTexture(),transparent:true,depthWrite:false,depthTest:true,alphaTest:.01,fog:false});
        material.toneMapped=false;
        const cue=new THREE.Sprite(material);cue.name='talk-cue';cue.scale.set(1.25,.9375,1);S.scene.add(cue);cues.push(cue);
      }
      const cue=cues[i],r=targets[i];cue.visible=!!r;cue.userData.person=r||null;
      if(r){
        r.g.updateWorldMatrix(true,false);
        cue.position.set(0,r.g.userData.talkHeight||2.05,0);r.g.localToWorld(cue.position);
        // Names remain DOM overlays; lift a cue just enough to clear any overlapping
        // family tag, using camera-up so the tail stays over the same person on screen.
        const center=cue.position.clone().project(S.camera);
        const edge=cue.position.clone().add(up).project(S.camera);
        const pxPerUnit=Math.abs(edge.y-center.y)*window.innerHeight/2;
        if(center.z>-1&&center.z<1&&pxPerUnit>.01){
          const x=(center.x+1)*window.innerWidth/2,halfW=pxPerUnit*cue.scale.x/2,halfH=pxPerUnit*cue.scale.y/2;
          let y=(1-center.y)*window.innerHeight/2;
          for(const tag of tags)if(x+halfW>tag.left-6&&x-halfW<tag.right+6&&y+halfH>tag.top-6&&y-halfH<tag.bottom+6){
            const lift=y+halfH-tag.top+6;cue.position.addScaledVector(up,lift/pxPerUnit);y-=lift;
          }
        }
      }
    }
  }
  function updateActionGuide() {
    const records=[],talkPeople=[];
    if(S.phase==='play')for(const p of api.activePlayers()) {
      if(p.carriedBy)continue;
      const work=S.zones.find(z=>z.action&&z.visible&&!z.done&&z.workers[p.slot]&&insideZone(p,z));
      const actions=promptActions(p);
      if(work)records.push({p,target:work.inter,label:work.action,work,ok:true});
      for(const [key,a]of actions) {
        if(a.ok&&a.talkPerson)talkPeople.push(a.talkPerson);
        if(work&&a.guideTarget===work.inter)continue;
        records.push({p,key,target:a.label==='Lift friend'?'friends':a.guideTarget,label:a.guideLabel||a.label,detail:a.label,ok:a.ok,hint:a.hint,status:a.status,utility:a.label==='Lift friend'});
      }
      if(!work&&!actions.length) {
        const z=S.zones.find(z=>!z.action&&z.visible&&!z.done&&Math.hypot(p.pos.x-z.x,p.pos.z-z.z)<z.r+.5&&Math.abs(p.pos.y-z.y)<(z.vRange===undefined?2.5:z.vRange));
        if(z)records.push({p,target:z,label:(z.label||(z.time>=999?'Stand on the marked plate':'Stay in the marked ring'))+(z.time<999?' · '+Math.min(99,Math.floor(z.progress*20)*5)+'%':''),ok:true});
      }
    }
    renderActionGuide(records);
    updateTalkCues(talkPeople);
  }

  function setRole(p, idx) {
    dropHeld(p);
    p.roleIdx = (idx + ROLES.length) % ROLES.length;
    p.role = ROLES[p.roleIdx];
    const vis = p.mesh.visible;
    S.scene.remove(p.mesh); S.scene.remove(p.shadow);
    const m = buildPlayerMesh(p.role);
    shineUp(m.group); playerLamp(m.group);
    p.mesh = m.group; p.shadow = m.shadow; p.eyes = null; p.ghost = null;p.brows=null;p.gesture=null;
    p.mesh.visible = vis; p.shadow.visible = vis;
    S.scene.add(p.mesh); S.scene.add(p.shadow);
    syncArmor(p);syncTools(p); updateLabel(p);
    if (p.bubble) p.mesh.userData.bubble.visible = true;
  }
  function swapRole(p, direction = 1) {
    const taken = S.players.filter((q) => q.joined && q !== p).map((q) => q.roleIdx);
    for (let k = 1; k < ROLES.length; k++) {
      const idx = (p.roleIdx + direction * k + ROLES.length) % ROLES.length;
      if (taken.indexOf(idx) < 0) {
        setRole(p, idx);
        toast('P' + (p.slot + 1) + ' is now the ' + p.role.name + ' — ' + p.role.trait, 2500);
        Audio.sfx('pickup');
        return;
      }
    }
  }
  function cycleRole(p, d) { setRole(p, p.roleIdx + d); renderLobby(); }

  function joinSlot(i, device) {
    const p = S.players[i];
    if (!p || p.joined) return;
    p.joined = true; p.device = device;
    p.mesh.visible = true; p.shadow.visible = true; p.label.style.display = '';
    if (device && device.indexOf('vpn') === 0) setTimeout(() => netTell(device), 0);
    const saved = loadSetup()[i];
    if (saved && saved.role !== undefined && saved.role !== p.roleIdx && S.phase === 'lobby') setRole(p, saved.role);   // same character as last level
    if (S.phase !== 'lobby') {
      const lead = S.players.find((q) => q.joined && q !== p && !q.bubble);
      if (lead) { p.pos.copy(lead.pos); p.pos.x += 1.5; p.lastSafe.copy(lead.lastSafe); }
      if(S.runStarted&&!S.lifeJoined[i]){S.lifeJoined[i]=true;S.teamLives=Math.min(8,S.teamLives+1);p.health=2;p.lifeEpoch=1;p.recoveryUsed=0;}
      toast('👋 Player ' + (i + 1) + ' joined!');
    }
    Audio.sfx('pickup');
    renderLobby();
  }
  function leaveSlot(i) {
    const p = S.players[i];
    if (!p || !p.joined || i === 0) return;
    dropHeld(p);
    if (p.device && p.device.indexOf('vpn') === 0) netSend({ t: 'to', id: +p.device.slice(3), msg: { t: 'left' } });
    p.joined = false; p.device = null;
    p.mesh.visible = false; p.shadow.visible = false; p.label.style.display = 'none';
    renderLobby();
  }
  function deviceInUse(d) { return S.players.some((p) => p.joined && p.device === d); }
  function nextFreeSlot() { return S.players.findIndex((p, i) => i > 0 && !p.joined); }

  // A player whose controller (or phone) went away: the next new controller, phone or keyboard to press A / JUMP / E
  // takes that player over (same character, hearts, equipment and place), instead of adding a new player.
  function orphanPlayer() { return S.players.find((p) => p.joined && isPad(p.device) && p.wasHere === p.device && !present(p)); }   // only a controller that worked and then stopped
  function takeOver(p, device) {
    const was = p.device; p.device = device; p.promptStr = null; Audio.init(); Audio.sfx('pickup');
    if (device.indexOf('vpn') === 0) netTell(device);
    toast('🎮 P' + (p.slot + 1) + ' is back, on a ' + (device.indexOf('gp') === 0 ? 'new controller' : device.indexOf('kb') === 0 ? 'keyboard' : device === 'vpt' ? 'touch screen' : 'phone') + '.', 3000);
    renderLobby();
    return was;
  }
  SQ._takeOver = takeOver; SQ._orphan = orphanPlayer;
  function checkJoins() {
    // a controller that dies: say once how to get that player back
    S.players.forEach((p) => {
      const here = present(p);
      if (here) { p.wasHere = p.device; p.lostSaid = false; }
      else if (p.joined && isPad(p.device) && p.wasHere === p.device && !p.lostSaid && S.phase !== 'lobby') { p.lostSaid = true; toast('🔌 P' + (p.slot + 1) + '\'s controller stopped. Press A on any other controller (or E on the keyboard) to take over P' + (p.slot + 1) + '.', 5000); }
    });
    // Enter = second keyboard player; A/Start on an unused controller = new player
    if (pressedKeys.Enter && !deviceInUse('kb2') && S.phase === 'lobby') {
      const i = nextFreeSlot(); if (i > 0) joinSlot(i, 'kb2');
    }
    // E = the WASD keyboard joins again after a controller took Player 1
    if ((pressedKeys.KeyE || pressedKeys.KeyF) && !deviceInUse('kb1')) {
      const o = orphanPlayer();
      if (o) takeOver(o, 'kb1');
      else { const i = nextFreeSlot(); if (i > 0) joinSlot(i, 'kb1'); }
    }
    const idsThisFrame = {};
    // the touch screen: whoever touches it is Player 1 when Player 1 has no controller (a tablet or phone game)
    if (gpNow.vpt && gpNow.vpt.on && !deviceInUse('vpt') && (gpPressed('vpt', 0) || gpPressed('vpt', 2) || gpPressed('vpt', 9) || vpads.vpt.touched)) {
      const p1 = S.players[0];
      if (p1.joined && !isPad(p1.device)) { p1.device = 'vpt'; p1.promptStr = null; renderLobby(); }
      else { const i = nextFreeSlot(); if (i > 0) joinSlot(i, 'vpt'); }
      vpads.vpt.touched = false;
    }
    // phones: JUMP (or Start) joins as a new player, like a controller
    for (const k in vpads) {
      if (k === 'vpt' || !gpNow[k] || !gpNow[k].on || deviceInUse(k)) continue;
      if (gpPressed(k, 0) || gpPressed(k, 9)) {
        Audio.init();
        const o = orphanPlayer(); if (o) { takeOver(o, k); continue; }
        const p1 = S.players[0];
        if (S.phase === 'lobby' && p1.device === 'kb1' && !S.players.some((q, j) => j > 0 && q.joined)) { p1.device = k; netTell(k); Audio.sfx('pickup'); renderLobby(); continue; }
        const i = nextFreeSlot();
        if (i > 0) joinSlot(i, k);
      }
    }
    for (let g = 0; g < 4; g++) {
      if (!gpNow[g] || !gpNow[g].on) continue;
      const d = 'gp' + g;
      if (deviceInUse(d)) continue;
      if (S.phase === 'play' && !S.toldPad) { S.toldPad = true; toast('🎮 Controller found: press A to join as a new player, or Start to take over Player 1.', 4500); }
      if (gpPressed(g, 0) || gpPressed(g, 9)) {
        Audio.init();
        const id = gpNow[g].id;
        if (id && idsThisFrame[id]) continue;              // Chrome sometimes lists one controller twice
        idsThisFrame[id] = true;
        const o = orphanPlayer(); if (o) { takeOver(o, d); continue; }   // a dead controller's player comes back on this one
        const p1 = S.players[0];
        if (S.phase === 'lobby' && p1.device === 'kb1') {  // first controller in the lobby becomes Player 1
          p1.device = d; Audio.sfx('pickup'); renderLobby();
          continue;
        }
        // during the game: Player 1 on the keyboard picks up a controller. Alone, any button hands P1 over;
        // with friends playing, Start hands P1 over and A joins a new player.
        // during the game the rule is always the same: A joins as a new player, Start takes over Player 1
        if (S.phase !== 'lobby' && p1.joined && p1.device !== d && gpPressed(g, 9) && p1.device && p1.device.indexOf('gp') !== 0) {
          p1.device = d; Audio.sfx('pickup'); p1.promptStr = null;
          toast('🎮 Player 1 is now on the controller (the keyboard can join as a new player with E).', 3500);
          continue;
        }
        if (S.phase !== 'lobby' && !gpPressed(g, 0)) continue;
        const i = nextFreeSlot();
        if (i > 0) { joinSlot(i, d); if (S.phase !== 'lobby' && !S.toldStart) { S.toldStart = true; toast('🎮 Tip: Start on a controller takes over Player 1 instead.', 3500); } }
      }
    }
  }

  function updatePlayer(p, inp, dt) {
    const L = S.level;
    resetPlayerArms(p);
    p.inp = inp;                                                         // (a level can read the stick, e.g. to steer a ride)
    if (p.riding && (p.bubble || p.carriedBy || !p.joined)) dismount(p);
    p.mesh.visible=!!p.joined&&(!!p.bubble||p.hitCd<=0||Math.floor(p.hitCd*12)%2===0);
    if(!p.fallPrev||p.pos.distanceTo(p.fallPrev)>7||p.onGround)p.fallPeak=p.pos.y;
    else p.fallPeak=Math.max(p.fallPeak===undefined?p.pos.y:p.fallPeak,p.pos.y);
    if (p.hitCd > 0) p.hitCd -= dt;
    if (p.callT > 0) {
      p.callT -= dt;
      const k = 1 - p.callT / 0.6;
      p.callRing.position.set(p.pos.x, p.pos.y + 0.1, p.pos.z);
      p.callRing.scale.setScalar(1 + k * p.role.callRadius * 0.9);
      p.callRing.material.opacity = (1 - k) * 0.7;
    } else p.callRing.material.opacity = 0;

    if(p.bubble||p.seat||p.carriedBy){
      p.gesture=null;p.visualGesture=null;const b=p.mesh.userData.body;b.rotation.y=0;if(p.mesh.userData.head)p.mesh.userData.head.rotation.set(0,0,0);if(p.mesh.userData.motion)p.mesh.userData.motion.weight=0;
      if(p.mesh.userData.roleTool)p.mesh.userData.roleTool.visible=false;
      for(const name of ['armL','armR']){const a=b.getObjectByName(name);if(a){a.rotation.y=0;a.rotation.z=a.userData.z0===undefined?(name==='armL'?-.18:.18):a.userData.z0;a.rotation.x=-.5;}}
    }
    // ---- bubble ----
    if (p.bubble) {
      const b = p.bubble;
      b.t += dt;
      const others = S.players.filter((q) => q.joined && q !== p && !q.bubble);
      if(b.death){if(b.t>1.2){p.pos.copy(safeReturn(p,S.checkpoint));popBubble(p,null);}}
      else if (!others.length) {
        if (b.t > 1.2) { p.pos.set(b.x, b.y - 2.2, b.z); popBubble(p, null); }
      } else {
        // float to nearest teammate if waited too long or it is a regroup bubble
        if (!b.hazard || b.t > T.bubbleWait) {
          let near = others[0], nd = 1e9;
          others.forEach((q) => { const d = q.pos.distanceTo(p.pos); if (d < nd) { nd = d; near = q; } });
          if (b.to && b.to.joined && !b.to.bubble) near = b.to;               // regroup: go to the main group
          b.x += (near.pos.x - b.x) * Math.min(1, dt * 2.5);
          b.z += (near.pos.z - b.z) * Math.min(1, dt * 2.5);
          b.y += (near.pos.y + 2.2 - b.y) * Math.min(1, dt * 2.5);
          if (Math.hypot(near.pos.x - b.x, near.pos.z - b.z) < 1.8) { p.pos.set(near.pos.x + 1, near.pos.y, near.pos.z); popBubble(p, null); }
        }
        if (p.bubble) for (const q of others) {
          if (Math.hypot(q.pos.x - b.x, q.pos.z - b.z) < 2.2 && Math.abs(q.pos.y + 1 - b.y) < 3.5 && b.t > 0.6) {
            p.pos.set(b.x, Math.max(groundAt(b.x, b.z), b.y - 2.2), b.z);
            popBubble(p, q); break;
          }
        }
      }
      if (p.bubble) {
        p.pos.set(b.x, b.y + Math.sin(S.time * 3 + p.slot) * 0.25, b.z);
        p.mesh.position.copy(p.pos);
        p.shadow.visible = false;
        return;
      }
    }
    p.shadow.visible = true;

    // ---- seated on a ride the level moves (p.seat(p) -> [x, y, z, facing] or null) ----
    if (p.seat) {
      const st = p.seat(p);
      if (st) {
        p.pos.set(st[0], st[1], st[2]); p.vel.set(0, 0, 0); p.onGround = true; if (st[3] !== undefined) p.facing = st[3];
        p.mesh.position.copy(p.pos); p.mesh.rotation.y = p.facing;
        p.shadow.position.set(p.pos.x, p.pos.y + 0.04, p.pos.z);
        if (inp.cheer) cheer(p);
        return;
      }
    }

    // ---- being carried ----
    if (p.carriedBy) {
      const c = p.carriedBy;
      p.pos.set(c.pos.x, c.pos.y + 2.1, c.pos.z);
      p.vel.set(0, 0, 0);
      if (inp.jumpP) releaseCarried(c, false);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = c.facing;
      return;
    }

    // ---- actions ----
    if (p.stun <= 0) {
      if (inp.act) doAction(p, inp.split ? 'use' : 'context');
      if (inp.call) callAnimals(p);
      if (inp.carry) doAction(p, 'carry');
    }
    if(S.homeInterior)return;
    if (inp.cheer) cheer(p);
    if (inp.share) doShare(p, !inp.split);
    if (inp.catchup) catchUp(p);

    const dragging = p.holding && p.holding.heavy && !p.role.strong;
    const wasGround=p.onGround;
    let gi=groundInfo(p.pos.x,p.pos.z,p.pos.y),g=gi.h;
    if(p.ropeSwing)stepRope(p,dt);
    else {
    // ---- movement ----
    let speed = p.role.speed;
    if (p.armor.sandals) speed *= 1.2;
    let inMud = false;
    for (const m of S.muds) if (inShape(m, p.pos.x, p.pos.z)) inMud = true;
    if (inMud && !p.armor.sandals) speed *= 0.55;
    if (dragging) speed *= 0.5;
    if (p.carrying) speed *= 0.8;
    if (p.riding) speed *= p.riding.rideSpeed || 1.35;                // a camel or donkey goes a little faster than walking
    if (inp.run && !dragging) speed *= T.runBoost || 1.45;       // hold X (or Shift) to run
    p.running = !!inp.run && Math.hypot(inp.mx, inp.mz) > 0.3;
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
    const tx = p.stun > 0 ? p.vel.x : inp.mx * speed;
    const tz = p.stun > 0 ? p.vel.z : inp.mz * speed;
    const k = Math.min(1, dt * (p.onGround ? T.accelGround : T.accelAir));
    p.vel.x += (tx - p.vel.x) * k;
    p.vel.z += (tz - p.vel.z) * k;
    if (Math.abs(inp.mx) + Math.abs(inp.mz) > 0.1) {
      const ta = Math.atan2(inp.mx, inp.mz);
      let d = ta - p.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.facing += d * Math.min(1, dt * 14);
    }

    // ---- jump (buffer + coyote + variable height) ----
    if (inp.jumpP) p.jumpBuf = T.jumpBuffer; else p.jumpBuf -= dt;
    if (p.onGround) p.coyote = T.coyote; else p.coyote -= dt;
    if (p.jumpBuf > 0 && p.coyote > 0 && !dragging) {
      p.vel.y = p.role.jump; p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
      p.squash = 1.25; Audio.sfx('jump');
      spawnPuff(p.pos.x, p.pos.y, p.pos.z, surfacePuff(p), 4);
    }
    if (p.sprung && (p.vel.y <= 0 || p.onGround)) p.sprung = false;    // a spring launch is not cut short
    if (!inp.jump && p.vel.y > 0 && p.stun <= 0 && !p.sprung) p.vel.y *= Math.pow(T.jumpCut, dt * 10);
    const hang = inp.jump && Math.abs(p.vel.y) < 2.5 && !p.onGround ? T.apexHang : 1;   // a little float at the top: time to aim
    p.vel.y -= T.gravity * (p.vel.y < 0 ? T.fallMult : 1) * hang * dt;
    if (p.vel.y < -30) p.vel.y = -30;
    if (!p.onGround && p.vel.y < 0 && p.stun <= 0) landingMagnet(p, inp, dt);

    // ---- integrate & collide ----
    const prevY = p.pos.y, ox = p.pos.x, oz = p.pos.z;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    resolveSides(p.pos, T.playerRadius, prevY);
    steepHill(p, ox, oz, prevY, dt);
    softBump(p);
    // edge guard: a gentle stick push never walks you off a high edge (a full push still does)
    const tilt = Math.hypot(inp.mx, inp.mz);
    if (p.onGround && p.vel.y <= 0 && tilt > 0.05 && tilt < 0.55 && prevY - groundAt(p.pos.x, p.pos.z, prevY) > T.edgeGuard) {
      p.pos.x = ox; p.pos.z = oz; p.vel.x = 0; p.vel.z = 0;
    }
    p.pos.y += p.vel.y * dt;
    const landing = !p.onGround && p.vel.y < -4;                     // coming down from a jump (not just stepping off an edge)
    gi = groundInfo(p.pos.x, p.pos.z, prevY, landing ? T.landGrace : 0);
    g = gi.h;

    if (p.pos.y <= g) {
      if (!wasGround && p.vel.y < -6) { p.squash = 0.72; Audio.sfx('land'); spawnPuff(p.pos.x, g, p.pos.z, surfacePuff(p,gi.pl), 5); }
      if (landing && gi.pl && Math.abs(inp.mx) + Math.abs(inp.mz) < 0.5) { p.vel.x *= 0.25; p.vel.z *= 0.25; }   // stick the landing on a platform
      if (landing && gi.pl) {                                            // landed on the very edge: nudge onto the platform
        const pl = gi.pl;
        p.pos.x = Math.max(pl.minX + 0.05, Math.min(pl.maxX - 0.05, p.pos.x));
        p.pos.z = Math.max(pl.minZ + 0.05, Math.min(pl.maxZ - 0.05, p.pos.z));
      }
      if (!wasGround && gi.pl && gi.pl.bouncy && p.vel.y < -7.5) {        // a striped canopy: one gentle rebound, then you settle
        p.pos.y = g; gi.pl.flexT = 0.4;
        if (p.jumpBuf > 0 && !(p.holding && p.holding.heavy && !p.role.strong)) { p.vel.y = p.role.jump + 1.2; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; Audio.sfx('jump'); }   // jump pressed as you land: a full jump (plus a little spring from the cloth)
        else { p.vel.y = Math.min(5.5, -p.vel.y * gi.pl.bouncy); p.onGround = false; p.coyote = T.coyote; }   // the rebound keeps the normal jump window open
      } else { p.pos.y = g; p.vel.y = 0; p.onGround = true; }
    } else if (p.pos.y - g > 0.05) p.onGround = false;
    // snap down small steps when walking
    if (wasGround && !p.onGround && p.vel.y <= 0 && p.pos.y - g < T.stepUp) { p.pos.y = g; p.onGround = true; }
    p.standingOn = p.onGround ? gi.pl : null;

    }
    // ---- hazards ----
    let hazMsg = null;
    for (const h of S.hazards) {
      if (!h.on || !inShape(h, p.pos.x, p.pos.z)) continue;
      if (h.except && h.except(p)) continue;
      if (p.standingOn && p.standingOn.light) continue;            // walking on the light across it
      if (h.maxY !== undefined && p.pos.y > h.maxY) continue;
      hazMsg = h.msg || ('P' + (p.slot + 1) + ' fell in!');
    }
    const wade = p.role.wade || 1.1;
    if (!hazMsg && S.waterY - p.pos.y > wade) hazMsg = '🌊 P' + (p.slot + 1) + (S.lifeMode==='practice'?' got swept up — a teammate can pop the bubble!':' fell into deep water. Back to the checkpoint.');
    if (!hazMsg && p.pos.y < (L.killY !== undefined ? L.killY : -40)) hazMsg = 'P' + (p.slot + 1) + ' fell!';
    if (hazMsg) { enterBubble(p, true, hazMsg); return; }
    if(p.onGround&&!wasGround&&S.lifeMode!=='practice'&&(p.fallPeak||0)-p.pos.y>8){
      hitPlayer(p,p.pos.x,p.pos.z,'landing','A long fall hurt P'+(p.slot+1)+'.');if(p.bubble||S.phase==='gameover')return;
    }
    if(p.onGround)p.fallPeak=p.pos.y;
    if(!p.fallPrev)p.fallPrev=p.pos.clone();else p.fallPrev.copy(p.pos);

    // remember a safe spot (on ground, not in water)
    p.safeT -= dt;
    if (p.onGround && p.safeT <= 0 && safeStanding(p,p.pos)) { p.lastSafe.copy(p.pos); p.safeT = 0.3; }

    // ---- visuals ----
    p.squash += (1 - p.squash) * Math.min(1, dt * 10);
    const body = p.mesh.userData.body;
    body.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
    const spd = Math.hypot(p.vel.x, p.vel.z);
    const wt0 = p.walkT || 0;
    p.walkT = wt0 + dt * Math.min(12, spd * 1.3);
    if (p.onGround && spd > 2 && Math.floor(p.walkT / Math.PI) !== Math.floor(wt0 / Math.PI)) Audio.stepSound(surfaceAt(p));
    if (p.onGround && spd > 1) footprint(p);
    p.workT = Math.max(0, (p.workT || 0) - dt);
    const bracing = p.workT > 0 && !L.solemn && p.onGround && spd < 1.5 && !p.holding && !p.carrying;
    const swing = p.onGround ? Math.sin(p.walkT) * Math.min(0.7, spd * 0.08) : -0.5;
    const aL = body.getObjectByName('armL'), aR = body.getObjectByName('armR');
    if (aL) {
      aL.rotation.y=0;aR.rotation.y=0;
      const inHands = p.holding && !dragging && holdInHands(p.holding);
      if (p.carrying || (p.holding && !inHands && !dragging)) { aL.rotation.x = -2.8; aR.rotation.x = -2.8; }   // arms straight up: a friend or a big load overhead
      else if (p.holding) { aL.rotation.x = -1.1; aR.rotation.x = -1.1; }                // arms forward, holding it in front
      else { aL.rotation.x = swing; aR.rotation.x = p.onGround ? -swing : -0.5; }
      if (bracing) { aL.rotation.x = -0.9 + Math.sin(S.time * 9) * 0.12; aR.rotation.x = -0.9 - Math.sin(S.time * 9) * 0.12; }
      if(p.ropeSwing){aR.rotation.x=-2.7;if(!p.holding)aL.rotation.x=-2.7;}
      // idle for a while: a friendly wave now and then; cheering: both arms up
      const still = p.onGround && spd < 0.3 && !p.holding && !p.carrying && Math.abs(inp.mx) + Math.abs(inp.mz) < 0.1;
      p.idleT = still ? (p.idleT || 0) + dt : 0;
      if (aR.userData.z0 === undefined) { aR.userData.z0 = aR.rotation.z; aL.userData.z0 = aL.rotation.z; }
      const waving = !L.solemn&&p.idleT > 5 && (p.idleT % 6) < 1.4, cheering = !L.solemn&&p.cheerT > 0.5;
      aR.rotation.z = waving || cheering ? aR.userData.z0 - 2.5 + Math.sin(S.time * 14) * 0.35 : aR.userData.z0;
      aL.rotation.z = cheering ? aL.userData.z0 + 2.5 - Math.sin(S.time * 14) * 0.35 : aL.userData.z0;
      if(!p.onGround&&!p.holding&&!p.carrying&&!p.riding&&!p.ropeSwing){const open=Math.max(0,Math.min(.22,(-p.vel.y-2)*.015));aL.rotation.z-=open;aR.rotation.z+=open;}
      if (waving || cheering) aR.rotation.x = 0;
      if (cheering) aL.rotation.x = 0;
    }
    if (p.cheerT > 0) { p.cheerT -= dt; if (p.cheerT <= 0 && p.labelCheer) p.labelCheer.style.display = 'none'; }
    // the face: blinks, looks at nearby things and shows a mood (see faceMood)
    p.blinkT = (p.blinkT === undefined ? 2 + p.slot : p.blinkT) - dt;
    if (p.blinkT < 0) p.blinkT = 2.5 + Math.random() * 3;
    p.happyT = Math.max(0, (p.happyT || 0) - dt);
    const mood = p.mood = faceMood(p);
    const blink = p.blinkT < 0.12;
    const eyeY = mood === 'joy' ? 0.3 : blink ? 0.15 : mood === 'sleepy' ? 0.42 + Math.sin(S.time * 1.3) * 0.08 : mood === 'surprise' ? 1.25 : 1;
    const eyeX = mood === 'surprise' && !blink ? 1.18 : 1;
    const smileM = body.getObjectByName('smile'), oh = body.getObjectByName('oh');
    if (smileM && oh) {
      smileM.visible = mood !== 'surprise'; oh.visible = mood === 'surprise';
      smileM.rotation.z = mood === 'worried' ? 0 : Math.PI;                     // a little frown when worried
      smileM.position.y = mood === 'worried' ? -.15 : -.09;
      smileM.scale.setScalar(mood === 'joy' ? 1.3 : mood === 'worried' ? 0.7 : 1);if(mood==='listen')smileM.scale.y=.3;
    }
    if (!p.brows) { p.brows = []; body.traverse((o) => { if (o.name === 'brow') { o.userData.z0 = o.rotation.z; o.userData.y0 = o.position.y; p.brows.push(o); } }); }
    p.brows.forEach((b) => {                                      // brows: up in surprise, tilted when worried
      const sd = b.userData.side;
      b.rotation.z = b.userData.z0 + (mood === 'worried' ? sd * 0.45 : mood === 'joy' ? -sd * 0.1 : 0);
      b.position.y = b.userData.y0 + (mood === 'surprise' ? 0.05 : mood === 'sleepy' ? -0.025 : 0);
    });
    // where to look: the nearest thing to do, or a friend, now and then
    p.lookT = (p.lookT || 0) - dt;
    if (p.lookT <= 0) { p.lookT = 0.35; p.lookX = eyeLook(p); }
    p.lookS = (p.lookS || 0) + ((p.lookX || 0) - (p.lookS || 0)) * Math.min(1, dt * 10);
    // lean into turns and forward when running; the robe swings a little behind
    p.prevFacing = p.prevFacing === undefined ? p.facing : p.prevFacing;
    let turn = p.facing - p.prevFacing; while (turn > Math.PI) turn -= Math.PI * 2; while (turn < -Math.PI) turn += Math.PI * 2;
    p.prevFacing = p.facing;
    const lean = Math.max(-0.22, Math.min(0.22, -turn / Math.max(dt, 1e-3) * 0.02 * Math.min(1, spd / 6)));
    body.rotation.z += (lean - body.rotation.z) * Math.min(1, dt * 8);
    body.rotation.x += ((bracing ? 0.22 : p.holding && p.holding.heavy ? 0.12 + Math.min(0.08, spd * 0.008) : Math.min(0.12, spd * 0.011)) - body.rotation.x) * Math.min(1, dt * 8);
    if(!p.onGround&&!p.riding&&!p.seat&&!p.ropeSwing)body.rotation.x+=((p.vel.y>0?-.08:.08)-body.rotation.x)*Math.min(1,dt*5);
    if(p.holding&&p.onGround)body.rotation.z+=Math.sin(p.walkT)*Math.min(.025,spd*.002);
    const rb = body.getObjectByName('robe');
    if (rb) { const sw = p.onGround ? Math.sin(p.walkT * 0.5) * Math.min(0.06, spd * 0.006) : -0.05; rb.rotation.z = sw; }
    if (!p.eyes) { p.eyes = []; body.traverse((o) => { if (o.name === 'eye') p.eyes.push(o); }); }
    p.eyes.forEach((e) => {
      if (!e.userData.s0) e.userData.s0 = [e.scale.x, e.scale.y, e.position.x];
      const s0 = e.userData.s0; e.scale.x = s0[0] * eyeX; e.scale.y = s0[1] * eyeY; e.position.x = s0[2] + p.lookS * 0.035;
    });
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1 && p.onGround;
    const motion=p.mesh.userData.motion;motion.weight+=((moving?1:0)-motion.weight)*Math.min(1,dt*12);if(motion.weight<.001)motion.weight=0;
    const headRig=p.mesh.userData.head,quiet=L.solemn||p.bubble||p.stun>0,lookScale=setting('gentle')==='1'?.55:1;
    if(headRig){headRig.rotation.y+=((quiet?0:(p.lookS||0)*.15*lookScale)-headRig.rotation.y)*Math.min(1,dt*7);headRig.rotation.x+=((quiet?0:p.holding?.045:mood==='sleepy'?.025:0)-headRig.rotation.x)*Math.min(1,dt*7);}
    // Feet stay outside the leaning/squashing body so a planted sole meets its deck.
    // This is presentation only: feet never write player position, velocity or collision state.
    const seated=!!(p.riding||p.seat),stride=Math.min((p.holding||p.carrying) ? .22 : .34,spd*.027);
    const gait=seated?'ride':p.ropeSwing?'rope':!p.onGround?'air':moving||motion.weight>0?'walk':'idle';
    p.visualGait=gait;
    (p.mesh.userData.feet||[]).forEach((f,i)=>{
      const phase=p.walkT+(i?Math.PI:0),lift=gait==='walk'?Math.max(0,Math.sin(phase))*.16*motion.weight:0;
      f.group.position.set(f.side*(seated?.32:.2),seated?.22:lift,.1+(gait==='walk'?Math.cos(phase)*stride*motion.weight:seated?.24:gait==='air'?f.side*.08:0));
      f.group.rotation.set(seated?-.65:gait==='air'||gait==='rope'?.32:gait==='walk'?-Math.max(0,Math.sin(phase))*.24*motion.weight:0,0,seated?-f.side*.18:0);
      const gold=p.mesh.userData.armor.sandals.children[i];if(gold){gold.position.copy(f.group.position);gold.position.y+=.06;gold.position.z+=.02;gold.rotation.copy(f.group.rotation);}
    });
    body.position.y = p.onGround&&!seated ? (.035+Math.abs(Math.sin(p.walkT))*.065)*motion.weight : 0;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.facing;
    animateGesture(p,dt,spd);
    if (p.riding) { p.mesh.position.y += p.riding.seat || 1.1; body.position.y = Math.abs(Math.sin(p.walkT * 0.5)) * Math.min(0.12, Math.hypot(p.vel.x, p.vel.z) * 0.02); }
    p.shadow.position.set(p.pos.x, groundAt(p.pos.x, p.pos.z, p.pos.y) + 0.04, p.pos.z);
    p.shadow.scale.setScalar(Math.max(0.35, 1 - (p.pos.y - g) * 0.12));
    const air = !p.onGround && p.pos.y - g > 0.6, sm = p.shadow.material;     // in the air: the landing spot glows gold over a platform
    if (sm && sm.color) { sm.color.setHex(air && gi.pl ? 0xfbbf24 : 0x000000); sm.opacity = air ? 0.55 : 0.3; }

    // held item follows
    if (p.holding) {
      const it = p.holding;
      if (holdInHands(it)) {                                       // small things sit in the hands, in front of the chest
        const fw = 0.55 + it.holdR * 0.6, bob = body.position.y;
        it.mesh.position.set(p.pos.x + Math.sin(p.facing) * fw, p.pos.y + 0.98 + bob - it.holdLow, p.pos.z + Math.cos(p.facing) * fw);
      } else it.mesh.position.set(p.pos.x, p.pos.y + 2.3, p.pos.z);   // big loads ride overhead
      it.mesh.rotation.y = p.facing + Math.PI / 2;
      if (dragging) it.mesh.position.set(p.pos.x - Math.sin(p.facing) * 1.4, p.pos.y + 0.35, p.pos.z - Math.cos(p.facing) * 1.4);
      else if(!holdInHands(it))clearPlayerHeadwear(p,it);
      const dz = it.deliverTo;
      if (dz && Math.hypot(p.pos.x - dz.x, p.pos.z - dz.z) <= dz.r && (dz.y === undefined || Math.abs(p.pos.y - dz.y) < 3)) {
        it.delivered = true; it.holder = null; p.holding = null; it.mesh.visible = false;
        Audio.sfx('build');
        if (it.onDeliver) it.onDeliver(p, it);
      }
    }
    posePlayerLoad(p);
  }

  // A player's mood shows on the face: surprise (a fall, a bump, a bubble), joy (good news, the finish),
  // worried (storm, rain, a countdown running low), sleepy (standing still at night), or '' (a happy smile).
  function faceMood(p) {
    if (p.bubble || p.stun > 0 || (!p.onGround && p.vel.y < -9)) return 'surprise';
    if(S.level.solemn)return 'listen';
    if (p.happyT > 0 || S.finaleDone) return 'joy';
    if (!p.onGround && p.vel.y > 3) return 'surprise';
    const cd = S.countdown && !S.countdown.over ? S.countdown : null;
    if (S.rain || S.timeCfg === TIMES.storm || (cd && cd.left < 20)) return 'worried';
    if (S.timeCfg === TIMES.night && (p.idleT || 0) > 4) return 'sleepy';
    return '';
  }
  SQ.faceMood = faceMood;
  // Eyes glance (-1 left .. 1 right, from the player's view) toward the nearest thing to do or a friend.
  function eyeLook(p) {
    let best = null, bd = 36;
    for (const it of S.interactables) { if (!it.alive || it.x === undefined) continue; const d = (it.x - p.pos.x) ** 2 + (it.z - p.pos.z) ** 2; if (d < bd) { bd = d; best = it; } }
    if (!best) for (const q of S.players) { if (q === p || !q.joined) continue; const d = (q.pos.x - p.pos.x) ** 2 + (q.pos.z - p.pos.z) ** 2; if (d < bd) { bd = d; best = q.pos; } }
    if (!best) return 0;
    const dx = best.x - p.pos.x, dz = best.z - p.pos.z, f = p.facing;
    const side = dx * Math.cos(f) - dz * Math.sin(f), fwd = dx * Math.sin(f) + dz * Math.cos(f);
    if (fwd < -0.5) return 0;                                       // behind: look ahead
    return Math.max(-1, Math.min(1, side / Math.max(1, Math.hypot(side, fwd))));
  }
  SQ.eyeLook = eyeLook;

  function bestInteract(p, kind = 'context') {
    let best = null, bd = 1e9;
    for (const it of S.interactables) {
      if (!it.alive || (it.available&&!it.available(p)) || (it.item&&!it.item.mesh.visible)) continue;
      if ((kind === 'carry' && !it.item) || (kind === 'use' && it.item)) continue;
      const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
      if (d > it.r || Math.abs(p.pos.y - it.y) > it.vRange) continue;
      const pr = it.priority || 0, bp = best ? best.priority || 0 : -1e9;
      if (pr > bp || (pr === bp && d < bd)) { bd = d; best = it; }
    }
    return best;
  }
  function mateNear(p) {
    return S.players.find((q) => q !== p && q.joined && !q.bubble && !q.carriedBy && !q.carrying && !q.holding &&
      Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 1.6 && Math.abs(q.pos.y - p.pos.y) < 1);
  }
  function callAnimals(p) {
    p.callT = 0.6;
    let n = 0, kind = null;
    let refused = null;
    for (const f of S.followers) {
      if (f.state !== 'idle' || f.call === false) continue;
      if (Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) <= p.role.callRadius) {
        const c = f.callable ? f.callable(p) : true;
        if (c !== true) { refused = c; continue; }
        f.state = 'follow'; f.leader = p; n++; kind = f.kind; f.joyT = S.time;   // a happy hop
      }
    }
    if (!n && refused) { Audio.sfx('error'); toast(refused, 2600); return; }
    if (n) {
      Audio.sfx(kind === 'lion' || kind === 'bear' ? 'roar' : 'bleat');
      const L = S.level;
      const msg = L.onCallText ? L.onCallText(kind, n) : 'Called ' + n + ' ' + kind + (n > 1 ? 's' : '') + '!';
      if (msg) toast(msg, 2000);                                   // (a level can return '' to keep it quiet: the hop and the sound say it)
    } else {
      Audio.sfx('call');
      if (p.role.id !== 'shepherd' && S.followers.some((f) => f.state === 'idle' && Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) < 14))
        toast('Get closer — only the Shepherd can call from far away.', 2000);
    }
  }
  // Resolve each action once for both its prompt and its button. Compact devices keep contextual ACTION.
  function animalAction(p) {
    const inCall = S.followers.filter(ff => ff.state === 'idle' && ff.call !== false && Math.hypot(ff.pos.x-p.pos.x,ff.pos.z-p.pos.z) <= p.role.callRadius);
    const callF = inCall.find(ff => !ff.callable || ff.callable(p) === true) || inCall[0];
    if (!callF) return null;
    const callOk = !callF.callable || callF.callable(p) === true;
    const list = callOk ? inCall.filter(ff => !ff.callable || ff.callable(p) === true) : [callF];
    const k = list[0].kind, same = list.every(ff => ff.kind === k);
    const named = list.length <= 3 && list.every(ff => /^[A-Z]/.test(ff.kind));      // people with names: "Call Moses and Aaron"
    const label = list.length === 1 ? 'Call '+k : named ? 'Call '+list.map(ff => ff.kind).join(' and ') : 'Call '+list.length+' '+(same ? (k === 'sheep' ? 'sheep' : k+'s') : 'animals');
    return { label, guideLabel:label, guideTarget:callF, ok: callOk, run: () => callAnimals(p), at: [callF.pos.x,callF.pos.y,callF.pos.z] };
  }
  function resolveAction(p, kind = 'context') {
    if(p.ropeSwing)return {label:'Swinging…',status:'Swinging…',guideTarget:p.ropeSwing.anchor,ok:true,run(){}};
    const callIt = kind === 'context' || kind === 'call' || kind === 'carry' ? animalAction(p) : null;
    if (kind === 'call') return callIt || { label:null, ok:true, run:()=>callAnimals(p) };
    if (kind !== 'use') {
      if (p.carrying) return { label:'Throw friend', ok:true, run:()=>releaseCarried(p,true) };
      if (p.holding) {
        // Opt-in carrying tasks also work on compact controls (keyboard/phone/touch).
        // Ordinary held items still use contextual ACTION to put down, as before.
        if(kind==='context'){
          const use=bestInteract(p,'use');
          if(use&&use.whileHolding&&(!use.can||use.can(p)===true))return resolveAction(p,'use');
          if(p.role.id==='apostle'){const home=apostleAction(p);if(home&&home.homeEntry)return home;}
        }
        const it=p.holding,d=it.deliverTo;
        return { label:d ? 'Put down · take to '+(it.to || 'the gold ring') : (it.to ? 'Put down · '+it.to : 'Put down'), ok:true, run:()=>dropHeld(p), dest:d };
      }
    }
    const best=bestInteract(p,kind);
    if (best) {
      const c=best.can ? best.can(p) : true;
      const label=(typeof best.label === 'function' ? best.label(p) : best.label) || 'Use';
      const at=best.item ? [best.item.mesh.position.x,best.item.mesh.position.y-.3,best.item.mesh.position.z] : [best.x,best.y,best.z];
      if (c === true) return { label,guideLabel:label,guideTarget:best,talkPerson:best.talkPerson,status:typeof best.status==='function'?best.status(p):best.status,ok:true,run:()=>best.use(p),at };
      if (callIt && callIt.ok) return callIt;
      const role=typeof c === 'string' && (c.match(/\b(Builder|Scribe|Fisherman|Shepherd)\b/) || [])[1];
      return { label:role && role !== p.role.name ? 'needs '+role : label,guideLabel:label,guideTarget:best,ok:false,at,hint:typeof c==='string'?c:null,run:()=>{Audio.sfx('error');if(c)toast(c,2400);} };
    }
    if (p.riding && kind !== 'carry' && kind !== 'call') return { label:'Get off the '+p.riding.kind, ok:true, run:()=>dismount(p) };
    if (p.role.id === 'apostle' && kind !== 'carry' && kind !== 'call') { const ap = apostleAction(p); if (ap) return ap; }
    if (kind === 'carry' && callIt) return callIt;                    // B: nothing to pick up, so call the animals
    if (kind !== 'use') {
      // On a shared compact action button, a nearby named story companion takes
      // priority over optional teammate lifting. A clustered party must still
      // be able to call Jonah after dismounting on the beach.
      if(callIt&&callIt.ok&&/^[A-Z]/.test(callIt.guideTarget.kind)&&Math.hypot(callIt.guideTarget.pos.x-p.pos.x,callIt.guideTarget.pos.z-p.pos.z)<3.5)return callIt;
      const mate=mateNear(p);
      if (mate) return { label:'Lift friend',ok:true,run:()=>{p.carrying=mate;mate.carriedBy=p;Audio.sfx('pickup');},at:[mate.pos.x,mate.pos.y,mate.pos.z] };
    }
    if (callIt) return callIt;
    return { label:null,ok:true,run:()=>{if(kind === 'context')callAnimals(p);} };
  }
  function apostleAction(p) {
    const door = (S.doors || []).find((d) => (d.interior||!d.visited) && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) < 1.6 && Math.abs(d.y - p.pos.y) < 1.2);
    if(door&&door.interior){
      const reason=homeEntryReason(door);
      return {label:'Enter the family home',homeEntry:true,ok:!reason,hint:reason,at:[door.x,door.y+1,door.z],run:()=>reason?toast(reason,3000):enterHomeInterior(door)};
    }
    if (door) return { label: 'Visit this home', ok: true, at: [door.x, door.y + 1, door.z], run: () => visitHome(p, door) };
    let best = null, bd = 2.3;
    for (const r of S.people) {
      if (r.wx === undefined || !r.g.visible || !r.g.parent || Math.abs(r.wy - p.pos.y) > 1.5) continue;
      const d = Math.hypot(r.wx - p.pos.x, r.wz - p.pos.z); if (d < bd) { bd = d; best = r; }
    }
    if (best) return { label: 'Talk with them', guideTarget: best, talkPerson: best, ok: true, at: [best.wx, best.wy + 2, best.wz], run: () => askPerson(p, best) };
    return null;
  }
  function visitHome(p, door) {
    door.visited = true; Audio.sfx('door');
    S.players.forEach((q) => { if (q.joined && !q.bubble) q.health = Math.max(q.health, 2); });
    renderHUD(); spawnPuff(door.x, door.y + 1, door.z, 0xfde68a, 10); p.servant += 2;
    toast('🏠 A family welcomes you in and shares bread: everyone\'s hearts are full ("breaking bread from house to house", Acts 2:46).', 3800);
  }
  const CLUES = ['I saw something shining over that way!', 'A scroll piece? Try over there, friend.', 'My children found a golden scroll near there.', 'Look that way. Peace be with you!'];
  function askPerson(p, r) {
    const near = (list) => list.filter((f) => !f.got && !f.hidden).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
    const f = near(S.fragments) || near(S.leaves);
    if (!r.talked) { r.talked = true; p.servant += 1; }
    if (!f) { toast('💬 "God bless you on your way!" (You have found everything here.)', 2600); return; }
    S.hint = { at: [f.x, f.y + 0.5, f.z], t: 12 };
    Audio.sfx('page'); toast('💬 "' + CLUES[S.people.indexOf(r) % CLUES.length] + '" The golden arrow shows the way to ' + (S.fragments.indexOf(f) >= 0 ? 'a hidden scroll piece.' : 'something to gather.'), 3400);
  }
  SQ._apostleAction = (p) => apostleAction(p);

  // Optional authored home visits use a separate cutaway scene and temporary avatars.
  // Outdoor positions, inventories, platforms and tasks stay untouched while the world is paused.
  function homeEntryReason(door){
    if(S.phase!=='play'||S.finaleStarted||S.homeInterior)return 'Finish the current gathering before visiting.';
    if(door.interior.available&& !door.interior.available(api))return 'Serve this household before visiting its home.';
    if(api.players().some(p=>p.bubble||p.carriedBy||p.carrying||p.riding||p.seat||!p.onGround))return 'Regroup on foot before entering the home.';
    if(api.players().some(p=>Math.hypot(p.pos.x-door.x,p.pos.z-door.z)>7||Math.abs(p.pos.y-door.y)>1.2))return 'Gather everyone near the door to visit together.';
    return null;
  }
  function homeGroundAt(x,z,footY=Infinity){
    const h=S.homeInterior;if(!h)return 0;let y=0;
    for(const b of h.solids)if(x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ&&b.top<=footY+T.stepUp)y=Math.max(y,b.top);
    return y;
  }
  function homeActions(){
    const h=S.homeInterior;if(!h)return [];
    return [
      {id:'exit',x:0,z:3.6,y:0,r:1.9,label:'Return outside'},
      ...(!h.door.visited?[{id:'bread',x:2.3,z:.1,y:0,r:1.7,label:'Share bread with the family'}]:[]),
      {id:'clue',x:-2.7,z:-2.5,y:1.2,r:1.7,label:'Read the household ledger'}
    ];
  }
  function homeActionFor(a){return homeActions().find(t=>Math.hypot(a.pos.x-t.x,a.pos.z-t.z)<=t.r&&Math.abs(a.pos.y-t.y)<.7)||null;}
  function enterHomeInterior(door){
    const reason=homeEntryReason(door);if(reason){toast(reason,3000);return;}
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x252338);
    const camera=new THREE.PerspectiveCamera(48,window.innerWidth/window.innerHeight,.1,200);camera.position.set(0,12.5,15.5);camera.lookAt(0,.2,-.4);camera.updateMatrixWorld(true);
    const h=S.homeInterior={door,scene,camera,avatars:[],solids:[],age:0,walkT:0,pendingHint:null,stories:[],labelTextures:[],sharedMaterials:new Set(),sharedGeometries:new Set(),help:UI.help.innerHTML,helpClass:UI.help.className,hudPointer:UI.hud.style.pointerEvents,timerClass:UI.timer.className};
    S.scene.traverse(o=>{if(o.geometry)h.sharedGeometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])h.sharedMaterials.add(m);});
    door.roomState=door.roomState||{clueRead:false};
    const box=(x,y,z,w,height,d,color,tex,solid=false)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,height,d),texMat(color,tex));m.position.set(x,y+height/2,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);
      if(solid)h.solids.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,bottom:y,top:y+height});return m;
    };
    box(0,-.3,0,12,.3,10,0xd2b98b,'paving');
    box(0,0,-5,12,3.5,.25,0xd3b78a,'brick');box(-6,0,-1,.25,3.5,8,0xc4a47c,'brick');box(6,0,-1,.25,3.5,8,0xc4a47c,'brick');
    // Cutaway front and clear floor keep all four players, the exit and loft visible.
    box(-2.7,0,.9,4,.6,1.5,0xae885a,'wood',true);box(-2.7,0,-1.9,4,1.2,4,0xb79a70,'wood',true);
    box(2.3,0,-1.5,3,.85,1.5,0x9b6c42,'wood',true);
    box(3.6,0,-3.7,2.7,.35,1.4,0x8f6642,'wood');box(3.6,.36,-3.7,2.6,.08,1.3,0x994867,'cloth');
    box(1.6,.02,2.6,3.3,.025,1.7,0x845d79,'weave');
    for(const x of [-5.8,5.8])box(x,3.3,-1,.18,.18,8,0x795334,'wood');
    const light=new THREE.HemisphereLight(0xffebcd,0x756482,1);scene.add(light);
    const sun=new THREE.DirectionalLight(0xffdba6,.9);sun.position.set(4,9,7);scene.add(sun);
    const lamp=new THREE.PointLight(0xffb95c,1.1,14,2);lamp.position.set(2.8,2.4,-2.7);scene.add(lamp);
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshBasicMaterial({color:0xffd79a}));flame.position.copy(lamp.position);scene.add(flame);
    const host=personMesh(0x3e7380,0xe8ddbd,1,{age:'elder',register:false});host.position.set(4.5,0,-1.7);host.rotation.y=-.4;scene.add(host);
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.06,18),mat(0xc29c62));plate.position.set(2.3,.9,-1.5);scene.add(plate);
    for(const x of [2.05,2.5]){const bread=new THREE.Mesh(new THREE.SphereGeometry(.23,12,8),mat(0xe1b56e));bread.scale.y=.55;bread.position.set(x,1.04,-1.5);scene.add(bread);}
    const jar=new THREE.Mesh(new THREE.SphereGeometry(.35,12,10),texMat(0xa7643d,'clay'));jar.scale.y=1.3;jar.position.set(5,.5,1.2);scene.add(jar);
    box(-2.7,1.2,-2.6,1.2,.45,.9,0x956338,'wood',true);
    const ledger=new THREE.Mesh(new THREE.PlaneGeometry(1,.7),mat(0xf6e4b5));ledger.rotation.x=-Math.PI/2;ledger.position.set(-2.7,1.67,-2.6);scene.add(ledger);
    for(let k=0;k<4;k++)box(-2.7,1.678,-2.85+k*.15,.7,.012,.025,0x73563b,null);
    const matDoor=new THREE.Mesh(new THREE.RingGeometry(.9,1.2,28),new THREE.MeshBasicMaterial({color:0x69bbb1,side:THREE.DoubleSide}));matDoor.rotation.x=-Math.PI/2;matDoor.position.set(0,.02,3.6);scene.add(matDoor);
    const exitSign=worldSign(['Return outside'],3.3);if(exitSign){exitSign.position.set(0,.5,4.8);scene.add(exitSign);h.labelTextures.push(exitSign.material.map);}
    const clueSign=worldSign(['Household ledger'],2.8);if(clueSign){clueSign.position.set(-2.7,2.4,-4.1);scene.add(clueSign);h.labelTextures.push(clueSign.material.map);}
    h.tapRing=new THREE.Mesh(new THREE.RingGeometry(.35,.5,24),new THREE.MeshBasicMaterial({color:0xfde047,side:THREE.DoubleSide}));h.tapRing.rotation.x=-Math.PI/2;h.tapRing.visible=false;scene.add(h.tapRing);
    clearHomeTap();syncHomeAvatars();
    UI.help.textContent='Move • Jump • Use / ACT at the table or ledger • Controller B returns outside • Start / Esc pauses';UI.help.classList.remove('gone');UI.hud.style.pointerEvents='auto';UI.timer.classList.add('hidden');
    if(!UI.hud.homeExitBound){UI.hud.homeExitBound=true;UI.hud.addEventListener('click',e=>{if(e.target.closest('[data-home-exit]'))exitHomeInterior();});}
    toast('An imagined family home. Explore together; your supplies wait safely outside.',3300);renderHomeUI();
  }
  function clearHomeTap(){tap.target=null;tap.act=false;tap.actT=0;tap.jumpT=0;if(tap.ring)tap.ring.visible=false;if(vpads.vpt){vpads.vpt.ax=[0,0];vpads.vpt.b[0]=false;vpads.vpt.b[2]=false;}}
  function syncHomeAvatars(){
    const h=S.homeInterior;
    for(const p of api.players())if(!h.avatars.some(a=>a.player===p)){
      const m=buildPlayerMesh(p.role);for(const k of ARMOR_TYPES)m.group.userData.armor[k].visible=!!p.armor[k];h.scene.add(m.group);h.scene.add(m.shadow);
      const a={player:p,mesh:m.group,shadow:m.shadow,pos:new THREE.Vector3((h.avatars.length-(api.players().length-1)/2)*2.5,0,2.8),vel:new THREE.Vector3(),onGround:true,facing:Math.PI,walkT:0};h.avatars.push(a);
    }
  }
  function homeUse(a,t){
    const h=S.homeInterior;if(!h||h.age<.25||!t)return;
    if(t.id==='exit'){exitHomeInterior();return;}
    if(t.id==='bread'&&!h.door.visited){h.door.visited=true;for(const p of api.players())p.health=2;Audio.sfx('door');toast('The family shares bread; everyone’s hearts are full (Acts 2:46).',3200);}
    if(t.id==='clue'){
      const clue=typeof h.door.interior.clue==='function'?h.door.interior.clue(api):h.door.interior.clue;
      if(clue){h.pendingHint=clue;if(!h.door.roomState.clueRead){h.door.roomState.clueRead=true;a.player.servant+=2;}Audio.sfx('page');toast(clue.text,5500);if(Speech.on())Speech.say(clue.text);}
    }
    renderHomeUI();
  }
  function homeResolveSides(a){
    for(const b of S.homeInterior.solids){
      if(a.pos.y>=b.top-T.stepUp||a.pos.y+1.8<=b.bottom)continue;
      const x=Math.max(b.minX,Math.min(b.maxX,a.pos.x)),z=Math.max(b.minZ,Math.min(b.maxZ,a.pos.z)),dx=a.pos.x-x,dz=a.pos.z-z,d=Math.hypot(dx,dz);
      if(d>=.45)continue;
      if(d>.0001){a.pos.x=x+dx/d*.45;a.pos.z=z+dz/d*.45;}
      else{const sides=[[a.pos.x-b.minX,0,b.minX-.45],[b.maxX-a.pos.x,0,b.maxX+.45],[a.pos.z-b.minZ,1,b.minZ-.45],[b.maxZ-a.pos.z,1,b.maxZ+.45]].sort((x,y)=>x[0]-y[0]);if(sides[0][1])a.pos.z=sides[0][2];else a.pos.x=sides[0][2];}
    }
    a.pos.x=Math.max(-5.3,Math.min(5.3,a.pos.x));a.pos.z=Math.max(-4.3,Math.min(4.2,a.pos.z));
  }
  function updateHomeInterior(dt,inputs,anyPause){
    const h=S.homeInterior;
    if(S.phase==='paused'){if(anyPause)togglePause();else inputs.forEach(i=>i&&pauseInput(i));renderHomeUI();return;}
    if(anyPause){togglePause();renderHomeUI();return;}
    checkJoins();syncHomeAvatars();h.age+=dt;S.runTime=(S.runTime||0)+dt;
    for(const a of h.avatars){
      const p=a.player,i=inputs[p.slot]||{};
      if(i.reread)toast(h.pendingHint?h.pendingHint.text:'Explore the low loft to read the household ledger. Share bread at the table; return outside at the doorway.',4500);
      if(i.share&&Speech.on())Speech.say(h.pendingHint?h.pendingHint.text:'Explore the loft, share bread, and return outside together.');
      if(h.age>.25&&i.carry){exitHomeInterior();return;}
      if(i.act&&h.age>.25){homeUse(a,homeActionFor(a));if(!S.homeInterior)return;}
      const speed=p.role.speed*(i.run?T.runBoost:1)*.8,k=Math.min(1,dt*12),mx=i.mx||0,mz=i.mz||0;
      a.vel.x+= (mx*speed-a.vel.x)*k;a.vel.z+=(mz*speed-a.vel.z)*k;
      if(i.jumpP&&a.onGround){a.vel.y=p.role.jump;a.onGround=false;Audio.sfx('jump');}
      if(!i.jump&&a.vel.y>3)a.vel.y-=T.gravity*dt;
      const oldY=a.pos.y;a.pos.x+=a.vel.x*dt;a.pos.z+=a.vel.z*dt;homeResolveSides(a);
      a.vel.y-=T.gravity*dt;a.pos.y+=a.vel.y*dt;const floor=homeGroundAt(a.pos.x,a.pos.z,oldY);
      if(a.pos.y<=floor&&a.vel.y<=0){a.pos.y=floor;a.vel.y=0;a.onGround=true;}else if(a.pos.y>floor+.05)a.onGround=false;
      if(Math.hypot(mx,mz)>.1)a.facing=Math.atan2(mx,mz);
      a.mesh.position.copy(a.pos);a.mesh.rotation.y=a.facing;a.shadow.position.set(a.pos.x,floor+.025,a.pos.z);
      const body=a.mesh.userData.body,walk=Math.hypot(a.vel.x,a.vel.z);a.walkT+=dt*walk;
      for(const [name,phase]of [['armL',0],['armR',Math.PI]]){const arm=body.getObjectByName(name);if(arm)arm.rotation.x=a.onGround?Math.sin(a.walkT*1.5+phase)*Math.min(.6,walk*.09):-.4;}
    }
    // Gentle separation on the small landings; no teammate can push another through a wall.
    for(let n=0;n<h.avatars.length;n++)for(let m=n+1;m<h.avatars.length;m++){
      const a=h.avatars[n],b=h.avatars[m],dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz);
      if(d>.001&&d<.85&&Math.abs(a.pos.y-b.pos.y)<1){const push=(.85-d)/2/d;a.pos.x-=dx*push;a.pos.z-=dz*push;b.pos.x+=dx*push;b.pos.z+=dz*push;homeResolveSides(a);homeResolveSides(b);}
    }
    if(tap.target){h.tapRing.visible=true;h.tapRing.position.set(tap.target.x,tap.target.y+.025,tap.target.z);}else h.tapRing.visible=false;
    renderHomeUI();
  }
  function renderHomeUI(){
    const h=S.homeInterior;if(!h)return;h.camera.aspect=window.innerWidth/window.innerHeight;const fit=Math.max(1,1.35/h.camera.aspect);h.camera.position.set(0,.2+12.3*fit,-.4+15.9*fit);h.camera.lookAt(0,.2,-.4);h.camera.updateProjectionMatrix();h.camera.updateMatrixWorld(true);
    const hud='<div class="t">'+esc(h.door.interior.title||'A family home')+'</div><div class="row">'+(h.door.visited?'✓':'○')+' Share bread at the table</div><div class="row">'+(h.door.roomState.clueRead?'✓':'○')+' Explore the loft ledger</div><div class="small">'+api.players().map(p=>'P'+(p.slot+1)+' '+'♥'.repeat(Math.max(0,p.health))).join(' · ')+'</div><div class="small">Optional visit · supplies kept outside</div><button class="sq-btn" data-home-exit>Return outside</button>';
    if(h.hudHTML!==hud){h.hudHTML=hud;UI.hud.innerHTML=hud;}
    const records=[],placed=[],solo=api.players().length===1;
    for(const a of h.avatars){
      const p=a.player,t=homeActionFor(a),key=p.device&&p.device.startsWith('gp')?'Y':ACT_KEY[p.device]||'ACT';
      const v=new THREE.Vector3(a.pos.x,a.pos.y+2.7,a.pos.z).project(h.camera);p.label.style.display='';
      p.labelAct.textContent=t?key+': '+t.label:'';p.labelAct.style.display=t&&solo?'':'none';p.labelAct.style.opacity='1';
      const bounds=p.label.getBoundingClientRect(),side=Math.min(bounds.width||140,window.innerWidth-12)/2+6;
      const x=Math.max(side,Math.min(window.innerWidth-side,(v.x*.5+.5)*window.innerWidth)),height=bounds.height||(solo?42:22);let y=(-v.y*.5+.5)*window.innerHeight;
      for(let k=0;k<placed.length;k++){const[px,py,ph]=placed[k];if(Math.abs(px-x)<140&&y>py-ph-6&&y-height<py+6){y=py-ph-6;k=-1;}}placed.push([x,y,height]);p.label.style.left=x+'px';p.label.style.top=y+'px';
      if(t&&S.phase==='play')records.push({p,key,target:'home:'+t.id,label:t.label,ok:true});
    }
    renderActionGuide(records);
  }
  function exitHomeInterior(){
    const h=S.homeInterior;if(!h)return;if(S.phase==='paused')togglePause();S.homeInterior=null;clearHomeTap();
    if(h.pendingHint&&h.pendingHint.at){S.hint={at:h.pendingHint.at.slice(),t:15,route:true,getRoute:typeof h.door.interior.clue==='function'?h.door.interior.clue:null};S.objectiveTimer=0;toast(h.pendingHint.text,4500);}
    UI.help.innerHTML=h.help;UI.help.className=h.helpClass;UI.hud.style.pointerEvents=h.hudPointer;UI.timer.className=h.timerClass;api.players().forEach(p=>p.promptStr=null);
    renderHUD();renderTimer();updateCamera(0,true);updateLabels();updateActionGuide();
    const geometries=new Set(),materials=new Set();h.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});Object.values(roundCache).forEach(g=>h.sharedGeometries.add(g));[matCache,texMatCache,charCache].forEach(cache=>Object.values(cache).forEach(m=>h.sharedMaterials.add(m)));geometries.forEach(g=>{if(!h.sharedGeometries.has(g))g.dispose();});materials.forEach(m=>{if(!h.sharedMaterials.has(m))m.dispose();});h.labelTextures.forEach(t=>t&&t.dispose());
    Audio.sfx('door');
    const next=()=>{const queued=h.stories.shift();if(queued)showStory(queued.pages,()=>{if(queued.onDone)queued.onDone();next();},queued.again);};next();
  }
  function beginGesture(p,kind,at,duration=.7) {
    if(!Array.isArray(at)||at.length!==3||!at.every(Number.isFinite))return;
    const G=p.gesture;if(G&&G.t>0&&G.kind===kind&&Math.hypot(...at.map((v,i)=>v-G.at[i]))<.4){G.at=at.slice();G.t=duration;return;}
    p.gesture={kind,at:at.slice(),t:duration,duration,age:0};
  }
  function animateGesture(p,dt,spd) {
    const body=p.mesh.userData.body,tool=p.mesh.userData.roleTool,G=p.gesture;
    if(G){G.t=Math.max(0,G.t-dt);G.age+=dt;}
    const occupied=!!(p.holding||p.carrying||p.riding||p.seat||p.carriedBy||p.ropeSwing);
    const active=G&&G.t>0&&p.onGround&&spd<1.5&&!p.bubble&&p.stun<=0&&!S.level.solemn&&!(p.cheerT>0);
    const posing=active&&!occupied;
    p.visualGesture=posing?G.kind:null;
    const fade=active?Math.min(1,G.t/.15,G.age/.1):0;
    let yaw=0;
    if(posing&&Math.hypot(G.at[0]-p.pos.x,G.at[2]-p.pos.z)>.15){yaw=Math.atan2(G.at[0]-p.pos.x,G.at[2]-p.pos.z)-p.facing;while(yaw>Math.PI)yaw-=Math.PI*2;while(yaw< -Math.PI)yaw+=Math.PI*2;yaw=Math.max(-1.15,Math.min(1.15,yaw))*fade;}
    body.rotation.y+=(yaw-body.rotation.y)*Math.min(1,dt*12);
    if(tool)tool.visible=!occupied&&!(active&&G.kind!=='read');
    if(!posing)return;
    p.mesh.updateWorldMatrix(true,true);
    const target=body.worldToLocal(new THREE.Vector3(...G.at));
    for(const [name,sd]of [['armL',-1],['armR',1]]){
      const arm=body.getObjectByName(name);if(!arm)continue;
      if(G.kind==='talk'){
        if(sd===1){arm.rotation.set(-.65*fade,0,-.55*fade);}
      }else{
        const aim=G.kind==='read'?new THREE.Vector3(sd*.12,1.02,.55):target.clone().add(new THREE.Vector3(sd*.12,0,0));
        aim.sub(arm.position);if(aim.lengthSq()<.01)aim.set(0,-.4,.4);
        const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),aim.normalize());
        arm.quaternion.slerp(q,fade);
      }
    }
  }
  function actionInfo(p) { const r=resolveAction(p);return r.label ? r : null; }
  function doAction(p,kind = 'context') {
    const a=resolveAction(p,kind);if(a.status)return;
    if(a.label&&a.ok){p.workT=.7;const target=a.guideTarget||{};beginGesture(p,a.talkPerson?'talk':target.pose||(/\bread\b/i.test(a.label)?'read':'reach'),target.poseAt||a.at,.85);}
    a.run();
  }

  // Who is "ahead"? The player closest to where the golden arrow points (the next goal). No arrow: Player 1.
  function aheadPlayer(exclude) {
    const list = S.players.filter((q) => q.joined && !q.bubble && q !== exclude);
    if (!list.length) return null;
    let obj = null;
    try { obj = S.level.objective ? S.level.objective(api) : null; } catch (e) { obj = null; }
    if (!obj) return list.find((q) => q.slot === 0) || list[0];
    return list.reduce((m, q) => (Math.hypot(q.pos.x - obj[0], q.pos.z - obj[2]) < Math.hypot(m.pos.x - obj[0], m.pos.z - obj[2]) ? q : m), list[0]);
  }
  // A player who is behind can float up to whoever is ahead (C / . / L3). No penalty.
  function catchUp(p) {
    if (p.bubble || p.carriedBy) return;
    const lead = aheadPlayer(p);
    if (!lead) { toast('Catch up works when friends are playing.', 2000); return; }
    if (lead.pos.distanceTo(p.pos) < 8) { toast('P' + (p.slot + 1) + ' is already with P' + (lead.slot + 1) + '!', 1800); return; }
    enterBubble(p, false, '🫧 P' + (p.slot + 1) + ' floats to catch up with P' + (lead.slot + 1) + '!');
    if (p.bubble) p.bubble.to = lead;
  }
  function doShare(p, mayCheer = true) {
    const mate = S.players.find((q) => q !== p && q.joined && !q.bubble && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 2.6);
    const canGive = mate && ['sword', 'belt', 'breastplate', 'shield', 'helmet', 'sandals'].some((t) => p.armor[t] && !mate.armor[t]);
    if (!canGive) { if(mayCheer)cheer(p);else toast('Move near a teammate who needs one of your equipment pieces.',2000); return; }
    for (const t of ['sword', 'belt', 'breastplate', 'shield', 'helmet', 'sandals']) {
      if (p.armor[t] && !mate.armor[t]) {
        p.armor[t] = false; mate.armor[t] = true;
        syncArmor(p); syncArmor(mate);
        S.team.shares++;
        Audio.sfx('pickup');
        if (!p.sharedTypes[t]) { p.sharedTypes[t] = true; addServant(p, 10, 'for sharing the ' + ARMOR[t].name + '!'); }
        else toast(ARMOR[t].icon + ' P' + (p.slot + 1) + ' shared with P' + (mate.slot + 1), 1600);
        return;
      }
    }
    toast('Nothing to share (they already have your armor).', 1800);
  }

  /* -------------------------------------------------------------------
   * 11. WORLD UPDATE (followers, zones, pickups, leaves, fx)
   * ----------------------------------------------------------------- */
  function updateFollowers(dt) {
    const counts = {};
    let waiting = 0;
    S.followers.forEach((f) => {
      if (f.state === 'follow') f.wasFollowing = true;
      if (f.state === 'delivered' || f.state === 'parked') f.wasFollowing = false;
      const w = f.state === 'idle' && f.wasFollowing && f.mesh.visible;
      if (w) waiting++;
      if (w && !f.beacon) {        // a tall soft light over an animal left behind, easy to spot from far away
        f.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 9, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
        S.scene.add(f.beacon);
      }
      if (f.beacon) { f.beacon.visible = w; if (w) f.beacon.position.set(f.pos.x, f.pos.y + 5, f.pos.z); }
    });
    if (waiting !== S.waiting) { S.waiting = waiting; renderHUD(); }
    S.followers.forEach((f, i) => {
      if (f.rideInter) { f.rideInter.x = f.pos.x; f.rideInter.z = f.pos.z; f.rideInter.y = f.pos.y; }
      if (f.state === 'parked') return;
      if (f.state === 'delivered') {
        const t = typeof f.parkAt === 'function' ? f.parkAt(f) : f.parkAt;
        if (t) {
          f.pos.x += (t[0] - f.pos.x) * Math.min(1, dt * 2);
          f.pos.z += (t[2] - f.pos.z) * Math.min(1, dt * 2);
          f.pos.y = t[1];
          if (Math.hypot(t[0] - f.pos.x, t[2] - f.pos.z) < 0.2) f.state = 'parked';
        } else { f.mesh.visible = false; f.state = 'parked'; }
        f.mesh.position.copy(f.pos);
        return;
      }
      if (f.state === 'ridden') {
        const R = f.rider;
        if (!R || R.riding !== f) { f.state = 'idle'; f.rider = null; }
        else {
          f.pos.x = R.pos.x; f.pos.z = R.pos.z; f.mesh.rotation.y = R.facing;
          const dt2 = f.deliverTo;
          if (dt2 && Math.hypot(f.pos.x - dt2.x, f.pos.z - dt2.z) <= dt2.r) { dismount(R); f.state = 'delivered'; if (f.onDeliver) f.onDeliver(R, f); }
        }
      } else if (f.state === 'follow') {
        const L = f.leader;
        if (!L || !L.joined) { f.state = 'idle'; return; }
        const k = counts[L.slot] = (counts[L.slot] || 0) + 1;       // 1, 2, 3...
        // two by two: pairs in rows behind the leader
        const row = Math.floor((k - 1) / 2), side = k % 2 ? -0.7 : 0.7;
        const fx = Math.sin(L.facing), fz = Math.cos(L.facing);
        const tx = L.pos.x - fx * (1.8 + row * 1.4) + fz * side, tz = L.pos.z - fz * (1.8 + row * 1.4) - fx * side;
        const dx = tx - f.pos.x, dz = tz - f.pos.z;
        const dd = Math.hypot(dx, dz);
        const d = Math.hypot(L.pos.x - f.pos.x, L.pos.z - f.pos.z);
        if (!L.bubble && dd > 0.25) {
          const sp = Math.min(13, Math.min(dd / dt, 2 + dd * 4));
          f.pos.x += (dx / dd) * sp * dt; f.pos.z += (dz / dd) * sp * dt;
          if (dd > 0.6) f.mesh.rotation.y = Math.atan2(dx, dz);
        }
        if (d > 40) { f.pos.x = L.pos.x - 2; f.pos.z = L.pos.z + 2; } // never lose the parade
        const dt2 = f.deliverTo;
        if (dt2 && Math.hypot(f.pos.x - dt2.x, f.pos.z - dt2.z) <= dt2.r) {
          f.state = 'delivered';
          if (f.onDeliver) f.onDeliver(L, f);
        }
      } else {
        f.wanderT -= dt;
        if (f.wanderT <= 0) {
          f.wanderT = 2 + Math.random() * 3;
          const hx = f.home.x - f.pos.x, hz = f.home.z - f.pos.z;
          f.wanderA = Math.hypot(hx, hz) > 4 ? Math.atan2(hx, hz) : f.wanderA + (Math.random() - 0.5) * 2.5;
        }
        f.pos.x += Math.sin(f.wanderA) * 1.0 * dt;
        f.pos.z += Math.cos(f.wanderA) * 1.0 * dt;
        f.mesh.rotation.y = f.wanderA;
      }
      const gy = groundAt(f.pos.x, f.pos.z, f.pos.y + 1);
      const bird = f.mesh.userData && f.mesh.userData.bird;
      f.pos.y = bird ? gy + 1.6 + Math.sin(S.time * 4 + i) * 0.3 : f.state === 'ridden' && f.rider ? f.rider.pos.y : gy;
      const hop = f.state === 'follow' && !bird ? Math.abs(Math.sin(S.time * 10 + i)) * 0.15 : 0;
      const joy = f.joyT !== undefined && S.time - f.joyT < 0.45 ? Math.sin((S.time - f.joyT) / 0.45 * Math.PI) * 0.7 : 0;
      f.mesh.position.set(f.pos.x, f.pos.y + hop + joy, f.pos.z);
      if (!bird && !f.noSquash) { const sq = hop > 0 ? 1 + (hop - 0.075) * 0.5 : 1; f.mesh.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
      if (bird) f.mesh.children.forEach((c) => { if (c.name === 'wing') c.rotation.z = Math.sin(S.time * 14 + i) * 0.6 * Math.sign(c.position.x); });
      else {
        const mv = f.lastX === undefined ? 0 : Math.hypot(f.pos.x - f.lastX, f.pos.z - f.lastZ) / Math.max(dt, 1e-3);
        f.lastX = f.pos.x; f.lastZ = f.pos.z;
        f.walkAmt = (f.walkAmt || 0) + ((mv > 0.4 ? 1 : 0) - (f.walkAmt || 0)) * Math.min(1, dt * 6);
        f.walkPh = (f.walkPh || 0) + dt * Math.min(14, 3 + mv * 2.2);
        const body = f.mesh.userData.animal ? f.mesh : f.mesh.children.find((c) => c.userData && c.userData.animal);   // (a level may wrap the animal, e.g. a donkey with a rider)
        if (body) {
          f.idleT = mv > 0.4 ? 0 : (f.idleT || 0) + dt;
          if (f.walkAmt > 0.01 || f.legsMoved) {
            f.legsMoved = f.walkAmt > 0.01;
            body.children.forEach((c) => { if (c.name === 'leg') c.rotation.x = Math.sin(f.walkPh + c.userData.phase) * 0.55 * f.walkAmt; });
          }
          if (!body.userData.parts) body.userData.parts = { head: body.children.find((c) => c.name === 'head'), tail: body.children.find((c) => c.name === 'tail') };
          const { head, tail } = body.userData.parts, ph = (f.pos.x * 3.1 + f.pos.z) % 6.28;
          if (head) {
            const graze = body === f.mesh && f.walkAmt < 0.2 && (f.idleT + ph) % 13 > 8.5;            // head down to graze now and then (not with a rider)
            const wantX = graze ? 0.55 : Math.sin(f.walkPh * 2) * 0.06 * f.walkAmt;
            head.rotation.x += (wantX - head.rotation.x) * Math.min(1, dt * 4);
            head.rotation.y += ((graze || f.walkAmt > 0.2 ? 0 : Math.sin(S.time * 0.7 + ph) * 0.3) - head.rotation.y) * Math.min(1, dt * 3);   // looks about
          }
          if (tail) tail.rotation.y = Math.sin(S.time * (f.walkAmt > 0.2 ? 9 : 3) + ph) * 0.35;
        }
      }
    });
  }

  function insideZone(p,z) {
    return Math.hypot(p.pos.x-z.x,p.pos.z-z.z)<=z.r && Math.abs(p.pos.y-z.y)<(z.vRange===undefined?2.5:z.vRange) && (!z.action || (p.onGround&&!p.carriedBy));
  }
  function updateZones(dt) {
    for (const z of S.zones) {
      if (z.done || !z.visible) continue;
      let on=api.activePlayers().filter(p=>insideZone(p,z));
      if(z.action){
        for(const slot in z.workers)if(!on.some(p=>p.slot===+slot))delete z.workers[slot];
        on=on.filter(p=>z.workers[p.slot]);
      }
      if (on.length) {
        const rate = (1 / z.time) * (1 + 0.5 * (on.length - 1));
        z.progress = Math.min(1, z.progress + rate * dt);
        on.forEach((p) => { if (z.time > 1 && z.time < 9999 && !S.level.solemn) {p.workT = 0.2;beginGesture(p,z.pose||'work',z.poseAt||[z.x,z.y+1,z.z],.35);} z.helpTime[p.slot] = (z.helpTime[p.slot] || 0) + dt; });
        if (Math.random() < dt * 6) spawnPuff(z.x + (Math.random() - 0.5) * z.r, z.y + 0.3, z.z + (Math.random() - 0.5) * z.r, z.color || 0xf59e0b, 1);
      }
      z.fill.scale.setScalar(Math.max(0.001, z.progress));
      if (z.progress >= 1) {
        z.done = true;
        z.ringMat.color.setHex(0x22c55e);
        Audio.sfx('build');
        const helpers = S.players.filter((p) => z.helpTime[p.slot] > 0);
        if (z.onDone) z.onDone(helpers, z);
        if(z.time<999&&S.phase!=='gameover')for(const p of on)if(setRunCheckpoint(p.pos,'Progress checkpoint'))break;
      }
    }
  }


  // Imagined supply puzzles: Ephesians 6 teaches spiritual truth; a puzzle never earns salvation.
  // Group nearby rewards so four pieces on a ship do not become four overlapping puzzles.
  const SEALS = ['Circle', 'Triangle', 'Square'];
  const SEAL_GLYPHS = ['●', '▲', '■'];
  function worldSign(lines, width) {
    if (/jsdom/.test(navigator.userAgent || '')) return null;
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#342c24'; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#e5c78f'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 182);
    ctx.fillStyle = '#fff2d5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => { ctx.font = (i ? '34' : 'bold 52') + 'px sans-serif'; ctx.fillText(line, 256, lines.length === 1 ? 96 : 58 + i * 75, 470); });
    const tex = new THREE.CanvasTexture(c);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sign.scale.set(width, width * 192 / 512, 1); return sign;
  }
  function sealBadge(index) {
    if (/jsdom/.test(navigator.userAgent || '')) return null;
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');if(!ctx)return null;
    ctx.fillStyle='#f6e3b9';ctx.beginPath();ctx.arc(64,64,60,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#806339';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#483c2d';
    if(index===0){ctx.beginPath();ctx.arc(64,64,29,0,Math.PI*2);ctx.fill();}
    else if(index===1){ctx.beginPath();ctx.moveTo(64,27);ctx.lineTo(99,93);ctx.lineTo(29,93);ctx.closePath();ctx.fill();}
    else ctx.fillRect(35,35,58,58);
    const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true}));badge.scale.set(1.05,1.05,1);return badge;
  }
  function supplySurface(x, z, y) {
    const B = S.level.bounds;
    if (x < B.minX + .7 || x > B.maxX - .7 || z < B.minZ + .7 || z > B.maxZ - .7) return false;
    const h = groundAt(x, z, y + .6);
    if (Math.abs(h - y) > .55 || S.waterY > h + .2 || (!groundInfo(x,z,y+.6).pl && slopeAt(x, z) > T.maxSlope)) return false;
    if (S.hazards.some((q) => q.on !== false && (q.maxY === undefined || h <= q.maxY) && inShape(q, x, z))) return false;
    if (S.circles.some((o) => o.on !== false && o.top > y && Math.hypot(o.x - x, o.z - z) < o.r + .65)) return false;
    // Leave standing room, and reject spots hidden inside a wall or underneath a platform.
    if (S.platforms.some((pl) => pl.on && x > pl.minX - .5 && x < pl.maxX + .5 && z > pl.minZ - .5 && z < pl.maxZ + .5 && pl.top > h + .2 && pl.bottom < h + 2.5)) return false;
    return true;
  }
  function supplyRoute(x, z, y, tx, tz) {
    const n = Math.ceil(Math.hypot(tx-x, tz-z) / .4);
    for (let i=0; i<=n; i++) if (!supplySurface(x+(tx-x)*i/Math.max(1,n), z+(tz-z)*i/Math.max(1,n), y)) return false;
    return true;
  }
  function openSupply(q) {
    q.open = true; q.lid.rotation.x = -1.1;
    q.stations.forEach((st) => { st.inter.remove(); st.light.material.color.setHex(0x86efac); });
    q.inspect.remove(); if(q.dial) q.dial.remove();
    Audio.sfx('build'); spawnPuff(q.x, q.y+1, q.z, 0xfde68a, 10);
    toast('Supply cache open! A separate copy of each reward is reserved for every player. Return here to claim yours.', 5000);
  }
  function inspectSupply(q) {
    q.inspected = true;
    const order = q.order.map((i) => SEAL_GLYPHS[i] + ' ' + SEALS[i]).join(' → ');
    toast(q.kind === 'balance' ? 'Balance cache: ACTION latches a plate only while you stand on it. Together: hold both plates. Alone: latch each in turn.' :
      (q.kind === 'relay' ? 'Lantern relay: ' : 'Trail lock: ') + order + '. Use ACTION at each matching stone.' + (q.kind === 'relay' ? ' After the first seal, keep the chain lit (20 seconds). Inspect again anytime.' : ' A wrong seal resets the lock; try again.'), 8500);
  }
  function useSupplySeal(q, st, p) {
    if (!q.inspected) { toast('Read the clue on the supply chest first.', 2200); return; }
    if (q.kind === 'balance') {
      if (Math.hypot(p.pos.x-st.x,p.pos.z-st.z) > .75 || Math.abs(p.pos.y-st.y) > .65) { toast('Stand on the plate to latch it.', 1800); return; }
      if (S.players.filter(present).length <= 1) st.latched = true;
      else st.armed = true;
      st.light.material.color.setHex(0x86efac); Audio.sfx('winch');
      return;
    }
    if (st.index !== q.order[q.progress]) {
      q.progress = 0; q.left = 0; Audio.sfx('error'); toast('The seal order reset. Check the clue; you can try again.', 2200);
      q.stations.forEach((a) => a.light.material.color.setHex(0xc7a06a)); return;
    }
    q.progress++; q.left = q.kind === 'relay' ? 20 : 0;
    st.light.material.color.setHex(0x86efac); Audio.sfx('block');
    if (q.progress === q.order.length) openSupply(q);
  }
  function buildSupplyQuests() {
    S.supplyQuests = [];
    for (const pk of S.pickups) {
      let q = S.supplyQuests.find((a) => Math.abs(a.y-pk.y)<.5 && Math.hypot(a.x-pk.x,a.z-pk.z)<5 && supplyRoute(a.x,a.z,a.y,pk.x,pk.z));
      if (!q) {
        q = { x: pk.x, y: pk.y, z: pk.z, rewards: [], stations: [], open: false, inspected: false, progress: 0, left: 0 };
        S.supplyQuests.push(q);
      }
      q.rewards.push(pk); pk.quest = q;
    }
    S.supplyQuests.forEach((q, qi) => {
      const seed = (S.level.id || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0) + qi;
      q.origin = { x:q.x, y:q.y, z:q.z };
      // Put supplies on a short side detour rather than directly under the spawn or golden arrow.
      // Preserve the old reward's safe approach; no required armor is hidden behind its own ability.
      const sp=S.level.spawn||[0,0], fb=S.level.finale&&S.level.finale.beacon||[sp[0],0,sp[1]-30];
      const forward=Math.atan2(fb[2]-sp[1],fb[0]-sp[0]), side=forward+(seed%2?1:-1)*Math.PI/2;
      let detour=null;
      for(const radius of [6,4.5])for(const turn of [0,.45,-.45,Math.PI]){
        if(detour)break;
        const dx=Math.cos(side+turn)*radius,dz=Math.sin(side+turn)*radius,x=q.x+dx,z=q.z+dz;
        if(!supplyRoute(q.x,q.z,q.y,x,z))continue;
        if(S.interactables.some(it=>it.alive&&Math.hypot(it.x-x,it.z-z)<2&&Math.abs(it.y-q.y)<2))continue;
        if(S.supplyQuests.some(other=>other!==q&&Math.hypot(other.x-x,other.z-z)<4&&Math.abs(other.y-q.y)<1))continue;
        if(!q.rewards.every(pk=>supplyRoute(pk.x,pk.z,pk.y,pk.x+dx,pk.z+dz)))continue;
        detour={dx,dz,x,z};
      }
      if(detour){
        q.x=detour.x;q.z=detour.z;q.y=groundAt(q.x,q.z,q.y+.6);
        q.rewards.forEach(pk=>{pk.x+=detour.dx;pk.z+=detour.dz;pk.y=groundAt(pk.x,pk.z,pk.y+.6);pk.mesh.position.set(pk.x,pk.y+1.3,pk.z);pk.ring.position.set(pk.x,pk.y+.05,pk.z);});
      }
      q.kind = ['trail', 'balance', 'relay'][seed % 3];
      q.order = [[0,2,1],[2,0,1],[1,2,0],[2,1,0],[1,0,2],[0,1,2]][seed%6];
      const g = q.mesh = new THREE.Group(); g.position.set(q.x,q.y,q.z); S.scene.add(g);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3,.7,.9), texMat(0x997044,'wood')); base.position.y=.35; g.add(base);
      q.lid = new THREE.Group(); q.lid.position.set(0,.7,-.45); g.add(q.lid);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.4,.17,1),texMat(0xe4c895,'wood'));top.position.z=.45;q.lid.add(top);
      const sign = worldSign(['Supply cache', 'Read clue · ACTION'], 4.1); if(sign){sign.position.set(0,1.9,0);g.add(sign);}
      q.inspect = api.interact({x:q.x,z:q.z,y:q.y,r:1.25,vRange:.8,priority:0,label:'Read supply clue',use(){inspectSupply(q);}});
      // Search only along a safe walk from this cache; no new platforms, holiness-boundary rewards, or pit crossings.
      const spots=[];
      for (const radius of [3.2,4.2,2.4]) for(let j=0;j<16&&spots.length<3;j++) {
        const angle=(j+seed%8)*Math.PI/8, x=q.x+Math.cos(angle)*radius, z=q.z+Math.sin(angle)*radius;
        if (!supplyRoute(q.x,q.z,q.y,x,z)) continue;
        if (S.interactables.some((it)=>it!==q.inspect&&it.alive&&Math.hypot(it.x-x,it.z-z)<1.5&&Math.abs(it.y-q.y)<2)) continue;
        if (S.supplyQuests.some((other)=>other!==q&&Math.hypot(other.x-x,other.z-z)<1.6&&Math.abs(other.y-q.y)<1)) continue;
        if(spots.some((a)=>Math.hypot(a.x-x,a.z-z)<2.1))continue;
        spots.push({x,z,y:groundAt(x,z,q.y+.6)}); if(spots.length===3)break;
      }
      // Narrow ledges use an inset dial: the same clue and seal order, without placing unreachable switches.
      q.compact = spots.length<3;
      if(q.compact){q.kind='trail';spots.length=0;for(let i=0;i<3;i++)spots.push({x:q.x,z:q.z,y:q.y});}
      spots.slice(0,q.kind==='balance'?2:3).forEach((pos,i)=>{
        const st = Object.assign(pos,{index:i,latched:false,armed:false});q.stations.push(st);
        const seal=new THREE.Group();seal.position.set(st.x,st.y+.04,st.z);S.scene.add(seal);st.mesh=seal;
        st.light=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.1,i===1?3:i===2?4:24),mat(0xc7a06a).clone());seal.add(st.light);
        if(q.compact) {seal.position.set(q.x+(i-1)*.42,q.y+1,q.z);seal.scale.setScalar(.3);}
        else {const badge=sealBadge(i);if(badge){badge.position.y=1;seal.add(badge);}}
        st.inter=api.interact({x:st.x,z:st.z,y:st.y,r:q.compact?0:1.15,vRange:.8,priority:0,label:()=>q.kind==='balance'?'Latch '+SEALS[i]+' plate':'Press '+SEALS[i]+' seal',use:p=>useSupplySeal(q,st,p)});
      });
      if(q.compact) {
        let dial=0;
        q.inspect.label=()=>q.inspected?'Press dial: '+SEALS[dial]:'Read supply clue';
        q.inspect.use=p=>{if(!q.inspected){inspectSupply(q);return;}useSupplySeal(q,q.stations[dial],p);};
        // Jumping is still jumping; a separate nearby ACTION lets any device turn the dial.
        q.dial=api.interact({x:q.x+.95,z:q.z,y:q.y,r:.6,vRange:.8,priority:1,label:()=> 'Turn dial → '+SEALS[(dial+1)%3],use(){dial=(dial+1)%3;toast('Dial: '+SEAL_GLYPHS[dial]+' '+SEALS[dial],1200);}});
        q.getDial=()=>dial;
      }
    });
  }
  function updateSupplies(dt, act) {
    for (const q of S.supplyQuests || []) {
      if (!q.open && q.inspected && q.kind==='relay' && q.progress) {
        q.left-=dt;
        if(q.left<=0){q.progress=0;q.left=0;q.stations.forEach(st=>st.light.material.color.setHex(0xc7a06a));toast('The lantern relay went out. Read the clue and try again.',2400);}
      }
      if(!q.open && q.inspected && q.kind==='balance'){
        const used=new Set();
        const held=q.stations.slice(0,2).every(st=>{
          if(st.latched)return true;
          const p=act.find(p=>!used.has(p.slot)&&Math.hypot(p.pos.x-st.x,p.pos.z-st.z)<.75&&Math.abs(p.pos.y-st.y)<.65);
          if(!p||!st.armed)return false;used.add(p.slot);return true;
        });
        if(held)openSupply(q);
      }
      for(const pk of q.rewards){
        const joined=api.players();
        pk.got=joined.length>0&&joined.every(p=>pk.claimed[p.slot]===p.lifeEpoch);
        pk.mesh.visible=pk.ring.visible=q.open&&!pk.got;
        if(!q.open)continue;
        pk.mesh.rotation.y+=dt*2;pk.mesh.position.y=pk.y+1.3+Math.sin(S.time*3+pk.x)*.2;
        // Per-slot, per-life entitlements survive leaving/rejoining, sharing and a consumed helmet.
        // A genuine death renews stock; no fast player can exhaust another slot’s share.
        const p=act.find(p=>pk.claimed[p.slot]!==p.lifeEpoch&&!p.armor[pk.type]&&Math.hypot(p.pos.x-pk.x,p.pos.z-pk.z)<1.6&&Math.abs(p.pos.y-pk.y)<.85);
        if(!p)continue;
        pk.claimed[p.slot]=p.lifeEpoch;p.armor[pk.type]=true;S.earnedArmor[pk.type]=true;syncArmor(p);Audio.sfx('fanfare');
        if(armorSeen(pk.type))toast(pk.def.icon+' P'+(p.slot+1)+' claimed '+pk.def.name+'. Your teammates have their own copies.',2600);
        else verse(pk.def.name+' '+pk.def.icon+' · Game equipment for everyone. God’s salvation is His gift; it is not earned by solving this puzzle. '+pk.def.desc,pk.def.verse,pk.def.ref);
        return; // at most one verse card this frame; other players collect on subsequent frames
      }
    }
  }
  function supplyHUD() {
    const ps=api.activePlayers();
    const q=(S.supplyQuests||[]).find(q=>ps.some(p=>Math.hypot(p.pos.x-q.x,p.pos.z-q.z)<8&&Math.abs(p.pos.y-q.y)<2));
    if(!q)return '';
    let text;
    if(q.open) text=q.rewards.map(pk=>pk.def.icon+' '+api.players().filter(p=>pk.claimed[p.slot]===p.lifeEpoch).length+'/'+api.players().length+' claimed').join(' · ');
    else if(!q.inspected)text='Supply puzzle: read the clue on the chest';
    else if(q.kind==='balance')text='Hold Circle + Triangle plates together; solo: ACTION latches each.';
    else text=q.order.map(i=>SEAL_GLYPHS[i]+' '+SEALS[i]).join(' → ')+' · '+q.progress+'/'+q.order.length+(q.kind==='relay'&&q.progress?' · '+Math.ceil(q.left)+'s':'');
    return '<div class="small">'+esc(text)+'</div>';
  }

  // A scroll and lantern are an imagined meeting marker, not a sacred object the player activates.
  // Find a supported point inside the level's actual finale zone, including rooftop and ship endings.
  function buildFinishMarker() {
    const F=S.level.finale;if(!F||!F.inZone||!F.beacon)return;
    const b=F.beacon,candidates=[];
    for(let dx=-10;dx<=10;dx+=1)for(let dz=-10;dz<=10;dz+=1){
      const x=b[0]+dx,z=b[2]+dz,B=S.level.bounds;
      if(x<B.minX||x>B.maxX||z<B.minZ||z>B.maxZ)continue;
      const y=groundAt(x,z,b[1]+1);
      if(S.waterY>y+.3||!F.inZone({pos:new THREE.Vector3(x,y,z)}))continue;
      candidates.push({x,y,z,score:dx*dx+dz*dz+Math.pow(y-(b[1]-2),2)});
    }
    candidates.sort((a,b)=>a.score-b.score);
    const at=candidates[0];if(!at)throw new Error('No supported finish marker inside finale zone: '+S.level.id);
    const g=new THREE.Group();g.name='finish-scroll';g.position.set(at.x,at.y,at.z);S.scene.add(g);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.65,1.85,48),new THREE.MeshBasicMaterial({color:0xb6a78b,side:THREE.DoubleSide,transparent:true,opacity:.7}));ring.rotation.x=-Math.PI/2;ring.position.y=.05;g.add(ring);
    const lectern=new THREE.Mesh(new THREE.BoxGeometry(.85,.8,.6),texMat(0x846346,'wood'));lectern.position.set(0,.4,0);g.add(lectern);
    const paper=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,.65),mat(0xffe8b5));paper.position.y=.85;paper.rotation.x=.2;g.add(paper);
    [-.6,.6].forEach(x=>{const roll=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.8,10),texMat(0xa67e48,'wood'));roll.rotation.x=Math.PI/2;roll.position.set(x,.9,0);g.add(roll);});
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,2.1,8),mat(0x675242));pole.position.set(1.1,1.05,0);g.add(pole);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.35,.5,.35),mat(0xb4a184).clone());lamp.position.set(1.1,1.9,0);g.add(lamp);
    const ref=S.level.memoryVerse&&S.level.memoryVerse.ref||'';
    const label=worldSign([S.level.solemn?'Gather quietly':'Gather here',ref],4.6);if(label){label.position.set(0,2.9,0);label.visible=false;g.add(label);}
    S.finishMarker=Object.assign(at,{mesh:g,ring,lamp,label,ready:false});
  }
  function updateFinishMarker() {
    const m=S.finishMarker;if(!m)return;
    const ready=S.finaleStarted|| (S.level.isComplete?S.level.isComplete(api):allTasksDone());
    if(ready&&!m.ready){m.ready=true;if(m.label)m.label.visible=!m.captionHidden;m.ring.material.color.setHex(S.level.solemn?0xe4cc9e:0x86efac);m.lamp.material.color.setHex(0xffda83);m.lamp.material.emissive.setHex(0x916724);renderHUD();}
  }

  function updatePickups(dt) {
    const act = api.activePlayers();
    for (const it of S.gatherables) {                                 // things gathered on the way: run into them
      if (it.got || it.hidden) continue;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.position.y = it.y + 0.4 + Math.sin(S.time * 2.5 + it.x) * 0.1;
      const p = act.find((q) => Math.hypot(q.pos.x - it.x, q.pos.z - it.z) < it.r && Math.abs(q.pos.y - it.y) < 2);
      if (!p) continue;
      it.got = true; it.mesh.visible = false; if (it.shadow) it.shadow.visible = false;
      Audio.sfx('pickup'); spawnPuff(it.x, it.y + 0.6, it.z, 0xfde68a, 8);
      if (it.task) addTask(it.task, 1);
      if (it.onGet) it.onGet(p, it);
    }
    updateSupplies(dt, act);
    S.supplyHudT = (S.supplyHudT || 0) - dt;
    if (S.supplyHudT <= 0) { S.supplyHudT = .25; renderHUD(); }
    for (const lf of S.leaves) {
      if (lf.shadow) { lf.shadow.visible = !lf.got && !lf.hidden && lf.mesh.visible; if (lf.shadow.visible) placeBlob(lf.shadow, lf.x, lf.y, lf.z); }
      if (lf.got || lf.hidden) continue;
      lf.mesh.rotation.y += dt * 3;
      for (const p of act) {
        if (Math.hypot(p.pos.x - lf.x, p.pos.z - lf.z) < 1.1 && Math.abs(p.pos.y + 1 - lf.y) < 1.6) {
          lf.got = true; lf.mesh.visible = false; S.leafCount++;
          S.chain = S.time - (S.chainAt || -9) < 1.6 ? (S.chain || 0) + 1 : 0; S.chainAt = S.time;
          Audio.chime(S.chain);
          p.happyT = 0.5;
          if (S.chain && S.chain % 5 === 4) spawnPuff(lf.x, lf.y, lf.z, 0xfde047, 10);   // a sparkle every fifth in a row renderHUD(); break;
        }
      }
    }
    for (const f of S.fragments) {
      if (f.got) continue;
      f.mesh.rotation.y += dt * 1.5;
      f.mesh.position.y = f.baseY + Math.sin(S.time * 2.5) * 0.2;
      if (!f.shadow) f.shadow = blobShadow(0.5);
      placeBlob(f.shadow, f.x, f.baseY, f.z); f.shadow.scale.multiplyScalar(1.6);
      if (f.net) continue;
      for (const p of act) {
        if (Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 1.4 && Math.abs(p.pos.y + 1 - f.y) < 1.8) { collectFragment(f, p); break; }
      }
    }
  }

  // ---- crumbling platforms, springs, sweepers, golden scroll ----
  function makeCritter(o) {
    const c = Object.assign({ kind: 'bear', mode: 'charge', r: 8, sight: 7, speed: 9, warn: 0.9, tired: 1.8, msg: null }, o);
    c.mesh = o.mesh || shineUp(animalMesh(c.kind));
    if (c.scale) c.mesh.scale.setScalar(c.scale);
    c.home = new THREE.Vector3(c.x, groundAt(c.x, c.z, 99), c.z); c.pos = c.home.clone();
    c.state = 'roam'; c.t = Math.random() * 2; c.dir = Math.random() * 6.28; c.cool = 0; c.hop = 0; c.base = c.mesh.scale.y;
    if (c.mode !== 'hop') {
      c.alert = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      c.alert.rotation.x = Math.PI; c.alert.visible = false; S.scene.add(c.alert);
    }
    c.mesh.position.copy(c.pos); S.scene.add(c.mesh);
    (S.critters = S.critters || []).push(c);
    return c;
  }
  function updateCritters(dt) {
    const ps = S.players.filter((p) => p.joined && !p.bubble && !p.carriedBy && !p.seat);
    for (const c of S.critters || []) {                                  // (hail below runs even in a level with no animals)
      if (c.off) { c.mesh.visible = false; if (c.alert) c.alert.visible = false; continue; }
      c.mesh.visible = true; c.t += dt; c.cool = Math.max(0, c.cool - dt);
      const dist = (p) => Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      const step = (vx, vz) => {                                            // move, but never up a wall or out of its land
        const nx = c.pos.x + vx * dt, nz = c.pos.z + vz * dt, ny = groundAt(nx, nz, c.pos.y + 0.6);
        if (ny > c.pos.y + 0.6 || Math.hypot(nx - c.home.x, nz - c.home.z) > c.r + 3) return false;
        c.pos.x = nx; c.pos.z = nz; c.pos.y = ny; return true;
      };
      let lift = 0;
      if (c.mode === 'hop') {                                                  // a frog: little hops, a bump if you are in the way
        if (c.hop <= 0 && c.t > 0.7 + (c.x * 7 + c.z * 3 & 7) * 0.12) {
          c.t = 0; c.hop = 0.45;
          const hx = c.home.x - c.pos.x, hz = c.home.z - c.pos.z;
          c.dir = Math.hypot(hx, hz) > c.r * 0.7 ? Math.atan2(hx, hz) + (Math.random() - 0.5) : c.dir + (Math.random() - 0.5) * 2.4;
        }
        if (c.hop > 0) { c.hop = Math.max(0, c.hop - dt); step(Math.sin(c.dir) * 3.2, Math.cos(c.dir) * 3.2); lift = Math.sin((1 - c.hop / 0.45) * Math.PI) * 0.55; }
        for (const p of ps) if (p.hitCd <= 0 && dist(p) < 0.75 && Math.abs(p.pos.y - c.pos.y) < 0.9 && !(p.frogCd > S.time)) {
          const d = dist(p) || 1; p.vel.x = (p.pos.x - c.pos.x) / d * 7; p.vel.z = (p.pos.z - c.pos.z) / d * 7; p.vel.y = 4.5; p.onGround = false; p.stun = 0.25; p.frogCd = S.time + 0.8;
          Audio.sfx('pop'); if (c.msg && !S.saidFrog) { S.saidFrog = true; toast(c.msg, 2400); }
        }
        c.mesh.rotation.y = c.dir;
      } else {
        const seen = ps.filter((p) => Math.abs(p.pos.y - c.pos.y) < 1.4 && dist(p) < c.sight && Math.hypot(p.pos.x - c.home.x, p.pos.z - c.home.z) < c.r + 2)
          .sort((a, b) => dist(a) - dist(b))[0];
        if (c.state === 'roam') {
          if (c.t > 2.2) { c.t = 0; const hx = c.home.x - c.pos.x, hz = c.home.z - c.pos.z; c.dir = Math.hypot(hx, hz) > c.r * 0.5 ? Math.atan2(hx, hz) : c.dir + (Math.random() - 0.5) * 2.5; }
          if (!step(Math.sin(c.dir) * 1.4, Math.cos(c.dir) * 1.4)) c.dir += Math.PI * 0.7;
          c.mesh.rotation.y = c.dir;
          if (seen && c.cool <= 0) { c.state = 'warn'; c.t = 0; c.target = seen; Audio.sfx('roar'); }
        } else if (c.state === 'warn') {                                       // stamp, roar, look: time to get out of the way
          const p = c.target; c.dir = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); c.mesh.rotation.y = c.dir;
          lift = Math.abs(Math.sin(c.t * 18)) * 0.12;
          if (c.t > c.warn) { c.state = 'charge'; c.t = 0; c.hit = {}; }
        } else if (c.state === 'charge') {
          const ok = step(Math.sin(c.dir) * c.speed, Math.cos(c.dir) * c.speed);
          for (const p of ps) if (!c.hit[p.slot] && dist(p) < 1.15 && Math.abs(p.pos.y - c.pos.y) < 1.3) { c.hit[p.slot] = true; hitPlayer(p, c.pos.x, c.pos.z, 'bump', c.msg || ('The ' + c.kind + ' charged! Watch for the red sign and jump aside.')); }
          if (!ok || c.t > 1.3) { c.state = 'tired'; c.t = 0; }
        } else if (c.state === 'tired') {                                      // puffing: the moment to slip past
          lift = Math.sin(c.t * 9) * 0.04;
          if (c.t > c.tired) { c.state = 'roam'; c.t = 0; c.cool = 0.6; }
        }
        if (c.alert) { c.alert.visible = c.state === 'warn'; c.alert.position.set(c.pos.x, c.pos.y + 2.6 + Math.sin(S.time * 10) * 0.1, c.pos.z); }
      }
      c.mesh.position.set(c.pos.x, c.pos.y + lift, c.pos.z);
      c.walkPh = (c.walkPh || 0) + dt * (c.state === 'charge' ? 16 : c.state === 'roam' ? 5 : 0);
      if (!c.legs) { c.legs = []; c.mesh.traverse((q) => { if (q.name === 'leg') c.legs.push(q); }); }
      c.legs.forEach((q, k) => { q.rotation.x = Math.sin(c.walkPh + (k % 2) * Math.PI) * (c.state === 'charge' ? 0.7 : c.state === 'roam' ? 0.35 : 0); });
    }
    for (const h of S.hails || []) {                                        // hail: a shadow, then the stone
      if (h.on) {
        h.t -= dt;
        if (h.t <= 0) {
          h.t = h.every;
          let x = h.minX + Math.random() * (h.maxX - h.minX), z = h.minZ + Math.random() * (h.maxZ - h.minZ);
          const near = ps.filter((p) => p.pos.x > h.minX && p.pos.x < h.maxX && p.pos.z > h.minZ && p.pos.z < h.maxZ);
          if (near.length && Math.random() < h.near) { const p = near[Math.floor(Math.random() * near.length)]; x = p.pos.x + p.vel.x * 0.6 + (Math.random() - 0.5) * 3; z = p.pos.z + p.vel.z * 0.6 + (Math.random() - 0.5) * 3; }
          const y = groundAt(x, z, 99);
          const sh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.15, depthWrite: false }));
          sh.rotation.x = -Math.PI / 2; sh.position.set(x, y + 0.04, z); S.scene.add(sh);
          const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: 0xe0f2fe, emissive: 0x334155 }));
          st.position.set(x, y + 14, z); S.scene.add(st);
          h.stones.push({ x, y, z, sh, st, t: 0 });
        }
      }
      h.stones = h.stones.filter((k) => {
        k.t += dt;
        const f = Math.min(1, k.t / 1.1);
        k.sh.scale.setScalar(0.4 + f * 0.6); k.sh.material.opacity = 0.15 + f * 0.4;
        k.st.position.y = k.y + 14 * (1 - f * f);
        if (k.t >= 1.1 && !k.done) {
          k.done = true; spawnPuff(k.x, k.y + 0.2, k.z, 0xe0f2fe, 6); Audio.sfx('block');
          for (const p of ps) if (Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 0.95 && Math.abs(p.pos.y - k.y) < 1.2) hitPlayer(p, k.x, k.z, 'falling', h.msg || 'Hail! Watch for the shadows, or find a roof.');
        }
        if (k.t > 1.5) { S.scene.remove(k.sh); S.scene.remove(k.st); k.sh.geometry.dispose(); k.st.geometry.dispose(); return false; }
        return true;
      });
    }
  }
  SQ._updateCritters = updateCritters;
  function updateDarkness(dt) {
    if (S.darkTarget === undefined) return;
    const k0 = S.dark || 0, k = k0 + (S.darkTarget - k0) * Math.min(1, dt * 1.5);
    if (Math.abs(k - k0) < 1e-4 && S.darkDone === S.darkTarget) return;
    S.dark = k; S.darkDone = Math.abs(k - S.darkTarget) < 0.002 ? S.darkTarget : null;
    if (!S.darkBase) {                                                    // every sky light (not the lamps) dims; the lamps stay warm
      const lights = S.scene.children.filter((o) => o.isHemisphereLight || o.isDirectionalLight || o.isAmbientLight).map((l) => [l, l.intensity]);
      S.darkBase = { lights, exp: S.renderer && S.renderer.toneMappingExposure, bg: S.scene.background.clone(), fog: S.scene.fog ? S.scene.fog.color.clone() : null, far: S.scene.fog ? S.scene.fog.far : 0 };
    }
    const b = S.darkBase, night = new THREE.Color(0x05060c);
    b.lights.forEach(([l, i0]) => { l.intensity = i0 * (1 - k * (l.isHemisphereLight || l.isAmbientLight ? 0.8 : 0.92)); });
    if (b.exp !== undefined && S.renderer) S.renderer.toneMappingExposure = b.exp * (1 - k * 0.25);
    S.scene.background.copy(b.bg).lerp(night, k);
    if (S.scene.fog) { S.scene.fog.color.copy(b.fog).lerp(night, k); S.scene.fog.far = b.far * (1 - k * 0.6); }
    S.players.forEach((p) => {                                           // a small lamp each (Exodus 10:23: Israel had light)
      let l = p.mesh.getObjectByName('darkLamp');
      if (!l) { l = new THREE.PointLight(0xffe2b0, 0, 11, 2); l.position.y = 1.9; l.name = 'darkLamp'; p.mesh.add(l); }
      l.intensity = k * 1.5;
    });
  }
  /* -------------------------------------------------------------------
   * THE WAY IN (LEVEL.approach): a platforming approach before the story route, a stretch before the story begins.
   * The level grows toward +z; players start at the far end and cross pits on stepping stones, crumbling
   * stones or moving rafts, and dodge an angry animal, to reach the level's own start. Each section is
   * about 10 m. The ground there follows the level's own edge, so it flows straight into the level.
   *   approach: ['stones', 'meadow:bear', 'crumbles', 'mover', 'log', 'ledge']   (true = a default three)
   * Falling into a pit is like any fall (a bubble in Practice, a life in Adventure, back to the start).
   * ----------------------------------------------------------------- */
  const SECTION = 10, LANES = [-6, 0, 6];
  function setupApproach(L) {
    if (!L.approach || L.solemn || !L.bounds || !L.spawn || L.approachSet) return;
    L.approachSet = true;
    const list = L.approach === true ? ['stones', 'meadow', 'mover'] : L.approach.slice();
    const B = L.bounds, z0 = B.maxZ, len = 7 + list.length * SECTION, z1 = z0 + len;
    const t0 = L.terrain ? L.terrain.bind(L) : () => 0, c0 = L.groundColor ? L.groundColor.bind(L) : null;
    const A = S.approach = { list, z0, z1, oldSpawn: L.spawn.slice(), pits: [], route: [], crossed: false };
    list.forEach((kind, i) => {
      const zc = z1 - 6 - SECTION * i - SECTION / 2, k = kind.split(':')[0];
      const w = k === 'stones' ? 3.4 : k === 'crumbles' ? 6.2 : k === 'mover' ? 7.6 : 0;
      if (w) A.pits.push({ kind: k, zc, a: zc - w / 2, b: zc + w / 2 });
    });
    const edge = (x) => t0(Math.max(B.minX, Math.min(B.maxX, x)), z0);
    let low = Infinity; for (let x = B.minX; x <= B.maxX; x += 1) low = Math.min(low, edge(x));
    A.pitY = low - 8; A.low = low;
    A.inPit = (z) => A.pits.find((p) => z > p.a && z < p.b);
    L.terrain = (x, z) => {
      if (z <= z0) return t0(x, z);
      const h = edge(x), p = A.inPit(z);
      if (!p) return h;
      const d = Math.min(z - p.a, p.b - z);                               // steep pit walls
      return h + (A.pitY - h) * Math.min(1, d / 0.35);
    };
    if (c0) L.groundColor = (x, z, h) => {
      if (z <= z0) return c0(x, z, h);
      if (A.inPit(z) && h < A.low - 0.8) return 0x6b5a46;
      return c0(x, z0 - 0.5 - ((z - z0) % 9), edge(x));
    };
    L.bounds = Object.assign({}, B, { maxZ: z1 });
    L.spawn = [Math.max(B.minX + 2, Math.min(B.maxX - 2, A.oldSpawn[0])), z1 - 3];
  }
  function buildApproach() {
    const A = S.approach; if (!A) return;
    const L = S.level, B = L.bounds;
    const hAt = (x) => L.terrain(x, A.z0 + 0.5);
    const lanes = LANES.filter((x) => x > B.minX + 2 && x < B.maxX - 2);
    A.list.forEach((kind, i) => {
      const [k, arg] = kind.split(':'), zc = A.z1 - 6 - SECTION * i - SECTION / 2;
      const pit = A.pits.find((p) => p.zc === zc);
      if (pit) {                                                          // water at the bottom of the pit
        const water = new THREE.Mesh(new THREE.PlaneGeometry(B.maxX - B.minX, pit.b - pit.a + 0.2), new THREE.MeshLambertMaterial({ color: 0x3f7ea6, transparent: true, opacity: 0.9 }));
        water.rotation.x = -Math.PI / 2; water.position.set((B.minX + B.maxX) / 2, A.pitY + 1.5, zc); S.scene.add(water);
        api.hazard({ x: (B.minX + B.maxX) / 2, z: zc, w: B.maxX - B.minX + 4, d: pit.b - pit.a }, { maxY: A.low - 2.5, msg: 'Splash! Hop across on the stones.' });
      }
      lanes.forEach((x, li) => {
        const h = hAt(x);
        if (k === 'stones') {
          api.box({ x, z: zc, w: 1.3, d: 1.3, h: 0.4, y: h - 0.2, color: 0x9ca3af, tex: 'stone', house: false });
          if (li === 0) A.route.push(['jump', x, pit.b + 0.6], ['jump', x, zc], ['jump', x, pit.a - 0.8]);
        } else if (k === 'crumbles') {
          [zc + 1.45, zc - 1.45].forEach((z) => api.crumble({ x, z, top: h + 0.3, w: 1.5, d: 1.5, respawn: 2.5 }));
          if (li === 0) A.route.push(['jump', x, pit.b + 0.6], ['jump', x, zc + 1.45], ['jump', x, zc - 1.45], ['jump', x, pit.a - 0.8]);
        } else if (k === 'mover') {
          if (li === 1) return;                                          // two rafts, side lanes
          const m = api.mover({ w: 2.2, h: 0.4, d: 2.2, color: 0x8b5e34, path: [[x, h - 0.4, pit.b - 1.2], [x, h - 0.4, pit.a + 1.2]], speed: 1.6, wait: 1.2 });
          if (!A.route.some((r) => r[0] === 'ride')) A.route.push(['jump', x, pit.b + 0.7], ['ride', x, m, pit.b - 1.2, pit.a + 1.2], ['jump', x, pit.a - 0.8]);
        } else if (k === 'log' && li !== 1) {
          api.sweeper({ x, z: zc, length: 5.4, speed: 1.3 });
        } else if (k === 'ledge' && li === 0) {
          api.box({ x: (B.minX + B.maxX) / 2, z: zc, w: B.maxX - B.minX, d: 4, h: 1.1, y: Math.min(...lanes.map(hAt)) - 0.2, color: 0xb59a6d, house: false });
        }
      });
      if (k === 'meadow') {
        const kind2 = arg || 'ox';
        api.critter({ kind: kind2, x: lanes[0] + 3, z: zc, r: 6, sight: 6, speed: 8, msg: 'Watch out! When the red sign shows, jump aside, or climb a rock.' });
        [[lanes[0] - 2, zc + 2.5], [lanes[lanes.length - 1] - 1, zc - 2.5]].forEach(([x, z]) => api.box({ x, z, w: 2.2, d: 2.2, h: 1.5, y: hAt(x) - 0.1, color: 0x9c8b6e, house: false }));
      }
      if (k === 'ledge') A.route.push(['jump', lanes[0], zc + 1.2], ['jump', lanes[0], zc - 3]);
      else if (!pit) A.route.push(['walk', lanes[0], zc - SECTION / 2 + 1]);
      { const lx = lanes[1] !== undefined ? lanes[1] : lanes[0], off = pit ? (pit.b - pit.a) / 2 + 0.7 : 3.5;   // (on solid ground either side of a pit, never down in it)
        api.leaves([[lx, zc + off], [lx, zc - off]]); }
    });
    A.route.push(['walk', lanes[0], A.oldSpawn[1]], ['walk', A.oldSpawn[0], A.oldSpawn[1]]);   // (down the lane first: some levels have a building at their old edge)
  }
  function crossApproach(at) {
    const A = S.approach; if (!A || A.crossed) return;
    A.crossed = true;
    setRunCheckpoint(at ? at.clone() : new THREE.Vector3(A.oldSpawn[0], groundAt(A.oldSpawn[0], A.oldSpawn[1]), A.oldSpawn[1]), 'Checkpoint');
  }
  SQ._crossApproach = crossApproach;
  function updateApproach() {
    const A = S.approach; if (!A || A.crossed) return;
    if (api.activePlayers().some((q) => q.pos.z < A.z0 - 0.5 && !q.bubble)) crossApproach();
  }
  SQ._approach = () => S.approach;
  function updateGadgets(dt) {
    updateApproach();
    updateCritters(dt); updateDarkness(dt);
    const act = S.players.filter((p) => p.joined && !p.bubble);
    for (const c of S.crumbles) {
      if (c.state === 'idle') {
        if (act.some((p) => p.standingOn === c.platform)) { c.state = 'shake'; c.t = 0; Audio.sfx('drop'); }
      } else if (c.state === 'shake') {
        c.t += dt;
        c.mesh.position.x = c.o.x + Math.sin(c.t * 60) * 0.06;
        if (c.t >= c.delay) { c.state = 'fall'; c.t = 0; c.platform.on = false; }
      } else if (c.state === 'fall') {
        c.t += dt;
        c.mesh.position.y -= dt * 9;
        c.mesh.material.transparent = true; c.mesh.material.opacity = Math.max(0, 1 - c.t);
        if (c.t >= c.respawn) {
          c.state = 'idle'; c.platform.on = true;
          c.mesh.position.set(c.o.x, c.y + c.h / 2, c.o.z); c.mesh.material.opacity = 1; c.mesh.material.transparent = false;
          spawnPuff(c.o.x, c.y + c.h, c.o.z, 0xc8a46a, 5);
        }
      }
    }
    for (const sp of S.springs) {
      sp.squash = Math.max(0, sp.squash - dt * 4);
      sp.pad.scale.y = 1 - sp.squash * 0.6;
      for (const p of act) {
        if (p.standingOn === sp.platform && p.vel.y <= 0.1) {
          p.vel.y = sp.power; p.onGround = false; p.coyote = 0; p.standingOn = null; p.sprung = true;
          sp.squash = 1; Audio.sfx('jump'); Audio.sfx('bubble');
        }
      }
    }
    for (const sw of S.sweepers) {
      sw.a += sw.speed * dt;
      sw.g.rotation.y = sw.a;
      if(sw.forecast)sw.forecast.rotation.z=sw.a+sw.speed*.35;
      const dx = Math.cos(sw.a), dz = -Math.sin(sw.a);                  // log direction in the ground plane
      for (const p of act) {
        if (p.carriedBy || p.pos.y > sw.y + 0.75 || p.pos.y < sw.y - 1) continue;   // jump over it!
        const rx = p.pos.x - sw.o.x, rz = p.pos.z - sw.o.z;
        const along = Math.max(-sw.L / 2, Math.min(sw.L / 2, rx * dx + rz * dz));
        const px = rx - along * dx, pz = rz - along * dz;
        if (Math.hypot(px, pz) < 0.3 + T.playerRadius && Math.abs(along) > 0.5) {
          hitPlayer(p, p.pos.x - px, p.pos.z - pz, 'bump', 'P' + (p.slot + 1) + ' got swept! Jump over the spinning log.');
        }
      }
    }
    const G = S.gold;
    if (G && !S.goldGot) {
      G.g.rotation.y += dt * 2; G.ring.rotation.x += dt * 1.3;
      G.g.position.y = G.y + Math.sin(S.time * 2.5) * 0.15;
      for (const p of act) {
        if (Math.hypot(p.pos.x - G.x, p.pos.z - G.z) < 1.4 && Math.abs(p.pos.y + 1 - G.y) < 1.9) {
          S.goldGot = true; G.g.visible = false;
          Audio.sfx('win'); spawnPuff(G.x, G.y, G.z, 0xfacc15, 20);
          toast('🌟 P' + (p.slot + 1) + ' found the Golden Scroll! (⭐ star)', 3500);
          renderHUD();
          break;
        }
      }
    }
  }

  // ---- extra detail: grass, flowers, pebbles (instanced, cheap), clouds by day, fireflies at night ----
  // Plants that sway in a gentle breeze: a few lines added to the material's vertex shader (the higher a point,
  // the more it moves; each plant moves a little differently). Costs nothing on the CPU.
  const SWAY = { value: 0 };
  function swayMat(m, amp, base) {
    if (!m || m.userData.sway) return m;
    m.userData.sway = true;
    const before=m.onBeforeCompile, cacheKey=m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (sh, renderer) => {
      before.call(m,sh,renderer);
      sh.uniforms.sqTime = SWAY; sh.uniforms.sqAmp = { value: amp }; sh.uniforms.sqBase = { value: base || 0 };
      sh.vertexShader = 'uniform float sqTime;\nuniform float sqAmp;\nuniform float sqBase;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        'vec2 sqP = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);',
        '#else',
        'vec2 sqP = vec2(modelMatrix[3][0], modelMatrix[3][2]);',
        '#endif',
        'float sqH = max(position.y + sqBase, 0.0) * sqAmp;',
        'transformed.x += sin(sqTime * 1.7 + sqP.x * 0.35 + sqP.y * 0.21) * sqH;',
        'transformed.z += cos(sqTime * 1.3 + sqP.y * 0.31 + sqP.x * 0.13) * sqH * 0.6;'].join('\n'));
    };
    m.customProgramCacheKey = () => cacheKey() + ':sway' + amp + ':' + (base || 0);
    return m;
  }
  // Shared storybook dressing. It adds no platforms or hazards.
  const ART_WORLDS = [
    null,
    { name: 'first gardens', wall: 0xc9bd95, trim: 0x657b42, cloth: 0x528d82, foliage: 0x557c38 },
    { name: 'patriarch trails', wall: 0xc5a37c, trim: 0x805640, cloth: 0x9e4545, foliage: 0x6a7942 },
    { name: 'wilderness', wall: 0xcbb08b, trim: 0x88674d, cloth: 0x287887, foliage: 0x73814b },
    { name: 'harvest and kings', wall: 0xd2bd93, trim: 0x8c673c, cloth: 0x9b4638, foliage: 0x6b7940 },
    { name: 'prophets', wall: 0xbba88f, trim: 0x646879, cloth: 0x566b9a, foliage: 0x5d755b },
    { name: 'Galilee', wall: 0xd5c5a3, trim: 0x5a7c81, cloth: 0x347f91, foliage: 0x527950 },
    { name: 'Jerusalem', wall: 0xcabca5, trim: 0x735e64, cloth: 0x955477, foliage: 0x627756 },
    { name: 'to the nations', wall: 0xc8b99c, trim: 0x577a7d, cloth: 0x3d798e, foliage: 0x508166 }
  ];
  function buildStorybook(L) {
    const W = Number(String(L.id).split('-')[0]) || 1;
    const P = Object.assign({}, ART_WORLDS[W] || ART_WORLDS[1]);
    if (L.id === '4-2') Object.assign(P, { name: 'Samuel lamplight', wall: 0xb6a994, trim: 0x4e516e, cloth: 0x3e487a });
    if (L.id === '4-6') Object.assign(P, { name: 'cedar and limestone', wall: 0xe0d2b2, trim: 0xad793e, cloth: 0x426a76 });
    const root = new THREE.Group(); root.name = 'storybook';
    const detail = new THREE.Group(); detail.name = 'storybook-detail'; root.add(detail);
    const fixed = new THREE.Group(); fixed.name = 'storybook-landscape'; root.add(fixed);
    S.art = { root, detail, profile: P, movingCloth: [] };
    S.scene.add(root);
    // Seed scenery placement by level, independently of gameplay placement choices.
    let seed = W * 104729 + Number(String(L.id).split('-')[1]) * 8191;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const box = (parent, x, y, z, w, h, d, c, tx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), texMat(c, tx || 'stone'));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const B = L.bounds || { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const night = L.time === 'night', sea = ['3-4', '5-3', '8-8'].includes(L.id);
    // A broken silhouette of terraces, distant villages and headlands replaces empty horizons.
    // Everything is outside the playable bounds; roofs never suggest a new reachable platform.
    // (On an island level the edge is a cliff with water below, so these are left out.)
    for (let side = -1; side <= 1 && !S.island; side += 2) {
      for (let j = 0; j < 7; j++) {
        const x = (side < 0 ? B.minX : B.maxX) + side * (9 + rand() * 12);
        const z = B.minZ + (j + rand() * 0.65) / 7 * (B.maxZ - B.minZ), y = terrain(x, z);
        if (sea) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), texMat(0x747b75, 'stone'));
          rock.position.set(x, Math.max(0, y) + 1, z); rock.scale.set(4 + rand() * 5, 4 + rand() * 5, 5); fixed.add(rock);
        } else if (L.town && !L.solemn) {
          const w = 3 + rand() * 3, h = 2.5 + rand() * 3, d = 3 + rand() * 3;
          box(fixed, x, y + h / 2, z, w, h, d, P.wall);
          box(fixed, x, y + h - 0.12, z, w + 0.18, 0.24, d + 0.18, P.trim);
          // Little dark recesses and warm night windows read as homes at distance.
          const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.85), new THREE.MeshBasicMaterial({ color: night ? 0xe1a45c : 0x4e4438 }));
          wm.position.set(x, y + h * 0.58, z + d / 2 + 0.015); fixed.add(wm);
          box(fixed, x + side * 3, y + 0.32, z, 5, 0.64, d + 2, P.trim);
        } else {
          const outcrop = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), texMat(P.wall, 'stone'));
          outcrop.position.set(x, y + 0.4, z); outcrop.scale.set(3 + rand()*3, 1.5 + rand()*2, 4); fixed.add(outcrop);
        }
      }
    }
    if (!sea && !L.solemn && L.rim !== false && !S.island) {
      const points = [];
      for (let sd = -1; sd <= 1; sd += 2) for (let i = 0; i < 16; i++) {
        const x = (sd < 0 ? B.minX : B.maxX) + sd * (3.5 + rand()*8);
        const z = B.minZ + rand() * (B.maxZ-B.minZ), y = terrain(x,z);
        if (y < 0) continue;
        points.push([x,y,z,.75+rand()*.6]);
      }
      const dummy = new THREE.Object3D();
      [[new THREE.CylinderGeometry(.12,.2,1.8,6),0x7a6344, .9], [new THREE.IcosahedronGeometry(1,1), P.foliage,2.2]].forEach(([geo,c,dy],j) => {
        const m = new THREE.InstancedMesh(geo,texMat(c,j ? 'leaves':'bark'),points.length);
        points.forEach(([x,y,z,scale],i) => { dummy.position.set(x,y+dy*scale,z); dummy.scale.set(scale*(j?1.15:1),scale*(j?.8:1),scale); dummy.rotation.y = i*2.4; dummy.updateMatrix(); m.setMatrixAt(i,dummy.matrix); });
        m.castShadow = true; m.receiveShadow = true; detail.add(m);
      });
    }
    // Existing playable houses retain their exact roof and collision dimensions.
    (S.houseBoxes || []).forEach(({ o, mesh }, i) => {
      const skin = mesh.material.clone(); if(skin.userData.surface) registerSurface(skin,skin.userData.surface); if (skin.color) skin.color.lerp(new THREE.Color(P.wall), 0.28); mesh.material = skin;
      const g = new THREE.Group(); g.name = 'carved-house-trim';
      const z = o.d / 2 + 0.085, y = o.h / 2 - 0.54;
      box(g, 0, y, z, o.w - 0.18, 0.1, 0.09, P.trim, 'wood');
      for (let k = 0; k < Math.min(10, Math.floor(o.w / 0.55)); k++) {
        const x = -o.w / 2 + 0.4 + k * 0.55;
        box(g, x, y - 0.12, z, 0.16, 0.16, 0.08, P.trim, 'wood');
      }
      // Narrow painted corner stones, below roof height and flush with the wall.
      [-1, 1].forEach((sd) => box(g, sd * (o.w / 2 - 0.1), -0.12, z - 0.01, 0.18, Math.max(0.4, o.h - 0.7), 0.07, P.wall));
      mergeStatic(g, []); mesh.add(g);
    });
    // Stitching, edging and a restrained palette give authored cloth a woven character.
    // Instance wheat and flowers so hundreds of plants cost just a few draw calls.
    const pts = [], flowers = [];
    if (!sea && !L.solemn && L.decor !== false) {
      const harvest = L.id === '4-1', count = harvest ? 850 : (L.artDirection&&L.artDirection.storyPlants!==undefined?Math.max(0,Math.min(300,L.artDirection.storyPlants)):90);
      for (let i = 0; i < count * 5 && pts.length < count; i++) {
        const x = B.minX + 1 + rand() * (B.maxX - B.minX - 2), z = B.minZ + 1 + rand() * (B.maxZ - B.minZ - 2), y = terrain(x, z);
        if (y < -0.1 || y > 5 || Math.abs(x) < (harvest ? 5.7 : 8)) continue;
        if (harvest && (z < -13 || z > 38)) continue;
        if (S.platforms.some((p) => x > p.minX - 0.9 && x < p.maxX + 0.9 && z > p.minZ - 0.9 && z < p.maxZ + 0.9)) continue;
        if (S.interactables.some((p) => Math.hypot(x - p.x, z - p.z) < 2.3)) continue;
        if (S.circles.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.6)) continue;
        if (S.waters.some((p) => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ && y < p.y + 0.1)) continue;
        pts.push([x, y, z, 0.7 + rand() * 0.4]); if (pts.length % 5 === 0) flowers.push([x + 0.2, y, z]);
      }
      const harvestColor = harvest ? 0xc7a14a : P.foliage;
      const plant = (geo, c, points, yoff, scale, sway) => {
        const material = swayMat(texMat(c, 'leaves'), sway || 0.12, yoff);
        const m = new THREE.InstancedMesh(geo, material, points.length), dummy = new THREE.Object3D();
        points.forEach(([x, y, z, s], i) => { dummy.position.set(x, y + yoff * (s || 1), z); dummy.rotation.y = i * 2.4; dummy.scale.setScalar((s || 1) * (scale || 1)); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
        m.castShadow = false; m.receiveShadow = true; detail.add(m); return m;
      };
      plant(new THREE.CylinderGeometry(0.018, 0.026, harvest ? 0.85 : 0.45, 3), harvestColor, pts, harvest ? 0.42 : 0.22);
      if (harvest) plant(new THREE.SphereGeometry(0.09, 5, 4).scale(0.8, 2.6, 0.8), 0xd9b65d, pts, 0.9);
      plant(new THREE.CylinderGeometry(0.015, 0.022, 0.4, 3), 0x456b39, flowers, 0.2);
      const bloom = new THREE.SphereGeometry(0.14, 6, 4); bloom.scale(1, 0.35, 1);
      plant(bloom, harvest ? 0xb93e32 : P.cloth, flowers, 0.43, 1, 0.1);
    }
    // Samuel: warm pools around the existing lanterns, indigo textiles and quiet light.
    // These are practical lamps only; no image or light is presented as God.
    if (L.id === '4-2') {
      const lamps = [[-7, 24], [7, 12], [-7, -2]];
      lamps.forEach(([x, z]) => {
        const y = terrain(x, z);
        box(detail, x, y + 0.15, z, 0.5, 0.3, 0.5, 0x9e7648, 'wood');
        const light = new THREE.PointLight(0xffb75c, 0.8, 8, 2); light.position.set(x, y + 0.8, z); detail.add(light);
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), texMat(0xa26d3f, 'clay')); bowl.scale.y = 0.5; bowl.position.set(x, y + 0.38, z); detail.add(bowl);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 6), new THREE.MeshBasicMaterial({ color: 0xffc369 })); flame.position.set(x, y + 0.58, z); detail.add(flame);
        (S.flames = S.flames || []).push({ fl: flame, ph: z });
      });
      // Cloth against side walls, never across the passage or on a walkable roof.
      [-1, 1].forEach((sd) => {
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.4, 8, 8), swayMat(charMat(P.cloth, 'cloth'), 0.025, 1.2));
        cloth.rotation.y = -sd * Math.PI / 2; cloth.position.set(sd * 16.9, 2.3, 15); detail.add(cloth);
      });
    }
    // Temple: cedar panels, bronze bands, palm-like relief and gold edging on the
    // authored building. All relief is shallow; no new climb route or sacred figure.
    if (L.id === '4-6' && !L.templeArchitecture) {
      const architecture = new THREE.Group(); architecture.name = 'temple-relief'; detail.add(architecture);
      const temple = S.platforms.find((p) => p.maxX - p.minX > 11 && p.top - p.bottom > 8);
      if (temple) {
        const cx = (temple.minX + temple.maxX) / 2, z = temple.maxZ + 0.035, y = temple.bottom, w = temple.maxX - temple.minX;
        for (let k = -2; k <= 2; k++) {
          box(architecture, cx + k * 1.7, y + 3.4, z, 1.35, 5.8, 0.075, 0x936238, 'wood');
          box(architecture, cx + k * 1.7, y + 3.4, z + 0.06, 0.075, 4.9, 0.05, 0xc6a35e);
          for (let j = -1; j <= 1; j += 2) {
            const leaf = box(architecture, cx + k * 1.7 + j * 0.22, y + 4.2, z + 0.08, 0.08, 0.65, 0.04, 0xc6a35e);
            leaf.rotation.z = j * 0.55;
          }
        }
        [0.45, 7.8].forEach((h) => box(architecture, cx, y + h, z + 0.05, w - 0.35, 0.16, 0.1, 0xb99048));
      }
      mergeStatic(architecture, []);
    }
    // Static scenery is batched; keep instances and practical lights separate.
    mergeStatic(fixed, []);
    root.userData.profile = P.name;
  }
  function updateStorybook() {
    if (!S.art) return;
    S.art.detail.visible = (S.quality || 0) < 3;
  }

  // A small curved ribbon blade; opt-in gardens keep the original instance count,
  // wind, draw batching and placement. Ordinary levels retain their cone geometry.
  function gardenBladeGeometry() {
    const p=[],uv=[],idx=[];
    [[0,-.25,0,.055],[.025,-.09,.005,.065],[.075,.08,.02,.047],[.13,.22,.035,0]].forEach(([x,y,z,w],i)=>{p.push(x-w,y,z,x+w,y,z);uv.push(0,i/3,1,i/3);if(i<3){const k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function buildDecor(L) {
    if (L.decor === false) return;
    const B = L.bounds || { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const want = Object.assign({ grass: 320, flowers: 80, pebbles: 60 }, L.decor || {});
    const isGreen = (x, z, h) => {
      if (!L.groundColor) return true;
      const c = new THREE.Color(L.groundColor(x, z, h));
      return c.g > c.r * 1.05 && c.g > c.b * 1.1;
    };
    const blocked = (x, z, h) => {
      if (h < -0.4) return true;
      for (const pl of S.platforms) if (x > pl.minX - 0.3 && x < pl.maxX + 0.3 && z > pl.minZ - 0.3 && z < pl.maxZ + 0.3 && pl.top > h + 0.05 && pl.bottom < h + 2) return true;
      for (const c of S.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return true;
      return false;
    };
    const place = (n, green) => {
      const out = [];
      for (let tries = 0; out.length < n && tries < n * 8; tries++) {
        const x = B.minX + Math.random() * (B.maxX - B.minX), z = B.minZ + Math.random() * (B.maxZ - B.minZ);
        const h = terrain(x, z);
        if (blocked(x, z, h) || (green && !isGreen(x, z, h))) continue;
        out.push([x, h, z]);
      }
      return out;
    };
    const tufts = (pts) => { const out = []; pts.forEach(([x, y, z], i) => { out.push([x, y, z], [x + 0.14, y, z + 0.08], [x - 0.1, y, z + 0.13]); }); return out; };   // 3 blades together
    const stoneColors = () => {                        // stones a little darker than the ground they sit on
      const base = new THREE.Color(L.groundColor ? L.groundColor(0, 0, terrain(0, 0)) : 0x8a8f80);
      return [0.72, 0.8, 0.88].map((k) => base.clone().multiplyScalar(k).lerp(new THREE.Color(0x8b8178), 0.35).getHex());
    };
    const dummy = new THREE.Object3D();
    const instanced = (geo, material, pts, scale, colors) => {
      if (!pts.length) return null;
      const m = new THREE.InstancedMesh(geo, material, pts.length);
      pts.forEach(([x, y, z], i) => {
        dummy.position.set(x, y + scale * 0.25, z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        const sc = scale * (0.7 + Math.random() * 0.6); dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
        if (colors && m.setColorAt) m.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      S.scene.add(m);
      return m;
    };
    const garden=!!(L.artDirection&&L.artDirection.groundCover==='garden');
    S.decor = {
      grass: instanced(garden?gardenBladeGeometry():new THREE.ConeGeometry(0.1, 0.5, 4), swayMat(new THREE.MeshLambertMaterial({ color: garden?0xffffff:0x3f9a3a, side:garden?THREE.DoubleSide:THREE.FrontSide, emissive: new THREE.Color(garden?0x40562c:0x3f9a3a).multiplyScalar(0.13) }), garden?.16:.32, 0.25), tufts(place(want.grass, true)), 1, garden?[0x62834c,0x789759,0x537442]:[0x3f9a3a, 0x4cae45, 0x358a33]),
      flowers: instanced(new THREE.SphereGeometry(0.11, 6, 4), swayMat(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.4, 0.3), place(want.flowers, true), 1, [0xf43f5e, 0xfacc15, 0xffffff, 0xa855f7, 0xfb923c]),
      pebbles: instanced(new THREE.DodecahedronGeometry(0.14, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), place(Math.round(want.pebbles * 0.6), false), 1, stoneColors())
    };
    // real plants when the models loaded: ferns, broad leaves and flower clumps on grass
    const plant = (name, n, green, size) => {
      const m = modelInstance(name, size); if (!m) return;
      const pts = place(n, green); if (!pts.length) return;
      m.updateMatrixWorld(true);
      m.traverse((o) => {
        if (!o.isMesh) return;
        swayMat(o.material, name === 'Fern_1' ? 0.12 : 0.09, 0);
        const im = new THREE.InstancedMesh(o.geometry, o.material, pts.length);
        pts.forEach(([x, y, z], i) => {
          dummy.position.set(x, y - 0.05, z); dummy.rotation.set(0, (x * 13 + z * 7) % 6.28, 0); const sc = 0.8 + ((x * 31 + z * 17) % 1 + 1) % 1 * 0.5; dummy.scale.set(sc, sc, sc);
          dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix.clone().multiply(o.matrixWorld));
        });
        im.castShadow = true; im.receiveShadow = true; im.userData.plant = name; S.scene.add(im);
      });
    };
    if (want.plants !== false && Assets.gltf.Fern_1) {
      plant('Fern_1', 18, true, 0.9); plant('Plant_1_Big', 10, true, 1.0);
      plant('Flower_3_Group', 16, true, 0.6); plant('Flower_4_Group', 12, true, 0.6);
    }
    const night = S.timeCfg && S.timeCfg.lamps;
    if (!night) {                                           // soft clouds with flat bottoms, out round the horizon where the camera sees them
      S.clouds = [];
      const C0 = [(B.minX + B.maxX) / 2, (B.minZ + B.maxZ) / 2], R0 = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2 + 40;
      const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(S.scene.background), S.timeCfg === TIMES.sunset ? 0.3 : S.timeCfg === TIMES.storm ? 0.55 : 0.06);
      const top = new THREE.MeshLambertMaterial({ color: tint, emissive: tint.clone().multiplyScalar(0.62), fog: false });
      const under = new THREE.MeshLambertMaterial({ color: tint.clone().multiplyScalar(0.86), emissive: tint.clone().multiplyScalar(0.5), fog: false });
      for (let i = 0; i < 12; i++) {
        const cg = new THREE.Group(), n = 4 + (i % 3), w = 2.6;
        for (let k = 0; k < n; k++) {                         // a row of wide puffs along the bottom...
          const pf = new THREE.Mesh(new THREE.SphereGeometry(2.4 + Math.random() * 1.2, 16, 10), under);
          pf.position.set((k - (n - 1) / 2) * w, 0, (Math.random() - 0.5) * 2); pf.scale.set(1.25, 0.5, 1); cg.add(pf);
        }
        for (let k = 0; k < n - 1; k++) {                     // ...and rounder ones on top, lit by the sun
          const pf = new THREE.Mesh(new THREE.SphereGeometry(2.2 + Math.random() * 1.6, 16, 10), top);
          pf.position.set((k - (n - 2) / 2) * w * 0.95, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5); pf.scale.set(1, 0.78, 1); cg.add(pf);
        }
        mergeStatic(cg, []);
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4, rad = R0 + (i % 4) * 18 - 10, sc = 1 + Math.random() * 0.8;
        cg.scale.setScalar(sc); cg.userData = { ang, rad, y: 26 + (i % 5) * 4 + Math.random() * 4, spd: 0.004 + Math.random() * 0.004, C0 };
        S.scene.add(cg); S.clouds.push(cg);
      }
    } else {                                                // fireflies
      const n = L.artDirection&&L.artDirection.ambientCount!==undefined?Math.max(0,Math.min(160,L.artDirection.ambientCount)):70, pts = new Float32Array(n * 3);
      S.fireflies = { n, pts, base: [] };
      for (let i = 0; i < n; i++) S.fireflies.base.push([B.minX + Math.random() * (B.maxX - B.minX), 0.6 + Math.random() * 2.2, B.minZ + Math.random() * (B.maxZ - B.minZ), Math.random() * 6]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const gm = glowTex();
      S.fireflies.mesh = new THREE.Points(g, new THREE.PointsMaterial(gm ? { color: 0xf3f99a, size: 0.7, map: gm, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false } : { color: 0xfde68a, size: 0.25, transparent: true, opacity: 0.9 }));
      S.scene.add(S.fireflies.mesh);
    }
  }
  // ---- The horizon: two rings of distant hills (paler the farther away, so the world feels big), flat-topped
  //      mesas round desert levels, and a setting sun, a bright haze or the moon low ahead of the camera. ----
  function buildHorizon(L) {
    if (L.horizon === false) return;
    const B = L.bounds || { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, R0 = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2 + 40;
    const sky = new THREE.Color(S.scene.background), TC = S.timeCfg;
    const gc = new THREE.Color(L.groundColor ? L.groundColor(cx, cz, terrain(cx, cz)) : 0x5a9a4a);
    const desert = !(gc.g > gc.r * 1.05 && gc.g > gc.b * 1.1);
    let edge = -Infinity; for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; edge = Math.max(edge, terrain(cx + Math.cos(a) * (R0 - 41), cz + Math.sin(a) * (R0 - 41))); }
    if (!isFinite(edge)) edge = 0;
    const horizon=L.artDirection&&L.artDirection.horizon;
    if(horizon&&horizon.bounded){edge=-Infinity;for(let i=0;i<=16;i++){const u=i/16,x=B.minX+(B.maxX-B.minX)*u,z=B.minZ+(B.maxZ-B.minZ)*u;for(const [xx,zz]of [[x,B.minZ],[x,B.maxZ],[B.minX,z],[B.maxX,z]])edge=Math.max(edge,terrain(xx,zz));}}
    S.horizon = [];
    const ridge = (R, hMin, hMax, mix, seed, mesa) => {
      const N = 144, pos = [], col = [], idx = [];
      const night = TC === TIMES.night, base = horizon&&horizon.color!==undefined?new THREE.Color(horizon.color):night ? gc.clone().multiplyScalar(0.3) : gc;      // at night: dark hills against the sky
      const hiC = base.clone().multiplyScalar(desert && !night ? 1.08 : 0.9).lerp(sky, mix);
      const lo = night ? hiC.clone().multiplyScalar(0.75) : base.clone().lerp(sky, Math.min(1, mix + 0.12));   // hazy feet by day, dark by night
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        let n = 0.5 + 0.5 * (0.55 * Math.sin(a * 3 + seed) + 0.3 * Math.sin(a * 7.3 + seed * 2.1) + 0.15 * Math.sin(a * 13.1 + seed * 0.7));
        if (mesa) n = n > 0.52 ? 0.78 + (n - 0.52) * 0.25 : n * 0.7;          // flat-topped desert mesas
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, top = edge + (hMin + (hMax - hMin) * n)*(horizon&&horizon.heightScale!==undefined?Math.max(.25,Math.min(2,horizon.heightScale)):1);
        pos.push(x, edge - 80, z, x, top, z);
        const c = hiC.clone().lerp(sky, (1 - n) * 0.12);
        col.push(lo.r, lo.g, lo.b, c.r, c.g, c.b);
        if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -0.5; S.scene.add(m); S.horizon.push(m);
    };
    ridge(R0 + 85, 16, 36, TC === TIMES.night ? 0.55 : 0.66, 4.1, desert);
    ridge(R0 + 32, 6, 15, TC === TIMES.night ? 0.3 : 0.38, 1.3, desert);
    // the sun, a haze or the moon, low over the hills ahead (the camera looks along -z)
    S.skyGlows = [];
    const at = (az, el, d) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * d, edge + Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
    const disc = (color, r, dir) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color, fog: false })); m.lookAt(-dir.x, -dir.y, -dir.z); S.scene.add(m); S.skyGlows.push({ obj: m, dir }); };
    const halo = (color, size, op, dir) => { const g = glow(color, size, op); if (g) { S.scene.add(g); S.skyGlows.push({ obj: g, dir }); } };
    if (TC === TIMES.sunset) { const d = at(-0.25, 0.1, 205); disc(0xffe0a8, 8, d); halo(0xffa060, 95, 0.75, at(-0.25, 0.1, 200)); }
    else if (TC === TIMES.night) { const d = at(0.35, 0.34, 205); disc(0xeef2ff, 5.5, d); halo(0xc7d2fe, 46, 0.45, at(0.35, 0.34, 200)); }
    else if (TC === TIMES.day) halo(0xfff6e0, 170, 0.22, at(0, 0.05, 200));
    S.skyGlows.forEach((g) => g.obj.renderOrder = -0.8);
  }
  // ---- A living world: birds circling over the players by day, butterflies over green meadows, dust
  //      drifting in the sun on desert levels (fireflies at night are in buildDecor). LEVEL.life: false skips it. ----
  function buildLife(L) {
    if (L.life === false || L.solemn) return;
    const TC = S.timeCfg, B = L.bounds || { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const day = TC === TIMES.day || TC === TIMES.sunset;
    const sp = L.spawn || [0, 0], green = (x, z) => { if (!L.groundColor) return true; const c = new THREE.Color(L.groundColor(x, z, terrain(x, z))); return c.g > c.r * 1.05 && c.g > c.b * 1.1; };
    S.life = { birds: [], flies: [], dust: null };
    if (day) {                                                    // birds: a little flock wheeling high over the players
      // soft white birds (like gulls or doves): tapered, swept-back wings that bend at the wrist, grey tips,
      // a fan tail and a little beak. Flat shapes, so they cost almost nothing.
      const flat = (pts) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((q) => sh.lineTo(q[0], q[1])); const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); return g; };
      const innerGeo = flat([[0, -0.2], [0.5, -0.17], [0.5, 0.12], [0, 0.2]]);                // shoulder to wrist (x out, z back)
      const outerGeo = flat([[0, -0.17], [0.42, -0.02], [0.62, 0.22], [0.3, 0.2], [0, 0.12]]);   // wrist to a swept-back tip
      const tailGeo = flat([[-0.07, 0.25], [0.07, 0.25], [0.17, 0.55], [0, 0.5], [-0.17, 0.55]]);
      const wm = new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide }), tm = new THREE.MeshLambertMaterial({ color: 0x4b5563, side: THREE.DoubleSide });
      const bodyM = mat(0xf4f1ea), beakM = mat(0xf59e0b);
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group(), s = 0.85 + (i % 2) * 0.15;
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bodyM); body.scale.set(0.9, 0.8, 2.3); g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bodyM); head.position.set(0, 0.04, -0.3); g.add(head);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), beakM); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.03, -0.44); g.add(beak);
        const tail = new THREE.Mesh(tailGeo, wm); g.add(tail);
        const wing = (sd) => {
          const inner = new THREE.Group(); inner.scale.x = sd; g.add(inner);
          inner.add(new THREE.Mesh(innerGeo, wm));
          const outer = new THREE.Group(); outer.position.x = 0.5; inner.add(outer);
          outer.add(new THREE.Mesh(outerGeo, wm));
          const tip = new THREE.Mesh(flat([[0.3, 0.05], [0.42, -0.02], [0.62, 0.22], [0.4, 0.2]]), tm); tip.position.y = 0.002; outer.add(tip);
          return { inner, outer };
        };
        const L = wing(1), R = wing(-1);
        g.scale.setScalar(s * 1.3);
        g.userData = { L, R, r: 8 + i * 2, ph: i * 1.6, h: 8.5 + (i % 3) * 1.4, spd: 0.26 + (i % 2) * 0.06 };
        S.scene.add(g); S.life.birds.push(g);
      }
    }
    if (day && TC !== TIMES.storm) {                              // butterflies over the green, near flowers
      // real kinds: a monarch (orange, black veins, white spots), a cabbage white, a swallowtail (yellow and black),
      // a common blue. A fore wing and a hind wing on each side, a thin dark body, two antennae.
      const KINDS = [
        { base: '#e8771e', vein: '#1c1917', edge: '#1c1917', dots: '#ffffff' },
        { base: '#f6f3e8', vein: 'rgba(60,60,60,0.25)', edge: '#3f3f46', dots: '#3f3f46', spots: 1 },
        { base: '#f4d03f', vein: '#1c1917', edge: '#1c1917', dots: '#93c5fd', bands: 1 },
        { base: '#6b9be8', vein: 'rgba(30,40,80,0.35)', edge: '#f8fafc', dots: '#1e293b' }
      ];
      const wingShape = (fore) => {                                     // one side's wing outline, base at the body (0,0)
        const sh = new THREE.Shape();
        if (fore) { sh.moveTo(0, 0); sh.bezierCurveTo(0.08, 0.16, 0.28, 0.3, 0.42, 0.26); sh.bezierCurveTo(0.46, 0.17, 0.4, 0.06, 0.3, 0.01); sh.lineTo(0, -0.02); }
        else { sh.moveTo(0, -0.01); sh.bezierCurveTo(0.2, -0.02, 0.33, -0.1, 0.3, -0.22); sh.bezierCurveTo(0.24, -0.3, 0.1, -0.28, 0.02, -0.14); sh.lineTo(0, -0.01); }
        return sh;
      };
      const wingTex = (k) => canvasTex('butterfly-' + k, (x, n) => {
        const K = KINDS[k];
        x.clearRect(0, 0, n, n); x.fillStyle = K.base; x.fillRect(0, 0, n, n);
        if (K.bands) { x.fillStyle = K.vein; for (let i = 0; i < 4; i++) x.fillRect(n * (0.2 + i * 0.2), 0, n * 0.05, n); }
        x.strokeStyle = K.vein; x.lineWidth = n / 60;
        for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, n / 2); x.lineTo(n, n * (i / 5)); x.stroke(); }
        x.fillStyle = K.edge; x.fillRect(n * 0.84, 0, n * 0.16, n); x.fillRect(0, 0, n, n * 0.08); x.fillRect(0, n * 0.92, n, n * 0.08);
        x.fillStyle = K.dots; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(n * 0.92, n * (0.12 + i * 0.12), n * 0.022, 0, 6.3); x.fill(); }
        if (K.spots) { x.beginPath(); x.arc(n * 0.6, n * 0.35, n * 0.06, 0, 6.3); x.fill(); }
      }, 64);
      const shapeGeo = (fore) => {                                      // flat wing in the X-Z plane (Y up), UVs over its bounds
        const geo = new THREE.ShapeGeometry(wingShape(fore), 8); geo.rotateX(-Math.PI / 2);
        geo.computeBoundingBox(); const bb = geo.boundingBox, uv = [], pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) uv.push((pa.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (pa.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z || 1));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return geo;
      };
      const foreG = shapeGeo(true), hindG = shapeGeo(false);
      const bodyG = new THREE.CylinderGeometry(0.018, 0.012, 0.26, 6); bodyG.rotateX(Math.PI / 2);
      const bodyM = new THREE.MeshLambertMaterial({ color: 0x1c1917 });
      for (let tries = 0, n = 0; n < 14 && tries < 200; tries++) {
        const x = B.minX + Math.random() * (B.maxX - B.minX), z = B.minZ + Math.random() * (B.maxZ - B.minZ);
        if (!green(x, z) || Math.hypot(x - sp[0], z - sp[1]) > 45) continue;
        const k = n % KINDS.length, tex = wingTex(k);
        const wm = new THREE.MeshLambertMaterial(tex ? { map: tex, side: THREE.DoubleSide } : { color: new THREE.Color(KINDS[k].base), side: THREE.DoubleSide });
        const g = new THREE.Group();
        const side = (sgn) => { const w = new THREE.Group(); w.add(new THREE.Mesh(foreG, wm)); w.add(new THREE.Mesh(hindG, wm)); w.scale.x = sgn; return w; };
        const wl = side(-1), wr = side(1); g.add(wl); g.add(wr);
        g.add(new THREE.Mesh(bodyG, bodyM));
        [-1, 1].forEach((sgn) => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 3), bodyM); a.position.set(sgn * 0.03, 0.05, -0.17); a.rotation.set(-0.9, 0, sgn * 0.35); g.add(a); });
        g.scale.setScalar(0.9 + Math.random() * 0.3);
        g.userData = { wl, wr, x, z, ph: Math.random() * 6.28, hx: x, hz: z, rest: 0, restT: 3 + Math.random() * 6, y: terrain(x, z) + 0.8 };
        S.scene.add(g); S.life.flies.push(g); n++;
      }
    }
    let sandy = 0; for (let k = 0; k < 25; k++) { const a = k * 2.4, r = 4 + k * 0.8; if (!green(sp[0] + Math.cos(a) * r, sp[1] + Math.sin(a) * r)) sandy++; }
    if (day && sandy > 15) {                                       // desert: specks of dust drifting in the sunlight
      const n = L.artDirection&&L.artDirection.ambientCount!==undefined?Math.max(0,Math.min(160,L.artDirection.ambientCount)):160, pos = new Float32Array(n * 3), gm = glowTex();
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 36; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 36; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial(gm ? { color: 0xfff1d0, size: 0.28, map: gm, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending } : { color: 0xfff1d0, size: 0.06, transparent: true, opacity: 0.5 });
      S.life.dust = new THREE.Points(g, pm); S.life.dust.userData.home = pos.slice(); S.life.dust.frustumCulled = false; S.scene.add(S.life.dust);
    }
  }
  function updateLife(dt) {
    const Lf = S.life; if (!Lf) return;
    const t = S.time, c = S.camTarget || new THREE.Vector3();
    Lf.birds.forEach((b) => {
      const u = b.userData, a = t * u.spd + u.ph;
      b.position.set(c.x + Math.cos(a) * u.r, c.y + u.h + Math.sin(t * 0.7 + u.ph) * 0.8, c.z - 10 + Math.sin(a) * u.r);
      b.rotation.set(0, -a + Math.PI, 0); b.rotateZ(-0.25);                                  // facing along the circle, banking into the turn
      const gliding = Math.sin(t * 0.45 + u.ph) > 0.1;                                       // a few flaps, then a long glide
      const fl = gliding ? 0.12 + Math.sin(t * 1.5 + u.ph) * 0.04 : Math.sin(t * 7 + u.ph) * 0.55;
      u.L.inner.rotation.z = fl; u.R.inner.rotation.z = -fl;                                 // (mirrored by scale.x)
      u.L.outer.rotation.z = u.R.outer.rotation.z = -fl * 0.6 - 0.1;                        // the wrist bends a little (inside the mirrored wing)
    });
    Lf.flies.forEach((f) => {
      const u = f.userData;
      u.restT -= dt;
      if (u.rest > 0) {                                                   // resting on a flower: wings open and close slowly
        u.rest -= dt;
        const o = 0.35 + Math.sin(t * 1.4 + u.ph) * 0.45; u.wl.rotation.z = o; u.wr.rotation.z = -o;
        if (u.rest <= 0) u.restT = 4 + Math.random() * 8;
        return;
      }
      // a fluttery, wandering flight: quick wing beats, little bobs, the heading drifting this way and that
      const k = t * 0.55 + u.ph;
      const x = u.hx + Math.sin(k) * 1.8 + Math.sin(k * 2.3 + 1) * 0.6, z = u.hz + Math.cos(k * 0.8) * 1.8 + Math.sin(k * 3.1) * 0.4;
      const gy = terrain(x, z);
      let y = gy + 0.75 + Math.sin(t * 3.3 + u.ph) * 0.18 + Math.max(0, Math.sin(k * 1.7)) * 0.5;
      if (u.restT < 0) { y = gy + 0.12; if (Math.abs(f.position.y - y) < 0.15) { u.rest = 2 + Math.random() * 3; } }
      const dx = x - f.position.x, dz = z - f.position.z;
      f.position.set(x, f.position.y + (y - f.position.y) * Math.min(1, dt * 4), z);
      if (dx * dx + dz * dz > 1e-6) f.rotation.y = Math.atan2(dx, dz) + Math.PI;
      const beat = Math.sin(t * 22 + u.ph);                                // wings sweep from flat to nearly closed above the back
      const fl = 0.25 + (beat * 0.5 + 0.5) * 1.15; u.wl.rotation.z = fl; u.wr.rotation.z = -fl;
    });
    if (Lf.dust) {
      Lf.dust.visible = (S.quality || 0) < 2;
      const a = Lf.dust.geometry.attributes.position.array, h = Lf.dust.userData.home;
      for (let i = 0; i < a.length; i += 3) {
        const x = ((h[i] + t * 0.35 + c.x + 18) % 36 + 36) % 36 - 18, z = h[i + 2] + Math.sin(t * 0.3 + i) * 0.6;
        a[i] = c.x + x; a[i + 1] = c.y + h[i + 1] + Math.sin(t * 0.5 + i) * 0.4; a[i + 2] = c.z - 4 + z;
      }
      Lf.dust.geometry.attributes.position.needsUpdate = true;
    }
  }
  function updateDecor(dt) {
    updateStorybook();
    SWAY.value = S.time;
    if (S.shores) {
      S.shores.ripples.forEach((t, i) => t.offset.set((S.time * 0.015 + i * 0.3) % 1, (S.time * 0.01) % 1));
      S.shores.foam.forEach((f, i) => { f.material.opacity = 0.42 + Math.sin(S.time * 1.4 + i) * 0.16; });
    }
    updateLife(dt);
    if (S.flames) S.flames.forEach((f, i) => {
      const k = 1 + Math.sin(S.time * 11 + f.ph) * 0.12 + Math.sin(S.time * 17.3 + i) * 0.08;
      f.fl.scale.set(1, k, 1); if (f.gl) f.gl.material.opacity = f.gl.userData.baseOpacity * (0.85 + (k - 1) * 1.2);
    });
    if (S.clouds) S.clouds.forEach((c) => {                 // drift slowly round the sky
      const u = c.userData; u.ang += dt * u.spd;
      c.position.set(u.C0[0] + Math.cos(u.ang) * u.rad, u.y, u.C0[1] + Math.sin(u.ang) * u.rad); c.rotation.y = -u.ang;
    });
    if (S.skyGlows) S.skyGlows.forEach((g) => g.obj.position.set(S.camera.position.x + g.dir.x, S.camera.position.y * 0.2 + g.dir.y, S.camera.position.z + g.dir.z));
    if (S.fireflies) {
      const F = S.fireflies, a = F.mesh.geometry.attributes.position.array;
      F.base.forEach(([x, y, z, ph], i) => {
        a[i * 3] = x + Math.sin(S.time * 0.7 + ph) * 0.8;
        a[i * 3 + 1] = terrain(x, z) + y + Math.sin(S.time * 1.3 + ph) * 0.3;
        a[i * 3 + 2] = z + Math.cos(S.time * 0.6 + ph) * 0.8;
      });
      F.mesh.geometry.attributes.position.needsUpdate = true;
      F.mesh.material.opacity = 0.6 + Math.sin(S.time * 3) * 0.3;
    }
  }

  // ---- moving platforms ----
  function placeMover(m) {
    const o = m.o, pl = m.platform;
    pl.minX = m.pos.x - o.w / 2; pl.maxX = m.pos.x + o.w / 2;
    pl.minZ = m.pos.z - o.d / 2; pl.maxZ = m.pos.z + o.d / 2;
    pl.bottom = m.pos.y; pl.top = m.pos.y + o.h;
    m.mesh.position.set(m.pos.x, m.pos.y + o.h / 2, m.pos.z);
  }
  function updateMovers(dt) {
    for (const m of S.movers) {
      const o = m.o;
      const before = m.pos.clone();
      m.t += dt;
      if (typeof o.path === 'function') {
        const q = o.path(m.t); m.pos.set(q[0], q[1], q[2]);
      } else if (o.path.length > 1) {
        if (m.waitT > 0) m.waitT -= dt;
        else {
          const n = o.path.length;
          const a = o.path[m.seg];
          const nextI = o.loop ? (m.seg + 1) % n : m.seg + m.dir;
          const b = o.path[nextI];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 0.001;
          m.segT += ((o.speed || 3) * dt) / len;
          if (m.segT >= 1) {
            m.segT = 0; m.seg = nextI; m.waitT = o.wait === undefined ? 0.6 : o.wait;
            if (!o.loop && (m.seg === n - 1 || m.seg === 0)) m.dir = m.seg === 0 ? 1 : -1;
            m.pos.set(b[0], b[1], b[2]);
          } else m.pos.set(a[0] + (b[0] - a[0]) * m.segT, a[1] + (b[1] - a[1]) * m.segT, a[2] + (b[2] - a[2]) * m.segT);
        }
      }
      const dx = m.pos.x - before.x, dy = m.pos.y - before.y, dz = m.pos.z - before.z;
      // carry riders
      for (const p of S.players) {
        if (!p.joined || p.bubble || p.standingOn !== m.platform) continue;
        p.pos.x += dx; p.pos.y += dy; p.pos.z += dz;
        if (p.carrying) { p.carrying.pos.x += dx; p.carrying.pos.z += dz; }
      }
      placeMover(m);
    }
  }

  // ---- Belt of Truth: hidden paths appear while anyone on the team wears it ----
  function updateTruth() {
    if (!S.truthBoxes.length && !S.lieBoxes.length) return;
    const on = S.players.some((p) => p.joined && !p.bubble && p.armor.belt);
    if (on === S.truthOn) return;
    S.truthOn = on;
    S.truthBoxes.forEach((b) => {
      b.platform.on = on;
      b.mesh.material.opacity = on ? 0.95 : 0.15;
    });
    S.lieBoxes.forEach((b) => {
      b.mesh.material.opacity = on ? 0.25 : 1;
      b.mesh.material.color.setHex(on ? 0xef4444 : (b.color || 0x9c6b36));
      b.mesh.material.depthWrite = !on;
    });
    if (on) {
      Audio.sfx('fanfare');
      if (!S.truthAnnounced) { S.truthAnnounced = true; toast('🎗️ The Belt of Truth reveals the true path!', 3000); }
    }
  }

  // ---- story cards ----
  function showStory(pages, onDone, again) {
    if(S.homeInterior){S.homeInterior.stories.push({pages,onDone,again});return;}
    if(S.phase==='gameover')return;
    (pages || []).forEach((pg) => markShown(pg.ref));
    if (!pages || !pages.length) { if (onDone) onDone(); return; }
    if (!again) S.lastStory = pages;
    S.story = { pages, i: 0, onDone, prev: S.phase === 'story' ? 'play' : S.phase, age: 0, again: !!again, ready: {} };
    S.phase = 'story';
    renderStory();
    if (Audio.files.page) Audio.sfx('page');                         // the scroll unrolls (only with a recording)
    UI.story.classList.remove('hidden');
  }
  function bibleConnectionHTML(c) {
    if(!c)return '';
    return '<aside class="sq-bible-connection" style="text-align:left;margin:12px 0;padding:10px 12px;border-left:3px solid #b5894c;background:#fff6df;color:#3d2b18;font:16px/1.45 sans-serif"><b>Bible connection</b> · '+esc(c.passage)+'<div>'+esc(c.text)+'</div></aside>';
  }
  // Chapter bridges use narration with passage pointers, never quotation marks or new progress gates.
  const CHAPTER_BRIDGES = {
    '2-1': { title: 'The Promise Road', passage: 'Genesis 11:8–9; Genesis 12:1–3', text: 'After Babel, God called Abram to leave his country. God promised to bless all families of the earth through him.' },
    '3-1': { title: 'Let My People Go', passage: 'Genesis 50:24; Exodus 1:8–14; Exodus 2:1–10', text: 'Joseph’s family grew in Egypt. A later Pharaoh enslaved Israel. God had not forgotten His promise. Moses was born into this danger.' },
    '4-1': { title: 'Courage and Kindness', passage: 'Joshua 24:29; Judges 2:10–19; Ruth 1:1–5', text: 'After Joshua died, Israel often turned from God. In the days of the judges, Naomi’s family faced famine and loss. Ruth stayed with her.' },
    '5-1': { title: 'Voices of Faith', passage: '1 Kings 11:9–13; 1 Kings 12:20; 1 Kings 17:1–16', text: 'After Solomon, the kingdom divided. Many kings led people to worship idols. God sent prophets, including Elijah, to call them back.' },
    '6-1': { title: 'The Saviour Comes', passage: 'Nehemiah 6:15–16; Galatians 4:4–5; Luke 2:1–11', text: 'Jerusalem’s wall was rebuilt. Generations passed. At the time God chose, Jesus was born in Bethlehem—the promised Saviour had come.' },
    '7-1': { title: 'The Way of Love', passage: 'Matthew 14:22–33; Luke 10:25–37', text: 'Jesus taught and worked miracles. Now hear His parable about showing mercy. The road leads onward to His cross and resurrection.' },
    '8-1': { title: 'To the Ends of the Earth', passage: '1 Corinthians 15:3–4; Luke 24:39; Acts 1:8–11; Acts 2:1–11', text: 'Jesus died, was buried and rose bodily. He ascended to heaven and promised the Holy Spirit. At Pentecost, His followers began telling many nations.' }
  };
  function chapterBridgeHTML(b) {
    return b ? '<aside class="sq-chapter-bridge" style="text-align:left;margin:0 0 12px;padding:10px 12px;border-left:3px solid #688785;background:#e9f0e8;color:#283f3b;font:16px/1.45 sans-serif"><b>The story so far · '+esc(b.title)+'</b><div>'+esc(b.text)+'</div><small>'+esc(b.passage)+'</small></aside>' : '';
  }
  function renderStory() {
    const st = S.story, pg = st.pages[st.i];
    const body = pg.ref
      ? '<div class="sq-v" style="font-size:20px">“' + esc(pg.text) + '”</div><div class="sq-r">— ' + esc(pg.ref) + ' (KJV)</div>'
      : '<div class="sq-v" style="font-style:normal;font-size:19px">' + esc(pg.text) + '</div>';
    const entering = st.shownI !== st.i, turned = st.shownI !== undefined && entering; st.shownI = st.i;
    // Opt-in presentation only. Re-reading gets the same scene; ready-chip redraws do not restart it.
    if (entering && S.level.storyScene) S.level.storyScene(api, pg, st.again);
    if (st.spokenI !== st.i) { st.spokenI = st.i; if (Speech.on()) speakPage(pg); S.stats.pages++; S.stats.chars += ((pg.title || '') + (pg.text || '') + (pg.connection ? pg.connection.text : '') + (pg.bridge ? pg.bridge.text : '')).length; S.stats.cards.push(pg.ref || pg.title || (pg.text || '').slice(0, 30)); }
    UI.story.classList.toggle('sq-scene-reading',!!(pg.scene&&S.level.storyScene));
    UI.story.innerHTML = '<div class="sq-scroll' + (turned ? ' sq-turn' : '') + '" style="max-width:640px">' +
      chapterBridgeHTML(pg.bridge) + (pg.art ? '<div style="font-size:64px;line-height:1.2">' + pg.art + '</div>' : '') +
      (pg.title ? '<div class="sq-h">' + esc(pg.title) + '</div>' : '') + body + bibleConnectionHTML(pg.connection) +
      '<div style="margin-top:12px"><button class="sq-big" data-act="next">' + (st.i < st.pages.length - 1 ? 'Next ▶' : 'Continue ▶') +
      '</button><button class="sq-big sq-say" data-act="speak" title="Read it to me (RT / Q)">🔊</button></div>' + readyChips() + '<div class="sq-tag" style="margin-top:6px">' + (st.again ? 'Reading again • ' : '') + (st.i + 1) + ' / ' + st.pages.length +
      ({ all: ' • everyone press A / Space when you have read it', p1: ' • Player 1 turns the page', any: ' • Space / A' })[readerMode()] + '</div><div class="sq-readbar"><div></div></div></div>';
    updateReadBar();
  }
  // a short wait so the words get read (longer cards wait longer, never more than 3 seconds)
  function minRead(pg) { return Math.min(3, 0.6 + ((pg.text || '')+(pg.connection ? pg.connection.text : '') + (pg.bridge ? pg.bridge.text : '')).length * 0.012); }
  function updateReadBar() {
    const st = S.story; if (!st) return;
    const bar = UI.story.querySelector('.sq-readbar > div'); if (!bar) return;
    const k = Math.min(1, st.age / minRead(st.pages[st.i]));
    bar.style.width = (k * 100) + '%';
  }
  function readyChips() {
    if (readerMode() !== 'all') return '';
    const st = S.story, ps = S.players.filter((p) => p.joined);
    if (ps.length < 2) return '';
    return '<div class="sq-chips">' + ps.map((p) => {
      if (!present(p)) return '<span class="sq-chip" style="border-color:#a8a29e;color:#78716c">P' + (p.slot + 1) + ' 🔌 skipped</span>';
      const r = st.ready[p.slot];
      return '<span class="sq-chip" style="border-color:' + p.role.css + ';' + (r ? 'background:' + p.role.css + ';color:#fff' : 'color:' + p.role.css) + '">P' + (p.slot + 1) + (r ? ' ✓' : ' …') + '</span>';
    }).join('') + '</div>';
  }
  // a mouse click counts as Player 1 pressing: same reading delay, same "everyone ready" rule
  function storyClick() {
    const st = S.story;
    if (!st || S.phase !== 'story') return;
    if (readerMode() !== 'all') { nextStory(); return; }
    if (st.age < Math.max(0.4, minRead(st.pages[st.i]))) return;
    const p1 = S.players[0];
    if (!st.ready[p1.slot]) { st.ready[p1.slot] = true; Audio.sfx('pickup'); }
    if (S.players.filter(present).every((p) => st.ready[p.slot])) nextStory(true); else renderStory();
  }
  function nextStory(force) {
    const st = S.story;
    if (!st) return;
    if (!force && st.age < Math.max(0.4, minRead(st.pages[st.i]))) return;   // a moment to read before the page can turn
    Audio.sfx('pickup');
    st.i++; st.age = 0; st.ready = {}; Audio.sfx('page');
    if (st.i < st.pages.length) { renderStory(); return; }
    UI.story.classList.add('hidden');
    Speech.stop();
    S.phase = st.prev;
    S.story = null;
    if (S.level.storyScene) S.level.storyScene(api, null, st.again);
    if (st.onDone) st.onDone();
  }

  function spawnPuff(x, y, z, color, n) {
    for (let i = 0; i < (n || 5); i++) {
      let pt = S.particles.find((q) => q.life <= 0);
      if (!pt) {
        if (S.particles.length > 120) return;
        pt = { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true })), life: 0, v: new THREE.Vector3() };
        S.scene.add(pt.mesh); S.particles.push(pt);
      }
      pt.mesh.material.color.setHex(color || 0xffffff);
      pt.mesh.position.set(x, y + 0.2, z);
      pt.v.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      pt.life = 0.6; pt.mesh.visible = true;
    }
  }
  function updateParticles(dt) {
    for (const pt of S.particles) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      pt.v.y -= 9 * dt;
      pt.mesh.position.addScaledVector(pt.v, dt);
      pt.mesh.material.opacity = Math.max(0, pt.life / 0.6);
      if (pt.life <= 0) pt.mesh.visible = false;
    }
  }

  function setRain(on) {
    if (on && !S.rain) {
      const n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      S.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.25, transparent: true, opacity: 0.8 }));
      S.scene.add(S.rain);
    } else if (!on && S.rain) { S.scene.remove(S.rain); S.rain = null; }
  }
  function updateRain(dt) {
    if (!S.rain) return;
    const c = S.camTarget || new THREE.Vector3();
    S.rain.position.set(c.x, 0, c.z);
    const a = S.rain.geometry.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) { a[i] -= dt * 30; if (a[i] < c.y - 5) a[i] = c.y + 35; }
    S.rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---- Wet weather and footprints. In the rain the ground darkens and puddles gather near the players,
  //      shining and rippling with drops; it all dries again when the rain stops. Feet leave prints in sand
  //      (and in soft wet ground) that fade after a few seconds. Two shared pieces each: nearly free. ----
  let vseed = 7; function vrand() { vseed = (vseed * 16807) % 2147483647; return vseed / 2147483647; }   // looks only: game randomness stays untouched
  const WET = { k: 0, c0: null };
  const PRINTS_N = 96;
  function footprint(p) {                                        // one print every stride (about 0.7 m)
    if (p.printAt && Math.hypot(p.pos.x - p.printAt.x, p.pos.z - p.printAt.z) < 0.7) return;
    p.printAt = { x: p.pos.x, z: p.pos.z };
    if (S.level.footprints === false || p.standingOn || p.carriedBy) return;
    const surface = surfaceAt(p);
    if (surface !== 'sand' && !(surface === 'grass' && WET.k > 0.5)) return;
    if (!S.prints) {
      const geo = new THREE.CircleGeometry(1, 10); geo.rotateX(-Math.PI / 2); geo.scale(0.11, 1, 0.19);
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a2a14, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), PRINTS_N);
      m.frustumCulled = false; m.renderOrder = 1; m.count = PRINTS_N;
      const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < PRINTS_N; i++) m.setMatrixAt(i, z);
      S.scene.add(m); S.prints = { mesh: m, list: [], next: 0 };
    }
    p.stepSide = -(p.stepSide || 1);
    const sd = p.stepSide * 0.17, x = p.pos.x + Math.cos(p.facing) * sd, z = p.pos.z - Math.sin(p.facing) * sd;
    const y = groundAt(x, z, p.pos.y + 0.5);
    if (Math.abs(y - p.pos.y) > 0.3) return;
    const P = S.prints, i = P.next; P.next = (P.next + 1) % PRINTS_N;
    const hx = groundAt(x + 0.3, z, y + 0.5) - groundAt(x - 0.3, z, y + 0.5), hz = groundAt(x, z + 0.3, y + 0.5) - groundAt(x, z - 0.3, y + 0.5);
    const up = new THREE.Vector3(-hx / 0.6, 1, -hz / 0.6).normalize();                     // lies flat on a slope too
    const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.facing));
    P.list[i] = { x, y: y + 0.03, z, q: qn, t: 0 };
  }
  function updatePrints(dt) {
    const P = S.prints; if (!P) return;
    const M = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let changed = false;
    P.list.forEach((f, i) => {
      if (!f || f.gone) return;
      f.t += dt; const life = 5, k = f.t < life - 1.5 ? 1 : Math.max(0, (life - f.t) / 1.5);
      if (k <= 0) f.gone = true;
      if (k === f.k) return;
      f.k = k; changed = true;
      M.compose(v.set(f.x, f.y, f.z), f.q, sc.set(k, 1, k)); P.mesh.setMatrixAt(i, M);
    });
    if (changed) P.mesh.instanceMatrix.needsUpdate = true;
  }
  SQ._prints = () => (S.prints ? S.prints.list.filter((f) => f && !f.gone).length : 0);
  function makePuddles() {
    const c = S.camTarget || new THREE.Vector3(), spots = [];
    const dry = (x, z) => {
      const t = terrain(x, z);
      if (Math.abs(groundAt(x, z, t + 3) - t) > 0.05) return false;                         // (under a roof or on a deck: no)
      if (Math.abs(terrain(x + 1, z) - terrain(x - 1, z)) + Math.abs(terrain(x, z + 1) - terrain(x, z - 1)) > 0.25) return false;   // flat ground only
      if (S.waterMesh && t < S.waterMesh.position.y + 0.3) return false;
      for (const w of S.waters || []) if (x > w.minX - 1 && x < w.maxX + 1 && z > w.minZ - 1 && z < w.maxZ + 1) return false;
      return true;
    };
    for (let k = 0; k < 60 && spots.length < 10; k++) {
      const a = k * 2.399, r = 3 + (k % 7) * 2.4, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (dry(x, z) && spots.every((p) => Math.hypot(p[0] - x, p[1] - z) > 3)) spots.push([x, z, 0.7 + (k % 3) * 0.35]);
    }
    if (!spots.length) return null;
    const parts = spots.map(([x, z, r]) => { const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.7); g.rotateY((x * 7) % 3); g.translate(x, terrain(x, z) + 0.03, z); return g.toNonIndexed ? g.toNonIndexed() : g; });
    const P = [], N = []; parts.forEach((g) => { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x6b7f96, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.renderOrder = 1; S.scene.add(mesh);
    const rg = new THREE.RingGeometry(0.8, 1, 20); rg.rotateX(-Math.PI / 2);
    const rings = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0, depthWrite: false }), 20);
    rings.frustumCulled = false; rings.renderOrder = 2; S.scene.add(rings);
    return { mesh, rings, spots, drops: Array.from({ length: 20 }, (_, i) => ({ s: i % spots.length, t: (i * 0.137) % 1, dx: 0, dz: 0 })) };
  }
  function updateWeather(dt) {
    updatePrints(dt);
    const want = S.rain ? 1 : 0;
    if (want === WET.k && !WET.k) return;
    WET.k += Math.sign(want - WET.k) * Math.min(Math.abs(want - WET.k), dt / 5);       // wets over five seconds, dries the same
    const gm = S.groundMesh;
    if (gm) { if (!WET.c0) WET.c0 = gm.material.color.clone(); gm.material.color.copy(WET.c0).multiplyScalar(1 - 0.28 * WET.k); }
    if (WET.k > 0 && !S.puddles) S.puddles = makePuddles() || { none: true };
    const Pd = S.puddles; if (!Pd || Pd.none) return;
    Pd.mesh.material.opacity = 0.5 * WET.k; Pd.rings.material.opacity = 0.55 * WET.k;
    Pd.mesh.visible = Pd.rings.visible = WET.k > 0;
    const M = new THREE.Matrix4();
    Pd.drops.forEach((d, i) => {                                // drops land and ripple out across the puddles
      d.t += dt * 1.1;
      if (d.t >= 1) { d.t -= 1; d.s = Math.floor(vrand() * Pd.spots.length); const r = Pd.spots[d.s][2] * 0.6; d.dx = (vrand() - 0.5) * r; d.dz = (vrand() - 0.5) * r * 0.7; }
      const [x, z, r] = Pd.spots[d.s], k = d.t * Math.min(0.45, r * 0.35) * (S.rain ? 1 : 0);
      M.makeScale(k, 1, k); M.setPosition(x + d.dx, terrain(x, z) + 0.045, z + d.dz); Pd.rings.setMatrixAt(i, M);
    });
    Pd.rings.instanceMatrix.needsUpdate = true;
  }
  SQ._wet = () => WET.k;

  function buildBeacon() {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), mat(0xfacc15, { emissive: 0x8a6d00 }));
    cone.rotation.x = Math.PI; g.add(cone);
    addGlow(g, 0xfacc15, 2.6, 0.45);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.2, depthWrite: false }));
    beam.position.y = 5.3; g.add(beam);
    g.visible = false;
    S.scene.add(g);
    S.beacon = g;
  }
  function updateBeacon(dt) {
    S.objectiveTimer -= dt;
    if(S.hint&&S.hint.route&&S.hint.getRoute){const next=S.hint.getRoute(api);if(next&&next.at)S.hint.at=next.at.slice();}
    if (S.hint) { S.hint.t -= dt; const h = S.hint.at, f = !S.hint.route&&S.fragments.concat(S.leaves).find((q) => Math.abs(q.x - h[0]) < 0.01 && Math.abs(q.z - h[2]) < 0.01); if (S.hint.t <= 0 || (f && f.got)) { S.hint = null; S.objectiveTimer = 0; } }
    if (S.objectiveTimer <= 0) {
      S.objectiveTimer = 0.4;
      const L = S.level;
      let o = null;
      if (S.finaleStarted && S.finishMarker) o = [S.finishMarker.x, S.finishMarker.y + 1, S.finishMarker.z];
      else if (S.finaleStarted && L.finale && L.finale.beacon) o = L.finale.beacon;
      else if (L.objective) o = L.objective(api);
      if (S.hint && S.hint.t > 0 && !S.finaleStarted) o = S.hint.at;
      S.objective = o;
    }
    if(S.finaleStarted&&S.finishMarker&&S.finishMarker.guideHidden){S.beacon.visible=false;return;}
    if (S.objective) {
      S.beacon.visible = true;
      S.beacon.position.set(S.objective[0], S.objective[1] + 3 + Math.sin(S.time * 3) * 0.3, S.objective[2]);
      S.beacon.rotation.y += dt * 2;
      const cd = S.camera ? S.camera.position.distanceTo(S.beacon.position) : 30;     // close to the camera it shrinks (never a giant pyramid)
      S.beacon.scale.setScalar(Math.max(0.35, Math.min(1, (cd - 5) / 22)));
    } else S.beacon.visible = false;
  }

  /* -------------------------------------------------------------------
   * 12. CAMERA, LABELS, LIGHT
   * ----------------------------------------------------------------- */
  // Controls follow the camera: when a camera zone swings the view round to the side, "up" on the stick
  // still means "away from the camera" with camera-relative movement. With the usual camera behind the players, nothing changes.
  function camYaw() {
    if (!S.camera || !S.camTarget) return 0;
    const dx = S.camera.position.x - S.camTarget.x, dz = S.camera.position.z - S.camTarget.z;
    return Math.hypot(dx, dz) < 0.5 ? 0 : Math.atan2(dx, dz);
  }
  function camRelative(inp, yaw) {
    if (Math.abs(yaw) < 0.05 || (!inp.mx && !inp.mz) || window.SQ_WORLD_CONTROLS || inp.world) return;   // (tests that steer by map directions turn it off)
    const c = Math.cos(yaw), s = Math.sin(yaw), x = inp.mx, z = inp.mz;
    inp.mx = x * c + z * s; inp.mz = -x * s + z * c;
  }
  SQ._camRelative = camRelative;

  // One shared view: Player 1's connected gamepad, otherwise the first joined connected gamepad.
  // Sticks on unjoined/disconnected pads and other teammates cannot fight the camera owner.
  function cameraInput(inputs,dt) {
    const owner=S.players.find(p=>p.joined&&present(p)&&p.device&&p.device.indexOf('gp')===0)||S.players.find(p=>p.joined&&present(p)&&p.device==='vpt');
    S.cameraOwner=owner?owner.slot:null;
    S.camSteerT=Math.max(0,(S.camSteerT||0)-dt);
    if(!owner)return;
    const i=inputs[owner.slot];if(!i)return;
    if(i.cameraReset){S.camOrbitYaw=0;S.camOrbitPitch=0;S.camSteerT=.7;}
    else if(i.cameraX||i.cameraY){
      S.camOrbitYaw=((S.camOrbitYaw||0)-i.cameraX*dt*1.8+Math.PI*3)%(Math.PI*2)-Math.PI;
      S.camOrbitPitch=Math.max(-.3,Math.min(.55,(S.camOrbitPitch||0)+i.cameraY*dt*.8));
      S.camSteerT=.7;
    }
  }

  function updateCamera(dt, snap) {
    const act = S.players.filter((p) => p.joined && !p.bubble);
    const list = act.length ? act : S.players.filter((p) => p.joined);
    if (!list.length) return;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, sy = 0;
    list.forEach((p) => { minX = Math.min(minX, p.pos.x); maxX = Math.max(maxX, p.pos.x); minZ = Math.min(minZ, p.pos.z); maxZ = Math.max(maxZ, p.pos.z); sy += p.pos.y; });
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cy = sy / list.length;
    const spread = Math.max(maxX - minX, (maxZ - minZ) * 1.3);
    const zoom = Math.min(16, Math.max(0, spread - 6) * 0.75);      // the camera never zooms out too far
    if (!S.camTarget) S.camTarget = new THREE.Vector3(cx, cy, cz);
    const k = snap ? 1 : Math.min(1, dt * 4);
    // look ahead: lean the view a little toward the next goal, so what's coming is on screen (never backwards)
    let ax = 0, az = 0;
    if (S.objective && S.phase === 'play') { ax = Math.max(-3, Math.min(3, (S.objective[0] - cx) * 0.15)); az = Math.max(-3.5, Math.min(0, (S.objective[2] - cz) * 0.15)); }
    // camera zones (api.camZone): a framed view for a tricky stretch, blended in and out smoothly
    // a zone starts when the group's centre is in it, or when the player leading toward the goal reaches it
    // (so the one who runs ahead gets the framed view in time; a stray player off to the side does not)
    const inZ = (z, x, q) => x > z.minX && x < z.maxX && q > z.minZ && q < z.maxZ;
    let lead = null;
    if (S.objective && list.length > 1) lead = list.reduce((a, p) => (Math.hypot(p.pos.x - S.objective[0], p.pos.z - S.objective[2]) < Math.hypot(a.pos.x - S.objective[0], a.pos.z - S.objective[2]) ? p : a));
    const zone = (S.camZones || []).find((z) => inZ(z, cx, cz)) || (lead && (S.camZones || []).find((z) => inZ(z, lead.pos.x, lead.pos.z))) || null;
    if (zone) S.camZoneCur = zone;
    S.camZoneW = snap ? (zone ? 1 : 0) : (S.camZoneW || 0) + ((zone ? 1 : 0) - (S.camZoneW || 0)) * Math.min(1, dt * 2.2);
    const Z = S.camZoneCur, w = Z ? S.camZoneW : 0;
    let fx = cx + ax, fz = cz + az, fy = cy;
    if (Z && Z.focus) { const pull = Z.pull === undefined ? 0.4 : Z.pull; fx += (Z.focus[0] - fx) * pull * w; fz += (Z.focus[2] - fz) * pull * w; fy += ((Z.focus[1] === undefined ? fy : Z.focus[1]) - fy) * pull * w * 0.5; }
    S.camTarget.x += (fx - S.camTarget.x) * k;
    S.camTarget.y += (fy - S.camTarget.y) * k;
    S.camTarget.z += (fz - S.camTarget.z) * k;
    const intro = S.introCam > 0 ? S.introCam * S.introCam : 0;          // starts high and wide, swoops in
    let offX = 0, offY = 11 + zoom * 0.75, offZ = 15 + zoom;
    if (w > 0.001) {                                                       // the zone's angle: from the side (yaw), lower or higher, nearer or farther
      const back = (Z.back || 13) + zoom * 0.8, yaw = Z.yaw || 0;
      offX += (Math.sin(yaw) * back - offX) * w; offY += ((Z.height || 10) + zoom * 0.6 - offY) * w; offZ += (Math.cos(yaw) * back - offZ) * w;
    }
    if (S.camOrbitYaw || S.camOrbitPitch) {
      const radius=Math.hypot(offX,offY,offZ),yaw=Math.atan2(offX,offZ)+(S.camOrbitYaw||0);
      const pitch=Math.max(.32,Math.min(1.12,Math.atan2(offY,Math.hypot(offX,offZ))+(S.camOrbitPitch||0)));
      const horizontal=radius*Math.cos(pitch);offX=Math.sin(yaw)*horizontal;offZ=Math.cos(yaw)*horizontal;offY=radius*Math.sin(pitch);
    }
    const want = new THREE.Vector3(S.camTarget.x + offX, S.camTarget.y + offY + intro * 14, S.camTarget.z + offZ + intro * 12);
    if (S.introCam > 0 && S.phase === 'play') S.introCam = Math.max(0, S.introCam - dt / 1.6);
    // Fit head/feet for every teammate, including the operator below a raised lift.
    // Dolly along the chosen view; never rotate away from a deliberate right-stick orbit.
    const look=new THREE.Vector3(S.camTarget.x-offX/(Math.hypot(offX,offZ)||1)*2,S.camTarget.y+1.5,S.camTarget.z-offZ/(Math.hypot(offX,offZ)||1)*2);
    if(list.length>1||S.camera.aspect<1.25){
      const outward=want.clone().sub(look).normalize(),right=new THREE.Vector3(outward.z,0,-outward.x).normalize(),up=new THREE.Vector3().crossVectors(outward,right);
      const tan=Math.tan(S.camera.fov*Math.PI/360),aspect=Math.max(.35,S.camera.aspect||1),base=want.distanceTo(look);let fit=base;
      for(const p of list)for(const dy of [.1,2.8]){
        const d=new THREE.Vector3(p.pos.x-look.x,p.pos.y+dy-look.y,p.pos.z-look.z),depth=d.dot(outward);
        fit=Math.max(fit,Math.abs(d.dot(right))/(tan*aspect*.80)+depth+1.2,Math.abs(d.dot(up))/(tan*.72)+depth+1.2);
      }
      fit=Math.min(78,fit);S.camFitDistance=snap?fit:(S.camFitDistance===undefined?base:S.camFitDistance)+(fit-(S.camFitDistance===undefined?base:S.camFitDistance))*Math.min(1,dt*(fit>(S.camFitDistance||base)?7:1.8));
      want.copy(look).addScaledVector(outward,Math.max(base,S.camFitDistance));
    }else S.camFitDistance=undefined;
    // never let a hill come between the camera and the players: lift the camera until the view line clears the ground
    const ty = S.camTarget.y + 1.5;
    let need = want.y;
    for (let s = 0.15; s <= 1.001; s += 0.085) {
      const h = terrain(S.camTarget.x + (want.x - S.camTarget.x) * s, S.camTarget.z + (want.z - S.camTarget.z) * s) + 1.2;
      need = Math.max(need, ty + (h - ty) / s);
    }
    want.y = Math.max(want.y,Math.min(need, S.camTarget.y + 45));
    if (snap) S.camera.position.copy(want); else S.camera.position.lerp(want, k);
    { const hl = Math.hypot(offX, offZ) || 1; S.camera.lookAt(S.camTarget.x - offX / hl * 2, S.camTarget.y + 1.5, S.camTarget.z - offZ / hl * 2); }
    // keep sun shadows around the action
    S.sun.position.set(S.camTarget.x + 30, S.camTarget.y + 60, S.camTarget.z + 25);
    S.sun.target.position.set(S.camTarget.x, S.camTarget.y, S.camTarget.z);
    S.sun.target.updateMatrixWorld();

    // regroup: players split into groups that are too far apart (even two pairs) -> the groups behind
    // float to the group with whoever is furthest ahead (closest to the next goal). No penalty.
    if (act.length > 1 && S.phase === 'play') {
      const groups = [];
      act.forEach((p) => {
        const near = groups.filter((gr) => gr.some((q) => q.pos.distanceTo(p.pos) <= T.regroupDist));
        const merged = [p].concat(...near);
        near.forEach((gr) => groups.splice(groups.indexOf(gr), 1));
        groups.push(merged);
      });
      if (groups.length > 1) {
        const lead = aheadPlayer(null);                     // the group with whoever is furthest ahead stays put
        const main = groups.find((gr) => gr.indexOf(lead) >= 0) || groups[0];
        groups.splice(groups.indexOf(main), 1); groups.unshift(main);
        groups.slice(1).forEach((gr) => gr.forEach((p) => {
          if (p.carriedBy) return;
          const to = main.reduce((m, q) => (q.pos.distanceTo(p.pos) < m.pos.distanceTo(p.pos) ? q : m), main[0]);
          enterBubble(p, false, 'P' + (p.slot + 1) + ' floats back to the group 🫧');
          if (p.bubble) p.bubble.to = to;
        }));
      }
    }
  }
  // is the straight line from a to b blocked by the ground or a solid block?
  function lineBlocked(ax, ay, az, bx, by, bz) {
    for (let k = 1; k < 18; k++) {
      const t = k / 18, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (terrain(x, z) > y + 0.2) return true;
      for (const pl of S.platforms) {
        if (!pl.on || pl.top - pl.bottom < 1.2) continue;               // thin floors and steps do not hide anyone
        if (x > pl.minX && x < pl.maxX && z > pl.minZ && z < pl.maxZ && y > pl.bottom && y < pl.top) return true;
      }
    }
    return false;
  }
  // a player hidden behind a wall or hill shows as a coloured silhouette (drawn on top)
  function updateGhosts() {
    const c = S.camera.position;
    S.players.forEach((p) => {
      if (!p.joined || !p.mesh.visible) return;
      if (!p.ghost) p.ghost = p.mesh.getObjectByName('ghost');
      if (!p.ghost) return;
      const hid = lineBlocked(c.x, c.y, c.z, p.pos.x, p.pos.y + 1.1, p.pos.z) && lineBlocked(c.x, c.y, c.z, p.pos.x, p.pos.y + 1.9, p.pos.z);
      p.ghost.visible = hid;
    });
  }
  // fade any tree that hides a player from the camera
  const _seg = new THREE.Vector3(), _pt = new THREE.Vector3();
  function updateFade(dt) {
    const cam = S.camera.position;
    const ps = S.players.filter((p) => p.joined);
    for (const f of S.fadeables) {
      let block = false;
      for (const p of ps) {
        _seg.set(p.pos.x - cam.x, p.pos.y + 0.5 - cam.y, p.pos.z - cam.z);
        const len2 = _seg.lengthSq();
        _pt.set(f.x - cam.x, f.y - cam.y, f.z - cam.z);
        const t = Math.max(0, Math.min(1, _pt.dot(_seg) / len2));
        if (t > 0.05 && t < 0.97 && _pt.sub(_seg.multiplyScalar(t)).length() < f.r + 1.5) { block = true; break; }   // +1.5: keep the space around the player clear too
      }
      const want = block ? 0.25 : 1;
      if (Math.abs(f.a - want) < 0.01) continue;
      f.a += (want - f.a) * Math.min(1, dt * 8 || 1);
      f.obj.traverse((m) => {
        if (!m.isMesh) return;
        if (!m.userData.ownMat) { m.material = m.material.clone(); if(m.material.userData.surface) registerSurface(m.material,m.material.userData.surface); m.material.transparent = true; m.userData.ownMat = true; }
        m.material.opacity = f.a;
        m.material.depthWrite = f.a > 0.95;
      });
    }
  }
  function updateLabels() {
    const w = window.innerWidth / 2, h = window.innerHeight / 2;
    const v = new THREE.Vector3();
    const placed = [],edgePlaced=[],coop=api.players().length>1;
    S.players.forEach((p) => {
      if(p.edge)p.edge.hidden=true;
      if (!p.joined) return;
      v.set(p.pos.x, p.pos.y + 2.9, p.pos.z).project(S.camera);
      if(p.edge&&coop&&S.phase==='play'&&!S.homeInterior&&(v.z>1||Math.abs(v.x)>.90||Math.abs(v.y)>.88)){
        const flip=v.z>1?-1:1,dx=v.x*flip,dy=-v.y*flip,angle=Math.atan2(dy,dx),dirs=['→','↘','↓','↙','←','↖','↑','↗'];
        let x=Math.max(40,Math.min(window.innerWidth-40,w+dx*w)),y=Math.max(40,Math.min(window.innerHeight-85,h+dy*h));
        const hud=UI.hud.getBoundingClientRect();if(x<hud.right+40&&y<hud.bottom+22)y=hud.bottom+26;
        y=Math.min(window.innerHeight-85,y);for(const a of edgePlaced)if(Math.abs(a[0]-x)<85&&Math.abs(a[1]-y)<30)y=Math.max(32,y-32);
        edgePlaced.push([x,y]);p.edge.hidden=false;p.edge.style.left=x+'px';p.edge.style.top=y+'px';p.edge.style.setProperty('--player-color',p.role.css);
        p.edge.textContent='P'+(p.slot+1)+' '+dirs[(Math.round(angle/(Math.PI/4))+8)%8];p.edge.setAttribute('aria-label','Player '+(p.slot+1)+' near the screen edge');
        p.label.style.display='none';p.targetRing.visible=false;p.destRing.visible=false;return;
      }
      if (v.z > 1) { p.label.style.display = 'none'; p.targetRing.visible = false; p.destRing.visible = false; return; }
      p.label.style.display = '';
      updatePrompt(p);
      const bounds=p.label.getBoundingClientRect(),side=Math.min(bounds.width||140,window.innerWidth-12)/2+6;
      const x=Math.max(side,Math.min(window.innerWidth-side,v.x*w+w));
      let y = -v.y * h + h;
      const height=bounds.height || 22+(p.labelAct.style.display!=='none'&&p.promptStr ? p.promptStr.split('\n').length*16 : 0);
      for (let k=0;k<placed.length;k++) { // Keep nearby player names apart.
        const [px,py,ph]=placed[k];
        if(Math.abs(px-x)<140 && y>py-ph-6 && y-height<py+6){y=py-ph-6;k=-1;}
      }
      placed.push([x,y,height]);
      p.label.style.left = x + 'px';
      p.label.style.top = y + 'px';
    });
  }

  /* -------------------------------------------------------------------
   * 13. FINALE, RESULTS & QUIZ
   * ----------------------------------------------------------------- */
  function allTasksDone() {
    return (S.level.tasks || []).every((t) => taskComplete(t.id));
  }
  function updateFinale(dt) {
    const L = S.level;
    const F = L.finale || {};
    updateFinishMarker();
    if (!S.finaleStarted) {
      const done = L.isComplete ? L.isComplete(api) : allTasksDone();
      if (!done) return;
      S.finaleStarted = true;
      if (!L.solemn) Audio.sfx('win');
      if (F.message) toast(F.message, 5000);
      if (F.onStart) F.onStart(api);
      if (!F.inZone) { S.finaleDone = true; setTimeout(party, 200); }
      return;
    }
    if (S.finaleDone) return;
    const ps = api.players();
    const allIn = ps.length > 0 && ps.every((p) => !p.bubble && F.inZone(p));
    if (!allIn && !S.finaleT) return;
    S.finaleT += dt;
    const finished = F.onUpdate ? F.onUpdate(api, S.finaleT) : S.finaleT > 1.5;
    if (finished) { S.finaleDone = true; setTimeout(party, 200); }
  }

  // the end of every level: a short, happy team celebration (confetti, everyone hops), then the results
  function party() {
    if (S.phase === 'results'||S.phase==='gameover') return;
    if (S.level.solemn) { showResults(); return; }
    if(!S.partyN){S.finishTime=S.runTime||0;S.partyStart=S.time;S.phase='celebrate';}
    S.partyN = (S.partyN || 0) + 1;
    if (S.partyN === 1) { Audio.sfx('fanfare'); toast('🎉 Well done, team!', 2000); }
    if (S.partyN > 3) { showResults(); return; }
    const palettes={rooftop:[0xf6ce77,0x6cb6b2,0xf5e0b7],harvest:[0xe9bf54,0x9cb976,0xf3df9b],welcome:[0x66afb2,0xf2d1a0,0xe7ad88],temple:[0xf7d36d,0xe9e9d8,0x98c5dc]};
    const cols=palettes[S.level.finishTheme]||[0xf43f5e,0xfacc15,0x22c55e,0x3b82f6,0xa855f7,0xfb923c];
    api.players().forEach((p, k) => {
      if (p.onGround && !p.bubble) p.vel.y = 9;                            // a happy jump
      spawnPuff(p.pos.x, p.pos.y + 2.4, p.pos.z, cols[(S.partyN + k) % cols.length], 7);
    });
    setTimeout(party, S.partyN < 3 ? 350 : 250);
  }

  let quizState = null;
  // ⭐ finished  ⭐ all scroll fragments  ⭐ the Golden Scroll
  function starsEarned() {
    return [true, S.fragments.length > 0 && S.fragCount >= S.fragments.length, !!(S.gold && S.goldGot)];
  }
  function starsHTML() {
    const st = starsEarned(), names = ['Finished', 'All ' + S.fragments.length + ' scroll fragments', S.gold ? 'Golden Scroll' : 'No Golden Scroll here'];
    return '<div class="sq-stars">' + st.map((on, i) => '<span class="sq-star' + (on ? ' on' : '') + '" title="' + names[i] + '">' + (on ? '⭐' : '☆') + '<small>' + names[i] + '</small></span>').join('') + '</div>';
  }
  function showResults() {
    if(S.phase==='gameover')return;
    const L = S.level;
    S.phase = 'results';
    saveLevelResult(L);
    if (!L.solemn) Audio.sfx('win');
    // team first: what we did together; each helper is thanked, nobody is crowned
    const ps = api.players().slice().sort((a, b) => a.slot - b.slot);
    const teamTowel = ps.reduce((t, p) => t + p.servant, 0);
    const tm = S.finishTime===undefined?(S.runTime||0):S.finishTime, prevBest = S.prevBestTime;
    const timeLine = '<div style="margin-top:4px">⏱️ Time: <b>' + fmtTime(tm) + '</b>' + (prevBest ? (tm < prevBest ? ' 🎉 new best! (was ' + fmtTime(prevBest) + ')' : ' (best ' + fmtTime(prevBest) + ')') : '') + '</div>';
    const done = (L.tasks || []).map((t) => '<div>' + (api.taskCount(t.id) >= t.total ? '✅ ' : '▫️ ') + t.icon + ' ' + esc(t.label) + ' <b>' + api.taskCount(t.id) + '/' + t.total + '</b></div>').join('');
    const extra = (S.team.rescues ? '<div>🫧 Friends rescued from bubbles: <b>' + S.team.rescues + '</b></div>' : '') +
      (S.team.shares ? '<div>🛡️ Armor shared with a friend: <b>' + S.team.shares + '</b></div>' : '');
    const helpers = ps.map((p) => '<span style="white-space:nowrap"><b style="color:' + p.role.css + '">P' + (p.slot + 1) + ' ' + p.role.name + '</b> ' + p.servant + '</span>').join(' · ');
    const found=(S.discoveries||[]).filter(d=>d.found);
    const discoveries=found.length?'<div>🔎 Discoveries: '+found.map(d=>esc(d.name)).join(' · ')+'</div>':'';
    const category=setting('records')==='1'&&!L.solemn&&!L.practice?'<div style="font-size:12px">Team record · '+Object.keys(S.lifeJoined||{}).length+(Object.keys(S.lifeJoined||{}).length===1?' player · ':' players · ')+(S.lifeMode==='practice'?'Practice':'Adventure')+'</div>':'';
    const scores = '<div style="font-size:17px;font-weight:bold">🤝 What we did together</div>' + done + extra + discoveries + category +
      '<div style="margin-top:6px">🧺 Team Servant\'s Towel: <b>' + teamTowel + '</b> points</div>' + timeLine +
      (ps.length > 1 ? '<div style="font-size:12px;margin-top:2px">Thank you, helpers! ' + helpers + '</div>' : '');
    const E = L.ending || {};
    const quiz = (L.quiz || []).map((q, qi) =>
      '<div class="sq-q">' + (qi + 1) + '. ' + esc(q.q) + (q.ref ? ' <span style="font-weight:normal;font-size:12px">(' + esc(q.ref) + ')</span>' : '') + '</div>' +
      q.options.map((o, oi) => '<button class="sq-opt" data-q="' + qi + '" data-o="' + oi + '">' + 'ABCD'[oi] + ') ' + esc(o) + '</button>').join('') +
      '<div class="sq-fb" id="sq-fb-' + qi + '"></div>').join('');
    UI.results.innerHTML = '<div class="sq-scroll">' +
      '<div class="sq-tag">' + esc(L.world) + (L.solemn ? ': remember' : ' complete!') + '</div>' +
      (E.verse ? '<div class="sq-h" style="font-size:22px">“' + esc(E.verse.text) + '”</div><div class="sq-r">— ' + esc(E.verse.ref) + ' (KJV)</div>' : '') +
      (E.message ? '<div class="sq-v">' + esc(E.message) + '</div>' : '') + bibleConnectionHTML(L.bibleConnection) +
      (L.solemn ? '' : starsHTML() +
      '<div class="sq-scores">' + scores +
      '<div style="font-size:12px;font-style:italic;margin-top:4px">“And whosoever of you will be the chiefest, shall be servant of all.” (Mark 10:44)</div>' +
      '<div style="margin-top:6px">' + (L.leafIcon || '🌿') + ' ' + S.leafCount + '/' + S.leaves.length + ' &nbsp; 📜 ' + S.fragCount + '/' + S.fragments.length + ' fragments</div></div>') +
      (quiz ? '<div style="font-weight:bold;font-size:17px;margin-top:10px">📜 Scroll Review</div>' + quiz : '') +
      '<div style="margin-top:12px"><button class="sq-big" data-act="next">'+(window.SQ_BUILD&&SQ_BUILD.edition==='demo'?'Demo menu':'Continue ▶')+'</button><button class="sq-big" data-act="again">Play again</button><button class="sq-big" data-act="menu">Menu</button></div></div>';
    UI.results.classList.remove('hidden');
    quizState = { q: 0, o: 0, answered: {} };
    focusQuiz();
    UI.results.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('sq-opt')) answerQuiz(+b.getAttribute('data-q'), +b.getAttribute('data-o'));
      else if (b.getAttribute('data-act') === 'again') { saveSetup(); leave(); }
      else if (b.getAttribute('data-act') === 'next') goNext();
      else if (b.getAttribute('data-act') === 'menu') goMenu();
    };
  }
  function focusQuiz() {
    const done = Object.keys(quizState.answered).length >= S.level.quiz.length;
    UI.results.querySelectorAll('.sq-opt').forEach((b) => {
      const on = !done && +b.getAttribute('data-q') === quizState.q && +b.getAttribute('data-o') === quizState.o;
      b.classList.toggle('focus', on);
      if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    const menuBtn = UI.results.querySelector('[data-act="next"]');
    if (menuBtn) {
      menuBtn.classList.toggle('sq-focus', done);
      if (done && menuBtn.scrollIntoView) menuBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  function answerQuiz(qi, oi) {
    const q = S.level.quiz[qi];
    UI.results.querySelectorAll('.sq-opt[data-q="' + qi + '"]').forEach((b) => {
      const o = +b.getAttribute('data-o');
      b.classList.remove('right', 'wrong');
      if (o === q.answer) b.classList.add('right');
      else if (o === oi) b.classList.add('wrong');
    });
    const fb = document.getElementById('sq-fb-' + qi);
    if (oi === q.answer) { fb.textContent = '✅ Correct! ' + (q.explain || ''); Audio.sfx('coin'); quizState.answered[qi] = true; if (qi < S.level.quiz.length - 1) { quizState.q = qi + 1; quizState.o = 0; } }
    else { fb.textContent = 'Not quite — look at ' + (q.ref || 'the verse') + ' again!'; Audio.sfx('error'); }
    focusQuiz();
  }
  function quizInput(inp) {
    if (!quizState || !S.level.quiz || !S.level.quiz.length) return;
    if (Object.keys(quizState.answered).length >= S.level.quiz.length) { if (inp.jumpP) goNext(); return; }
    const n = S.level.quiz[quizState.q].options.length;
    if (inp.up) { quizState.o = (quizState.o + n - 1) % n; focusQuiz(); }
    if (inp.down) { quizState.o = (quizState.o + 1) % n; focusQuiz(); }
    if (inp.jumpP) answerQuiz(quizState.q, quizState.o);
  }

  /* -------------------------------------------------------------------
   * 14. START / LOOP
   * ----------------------------------------------------------------- */
  function validateLevel(L) {
    const need = ['id', 'world', 'title', 'terrain', 'build'];
    const miss = need.filter((k) => L[k] === undefined);
    if (miss.length) throw new Error('LEVEL is missing: ' + miss.join(', '));
    (L.tasks || []).forEach((t) => {
      if (!t.id || !t.total) throw new Error('Every task needs an id and total: ' + JSON.stringify(t));
    });
    (L.quiz || []).forEach((q, i) => {
      if (!q.options || q.answer === undefined || q.answer >= q.options.length) throw new Error('Quiz question ' + (i + 1) + ' has a bad answer index');
    });
    if (L.time !== undefined && !TIMES[L.time]) throw new Error('LEVEL.time "' + L.time + '" is unknown. Use one of: ' + Object.keys(TIMES).join(', '));
  }

  // ---- saved progress (browser storage; the game works fine without it) ----
  const SAVE_KEY = window.SQSave ? SQSave.key : 'scrollquest.progress.v1';
  function persistProgress(all){return window.SQSave?SQSave.write(all):localStorage.setItem(SAVE_KEY,JSON.stringify(all));}
  // >>> ORDER
  // CAMPAIGN_ORDER: written by tools/gen-order (from the menu in index.html): [save id, page, menu label]
  const CAMPAIGN_ORDER = [["1-1", "world-1-1-eden.html", "1-1 · In the Beginning"], ["1-2", "world-1-2-orchard.html", "1-2 · The First Choice"], ["1-3", "world-1-3-ark.html", "1-3 · Two by Two"], ["1-4", "world-1-4-rainbow.html", "1-4 · The Rainbow Promise"], ["1-5", "world-1-5-babel.html", "1-5 · The Tower of Babel"], ["2-1", "world-2-1-stars.html", "2-1 · Beneath a Thousand Stars"], ["2-4", "world-2-4-moriah.html", "2-2 · The LORD Will Provide"], ["2-2", "world-2-2-well.html", "2-3 · Water at the Well"], ["2-3", "world-2-3-bethel.html", "2-4 · The Dream at Bethel"], ["2-5", "world-2-5-storehouses.html", "2-5 · Joseph's Storehouses"], ["2-6", "world-2-6-forgiveness.html", "2-6 · The Road to Forgiveness"], ["3-1", "world-3-1-reeds.html", "3-1 · Among the Reeds"], ["3-2", "world-3-2-bush.html", "3-2 · The Burning Bush"], ["3-9", "world-3-9-plagues.html", "3-3 · Let My People Go"], ["3-3", "world-3-3-passover.html", "3-4 · The Passover"], ["3-4", "world-3-4-sea.html", "3-5 · Through the Sea"], ["3-5", "world-3-5-manna.html", "3-6 · Bread in the Wilderness"], ["3-6", "world-3-6-sinai.html", "3-7 · At Mount Sinai"], ["3-7", "world-3-7-tabernacle.html", "3-8 · A Place to Meet God"], ["3-8", "world-3-8-jericho.html", "3-9 · The Walls Fall Down"], ["4-1", "world-4-1-ruth.html", "4-1 · Ruth's Harvest"], ["4-2", "world-4-2-samuel.html", "4-2 · Speak, LORD"], ["4-3", "world-4-3-hills.html", "4-3 · The Shepherd's Hills"], ["4-4", "world-4-4-cave.html", "4-4 · Mercy in the Cave"], ["4-5", "world-4-5-abigail.html", "4-5 · Abigail's Peace Mission"], ["4-6", "world-4-6-temple.html", "4-6 · A House for Worship"], ["5-1", "world-5-1-last-meal.html", "5-1 · The Last Little Meal"], ["5-2", "world-5-2-still-voice.html", "5-2 · The Still Small Voice"], ["5-3", "world-5-3-jonah.html", "5-3 · Jonah's Second Chance"], ["5-4", "world-5-4-isaiah.html", "5-4 · Wounded for Us"], ["5-5", "world-5-5-furnace.html", "5-5 · The Fiery Furnace"], ["5-6", "world-5-6-lions.html", "5-6 · The Lions' Den"], ["5-7", "world-5-7-esther.html", "5-7 · For Such a Time"], ["5-8", "world-5-8-walls.html", "5-8 · Rebuild the Walls"], ["6-1", "world-6-1-shepherds.html", "6-1 · Shepherds in the Night"], ["6-2", "world-6-2-egypt.html", "6-2 · The Night Road to Egypt"], ["6-4", "world-6-4-nets.html", "6-3 · Leave Your Nets"], ["6-3", "world-6-3-roof.html", "6-4 · Through the Roof"], ["6-5", "world-6-5-loaves.html", "6-5 · Enough for Everyone"], ["6-6", "world-6-6-sea-walk.html", "6-6 · Be Not Afraid"], ["7-1", "world-7-1-neighbour.html", "7-1 · A Neighbour on the Road"], ["7-2", "world-7-2-zacchaeus.html", "7-2 · Zacchaeus"], ["7-3", "world-7-3-upper-room.html", "7-3 · The Upper Room"], ["7-4", "world-7-4-cross.html", "7-4 · The Cross"], ["7-5", "world-7-5-risen.html", "7-5 · He Is Risen!"], ["8-1", "world-8-1-pentecost.html", "8-1 · Good News for Many Nations"], ["8-2", "world-8-2-no-one-forgotten.html", "8-2 · No One Forgotten"], ["8-3", "world-8-3-desert-road.html", "8-3 · The Desert Road"], ["8-4", "world-8-4-basket.html", "8-4 · Over the Wall"], ["8-5", "world-8-5-gate.html", "8-5 · Knocking at the Gate"], ["8-6", "world-8-6-midnight.html", "8-6 · Songs at Midnight"], ["8-7", "world-8-7-ephesus.html", "8-7 · The Uproar in Ephesus"], ["8-8", "world-8-8-storm.html", "8-8 · Through the Storm"], ["8-9", "world-8-9-tree-of-life.html", "8-9 · The Tree of Life"]];
  // <<< ORDER
  // The story is played in chronological order: a level opens when the one before it in the menu is finished.
  // Family settings can open them all ('scrollquest.order' = 'all'). Checked here too, not only in the menu.
  function lockedBy(id) {
    if(window.SQ_BUILD&&SQ_BUILD.edition==='demo'&&SQ_BUILD.demoIds.includes(id))return null;
    try { if (localStorage.getItem('scrollquest.order') === 'all') return null; } catch (e) { return null; }
    const k = CAMPAIGN_ORDER.findIndex((r) => r[0] === id); if (k <= 0) return null;
    const lv = (loadProgress().levels || {});
    if ((lv[id] || {}).done || (lv[CAMPAIGN_ORDER[k - 1][0]] || {}).done) return null;
    let j = k - 1; while (j > 0 && !(lv[CAMPAIGN_ORDER[j - 1][0]] || {}).done) j--;   // the first level still to finish
    return { prev: CAMPAIGN_ORDER[k - 1], first: CAMPAIGN_ORDER[j] };
  }
  SQ._lockedBy = lockedBy;
  function showLockedLevel(L) {
    const lk = lockedBy(L.id); if (!lk || !document.body) return !!lk;
    S.phase = 'locked';
    const box = document.createElement('div'); box.id = 'sq-locked';
    box.setAttribute('style', 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#2a1a0e;font:20px Georgia,serif;color:#fff6e5;text-align:center;padding:16px');
    const esc2 = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = '<div style="max-width:560px"><div style="font-size:54px">🔒</div><div style="font-size:26px;margin:8px 0">' + esc2(L.title) + '</div>' +
      '<p>This level opens after <b>' + esc2(lk.prev[2]) + '</b>. Continue the Bible story in order.</p>' +
      '<p><a id="sq-locked-go" href="' + esc2(lk.first[1]) + '" style="display:inline-block;margin:6px;padding:12px 20px;border:2px solid #d4af37;border-radius:12px;color:#fff6e5;background:#6e3f14;text-decoration:none">▶ Play ' + esc2(lk.first[2]) + '</a>' +
      '<a href="index.html" style="display:inline-block;margin:6px;padding:12px 20px;border:2px solid #d4af37;border-radius:12px;color:#fff6e5;background:#3b2412;text-decoration:none">Menu</a></p>' +
      '<p style="font-size:14px;opacity:.75">(Grown-ups: Family settings → 🔒 Levels → all open)</p></div>';
    document.body.appendChild(box);
    const goTo = (h) => { try { location.href = h; } catch (e) {} };
    const poll = () => {                                                  // A on a controller plays, B goes to the menu
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) if (gp && gp.connected) { if (gp.buttons[0] && gp.buttons[0].pressed) return goTo(lk.first[1]); if (gp.buttons[1] && gp.buttons[1].pressed) return goTo('index.html'); }
      if (window.requestAnimationFrame) requestAnimationFrame(poll);
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') goTo(lk.first[1]); else if (e.key === 'Escape') goTo('index.html'); });
    poll();
    return true;
  }
  function loadProgress() {
    let all;
    try { all = window.SQSave ? SQSave.read() : JSON.parse(localStorage.getItem(SAVE_KEY)) || { levels: {} }; } catch (e) { return { levels: {} }; }
    if (!all.w8) {                       // World 8 was renumbered: 8-4 -> 8-6, 8-5 -> 8-8 (move old saves once)
      if (all.levels['8-5']) { all.levels['8-8'] = all.levels['8-5']; delete all.levels['8-5']; }
      if (all.levels['8-4']) { all.levels['8-6'] = all.levels['8-4']; delete all.levels['8-4']; }
      all.w8 = 1;
      try { persistProgress(all); } catch (e) { /* storage blocked */ }
    }
    return all;
  }
  // The first time a family picks up each piece of the Armor of God they read its verse on a card;
  // after that (any level) a short pop-up reminds them. Remembered with the family's progress.
  function armorSeen(type) {
    try {
      const all = loadProgress(); all.armorSeen = all.armorSeen || {};
      if (all.armorSeen[type]) return true;
      all.armorSeen[type] = 1; persistProgress(all);
    } catch (e) { /* storage blocked: always show the card */ }
    return false;
  }
  function teamRecordKey(){return (S.lifeMode||'adventure')+':'+Math.max(1,Object.keys(S.lifeJoined||{}).length||api.players().length);}
  function saveLevelResult(L) {
    if(L.practice)return;
    try {
      const all = loadProgress();
      const prev = all.levels[L.id] || {};
      const key=teamRecordKey(),records=Object.assign({},prev.teamRecords||{}),tm=Math.round(S.finishTime===undefined?(S.runTime||0):S.finishTime);
      S.prevBestTime=setting('records')==='1'&&records[key]?records[key].seconds:null;
      if(setting('records')==='1'&&!L.solemn){const old=records[key]||{};records[key]={seconds:Math.min(Number.isFinite(old.seconds)?old.seconds:1e9,tm),plays:(old.plays||0)+1};}
      const discovered=[...new Set((Array.isArray(prev.discovered)?prev.discovered:[]).concat((S.discoveries||[]).filter(d=>d.found).map(d=>d.id)))];
      const best = api.players().reduce((t, p) => t + p.servant, 0);    // the team's towel, not one player's
      all.levels[L.id] = Object.assign({},prev,{
        done: true,
        frags: Math.max(prev.frags || 0, S.fragCount), fragTotal: S.fragments.length,
        leaves: Math.max(prev.leaves || 0, S.leafCount), leafTotal: S.leaves.length,
        servant: Math.max(prev.servant || 0, best),
        stars: Math.max(prev.stars || 0, starsEarned().filter(Boolean).length),
        gold: !!(prev.gold || S.goldGot),
        solemn: !!L.solemn,
        plays: (prev.plays || 0) + 1,
        time: Math.round(Math.min(prev.time || 1e9,tm)),
        teamRecords:records,lastTeamKey:setting('records')==='1'?key:prev.lastTeamKey,discovered,discoveryTotal:Math.max(prev.discoveryTotal||0,(S.discoveries||[]).length,discovered.length)
      });
      all.last = L.id;                                                   // the menu's Continue / Play again
      const before = totalStars();
      persistProgress(all);
      const after = totalStars(), fresh = OUTFITS.filter((o) => o.stars > before && o.stars <= after);
      if (fresh.length) { S.newOutfit = fresh[fresh.length - 1]; setTimeout(() => toast('👘 New outfit: ' + S.newOutfit.icon + ' ' + S.newOutfit.name + '! Choose it in Family settings.', 4000), 1500); }
    } catch (e) { /* private window or blocked storage: just don't save */ }
  }
  SQ.loadProgress = loadProgress;
  window.addEventListener('sq-save-status',e=>{if(e.detail.code==='unavailable'&&S.phase==='play')toast('Saving is unavailable. Save a backup from the menu before closing.',6000);});
  window.addEventListener('sq-desktop-pause',()=>{if(S.phase==='play')togglePause();});

  function startPlay() {
    if (S.phase !== 'lobby') return;
    Audio.init();
    document.body.classList.toggle('sq-bigtext', setting('bigtext') === '1');
    S.phase = 'play';
    S.introCam = 1;                                   // the camera swoops in once the story cards are read
    UI.lobby.classList.add('hidden');
    const sp = S.level.spawn || [0, 0];
    S.players.filter((p) => p.joined).forEach((p, i) => {
      p.pos.set(sp[0] + (i - 1.5) * 1.6, 0, sp[1]);
      p.pos.y = groundAt(p.pos.x, p.pos.z);
      p.lastSafe.copy(p.pos);
    });
    initRun();
    updateCamera(0, true);
    Audio.startMusic(S.level.music);
    const go = () => { if (S.level.startMessage) toast(S.level.startMessage, 4500); };
    if (S.level.introStory) showStory(S.level.introStory.map((pg,i)=>i===0?Object.assign({},pg,{connection:S.level.bibleConnection,bridge:CHAPTER_BRIDGES[S.level.id]}):pg), go); else go();
  }

  function frame(dt) {
    S.time += dt;
    updateTouch(dt);
    pollGamepads();
    // global keys
    if (pressedKeys.KeyM) toast(Audio.toggleMute() ? '🔇 Sound off' : '🔊 Sound on', 1200);
    const inputs = S.players.map((p) => (p.joined ? readInput(p.device) : null));
    const anyPause = inputs.some((i) => i && i.pause);
    if(anyPause&&S.phase!=='paused')S.pauseOwner=inputs.findIndex(i=>i&&i.pause);
    if(S.homeInterior){
      updateTalkCues([]);
      S.time-=dt;updateHomeInterior(dt,inputs,anyPause);
      for(const k in pressedKeys)delete pressedKeys[k];return;
    }

    if (S.phase === 'lobby') {
      checkJoins();
      S.players.forEach((p, i) => {
        const inp = inputs[i];
        if (!inp) return;
        if (inp.left || inp.swapBack) cycleRole(p, -1);
        if (inp.right || inp.swap) cycleRole(p, 1);
      });
      const padOf = (p) => (isPad(p.device) ? p.device : null);
      if (pressedKeys.Space || S.players.some((p) => p.joined && padOf(p) && gpPressed(padKey(padOf(p)), 9))) startPlay();
    } else if(S.phase==='gameover'){
      S.gameOverAge+=dt;const i=inputs.find((i,k)=>i&&present(S.players[k]))||{};
      if(i.up||i.down||i.left||i.right)S.gameOverSel=1-S.gameOverSel;
      UI.gameover.querySelectorAll('button').forEach((b,k)=>b.classList.toggle('sq-focus',k===S.gameOverSel));
      if(S.gameOverAge>.75&&(i.jumpP||i.act)){if(S.gameOverSel)goMenu();else SQ.restart();}
    } else if (S.phase === 'play') {
      if (anyPause) togglePause();
      else if (inputs.some((i) => i && i.reread)) reread();
      else {
        checkJoins();
        updateAdventure(dt);
        updateMovers(dt);
        (S.bouncers || []).forEach((b) => {                                 // the canopy cloth dips and springs back
          if (!(b.pl.flexT > 0)) { if (b.g.scale.y !== 1) b.g.scale.y = 1; return; }
          b.pl.flexT = Math.max(0, b.pl.flexT - dt);
          b.g.scale.y = 1 - 0.45 * Math.sin((1 - b.pl.flexT / 0.4) * Math.PI);
        });
        cameraInput(inputs,dt);
        const yaw = camYaw();
        S.players.forEach((p, i) => {
          if (S.homeInterior||S.phase==='gameover'||!p.joined || !inputs[i]) return;            // joined this frame: starts next frame
          if (inputs[i].swapBack) swapRole(p,-1);
          else if (inputs[i].swap) swapRole(p,1);
          if ((!inputs[i].mx && !inputs[i].mz) || S.camSteerT > 0) p.ctlYaw = yaw;          // authored camera changes preserve a held direction; manual orbit follows the view
          camRelative(inputs[i], p.ctlYaw === undefined ? yaw : p.ctlYaw);   // so holding a direction never curves as the camera turns
          updatePlayer(p, inputs[i], dt);
        });
        if(S.homeInterior){for(const k in pressedKeys)delete pressedKeys[k];return;}
        if(S.phase!=='gameover'){
        updateGadgets(dt);
        // player-vs-player gentle separation
        const act = api.activePlayers().filter((p) => !p.carriedBy);
        for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
          const A = act[a], B = act[b];
          const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz);
          if (d < 1.0 && d > 1e-4 && Math.abs(A.pos.y - B.pos.y) < 1.5) {
            const push = (1.0 - d) / 2 / d;
            A.pos.x -= dx * push; A.pos.z -= dz * push; B.pos.x += dx * push; B.pos.z += dz * push;
          }
        }
        updateFollowers(dt);
        updateTruth();
        updateZones(dt);
        updatePickups(dt); updateWater(); updateJars(dt); updateRoleSpots(dt); updateTeamPads(dt); updateLights(dt); updatePeople(dt);
        if (S.level.update) S.level.update(api, dt);
        updateTrials(dt);
        updateCheckpoints();
        updateFinale(dt);
        S.runTime = (S.runTime || 0) + dt;
        if (UI.help) UI.help.classList.toggle('gone', S.runTime > 20);     // the controls fade after a while (they're in the pause menu)
        const cd = S.countdown;
        if (cd && !cd.over) { cd.left -= dt; if (cd.left <= 0) { cd.left = 0; cd.over = true; if (cd.onEnd) cd.onEnd(); } }
        if ((S.timerTick = (S.timerTick || 0) + dt) > 0.25) { S.timerTick = 0; renderTimer(); }
        }
      }
    } else if (S.phase === 'story' && anyPause) {
      togglePause();                                                     // settings (like who turns pages) during a story too
    } else if (S.phase === 'story') {
      if (S.story) S.story.age += dt;
      if (S.story && inputs.some((i) => i && i.share)) speakPage(S.story.pages[S.story.i]);   // RT / Q (or the phone share button): read it to me
      const p1in = inputs[0], mode = readerMode();
      updateReadBar();
      if (mode === 'p1') { if (p1in && (p1in.jumpP || p1in.act)) nextStory(); }          // the reader turns the pages
      else if (mode === 'all' && S.story) {                                              // everyone says "ready"
        const st = S.story, canRead = st.age >= Math.max(0.4, minRead(st.pages[st.i]));
        let changed = false;
        S.players.forEach((p, k) => { const inp = inputs[k]; if (canRead && inp && (inp.jumpP || inp.act) && !st.ready[p.slot]) { st.ready[p.slot] = true; changed = true; Audio.sfx('pickup'); } });
        if (S.players.filter(present).every((p) => st.ready[p.slot])) nextStory(true);   // an unplugged controller doesn't hold everyone up
        else if (changed) renderStory();
      }
      else if (inputs.some((i) => i && (i.jumpP || i.act)) || pressedKeys.Enter || pressedKeys.Space || pressedKeys.KeyE) nextStory();
    } else if (S.phase === 'paused') {
      if (anyPause) togglePause();
      else inputs.forEach((i) => i && pauseInput(i));
    } else if(S.phase==='celebrate'){
      api.players().forEach(p=>{p.mesh.position.copy(p.pos);p.mesh.position.y+=Math.abs(Math.sin((S.time-S.partyStart)*Math.PI*3))*.35;const body=p.mesh.userData.body;if(body)for(const name of ['armL','armR']){const arm=body.getObjectByName(name);if(arm)arm.rotation.x=-2.4;}});
    } else if (S.phase === 'results') {
      inputs.forEach((i) => i && quizInput(i));
    }
    updateParticles(dt);
    updateRain(dt);
    updateWeather(dt);
    updateBeacon(dt);
    updateCamera(dt, false);
    updateFade(dt);
    updateGhosts();
    updateDecor(dt);
    ScrollQuestGFX.update(S.scene, dt);
    if (S.skyDome) S.skyDome.position.copy(S.camera.position);
    updateLabels();
    updateActionGuide();
    updateNotices(dt);
    if(S.openSea)S.openSea.mesh.position.y=S.openSea.source.position.y-.015;
    for (const k in pressedKeys) delete pressedKeys[k];
  }

  // Automatic smoothness: if frames are slow for a few seconds, lower the shadow quality and the
  // screen resolution one step; if there is plenty of headroom for a while, step back up.
  // Steps: 0 full · 1 pixel ratio 1 · 2 small shadows · 3 no shadows, lower resolution
  // gentle waves near the camera so the water glints in the sun (a few thousand points: cheap)
  function updateWater() {
    const W = S.waterMesh; if (!W || !W.visible || (S.quality || 0) >= 3) return;
    W.position.x = Math.round(S.camera.position.x / 6.67) * 6.67; W.position.z = Math.round(S.camera.position.z / 6.67) * 6.67;
    const pa = W.geometry.attributes.position, t = S.time;
    if (W.material.map) { W.material.map.offset.set((W.position.x / 10 + t * 0.012) % 1, (-W.position.z / 10 + t * 0.008) % 1); }   // ripples drift (and stay put as the water follows the camera)
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + W.position.x, yv = -pa.getY(i) + W.position.z;
      pa.setZ(i, Math.sin(x * 0.45 + t * 1.3) * 0.06 + Math.sin(yv * 0.6 - t * 1.1) * 0.05);
    }
    pa.needsUpdate = true;
    W.geometry.computeVertexNormals();
  }
  // Half-resolution, view-space ambient occlusion. No additional world/normal render pass.
  // Depth-aware upsampling avoids a dark halo around a foreground player against the sky.
  const AO_VERTEX='varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
  const AO_FRAGMENT=`
    varying vec2 vUv; uniform highp sampler2D tDepth; uniform vec2 pixel; uniform mat4 inverseProjection; uniform mat4 projection;
    vec3 at(vec2 uv) {float d=texture2D(tDepth,clamp(uv,vec2(.001),vec2(.999))).x;vec4 p=inverseProjection*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;}
    void main(){
      float depth=texture2D(tDepth,vUv).x;
      if(depth>.99998){gl_FragColor=vec4(1.0);return;}
      // A wider normal baseline avoids amplifying small depth quantization steps.
      vec2 normalPixel=pixel*4.0;
      vec3 c=at(vUv), xp=at(vUv+vec2(normalPixel.x,0.0))-c, xm=c-at(vUv-vec2(normalPixel.x,0.0));
      vec3 yp=at(vUv+vec2(0.0,normalPixel.y))-c, ym=c-at(vUv-vec2(0.0,normalPixel.y));
      vec3 dx=dot(xp,xp)<dot(xm,xm)?xp:xm, dy=dot(yp,yp)<dot(ym,ym)?yp:ym;
      vec3 crossN=cross(dx,dy); float normalLength=length(crossN); vec3 n=normalLength>1e-12 ? crossN/normalLength : normalize(-c); if(dot(n,-c)<0.0)n=-n;
      float radius=.85, screenRadius=clamp(radius*projection[1][1]/max(-c.z,.2)*.5,.001,.065), occ=0.0;
      float aspect=pixel.y/pixel.x;
      for(int i=0;i<12;i++){
        float a=float(i)*2.39996323, r=sqrt((float(i)+.5)/12.0)*screenRadius;
        vec2 uv=vUv+vec2(cos(a)/aspect,sin(a))*r;
        if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)continue;
        vec3 d=at(uv)-c; float len=length(d);
        float facing=max(dot(n,d)/max(len,.001)-.12,0.0);
        occ+=facing*(1.0-smoothstep(.1,radius*1.8,len))*smoothstep(.02,.08,dot(n,d));
      }
      float ao=clamp(1.0-occ*.13,.72,1.0); gl_FragColor=vec4(ao,ao,ao,1.0);
    }`;
  const AO_COMPOSITE=`
    varying vec2 vUv; uniform sampler2D tColor; uniform highp sampler2D tDepth; uniform sampler2D tAO; uniform vec2 aoPixel; uniform vec2 colorPixel; uniform vec2 nearFar;
    float viewDepth(vec2 uv){float z=texture2D(tDepth,uv).x;return nearFar.x*nearFar.y/(nearFar.y+(nearFar.x-nearFar.y)*z);}
    void main(){
      vec4 color=texture2D(tColor,vUv);
      // Gentle edge antialiasing for the off-screen colour target.
      vec3 n=texture2D(tColor,vUv+vec2(0.0,colorPixel.y)).rgb,s=texture2D(tColor,vUv-vec2(0.0,colorPixel.y)).rgb;
      vec3 e=texture2D(tColor,vUv+vec2(colorPixel.x,0.0)).rgb,w=texture2D(tColor,vUv-vec2(colorPixel.x,0.0)).rgb;
      float horizontal=dot(abs(e-w),vec3(.2126,.7152,.0722)),vertical=dot(abs(n-s),vec3(.2126,.7152,.0722));
      float contrast=max(horizontal,vertical);
      vec3 edge=horizontal>vertical ? (n+s)*.5 : (e+w)*.5;
      color.rgb=mix(color.rgb,edge,smoothstep(.06,.25,contrast)*.24);
      float z=viewDepth(vUv), total=texture2D(tAO,vUv).r*2.0, weight=2.0;
      for(int i=0;i<4;i++) {
        vec2 offset=i==0?vec2(1.0,0.0):i==1?vec2(-1.0,0.0):i==2?vec2(0.0,1.0):vec2(0.0,-1.0);
        vec2 uv=clamp(vUv+offset*aoPixel,vec2(.001),vec2(.999));float w=exp(-abs(viewDepth(uv)-z)*3.0);
        total+=texture2D(tAO,uv).r*w;weight+=w;
      }
      float a=total/weight; vec3 tint=vec3(a,1.0-(1.0-a)*.94,1.0-(1.0-a)*.83);
      gl_FragColor=vec4(color.rgb*tint,color.a);
    }`;
  function initOcclusion() {
    const R=S.renderer;
    const supported=!!(R && typeof R.setRenderTarget==='function' && R.capabilities && (R.capabilities.isWebGL2 || (R.extensions && R.extensions.has('WEBGL_depth_texture'))));
    S.occlusion={supported,active:false,target:null,aoTarget:null,size:new THREE.Vector2(),quality:S.quality||0};
    UI.canvas.setAttribute('data-corner-shading',supported?'available':'unsupported');
  }
  function releaseOcclusion() {
    const O=S.occlusion;if(!O)return;
    if(O.target) {O.target.dispose(); O.aoTarget.dispose(); O.target=O.aoTarget=null;}
    O.active=false; if(UI.canvas) UI.canvas.setAttribute('data-corner-shading',O.supported?'off':'unsupported');
  }
  function resizeOcclusion() {
    const O=S.occlusion,R=S.renderer;if(!O||!O.supported||(S.quality||0)>=2){releaseOcclusion();return;}
    R.getDrawingBufferSize(O.size);const w=Math.max(1,O.size.x),h=Math.max(1,O.size.y), scale=Math.min(.5,960/w,540/h),aw=Math.max(1,Math.round(w*scale)),ah=Math.max(1,Math.round(h*scale));
    if(!O.target){
      O.target=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
      O.target.depthTexture=new THREE.DepthTexture(w,h,THREE.UnsignedIntType);
      O.aoTarget=new THREE.WebGLRenderTarget(aw,ah,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
      if(!O.scene){
        O.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);O.scene=new THREE.Scene();
        O.aoMaterial=new THREE.ShaderMaterial({uniforms:{tDepth:{value:null},pixel:{value:new THREE.Vector2()},inverseProjection:{value:new THREE.Matrix4()},projection:{value:new THREE.Matrix4()}},vertexShader:AO_VERTEX,fragmentShader:AO_FRAGMENT,depthTest:false,depthWrite:false,toneMapped:false});
        O.composite=new THREE.ShaderMaterial({uniforms:{tColor:{value:null},tDepth:{value:null},tAO:{value:null},aoPixel:{value:new THREE.Vector2()},colorPixel:{value:new THREE.Vector2()},nearFar:{value:new THREE.Vector2()}},vertexShader:AO_VERTEX,fragmentShader:AO_COMPOSITE,depthTest:false,depthWrite:false,toneMapped:false});
        O.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),O.aoMaterial);O.quad.frustumCulled=false;O.scene.add(O.quad);
      }
    }
    if(O.target.width!==w||O.target.height!==h)O.target.setSize(w,h);
    if(O.aoTarget.width!==aw||O.aoTarget.height!==ah)O.aoTarget.setSize(aw,ah);
    O.active=true; if(UI.canvas.getAttribute('data-corner-shading')!=='on') UI.canvas.setAttribute('data-corner-shading','on');
  }
  function renderFrame() {
    const O=S.occlusion,R=S.renderer,scene=S.homeInterior?S.homeInterior.scene:S.scene,camera=S.homeInterior?S.homeInterior.camera:S.camera;
    if(!O||!O.supported||(S.quality||0)>=2){R.render(scene,camera);return;}
    resizeOcclusion();if(!O.active){R.render(scene,camera);return;}
    const old=R.getRenderTarget();
    try {
      R.setRenderTarget(O.target);R.clear();R.render(scene,camera);
      const U=O.aoMaterial.uniforms;U.tDepth.value=O.target.depthTexture;U.pixel.value.set(1/O.target.width,1/O.target.height);U.inverseProjection.value.copy(camera.projectionMatrixInverse);U.projection.value.copy(camera.projectionMatrix);
      O.quad.material=O.aoMaterial;R.setRenderTarget(O.aoTarget);R.clear();R.render(O.scene,O.camera);
      const C=O.composite.uniforms;C.tColor.value=O.target.texture;C.tDepth.value=O.target.depthTexture;C.tAO.value=O.aoTarget.texture;C.aoPixel.value.set(1/O.aoTarget.width,1/O.aoTarget.height);C.colorPixel.value.set(1/O.target.width,1/O.target.height);C.nearFar.value.set(camera.near,camera.far);
      O.quad.material=O.composite;R.setRenderTarget(old);R.clear();R.render(O.scene,O.camera);
    } finally {R.setRenderTarget(old);}
  }
  SQ._renderFrame=renderFrame;SQ._resizeOcclusion=resizeOcclusion;

  function applyQuality(q) {
    S.quality = q;
    if(UI.canvas) UI.canvas.setAttribute('data-render-quality',String(q));
    surfaceQuality(q);
    if(q>=2) releaseOcclusion();
    if (UI.canvas && UI.canvas.classList) UI.canvas.classList.add('sq-graded');
    if (UI.tilt) UI.tilt.classList.toggle('off', q >= 2 || setting('tilt') === '0');      // the miniature blur goes first when a computer struggles
    (S.glows || []).forEach((g) => { g.visible = q < 2; });                                // soft halos go too
    if (groundingMat) groundingMat.visible = q < 3;                                        // and, last of all, the wall-foot shading and moss
    const R = S.renderer; if (!R) return;
    if (R.toneMapping !== undefined && THREE.ACESFilmicToneMapping !== undefined) R.toneMapping = THREE.ACESFilmicToneMapping;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (R.setPixelRatio) R.setPixelRatio(q === 0 ? dpr : q === 3 ? 0.75 : 1);
    if (S.sun && S.sun.shadow) {
      S.sun.castShadow = q < 3;
      const size = q >= 2 ? 1024 : 2048;
      if (S.sun.shadow.mapSize && S.sun.shadow.mapSize.x !== size) { S.sun.shadow.mapSize.set(size, size); if (S.sun.shadow.map) { S.sun.shadow.map.dispose(); S.sun.shadow.map = null; } }
    }
    if (R.setSize) R.setSize(window.innerWidth, window.innerHeight);
  }
  function autoQuality(raw) {
    if (!(raw > 0) || raw > 0.5) return;                          // ignore pauses (tab hidden, debugger)
    S.qAvg = S.qAvg === undefined ? raw : S.qAvg * 0.95 + raw * 0.05;
    S.qT = (S.qT || 0) + raw;
    if (S.qT < 3) return;
    if(UI.canvas) UI.canvas.setAttribute('data-frame-ms',String(Math.round(S.qAvg*1000)));                                          // judge every 3 seconds
    const q = S.quality || 0;
    if (S.qAvg > 1 / 40 && q < 3) { applyQuality(q + 1); S.qGood = 0; }
    else if (S.qAvg < 1 / 57 && q > 0) { S.qGood = (S.qGood || 0) + 1; if (S.qGood >= 4) { applyQuality(q - 1); S.qGood = 0; } }   // 12 s of headroom
    S.qT = 0;
  }
  SQ._autoQuality = autoQuality; SQ._applyQuality = applyQuality;

  SQ.start = function (L) { loadAssets(() => realStart(L)); };
  function realStart(L) {
    try {
      if (typeof THREE === 'undefined') throw new Error('Three.js did not load. Keep three.min.js in the same folder as this page.');
      if (!L) throw new Error('No LEVEL found. Check that the level .js file loaded (look for a typo above this message).');
      validateLevel(L);
      if (showLockedLevel(L)) return;                                    // a page opened out of order (a bookmark, an old tab)
      ScrollQuestGFX.clear();
      S.gfxReady=false;
      S.level = L;
      setupApproach(L);
      if (isNewTestament(L) && !ROLES.some((r) => r.id === 'apostle')) ROLES.push(APOSTLE);
      buildUI(L);

      S.renderer = SQ.makeRenderer ? SQ.makeRenderer(UI.canvas) : new THREE.WebGLRenderer({ canvas: UI.canvas, antialias: true });
      S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      S.renderer.setSize(window.innerWidth, window.innerHeight);
      if (S.renderer.shadowMap) { S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
      if (THREE.ACESFilmicToneMapping !== undefined) { S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = L.exposure || 0.92; }   // film-like colour: bright sand and sun glare are tamed (the CSS grade puts the colour back)
      if (UI.canvas.classList) UI.canvas.classList.add('sq-graded');
      initOcclusion();
      S.scene = new THREE.Scene();
      const TC = S.timeCfg = TIMES[L.time || 'day'];
      const sky = L.sky !== undefined ? L.sky : TC.sky;
      S.scene.background = new THREE.Color(sky);
      S.scene.fog = new THREE.Fog(sky, TC.fog[0], TC.fog[1]);
      S.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
      S.scene.add(new THREE.HemisphereLight(TC.hemi[0], TC.hemi[1], L.ambient || TC.ambient));
      S.sun = new THREE.DirectionalLight(TC.sun, L.sunlight || TC.sunI);
      { const fill = new THREE.DirectionalLight(TC.fill || 0xcfe3ff, TC.fillI !== undefined ? TC.fillI : 0.28); fill.position.set(-30, 25, -20); S.scene.add(fill); }   // soft fill: no harsh dark sides
      {                                                  // gradient sky: horizon colour to a deeper top
        const top = new THREE.Color(TC.skyTop !== undefined && L.sky === undefined ? TC.skyTop : sky).lerp(new THREE.Color(0x1e3a8a), L.sky === undefined && TC.skyTop !== undefined ? 0 : 0.35);
        const hor = new THREE.Color(sky);
        const geo = new THREE.SphereGeometry(300, 24, 12);
        const cols = [], pa = geo.attributes.position, c = new THREE.Color();
        for (let i = 0; i < pa.count; i++) { const k = Math.max(0, Math.min(1, pa.getY(i) / 300 * 1.6)); c.copy(hor).lerp(top, k); cols.push(c.r, c.g, c.b); }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        S.skyDome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
        S.skyDome.renderOrder = -1;
        S.scene.add(S.skyDome);
      }
      if (TC.stars) {                                    // a dome of stars around the level
        const n = 700, pts = new Float32Array(n * 3);
        const B0 = L.bounds || { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
        const cx = (B0.minX + B0.maxX) / 2, cz = (B0.minZ + B0.maxZ) / 2;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, up = 0.15 + Math.random() * 0.85, r = 170;
          pts[i * 3] = cx + Math.cos(a) * r * Math.sqrt(1 - up * up); pts[i * 3 + 1] = r * up; pts[i * 3 + 2] = cz + Math.sin(a) * r * Math.sqrt(1 - up * up);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        S.stars = new THREE.Points(g, L.artDirection&&L.artDirection.softStars?starMaterial({color:0xdde8ff,size:2,sizeAttenuation:false}):new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
        S.scene.add(S.stars);
      }
      S.sun.castShadow = true;
      S.sun.shadow.mapSize.set(2048, 2048); S.sun.shadow.bias = -0.0004; if ('normalBias' in S.sun.shadow) S.sun.shadow.normalBias = 0.02; if ('radius' in S.sun.shadow) S.sun.shadow.radius = 3;
      const sc = S.sun.shadow.camera;
      sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
      S.scene.add(S.sun); S.scene.add(S.sun.target);

      // terrain mesh
      const B = L.bounds || { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
      const pad = 40;
      const w = B.maxX - B.minX + pad * 2, d = B.maxZ - B.minZ + pad * 2;
      // Include the exact four island boundaries in the visible grid. Otherwise a
      // triangle straddles the cliff and leaves edge plants hovering over its slope.
      const axis = (lo, hi) => {
        const out = [], spans = [[lo - pad, lo], [lo, hi], [hi, hi + pad]];
        spans.forEach(([a, b], j) => { const n = Math.ceil((b - a) / 1.5); for (let i = j ? 1 : 0; i <= n; i++) out.push(a + (b - a) * i / n); });
        return out;
      };
      const xs = axis(B.minX, B.maxX), zs = axis(B.minZ, B.maxZ);
      const geo = new THREE.PlaneGeometry(w, d, xs.length - 1, zs.length - 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
      const pos = geo.attributes.position, cols = [];
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, xs[i % xs.length]); pos.setZ(i, zs[Math.floor(i / xs.length)]);
        const x = pos.getX(i), z = pos.getZ(i), h = terrain(x, z);
        pos.setY(i, h);
        c.copy(paintedGround(L,x,z,h));
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const gmap = TEX.ground();
      if (gmap) { const uvA = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uvA.setXY(i, pos.getX(i) / 7, pos.getZ(i) / 7); uvA.needsUpdate = true; }   // detail every 7 metres
      const ground = new THREE.Mesh(geo, makePaintedTerrain(gmap));
      ground.receiveShadow = true;
      S.scene.add(ground); S.groundMesh = ground;

      (L.tasks || []).forEach((t) => (S.tasks[t.id] = { count: 0, total: t.total, label: t.label || t.id }));
      buildBeacon();
      L.build(api);
      buildApproach();
      buildSupplyQuests();
      buildFinishMarker();
      applyRim();
      decorateHouses();
      buildGrounding();
      findWaters();
      themeCourses();
      buildShores();
      buildSeaHorizon();
      buildDecor(L);
      buildHorizon(L);
      buildLife(L);
      buildStorybook(L);
      for (let i = 0; i < 4; i++) S.players.push(makePlayer(i));
      joinSlot(0, 'kb1');
      restoreSetup();
      initTouch();
      initNet();
      autoGuides();
      renderLobby();
      renderHUD();
      updateCamera(0, true);
      // Texture/object UUID creation consumes randomness in Three.js. Delay new effects
      // until authored placement and character setup finish, preserving seeded layouts.
      S.gfxReady=true;
      const contact=contactMap();softContactMaterials.forEach(m=>{m.map=contact;m.needsUpdate=true;});
      const lightTargets=[];S.scene.traverse(obj=>{if(obj.userData.sqHalo||obj.userData.sqRay)lightTargets.push(obj);});
      lightTargets.forEach(obj=>{
        if(obj.userData.sqHalo)ScrollQuestGFX.attachBloomHalo(obj,obj.userData.sqHalo);
        if(obj.userData.sqRay)ScrollQuestGFX.createGodRay(S.scene,obj.userData.sqRay);
      });

      window.addEventListener('resize', () => {
        S.camera.aspect = window.innerWidth / window.innerHeight;
        S.camera.updateProjectionMatrix();
        S.renderer.setSize(window.innerWidth, window.innerHeight);
      });

      let last = performance.now();
      const loop = (now) => {
        requestAnimationFrame(loop);
        const raw = Math.max(0, (now - last) / 1000);
        const dt = Math.min(0.05, raw);
        last = now;
        autoQuality(raw);
        try { frame(dt); renderFrame(); }
        catch (e) {
          if (!S.errorShown) { S.errorShown = true; showError((e && e.stack) || String(e)); console.error(e); }
        }
      };
      window.addEventListener('pagehide',releaseOcclusion,{once:true});
      requestAnimationFrame(loop);
    } catch (e) {
      showError((e && e.stack) || String(e));
    }
  };

  // test hooks (used by the automated checker, harmless in the browser)
  SQ._frame = frame;
  SQ._keys = { down: (c) => { if (!keys[c]) pressedKeys[c] = true; keys[c] = true; }, up: (c) => { keys[c] = false; } };
  SQ._startPlay = startPlay;
  SQ._nextStory = () => nextStory(true);
  SQ._storyClick = () => storyClick();
  SQ._showResults = () => showResults();   // for tests
})();
