/* =====================================================================
 * LEVEL 4-2: SPEAK, LORD  (1 Samuel 3)
 * ---------------------------------------------------------------------
 * Night at the house of the LORD in Shiloh. A quiet level: no timer or enemies.
 *   The way in    (z 80..46)  broad benches and a low gallery; slide a woven courtyard screen.
 *                              Solid ground beneath every jump; no stock pits or spinning logs.
 *   The courtyard  (z 42..10)  the evening round in lamplight: pick up the oil, the water, the wood and
 *                              a blanket on the way (crates, a low wall, an upper gallery)
 *   Samuel's place (4, -4)     near the lamp of God: the LORD calls (told on cards)
 *   To Eli and back            walk with Samuel to Eli's room; the second and third calls are told in one
 *                              card; walk back along the upper walkway; "Speak; for thy servant heareth"
 * God speaks; nobody solves a puzzle to make Him speak. The message about Eli's house is told gently and
 * truthfully in the morning. Thread: 4-3 (Samuel anoints David).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const SAM = {
  things: [],
  steps: [],
  entryBenches: [],
  entryOpen: false,
  entryCrossed: false,
  boy: null,
  PLACE: [4, -4],
  ELI: [-11.6, 12.4],
  TO_ELI: [[4, -4], [2, 2], [-4, 6], [-10, 10], [-11.6, 12.4]],
  BACK: [[-11.6, 12.4], [-8.6, 12.4], [-6.6, 10], [-6.6, 2], [-6.6, -2], [-3, -4], [4, -4]],     // by the upper walkway
  path: null, seg: 0, walking: false,
  stage: 'round',            // round → wait → toEli → back → spoke
  told: false
};

const LEVEL = {
  id: '4-2',
  bibleConnection: {"passage": "1 Samuel 3", "text": "The LORD called Samuel and announced judgment on Eli’s house. Samuel told Eli the hard truth. Our courtyard screen and evening round are imagined. Opening the screen does not make God speak."},
  world: 'World 4-2',
  title: 'Speak, LORD',
  time: 'night',
  leafIcon: '🕯️',
  leafColor: 0xfde68a,
  spawn: [0, 80],
  bounds: { minX: -19, maxX: 19, minZ: -24, maxZ: 83 },
  startMessage: "Follow the benches to the gallery. Use the special action at the orange ring to open the screen.",

  intro: [
    { text: 'And the child Samuel ministered unto the LORD before Eli. And the word of the LORD was precious in those days; there was no open vision.', ref: '1 Samuel 3:1' },
    { text: 'Then Samuel answered, Speak; for thy servant heareth.', ref: '1 Samuel 3:10' }
  ],

  introStory: [
    { art: '🏕️', title: 'Samuel at Shiloh', text: 'Young Samuel lived at the house of the LORD in Shiloh, helping old Eli the priest. Samuel did not yet know the LORD\'s voice.' },
    { art: '🪔', title: 'Precious in those days', text: 'And the child Samuel ministered unto the LORD before Eli. And the word of the LORD was precious in those days; there was no open vision.', ref: '1 Samuel 3:1' }
  ],

  tasks: [
    { id: 'round', icon: '🪔', label: 'The evening round', total: 4 },
    { id: 'calls', icon: '👂', label: 'Go with Samuel', total: 2, lockedUntil: 'round' }
  ],

  memoryVerse: { text: 'And the LORD came, and stood, and called as at other times, Samuel, Samuel. Then Samuel answered, Speak; for thy servant heareth.', ref: '1 Samuel 3:10' },

  ending: {
    verse: { text: 'And Samuel grew, and the LORD was with him, and did let none of his words fall to the ground.', ref: '1 Samuel 3:19' },
    message: 'God spoke to young Samuel, and Samuel listened and told the truth, even when it was hard.'
  },

  quiz: [
    { q: 'Who did Samuel think was calling him?', ref: '1 Samuel 3:5', options: ['His mother', 'Eli', 'A soldier'], answer: 1 },
    { q: 'What did Eli tell Samuel to say?', ref: '1 Samuel 3:9', options: ['"Go away"', '"Speak, LORD; for thy servant heareth"', '"Wait until morning"'], answer: 1 },
    { q: 'What did Samuel do in the morning?', ref: '1 Samuel 3:18', options: ['He hid the message', 'He told Eli every whit and hid nothing', 'He ran away'], answer: 1 }
  ],

  music: {
    bpm: 66,
    notes: [64, 0, 0, 67, 69, 0, 67, 0, 64, 0, 62, 0, 60, 0, 0, 0,
            64, 0, 0, 67, 72, 0, 71, 0, 69, 0, 67, 0, 64, 0, 0, 0],
    bass: [48, 48, 45, 45, 41, 41, 43, 43]
  },

  terrain(x, z) { return z > 46 ? 0 : Math.sin(x * 0.3) * Math.cos(z * 0.24) * 0.06; },
  groundColor(x, z, h) { return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xa48a64 : 0x9a8160; },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;

    // --- an authored, peaceful way into Shiloh, on solid ground throughout ---
    // Broad bench landings teach the route; the gallery is only 1.6 m above the courtyard.
    [[-3,75,.5],[0,72,1],[3,69,.5]].forEach(([x,z,top])=>{
      SAM.entryBenches.push(api.box({x,z,w:3.4,d:2.8,y:0,h:top,color:0xaf9671,tex:'stone',house:false}));
      api.leaves([[x,z,top+1]]);
    });
    api.box({x:3,z:66,w:3.4,d:2.4,y:0,h:.8,color:0xaf9671,tex:'stone',house:false});
    SAM.entryGallery=api.box({x:3,z:59.5,w:4.2,d:10,y:0,h:1.6,color:0xb8996e,tex:'stone',house:false});
    api.box({x:1.6,z:53.5,w:3,d:2.4,y:0,h:.8,color:0xaf9671,tex:'stone',house:false});
    // The wall and closed screen communicate the route instead of an invisible boundary.
    for(const x of [-11,11])api.box({x,z:51,w:16,d:.5,y:0,h:3.4,color:0xa98c67,tex:'stone',house:false});
    SAM.entryBarrier=api.box({x:0,z:51,w:6,d:.4,y:0,h:2.8,color:0x89613d,tex:'weave',house:false});
    SAM.entryBarrier.mesh.visible=false; // physical proxy; the woven frame below is the visible screen
    const screen=new T.Group();screen.name='shiloh-courtyard-screen';screen.position.set(0,1.4,51);
    const weave=new T.Mesh(new T.BoxGeometry(5.8,2.6,.16),api.texMat(0xb28b59,'weave'));weave.castShadow=true;weave.receiveShadow=true;screen.add(weave);
    for(const x of [-2.95,2.95]){const post=new T.Mesh(new T.BoxGeometry(.15,2.8,.22),api.texMat(0x725036,'wood'));post.position.x=x;screen.add(post);}
    for(const y of [-1.3,1.3]){const rail=new T.Mesh(new T.BoxGeometry(6,.14,.22),api.texMat(0x725036,'wood'));rail.position.y=y;screen.add(rail);}
    api.add(screen);SAM.entryScreen=screen;
    const wheel=new T.Mesh(new T.TorusGeometry(.4,.075,8,16),api.texMat(0x725036,'wood'));wheel.position.set(4.6,2.6,55.4);api.add(wheel);SAM.entryWheel=wheel;
    const spoke=new T.Mesh(new T.BoxGeometry(.65,.08,.08),api.mat(0xb08d4a));wheel.add(spoke);
    const mount=new T.Mesh(new T.BoxGeometry(.18,1.3,.22),api.texMat(0x725036,'wood'));mount.position.set(4.6,2.25,55.55);api.add(mount);
    const rope=new T.Line(new T.BufferGeometry().setFromPoints([
      new T.Vector3(4.6,2.6,55.4),new T.Vector3(4.6,3.05,51.2),new T.Vector3(2.7,2.65,51.1)
    ]),new T.LineBasicMaterial({color:0x816747}));api.add(rope);SAM.entryRope=rope;
    SAM.entryWork=api.zone({x:3,z:56.8,y:1.6,r:1.8,vRange:.65,time:2.4,action:'Slide the courtyard screen',
      onDone(helpers){this.show(false);SAM.entryOpen=true;SAM.entryT=0;helpers.forEach(p=>api.servant(p,2,'for opening the courtyard!'));api.sfx('rope');api.toast('The courtyard screen stays open for everyone. Follow the steps down for the evening round.',3200);}
    });
    // Ordinary lanterns illuminate the human work area; they are not signs of God calling Samuel.
    SAM.entryLights=[];
    [[-5,76],[5.5,68],[5.5,58],[-4,50]].forEach(([x,z],i)=>{
      const y=api.groundAt(x,z),stand=new T.Mesh(new T.CylinderGeometry(.06,.09,2.4,8),api.texMat(0x725036,'wood'));stand.position.set(x,y+1.2,z);api.add(stand);
      const lamp=new T.Mesh(new T.SphereGeometry(.16,10,8),new T.MeshBasicMaterial({color:0xffd79a}));lamp.position.set(x,y+2.4,z);api.add(lamp);
      const light=new T.PointLight(0xffc46b,.65,9,2);light.position.copy(lamp.position);api.add(light);SAM.entryLights.push(light);
    });
    api.leaves([[0,78],[3,66,1.8],[3,63,2.6],[3,60,2.6],[3,57.5,2.6],[1.6,53.5,1.8],[0,49],[0,45]]);
    api.camZone({minX:-8,maxX:8,minZ:67,maxZ:82,yaw:-.2,height:8,back:12,focus:[0,0,72],pull:.3});
    api.camZone({minX:-3,maxX:8,minZ:50,maxZ:67,yaw:.25,height:8,back:12,focus:[2,1,57],pull:.3});

    // --- the house of the LORD: the tent, the lamp of God glowing inside ---
    api.box({ x: 0, z: -14, w: 8, d: 12, h: 3.6, color: 0x5b4030, tex: null, house: false });   // covered with skins (Exodus 26:14)
    const door = new T.Mesh(new T.PlaneGeometry(4, 3), api.mat(0x6d28d9)); door.position.set(0, 1.5, -7.98); api.add(door);
    const lampGlow = new T.PointLight(0xffc46b, 1.3, 12, 2); lampGlow.position.set(0, 2.4, -6.6); api.add(lampGlow);
    const lamp = new T.Mesh(new T.SphereGeometry(0.18, 10, 8), new T.MeshBasicMaterial({ color: 0xffd38a })); lamp.position.set(1.6, 2.2, -7.7); api.add(lamp);
    // Samuel's sleeping place (a mat), Eli's room
    const mat = new T.Mesh(new T.BoxGeometry(1.2, 0.1, 2), api.mat(0x92400e)); mat.position.set(SAM.PLACE[0], 0.05, SAM.PLACE[1]); api.add(mat);
    api.box({ x: -12, z: 18, w: 6, d: 8, h: 3.2, color: 0xc9b089, house: true });
    const eli = api.person(0x57534e, 0xe7e5e4, 1, { age: 'elder', beard: true }); eli.position.set(-13.4, 0, 12.8); api.add(eli);
    const boy = api.person(0x1d4ed8, 0xf5f5f4, 1, { age: 'child' }); boy.position.set(SAM.PLACE[0], 0, SAM.PLACE[1] - 1); api.add(boy);
    SAM.boy = { m: boy, x: SAM.PLACE[0], z: SAM.PLACE[1] - 1 };

    // --- the courtyard: the evening round, picked up on the way ---
    const thing = (kind) => {
      const g = new T.Group();
      if (kind === 'oil') { const j = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 0.55, 12), api.mat(0xb45309)); g.add(j); }
      else if (kind === 'water') { const j = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.8, 12), api.mat(0x9a6b42)); g.add(j); }
      else if (kind === 'wood') { [-0.15, 0.15].forEach((dz) => { const l = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.1, 8), api.mat(0x7a5230)); l.rotation.z = Math.PI / 2; l.position.z = dz; g.add(l); }); }
      else { const b = new T.Mesh(new T.BoxGeometry(0.9, 0.25, 0.6), api.mat(0x1e3a8a)); g.add(b); }
      return g;
    };
    // oil on a stack of crates
    api.box({ x: 6, z: 34, w: 1.6, d: 1.6, h: 1.1, color: 0x8b6b45 });
    api.box({ x: 7.8, z: 32.2, w: 1.8, d: 1.8, h: 2.1, color: 0x8b6b45 });
    // water at the well
    const well = new T.Mesh(new T.CylinderGeometry(1, 1.1, 0.9, 16), api.texMat(0x9a8f80, 'stone')); well.position.set(-7, 0.45, 28); api.add(well);
    // wood behind a low wall
    api.box({ x: -4, z: 20, w: 8, d: 0.6, h: 0.9, color: 0x9a8f80, house: false });
    // a blanket on the upper gallery (steps up the side)
    api.box({ x: 11, z: 20, w: 3, d: 12, h: 2.4, color: 0xb8996e, house: false });
    api.box({ x: 8.6, z: 25, w: 1.6, d: 1.6, h: 1.2, color: 0x8b6b45 });
    [['oil', 7.8, 32.2], ['water', -5.4, 28], ['wood', -4, 18.4], ['blanket', 11, 17]].forEach(([k, x, z]) =>
      SAM.things.push(api.gatherable({ x, z, mesh: thing(k), task: 'round', onGet(p) { api.servant(p, 2); } })));
    api.camZone({ minX: 5, maxX: 14, minZ: 13, maxZ: 28, yaw: 0.45, height: 8, back: 12, focus: [11, 2.4, 18], pull: 0.4 });

    // --- the upper walkway Samuel takes back (steps up from Eli's side, down by the tent) ---
    api.box({ x: -6.6, z: 6, w: 2.4, d: 10, h: 1.6, color: 0xb8996e, house: false });
    api.box({ x: -6.6, z: 11.8, w: 2, d: 1.6, h: 0.8, color: 0x8b6b45, house: false });
    api.box({ x: -6.6, z: 0.2, w: 2, d: 1.6, h: 0.8, color: 0x8b6b45, house: false });
    [[-6.6, 9], [-6.6, 3]].forEach(([x, z]) => { const l = new T.PointLight(0xffb347, 0.6, 7, 2); l.position.set(x + 1.4, 2.6, z); api.add(l); const f = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: 0xffc46b })); f.position.copy(l.position); api.add(f); });

    SAM.placeZone = api.zone({ x: SAM.PLACE[0], z: SAM.PLACE[1] + 1.8, r: 2, time: 0.8, color: 0xfde68a, hidden: true, onDone() { LEVEL._call(api); } });

    // --- fragments ---
    api.fragment({ x: -7, z: 28, y: -0.6, net: true });                        // down in the well (the Fisherman's net)
    api.box({ x: 13, z: 38, w: 3, d: 3, h: 5, color: 0xb8996e, house: false });  // a high wall corner (only the Scribe)
    api.box({ x: 10.5, z: 40.6, w: 1.6, d: 1.6, h: 2.0, color: 0x8b6b45, house: false });
    SAM.lamps = [];
    // Move the scroll out of reach until the ordinary lantern trail is lit in order.
    SAM.lampFragment = api.fragment({ x: 13, z: 38, y: 20 });
    SAM.lampFragment.mesh.visible = false;
    [[10.5, 40.6, 2.0], [13, 38, 5.0]].forEach(([x, z, y], i) => {
      const flame = new T.Mesh(new T.SphereGeometry(0.14, 8, 6), new T.MeshBasicMaterial({ color: 0xffcf70 }));
      flame.position.set(x + 0.5, y + 0.7, z); flame.visible = false; api.add(flame);
      const lamp = { lit: false, flame }; SAM.lamps.push(lamp);
      api.interact({ x, z, y, r: 1.6, vRange: 1.5, label: i ? 'Light lantern 2' : 'Light lantern 1',
        can: () => (!i || SAM.lamps[0].lit ? true : 'Follow the lantern trail: light lantern 1 on the lower ledge first.'),
        use(p) {
          this.remove(); lamp.lit = true; flame.visible = true; api.sfx('coin'); api.servant(p, 2, 'for lighting the way!');
          if (i) { SAM.lampFragment.y = SAM.lampFragment.baseY = 6.3; SAM.lampFragment.mesh.visible = true; }
        }
      });
    });
    [[-15.6, 14.6, 1.2], [-15.6, 16.6, 2.3]].forEach(([x, z, top]) => SAM.steps.push(api.box({ x, z, w: 1.6, d: 1.6, h: 0.35, y: top - 0.35, hidden: true, color: 0xa0703c })));
    const planks = new T.Mesh(new T.BoxGeometry(1.4, 0.4, 2), api.mat(0xa0703c)); planks.position.set(-16, 0.2, 10); api.add(planks);
    api.interact({
      x: -16, z: 10, r: 2.2, label: 'Build steps',
      can: (p) => (p.role.id === 'builder' ? true : 'Some planks. The Builder could make steps up Eli\'s roof (Tab / RB to switch).'),
      use(p) { this.remove(); planks.visible = false; SAM.steps.forEach((s) => s.show(true)); api.sfx('build'); api.servant(p, 3); }
    });
    api.fragment({ x: -13, z: 19, y: 3.2 + 1.3 });

    api.course([
      { x: -16, z: 40, top: 1, kind: 'block' },
      { x: -13.5, z: 38, top: 1.7, kind: 'float' },
      { x: -16, z: 36, top: 2.4, kind: 'float' },
      { x: -13.5, z: 34, top: 3.1, kind: 'float' },
      { x: -16, z: 32, top: 3.8, kind: 'float' },
      { x: -13.5, z: 30, top: 4.5, kind: 'float' }
    ]);
    api.leaves([[0, 38], [3, 34], [6, 34, 1.1], [0, 29], [-3, 24], [0, 16], [4, 12], [8.6, 25, 1.2], [11, 22, 2.4], [2, 6], [3, 0], [-6.6, 8, 1.6], [-6.6, 4, 1.6]]);
  },

  // the LORD calls (told): Samuel runs to Eli
  _call(api) {
    if (SAM.stage !== 'wait') return;
    SAM.stage = 'toEli';
    api.story([
      { art: '👂', title: 'Samuel!', text: 'That the LORD called Samuel: and he answered, Here am I.', ref: '1 Samuel 3:4' }
    ], () => { SAM.path = SAM.TO_ELI; SAM.seg = 0; SAM.walking = true; api.toast('🏃 Samuel runs to Eli. Go with him!', 3000); });
  },

  update(api, dt) {
    SAM.entryWheel.rotation.z=-SAM.entryWork.progress*Math.PI*2;
    if(SAM.entryOpen&&SAM.entryT<.5){
      SAM.entryT=Math.min(.5,SAM.entryT+dt);const k=SAM.entryT/.5;
      SAM.entryScreen.position.x=-6.6*k;
      const rope=SAM.entryRope.geometry.attributes.position;rope.setX(2,2.7-6.6*k);rope.needsUpdate=true;
      // Nobody walks through a visibly closed screen: collision clears only when it has slid away.
      if(k===1){
        SAM.entryBarrier.platform.on=false;
        // Keep the checkpoint sign beside the doorway instead of across the shared-camera view.
        api.checkpoint({x:-4,z:49,label:'Courtyard entrance checkpoint'});
      }
    }
    if(!SAM.entryCrossed&&api.activePlayers().some(p=>p.pos.z<46)){
      SAM.entryCrossed=true;api.checkpoint({x:0,z:43.5,label:'Shiloh courtyard checkpoint'});
    }
    if (!SAM.lamps[1].lit && SAM.lampFragment.shadow) SAM.lampFragment.shadow.visible = false;
    if (SAM.stage === 'round' && api.taskDone('round')) {
      SAM.stage = 'wait'; SAM.placeZone.show(true);
      api.toast('🌙 Night. "Samuel was laid down to sleep" near the lamp of God (1 Samuel 3:3). Sit by him.', 4000);
    }
    // Samuel walks only while someone is near him (the group stays together)
    if (SAM.walking && SAM.path) {
      const b = SAM.boy, tgt = SAM.path[Math.min(SAM.seg + 1, SAM.path.length - 1)];
      const near = api.near(b.x, b.z, 4.5).length > 0;
      const dx = tgt[0] - b.x, dz = tgt[1] - b.z, d = Math.hypot(dx, dz);
      if (near && d > 0.05) { const s = Math.min(d, dt * 3.4); b.x += dx / d * s; b.z += dz / d * s; b.m.rotation.y = Math.atan2(dx, dz); }
      if (d <= 0.05 && SAM.seg < SAM.path.length - 2) SAM.seg++;
      b.m.position.set(b.x, api.groundAt(b.x, b.z, 3), b.z);
      if (d <= 0.05 && SAM.seg >= SAM.path.length - 2) { SAM.walking = false; LEVEL._arrive(api); }
    }
  },

  _arrive(api) {
    api.task('calls'); api.activePlayers().forEach((p) => api.servant(p, 3));
    if (SAM.stage === 'toEli') {
      SAM.stage = 'back';
      api.story([
        { art: '🧓', title: '"I called not"', text: 'And he ran unto Eli, and said, Here am I; for thou calledst me. And he said, I called not; lie down again. And he went and lay down.', ref: '1 Samuel 3:5' },
        { art: '🔁', title: 'Again, and a third time', text: 'The LORD called again, and Samuel ran to Eli again. The third time, Eli understood that it was the LORD calling the boy. He told Samuel to lie down and, if he was called, to answer: "Speak, LORD; for thy servant heareth" (1 Samuel 3:6–9).' }
      ], () => { SAM.path = SAM.BACK; SAM.seg = 0; SAM.walking = true; api.toast('🪔 Walk back with Samuel along the upper walkway to his place.', 3500); });
    } else if (SAM.stage === 'back') {
      SAM.stage = 'spoke';
      api.story([
        { art: '🙏', title: 'Speak; for thy servant heareth', text: 'And the LORD came, and stood, and called as at other times, Samuel, Samuel. Then Samuel answered, Speak; for thy servant heareth.', ref: '1 Samuel 3:10' }
      ]);
    }
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    if(!SAM.entryCrossed&&ps.every(p=>p.pos.z>=46)){
      const front=Math.min(...ps.map(p=>p.pos.z));
      if(front>76.4)return[-3,1.5,75];
      if(front>73.4)return[0,2,72];
      if(front>70.4)return[3,1.5,69];
      if(!SAM.entryOpen)return[3,2.8,56.8];
      return[0,1.5,45];
    }
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length, cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const t = SAM.things.filter((it) => !it.got).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    if (t) return [t.x, t.y + 1, t.z];
    if (SAM.stage === 'wait') return [SAM.PLACE[0], 1.5, SAM.PLACE[1] + 1.8];
    if (SAM.walking) return [SAM.boy.x, SAM.boy.m.position.y + 2, SAM.boy.z];
    return [0, 1.5, -6.6];
  },

  finale: {
    message: '🌅 Morning: everyone gather at the doors of the house of the LORD.',
    beacon: [0, 3, -6],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z + 6) < 4.5; },
    onUpdate(api, t) {
      if (t > 0.5 && !SAM.told) {
        SAM.told = true;
        api.story([
          { art: '🌅', title: 'A hard message', text: 'In the morning Samuel opened the doors (1 Samuel 3:15). God\'s message was hard: He would judge Eli\'s family, because Eli\'s sons did wicked things and Eli did not stop them (1 Samuel 3:13). Samuel was afraid, but he told Eli everything and hid nothing. Eli said, "It is the LORD: let him do what seemeth him good" (1 Samuel 3:18).' },
          { art: '🌱', title: 'Samuel grew', text: 'And Samuel grew, and the LORD was with him, and did let none of his words fall to the ground.', ref: '1 Samuel 3:19' }
        ], () => { SAM.endT = api.time; api.sfx('win'); });
      }
      return SAM.endT !== undefined && api.time - SAM.endT > 2;
    }
  }
};
