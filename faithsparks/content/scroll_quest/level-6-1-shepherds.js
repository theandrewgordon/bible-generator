/* =====================================================================
 * LEVEL 6-1: SHEPHERDS IN THE NIGHT  (Luke 2:8-20)
 * ---------------------------------------------------------------------
 * Night on the hills near Bethlehem. Walk toward -z:
 *   The hills     (z 42..10)  bring the scattered sheep into the fold (the Shepherd calls from far away)
 *   The fold      (0, 7)      the angel of the Lord and the heavenly host (told on cards; shown only as light)
 *   The way down  (z 4..-20)  "with haste": stepping stones over the stream, a slow log ferry over the gully
 *   Bethlehem     (z -22..-40) the stable: Mary and Joseph; the babe in the manger is told, never shown
 * God sends the news; nobody earns it. The shepherds go, see, and tell. Thread: 6-2 the night road to Egypt.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const SHEP = {
  sheep: [],
  angel: null,
  host: [],
  steps: [],
  FOLD: [0, 7],
  GATE: [0, -23],
  STABLE: [0, -30],
  heard: false,
  told: false,
  saidCall: false
};

function shepHill(z) { return z > 6 ? Math.min(2.2, (z - 6) * 0.06) : 0; }

const LEVEL = {
  id: '6-1',
  bibleConnection: {"passage": "Luke 2:8–20", "text": "Angels announced Jesus’ birth to shepherds, who hurried to Bethlehem and then spread the news. Our flock and night crossings imagine their surroundings. Tending sheep does not make the Saviour be born."},
  world: 'World 6-1',
  title: 'Shepherds in the Night',
  time: 'night',
  town: true,
  leafIcon: '⭐',
  leafColor: 0xfde68a,
  spawn: [0, 78],
  bounds: { minX: -19, maxX: 19, minZ: -42, maxZ: 81 },
  startMessage: 'Just for our game: cross the watch path. Then bring the sheep into the fold.',

  intro: [
    { text: 'And there were in the same country shepherds abiding in the field, keeping watch over their flock by night.', ref: 'Luke 2:8' },
    { text: 'For unto you is born this day in the city of David a Saviour, which is Christ the Lord.', ref: 'Luke 2:11' }
  ],

  introStory: [
    { art: '🐑', title: 'Keeping watch by night', text: 'And there were in the same country shepherds abiding in the field, keeping watch over their flock by night.', ref: 'Luke 2:8' }
  ],

  tasks: [
    { id: 'sheep', icon: '🐑', label: 'Bring the sheep into the fold', total: 5 },
    { id: 'town', icon: '🏘️', label: 'Hurry to Bethlehem', total: 1, lockedUntil: 'sheep' }
  ],

  memoryVerse: { text: 'For unto you is born this day in the city of David a Saviour, which is Christ the Lord.', ref: 'Luke 2:11' },

  ending: {
    verse: { text: 'Glory to God in the highest, and on earth peace, good will toward men.', ref: 'Luke 2:14' },
    message: 'The Saviour God promised was born in Bethlehem. The shepherds went, saw Him, and told everyone.'
  },

  quiz: [
    { q: 'What were the shepherds doing that night?', ref: 'Luke 2:8', options: ['Sleeping in the town', 'Keeping watch over their flock', 'Fishing'], answer: 1 },
    { q: 'What did the angel say had been born?', ref: 'Luke 2:11', options: ['A Saviour, which is Christ the Lord', 'A new king of Egypt', 'A lamb'], answer: 0 },
    { q: 'Where did the shepherds find the babe?', ref: 'Luke 2:16', options: ['In a palace', 'Lying in a manger', 'In the temple'], answer: 1 }
  ],

  music: {
    bpm: 72,
    notes: [67, 0, 69, 67, 64, 0, 0, 0, 67, 0, 69, 67, 64, 0, 0, 0,
            74, 0, 74, 71, 72, 0, 0, 0, 72, 0, 72, 67, 69, 0, 0, 0],
    bass: [48, 48, 43, 43, 45, 45, 43, 43]
  },

  /* ---------- ground: hills down to the stream, the gully, the town ---------- */
  terrain(x, z) {
    let h = shepHill(z) + Math.sin(x * 0.3) * Math.cos(z * 0.2) * 0.15;
    const s = Math.abs(z + 4);
    if (s < 2.4) h -= 2.6 * Math.min(1, (2.4 - s) / 0.6);              // the stream
    const g = Math.abs(z + 15);
    if (g < 2.6) h -= 3.0 * Math.min(1, (2.6 - g) / 0.5);              // the gully
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z + 4) < 2.0 && h < -1.6) return 0x2c5d86;
    if (Math.abs(z + 15) < 2.3 && h < -1.5) return 0x5b4a3a;
    if (z < -21) return (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xa48a64 : 0x9a8160;   // town lanes
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x5f9a4a : 0x578f44;                    // grassy hills
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const [fx, fz] = SHEP.FOLD;

    // Imagined hillside watch terraces: a broad grassy route and an optional lookout.
    // All missed hops have ordinary ground below; no new flock or carrying chore.
    const entry=SHEP.entry={done:false,route:[],sideRoute:[]};
    const terrace=(x,z,h,w=6,d=4.5)=>{const y=api.terrain(x,z);const b=api.box({x,z,y,w,d,h,color:0x767663,tex:'stone',house:false});
      const turf=new T.Mesh(new T.BoxGeometry(w-.12,.045,d-.12),api.texMat(0x647e4c,'grass'));turf.position.set(0,h/2+.02,0);b.mesh.add(turf);return [x,y+h,z];};
    entry.route.push(terrace(0,73,.55),terrace(-3,67.5,.9),terrace(1,62,.65),terrace(3,56,.45),[0,api.terrain(0,49),49,false]);
    entry.sideRoute.push(terrace(5,69,.45,4.5,4.5),terrace(10,66,.95,5,5));
    entry.discovery=api.discovery({id:'night-watch-lookout',name:'The night-watch lookout',x:10,z:66,y:api.terrain(10,66)+.95,r:1.6,vRange:.65});
    const watch=new T.Group();watch.name='shepherd-watch-path';
    [[-10,74],[-11,60],[13,55]].forEach(([x,z],i)=>{const rock=new T.Mesh(new T.DodecahedronGeometry(1,0),api.texMat(i%2?0x8e8775:0x777969,'stone'));rock.position.set(x,api.terrain(x,z)+.5,z);rock.scale.set(2.8,1.2,2);watch.add(rock);});
    // Two practical lamps identify the low path without brightening the whole night.
    for(const [x,z] of [[-4.6,72],[5,55]]){
      const y=api.terrain(x,z),post=new T.Mesh(new T.CylinderGeometry(.08,.1,1.2,6),api.texMat(0x725b3b,'wood'));post.position.set(x,y+.6,z);watch.add(post);
      const bowl=new T.Mesh(new T.SphereGeometry(.2,8,6),api.texMat(0xa87543,'clay'));bowl.scale.y=.45;bowl.position.set(x,y+1.2,z);watch.add(bowl);
      const flame=new T.Mesh(new T.SphereGeometry(.1,8,6),new T.MeshBasicMaterial({color:0xffd890}));flame.position.set(x,y+1.35,z);watch.add(flame);
      const lamp=new T.PointLight(0xffbc72,.65,8,2);lamp.position.copy(flame.position);watch.add(lamp);
    }
    api.scenery(watch);
    api.leaves(entry.route.map(([x,y,z])=>[x,z,y+1]).concat([[5,69,api.terrain(5,69)+1.45],[10,66,api.terrain(10,66)+1.95],[0,76]]));
    api.camZone({minX:-16,maxX:17,minZ:46,maxZ:81,yaw:-.2,height:11,back:17,focus:[0,3,64],pull:.12});
    // Keep the high east course and its next landing in view before the spring jump.
    api.camZone({minX:10.5,maxX:19,minZ:11,maxZ:43,yaw:.35,height:13,back:22,focus:[16,7,25],pull:.12});

    // --- the fold: a low ring of stones (a gap toward the hills) ---
    for (let i = 0; i < 10; i++) {
      const a = (i + 0.5) / 12 * Math.PI * 2 + Math.PI / 2 + Math.PI / 6;
      const s = new T.Mesh(new T.BoxGeometry(1.5, 0.8, 0.7), api.texMat(0x8a8178, 'stone'));
      s.position.set(fx + Math.cos(a) * 3.4, 0.4, fz + Math.sin(a) * 3.4); s.rotation.y = -a; api.add(s);
    }
    [[-2.4, 10.6], [2.6, 11]].forEach(([x, z], i) => { const m = api.person(i ? 0x78350f : 0x57534e, 0xe7e5e4, 1, { beard: true, age: i ? 'elder' : undefined }); m.position.set(x, api.terrain(x, z), z); api.add(m); });

    // --- the sheep, scattered on the hills (some on low rocks) ---
    api.box({ x: 7, z: 30, w: 2.2, d: 2.2, h: 1.0, color: 0x8a8178, house: false });
    api.box({ x: 9, z: 18, w: 2.4, d: 2.4, h: 1.4, color: 0x8a8178, house: false });
    [[-8, 34], [7, 30], [-10, 22], [9, 18], [-3, 15]].forEach(([x, z]) => {
      SHEP.sheep.push(api.follower({ x, z, kind: 'sheep',
        deliverTo: { x: fx, z: fz, r: 3 },
        parkAt: () => [fx - 1.8 + Math.random() * 3.6, 0, fz - 1.8 + Math.random() * 3.6],
        onDeliver(p) { api.task('sheep'); api.servant(p, 3); if (api.taskDone('sheep')) LEVEL._angel(api); } }));
    });
    api.armor('helmet', 0, 38);                      // the helmet of salvation: a Saviour is born

    // --- the angel and the heavenly host (light only; they come when the sheep are safe) ---
    const angel = new T.Group();
    const robe = new T.Mesh(new T.CylinderGeometry(0.4, 0.7, 1.9, 12), new T.MeshBasicMaterial({ color: 0xffffff }));
    robe.position.y = 0.95; angel.add(robe);
    const head = new T.Mesh(new T.SphereGeometry(0.34, 12, 10), new T.MeshBasicMaterial({ color: 0xfff7e0 })); head.position.y = 2.15; angel.add(head);
    const glow = new T.Mesh(new T.SphereGeometry(2.4, 16, 12), new T.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.25, depthWrite: false, fog: false }));
    glow.position.y = 1.2; angel.add(glow);
    angel.position.set(fx, 5, fz - 4); angel.visible = false; api.add(angel); SHEP.angel = angel;
    SHEP.angelLight = new T.PointLight(0xfff4c2, 0, 30, 1.4); SHEP.angelLight.position.set(fx, 7, fz - 3); api.add(SHEP.angelLight);
    for (let i = 0; i < 16; i++) {
      const h = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), new T.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.9, fog: false }));
      h.position.set(fx + Math.cos(i * 0.9) * (7 + (i % 3) * 3), 9 + (i % 4) * 1.6, fz - 4 + Math.sin(i * 0.9) * 5); h.visible = false; api.add(h); SHEP.host.push(h);
    }

    // --- the stream: stepping stones (the Fisherman can wade) ---
    const water = new T.Mesh(new T.PlaneGeometry(40, 4), new T.MeshLambertMaterial({ color: 0x3b6e99, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.8, -4); api.add(water);
    api.hazard({ x: 0, z: -4, w: 40, d: 3.6 }, { maxY: -1.5, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Hop across on the stepping stones.' });
    [[0.6, -2.4], [-0.6, -4], [0.6, -5.6]].forEach(([x, z]) => api.stump(x, z, 2.85, 0.75));
    api.fragment({ x: 10, z: -4, y: -1.3, net: true });
    api.camZone({ minX: -5, maxX: 5, minZ: -8, maxZ: 0, yaw: 0.35, height: 7, back: 11, focus: [0, 0, -6], pull: 0.4 });

    // --- the gully: a slow log ferry across ---
    api.hazard({ x: 0, z: -15, w: 40, d: 4.6 }, { maxY: -1.4, msg: 'Down in the gully! Ride the log ferry across.' });
    api.mover({ w: 2.4, h: 0.4, d: 2.2, color: 0x7a5230, path: [[0, -0.4, -11.4], [0, -0.4, -18.6]], speed: 1.6, wait: 1.4 });
    api.camZone({ minX: -5, maxX: 5, minZ: -21, maxZ: -9.5, yaw: -0.4, height: 8, back: 12, focus: [0, 0, -18], pull: 0.4 });

    // --- Bethlehem: houses, the inn, the stable ---
    [[-10, -27, 6, 6, 3.4], [10, -27, 6, 6, 3.2], [-11, -37, 5, 5, 3], [11, -37, 5, 6, 3.4], [-12, 40, 5, 5, 3]].forEach(([x, z, w, d, h]) => api.box({ x, z, w, d, h, color: 0xd1bb92 }));
    SHEP.gateZone = api.zone({ x: SHEP.GATE[0], z: SHEP.GATE[1], r: 3, time: 0.3, color: 0xfde68a, hidden: true,
      onDone(helpers) { api.task('town'); helpers.forEach((p) => api.servant(p, 3)); } });
    const [sx, sz] = SHEP.STABLE;
    const shelter=api.box({ x: sx, z: sz - 4, w: 8, d: 6, h: 3.2, color: 0x8a7a66, tex: 'stone', house: false });
    SHEP.shelter=shelter;
    const opening = new T.Mesh(new T.PlaneGeometry(2.6, 2.2), new T.MeshBasicMaterial({ color: 0xffd38a })); opening.position.set(sx, 1.1, sz - 0.98); api.add(opening);
    const warm = new T.PointLight(0xffb347, 1.4, 12, 2); warm.position.set(sx, 2, sz + 0.6); api.add(warm);
    // Stone-and-timber shelter: shallow facade detail fits the original solid volume.
    const stable=new T.Group();stable.name='bethlehem-stable';stable.userData.landmark='stable-timber-stone';
    const timber=(x,y,z,w,h,d,c=0x765536)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,'wood'));m.position.set(x,y,z);m.castShadow=true;stable.add(m);return m;};
    const front=sz-.94;
    [-3.65,-1.48,1.48,3.65].forEach(dx=>timber(sx+dx,1.45,front,.22,2.9,.18));
    timber(sx,2.98,front,7.75,.32,.22);
    for(const dx of [-2.55,2.55]){const brace=timber(sx+dx,2.35,front+.015,1.25,.14,.2);brace.rotation.z=dx<0?-.55:.55;}
    for(let i=0;i<10;i++)timber(sx-3.6+i*.8,3.18,sz-4,.18,.08,5.9,0x957551);
    // Side shutters stay on the stone face, away from Mary, Joseph and the gather space.
    for(const dx of [-2.55,2.55]){
      const recess=new T.Mesh(new T.PlaneGeometry(.8,.7),new T.MeshBasicMaterial({color:0xa96c35}));recess.position.set(sx+dx,1.7,front+.11);stable.add(recess);
      for(const slat of [-.25,0,.25])timber(sx+dx+slat,1.7,front+.13,.065,.76,.07);
    }
    const straw=new T.Mesh(new T.CircleGeometry(2.3,18),api.mat(0x9b8557));straw.rotation.x=-Math.PI/2;straw.scale.set(1,.55,1);straw.position.set(sx,.025,sz-.2);stable.add(straw);
    api.scenery(stable);SHEP.stableArt=stable;
    const mary = api.person(0x1d4ed8, 0xf5f5f4, 1); mary.position.set(sx - 1.9, 0, sz + 0.2); api.add(mary);
    const joseph = api.person(0x78350f, 0xe7e5e4, 1, { beard: true }); joseph.position.set(sx + 1.9, 0, sz + 0.2); api.add(joseph);
    [[-2.2, 1.8], [2.4, 1.6]].forEach(([dx, dz]) => { const d = api.animalMesh('donkey'); d.position.set(sx + dx * 2.2, 0, sz + dz - 3); api.add(d); });

    // --- fragments ---
    // 2: a rock on the hills (only the Scribe jumps that high)
    api.box({ x: 12.5, z: 26, w: 3, d: 3, h: 5 + shepHill(26), color: 0x8a8178, house: false });
    api.box({ x: 10, z: 26, w: 1.6, d: 1.6, h: 2.0 + shepHill(26), color: 0x8b6b45 });
    api.fragment({ x: 12.5, z: 26, y: 5 + shepHill(26) + 1.3 });
    // 3: the Builder makes steps up to the inn roof
    [[-6.2, -25.4, 1.2], [-6.2, -27.4, 2.3]].forEach(([x, z, top]) => SHEP.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-5, 0.2, -21.6); api.add(planks);
    api.interact({
      x: -5, z: -21.6, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up to the inn roof (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; SHEP.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: -10, z: -28, y: 3.4 + 1.3 });

    // --- Golden Scroll course along the east hills ---
    const c = (x, z, top, kind) => ({ x, z, top: top + shepHill(z), kind });
    api.course([c(16.4, 40, 1.1, 'block'), c(17.0, 36.8, 2.1, 'float'), c(16.4, 33.6, 3.0, 'crumble'), c(17.0, 30.4, 3.8, 'float'),
      c(16.4, 27.2, 4.6, 'crumble'), c(17.0, 24.0, 5.0, 'spring'), c(16.4, 20.8, 9.2, 'float'), c(17.0, 17.6, 9.8, 'crumble'), c(16.4, 14.4, 10.4, 'float')]);

    api.leaves([[0, 40], [-3, 35], [3, 31], [-4, 26], [2, 21], [0, 16], [0, 12], [0, 1], [0.6, -2.4, 2.9], [-0.6, -4, 2.9], [0.6, -5.6, 2.9],
      [0, -9], [0, -21], [-3, -25], [3, -27]]);
  },

  onCallText(kind, n) {
    if (SHEP.saidCall) return '';
    SHEP.saidCall = true;
    return '🐑 The sheep follow you! Lead them to the fold.';
  },

  // the sheep are safe: the angel of the Lord, then the heavenly host
  _angel(api) {
    if (SHEP.heard) return; SHEP.heard = true;
    SHEP.angel.visible = true; SHEP.angelLight.intensity = 2.4;
    api.sfx('fanfare');
    api.story([
      { art: '✨', title: 'The glory of the Lord', text: 'And, lo, the angel of the Lord came upon them, and the glory of the Lord shone round about them: and they were sore afraid.', ref: 'Luke 2:9' },
      { art: '📣', title: 'Good tidings of great joy', text: 'And the angel said unto them, Fear not: for, behold, I bring you good tidings of great joy, which shall be to all people. For unto you is born this day in the city of David a Saviour, which is Christ the Lord.', ref: 'Luke 2:10–11' },
      { art: '🎶', title: 'Glory to God', text: 'And suddenly there was with the angel a multitude of the heavenly host praising God, and saying, Glory to God in the highest, and on earth peace, good will toward men.', ref: 'Luke 2:13–14' }
    ], () => {
      SHEP.host.forEach((h) => { h.visible = true; });
      SHEP.hostT = api.time;
      SHEP.gateZone.show(true);
      api.toast('🏃 "Let us now go even unto Bethlehem" (Luke 2:15)! Hurry down the hill to the town.', 4500);
    });
  },

  update(api, dt) {
    if(SHEP.entry&&!SHEP.entry.done&&api.activePlayers().some(p=>p.pos.z<46)){
      SHEP.entry.done=true;api.checkpoint({x:0,z:44,label:'Shepherds’ hillside'});api.toast('Bring the five sheep into the fold.',2600);
    }
    // the host shines, then goes back into heaven
    if (SHEP.hostT !== undefined) {
      const k = Math.min(1, (api.time - SHEP.hostT) / 10);
      SHEP.host.forEach((h, i) => { h.position.y += dt * (k > 0.6 ? 9 : 0.2 * Math.sin(api.time + i)); if (h.position.y > 40) h.visible = false; });
      if (k > 0.6) { SHEP.angel.position.y += dt * 9; SHEP.angelLight.intensity = Math.max(0, 2.4 - (k - 0.6) * 6); if (SHEP.angel.position.y > 40) SHEP.angel.visible = false; }
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if(SHEP.entry&&!SHEP.entry.done){const next=SHEP.entry.route.find(r=>ps[0].pos.z>r[2]+1);return next||[0,api.terrain(0,44)+1,44];}
    const [fx, fz] = SHEP.FOLD;
    if (!api.taskDone('sheep')) {
      if (SHEP.sheep.some((f) => f.state === 'follow')) return [fx, 1.5, fz];
      const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
      const s = SHEP.sheep.filter((f) => f.state === 'idle').sort((a, b) => Math.hypot(a.pos.x - cx, a.pos.z - cz) - Math.hypot(b.pos.x - cx, b.pos.z - cz))[0];
      return s ? [s.pos.x, s.pos.y + 1.5, s.pos.z] : [fx, 1.5, fz];
    }
    if (!api.taskDone('town')) return [SHEP.GATE[0], 1.5, SHEP.GATE[1]];
    return [SHEP.STABLE[0], 1.5, SHEP.STABLE[1] + 1];
  },

  finale: {
    message: '🌟 Everyone come to the stable!',
    beacon: [0, 3.4, -30],
    inZone(p) { return Math.hypot(p.pos.x - SHEP.STABLE[0], p.pos.z - (SHEP.STABLE[1] + 1)) < 4; },
    onUpdate(api, t) {
      if (t > 0.5 && !SHEP.told) {
        SHEP.told = true;
        api.story([
          { art: '🌾', title: 'Lying in a manger', text: 'And they came with haste, and found Mary, and Joseph, and the babe lying in a manger.', ref: 'Luke 2:16' },
          { art: '💛', title: 'The promised Saviour', text: 'God\'s own Son was born as a little baby. He is the Saviour God promised long ago, in the garden and through Isaiah. We don\'t show Him in our game, but the shepherds saw Him with their own eyes.' },
          { art: '🎶', title: 'Glorifying and praising God', text: 'And the shepherds returned, glorifying and praising God for all the things that they had heard and seen, as it was told unto them.', ref: 'Luke 2:20' }
        ], () => { SHEP.endT = api.time; api.sfx('win'); });
      }
      return SHEP.endT !== undefined && api.time - SHEP.endT > 2;
    }
  }
};
