/* =====================================================================
 * LEVEL 1-1: IN THE BEGINNING  (Genesis 1–2)  — the "Garden Gateway"
 * ---------------------------------------------------------------------
 * Movement first: the family runs, jumps and explores; the garden jobs happen on the way.
 * Players walk toward -z:
 *   Opening meadow (z 40..8)   run downhill along a fruit trail, hop the brook, stump stair to a scroll piece
 *   The river      (z 5..-5)   stepping stones (the camera frames the next stone), the Fisherman nets a piece
 *   Animal meadow  (z -8..-35) God brings the animals: they come to the path two by two, one press names a pair
 *   Treetop route  (optional)  roots and branches up the great oak to the Golden Scroll
 *   Garden heart   (z -45)     everyone gathers at the tree; the named animals come too: "very good"
 * Tasks: tend 3 plants in passing ("to dress it and to keep it") + name 4 pairs of animals.
 * Only edit THIS file to change the level. See GEMINI.md.
 * ===================================================================== */

const EDEN = {
  plants: [],
  animals: [],          // every animal (two per pair)
  pairs: [],            // { kind, need, a, b, inter, mark, named, coming, home, meet }
  firstName: true,
  plantHint: false,
  nameHint: false
};

function edenRoots(api,x,z,scale=1) {
  const T=api.THREE,g=new T.Group();g.name='garden-tree-roots';
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2+.3,from=new T.Vector3(x+Math.sin(a)*.2,api.terrain(x,z)+.35*scale,z+Math.cos(a)*.2),tx=x+Math.sin(a)*1.3*scale,tz=z+Math.cos(a)*1.3*scale,to=new T.Vector3(tx,api.terrain(tx,tz)+.025,tz),v=to.clone().sub(from);
    const m=new T.Mesh(new T.CylinderGeometry(.04*scale,.13*scale,v.length(),7),api.texMat(0x705438,'bark'));m.position.copy(from).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());g.add(m);
  }
  api.scenery(g);return g;
}

const LEVEL = {
  id: '1-1',
  bibleConnection: {"passage": "Genesis 2:15–20", "text": "God gave Adam work in the garden and brought the animals to him to name. Tending plants and meeting animals helps us explore that care; our puzzles are imagined."},
  world: 'World 1-1',
  title: 'In the Beginning',
  sky: 0x7dd3fc,
  ambient: 0.8,
  artDirection: {textureStrength:.32,storyPlants:24,ambientCount:24,checkpointSigns:false,roundTrees:true,groundCover:'garden'},
  decor: {grass:95,flowers:18,pebbles:16,plants:false},
  soundscape: {water:[{x:0,z:26,halfWidth:8,range:9},{x:0,z:0,halfWidth:18,range:12}]},
  leafIcon: '🍎',
  leafColor: 0xef4444,
  leafShape: 'round',                 // apples, not leaves
  spawn: [0, 61],
  bounds: { minX: -19, maxX: 19, minZ: -56, maxZ: 66 },
  courseTheme: 'tree',                // the Golden Scroll route climbs the great oak: roots and branches
  startMessage: 'Follow the apples over the garden banks. Miss a jump? Land on the grass and try again.',

  intro: [
    { text: 'In the beginning God created the heaven and the earth.', ref: 'Genesis 1:1' },
    { text: 'And the LORD God planted a garden eastward in Eden; and there he put the man whom he had formed.', ref: 'Genesis 2:8' }
  ],

  // story cards shown after Start (with ref = exact KJV, without = narration)
  introStory: [
    { art: '🌍', title: 'In the Beginning', text: 'In the beginning God created the heaven and the earth.', ref: 'Genesis 1:1' },
    { art: '☀️', text: 'And God said, Let there be light: and there was light.', ref: 'Genesis 1:3' },
    { art: '🌳', text: 'God gave Adam a good garden to care for. Explore it and meet the animals God brought.' }
  ],

  tasks: [
    { id: 'tend', icon: '🌱', label: 'Tend the garden', total: 3 },
    { id: 'name', icon: '🦌', label: 'Name the animals', total: 4 }
  ],

  memoryVerse: { text: 'And a river went out of Eden to water the garden; and from thence it was parted, and became into four heads.', ref: 'Genesis 2:10' },

  ending: {
    verse: { text: 'And God saw every thing that he had made, and, behold, it was very good.', ref: 'Genesis 1:31' },
    message: 'God made everything very good. He gave Adam good work in His garden.'
  },

  quiz: [
    { q: 'Who gave names to the animals?', ref: 'Genesis 2:19–20', options: ['Noah', 'Adam', 'Moses'], answer: 1 },
    { q: 'Why did God put the man in the garden?', ref: 'Genesis 2:15', options: ['To dress it and to keep it', 'To build a city', 'To sail a boat'], answer: 0 },
    { q: 'What did God say about everything He made?', ref: 'Genesis 1:31', options: ['It was good enough', 'It was very good', 'It needed fixing'], answer: 1 }
  ],

  music: {
    bpm: 96,
    notes: [72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
            69, 0, 72, 0, 74, 0, 76, 0, 74, 72, 69, 0, 67, 0, 0, 0],
    bass: [48, 48, 45, 45, 41, 41, 43, 43]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * 0.3 + Math.cos(z * 0.25) * 0.3;
    h += Math.max(0, Math.abs(x) - 15) * 1.6;                           // hills at the sides
    h += Math.max(0, z - 8) * 0.07;                                     // the meadow runs downhill from the start
    const dz = Math.abs(z);                                              // river across z = 0
    if (dz < 5) h -= 2.6 * Math.min(1, (5 - dz) / 0.8);
    const db = Math.abs(z - 26 - Math.sin(x * 0.35) * 0.8);              // a little winding brook to hop near the start
    if (db < 2.6 && Math.abs(x) < 8.5) h -= 1.0 * (1 - db / 2.6) * Math.min(1, (8.5 - Math.abs(x)) / 1.5);   // (its ends tuck under the banks)
    const dt = Math.hypot(x, z + 45);                                    // mound for the tree
    if (dt < 9) h += 1.6 * (1 - dt / 9);
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z) < 5 && h < -1) return 0x2563eb;
    if (Math.abs(x) > 16) return 0x3f8c2c;
    // Eden is the most alive place in the game: rich, fresh greens, with a warm path and lush banks (colours only)
    const base=Math.abs(x-Math.sin(z*.12)*2.2)<1.8&&z>6?0xd9c389:Math.sin(x*.17+Math.sin(z*.09))*Math.cos(z*.12)>.15?0x5bb534:0x4aa22a;
    const river=Math.max(0,1-Math.abs(Math.abs(z)-5.1)/.85),brook=Math.abs(x)<8.5?Math.max(0,1-Math.abs(Math.abs(z-26-Math.sin(x*.35)*.8)-2.5)/1.0):0;
    return new THREE.Color(base).lerp(new THREE.Color(0x4f8a36),Math.max(river,brook)*.45).getHex();
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    // A gentle imagined garden trail replaces the generic pit course. Misses land on grass.
    EDEN.entry={done:false,route:[]};
    [[0,56,.65,5,3],[3,52,1.25,5,3],[0,48,.65,5,3]].forEach(([x,z,rise,w,d])=>{
      const base=api.terrain(x,z);const bank=api.rockBox({x,z,y:base,w,d,h:rise,color:0x8b9270,house:false});const cap=new T.Mesh(new T.PlaneGeometry(w-.08,d-.08),api.texMat(0x99ac73,'ground'));cap.rotation.x=-Math.PI/2;cap.position.y=rise/2+.006;cap.receiveShadow=true;bank.mesh.add(cap);EDEN.entry.route.push([x,base+rise,z]);
      const root=new T.Mesh(new T.CylinderGeometry(.15,.24,w,9),api.texMat(0x805a35,'wood'));root.rotation.z=Math.PI/2;root.position.set(x,base+rise-.15,z+d/2-.1);api.add(root);
    });
    [[-5,43],[5,43]].forEach(([x,z])=>api.tree(x,z,1.1,0x3f9b51));
    api.leaves([[0,59],[0,56,api.terrain(0,56)+1.7],[3,52,api.terrain(3,52)+2.3],[0,48,api.terrain(0,48)+1.7],[0,44],[0,40]]);
    api.discovery({id:'garden-blossoms',name:'The blossom grove',x:-8,z:53,y:api.terrain(-8,53),r:2});
    [[-8,53],[-9,51],[-6.5,52]].forEach(([x,z])=>{const f=new T.Mesh(new T.IcosahedronGeometry(.3,1),api.mat(0xf8c4d3));f.position.set(x,api.terrain(x,z)+.4,z);api.add(f);});
    api.camZone({minX:-10,maxX:10,minZ:39,maxZ:65,yaw:.28,height:10,back:15,focus:[0,api.terrain(0,48),48],pull:.18});

    const path = (z) => Math.sin(z * 0.12) * 2.2;                        // x of the path at z (it winds a little)

    // fruit trees along the meadow
    [[-13, 38], [13, 34], [-14, 18], [14, 14], [-13, -14], [-12, -32]].forEach(([x, z]) => {
      const tree=api.tree(x, z, 1.0, 0x2f8f3a);tree.scale.set(1+(Math.abs(x)%3)*.06,1+(Math.abs(z)%4)*.045,1);edenRoots(api,x,z);
      for (let i = 0; i < 4; i++) {
        const f = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), api.mat(0xef4444));
        f.position.set(x + Math.cos(i * 1.6) * 1.4, api.terrain(x, z) + 4 + (i % 2) * 0.8, z + Math.sin(i * 1.6) * 1.4);
        api.add(f);
      }
    });

    // ---- the opening meadow: a fruit trail down the winding path, and the brook to hop ----
    const trail = []; for (let z = 33; z >= 9; z -= 2) if (Math.abs(z - 26) > 1.6) trail.push([path(z), z]);
    api.leaves(trail);
    api.arc([path(28), 28, api.terrain(path(28), 28)], [path(24), 24, api.terrain(path(24), 24)], 2);   // apples over the brook
    const by = api.terrain(0, 26) + 0.55;                                 // (the brook is shallow: nobody gets wet)
    const bg = new T.PlaneGeometry(19, 3.2, 38, 1), bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++){const x=bp.getX(i)*17/19,taper=Math.pow(Math.max(0,Math.sin(Math.PI*(x/17+.5))),.4);bp.setX(i,x);bp.setY(i,bp.getY(i)*taper-Math.sin(x*.35)*.8);}   // it winds like the channel
    bg.computeBoundingBox();
    // This winding surface has its own water texture; rectangular shoreline tracing
    // would put foam outside its tapered ends. The main river keeps the shared shore system.
    const brookMat=api.texMat(0x319ad2,'water').clone();brookMat.transparent=true;brookMat.opacity=.8;if(brookMat.map){brookMat.map=brookMat.map.clone();brookMat.map.repeat.set(2.4,.65);brookMat.map.needsUpdate=true;}
    const brook = new T.Mesh(new T.BufferGeometry().copy(bg),brookMat);
    brook.rotation.x = -Math.PI / 2; brook.position.set(0, by, 26); api.add(brook);EDEN.brook=brook;
    // Bank tones are painted into terrain itself: no floating trim or false ledge.

    // plants to tend: right beside the path, tended just by passing through the ring
    const plantAt = [[path(30), 30], [path(14), 14], [path(-18), -18]];   // right on the path: running through tends them
    plantAt.forEach(([x, z]) => {
      const sprout = new T.Group();
      const mound = new T.Mesh(new T.SphereGeometry(0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), api.mat(0x7a5230));
      mound.scale.y = 0.45; sprout.add(mound);
      for (let i = 0; i < 3; i++) {
        const leaf = new T.Mesh(new T.SphereGeometry(0.22, 6, 4), api.mat(0x4ade80));
        const a = (i / 3) * Math.PI * 2;
        leaf.scale.set(0.5, 0.25, 1); leaf.position.set(Math.cos(a) * 0.18, 0.55, Math.sin(a) * 0.18); leaf.rotation.y = -a;
        sprout.add(leaf);
      }
      const stalk = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.4, 4), api.mat(0x22c55e));
      stalk.position.y = 0.4; sprout.add(stalk);
      sprout.position.set(x, api.terrain(x, z), z);
      api.add(sprout);
      const bloom = new T.Group();
      for (let i = 0; i < 6; i++) {
        const stem = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.2, 5), api.mat(0x22c55e));
        const a = (i / 6) * Math.PI * 2;
        stem.position.set(Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6); bloom.add(stem);
        const fl = new T.Mesh(new T.DodecahedronGeometry(0.28), api.mat([0xf43f5e, 0xfacc15, 0xa855f7, 0xf97316][i % 4]));
        fl.position.set(Math.cos(a) * 0.6, 1.25, Math.sin(a) * 0.6); bloom.add(fl);
      }
      bloom.position.set(x, api.terrain(x, z), z);
      bloom.visible = false;
      api.add(bloom);
      EDEN.plants.push(api.zone({
        x, z, r: 1.9, time: 0.28, color: 0x22c55e,
        onDone(helpers) {
          sprout.visible = false; bloom.visible = true;
          api.puff(x, api.terrain(x, z) + 1, z, 0xf9a8d4, 14);
          api.sfx('build');
          api.task('tend');
          helpers.forEach((p) => api.servant(p, 4));
          if (api.taskCount('tend') === 1) {
            api.verse('Dress it and keep it', 'And the LORD God took the man, and put him into the garden of Eden to dress it and to keep it.', 'Genesis 2:15');
          }
        }
      }));
    });

    // ---- the animals: God brings them. Each pair waits off the path, then comes to meet you. ----
    // required: rabbits, deer, doves, lambs. Bonus: cows and lions (a shower of apples).
    [['rabbit', 8, 17, true], ['deer', -9, -11, true], ['dove', 9, -20, true], ['lamb', -9, -27, true],
      ['cow', 10, 9, false], ['lion', 9, -33, false]].forEach(([kind, x, z, need]) => {
      const a = api.follower({ x, z, kind, call: false }), b = api.follower({ x: x + (x > 0 ? 1.4 : -1.4), z: z - 0.8, kind, call: false });   // they come by themselves (God brings them)
      const mark = new T.Mesh(new T.OctahedronGeometry(0.28), api.mat(need ? 0xfde047 : 0xc4b5fd, { emissive: need ? 0x8a6d00 : 0x4c1d95 }));
      mark.scale.y = 1.6; api.add(mark);                                 // bobbing "!" over the pair until named
      const pr = { kind, need, a, b, mark, named: false, coming: false, meet: [path(z) + (x > 0 ? 2.6 : -2.6), z] };
      pr.inter = api.interact({
        x, z, r: 2.6, vRange: 4, label: 'Name the ' + kind + 's',
        use(p) {
          pr.named = true; this.remove(); pr.mark.visible = false;
          api.servant(p, 3);
          api.sfx(kind === 'lion' ? 'roar' : 'bleat');
          [a, b].forEach((f) => { f.joyT = api.time; api.puff(f.pos.x, f.pos.y + 1, f.pos.z, 0xfde047, 8); });
          if (need) api.task('name');
          else api.leaves([[p.pos.x + 1.2, p.pos.z - 1.2], [p.pos.x - 1.2, p.pos.z - 1.2], [p.pos.x, p.pos.z - 2.2], [p.pos.x + 1.2, p.pos.z - 3.2], [p.pos.x - 1.2, p.pos.z - 3.2]]);   // a bonus: a shower of apples
          if (EDEN.firstName) {
            EDEN.firstName = false;
            api.verse('God brought them to Adam', 'And out of the ground the LORD God formed every beast of the field, and every fowl of the air; and brought them unto Adam to see what he would call them: and whatsoever Adam called every living creature, that was the name thereof.', 'Genesis 2:19');
          }
        }
      });
      EDEN.pairs.push(pr);
      EDEN.animals.push({ f: a, kind, pair: pr, get named() { return pr.named; }, inter: pr.inter }, { f: b, kind, pair: pr, get named() { return pr.named; }, inter: pr.inter });
    });

    // ---- hill stump stair -> scroll piece 1 (off to the right of the meadow) ----
    api.stump(11, 30, 1.0);
    api.stump(13, 27, 2.2);
    api.stump(10.5, 24, 3.4);
    api.fragment({ x: 10.5, z: 24, y: api.terrain(10.5, 24) + 3.4 + 1.4 });

    // ---- the river + stepping stones (the camera turns to frame the next stone) ----
    const water = new T.Mesh(new T.PlaneGeometry(38, 10), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.7, 0);
    api.add(water);
    api.hazard({ x: 0, z: 0, w: 60, d: 9.2 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Hop on the stepping stones (the Fisherman can wade).' });
    [[-1, 3.2], [1.5, 0.3], [-1, -2.8]].forEach(([x, z]) => api.stump(x, z, 3.0, 1.1));
    api.camZone({ minX: -6, maxX: 6, minZ: -4.5, maxZ: 7.5, yaw: 0.5, height: 9.5, back: 14, focus: [0, 0.5, -3], pull: 0.35 });
    api.fragment({ x: 11, z: 0, y: 0.6, net: true });                    // scroll piece 2: the Fisherman nets it
    [[-5, 2], [-8.5, 0.5], [-12, -1]].forEach(([x, z], i) => api.stump(x, z, 3.0 + i * 1.1, 0.9));   // a rock stair in the river
    api.fragment({ x: -12, z: -1, y: api.terrain(-12, -1) + 5.2 + 1.4 }); // scroll piece 3

    // ---- the great oak and its treetop route to the Golden Scroll (optional) ----
    const oak = api.stump(14.6, -21, 12, 1.5);                            // the trunk (solid)
    [[14.6, 15.2, -21, 2.6], [12.4, 14.4, -19.6, 1.9], [16.4, 14.8, -23.2, 2.1], [14.0, 16.8, -22.6, 1.9], [16.6, 15.6, -19.4, 1.7],
      [12.8, 16.2, -22.8, 1.6], [15.4, 17.4, -20.6, 1.5], [13.2, 13.8, -23.2, 1.5]].forEach(([x, y, z, r]) => {
      const c = new T.Mesh(new T.IcosahedronGeometry(r, 1), api.texMat(0x2f8f3a, 'leaves'));
      c.position.set(x, api.terrain(14.6, -21) + y, z); c.castShadow = true; api.add(c);
    });
    api.course([
      { x: 6, z: -13, top: 1.0, kind: 'block' },          // a root
      { x: 8.5, z: -15.5, top: 2.1, kind: 'float' },      // branches...
      { x: 11, z: -17.5, top: 3.2, kind: 'block' },
      { x: 11, z: -21, top: 3.6, kind: 'spring' },        // a springy bough
      { x: 11, z: -24.5, top: 7.6, kind: 'float' },
      { x: 13.5, z: -27, top: 8.6, kind: 'float' },
      { x: 11, z: -29.5, top: 9.4, kind: 'crumble' },     // a dry twig
      { x: 8.5, z: -27.5, top: 10.2, kind: 'float' }
    ]);
    api.camZone({ minX: 4.5, maxX: 16, minZ: -32, maxZ: -11.5, yaw: -0.85, height: 7.5, back: 12.5, focus: [10.5, 6, -24], pull: 0.3 });

    // ---- the tree in the midst of the garden (the finish) ----
    const tz = -45, ty = api.terrain(0, tz);
    const trunk = new T.Mesh(new T.CylinderGeometry(1.0, 1.6, 7, 10), api.mat(0x6b4a2b));
    trunk.position.set(0, ty + 3.5, tz); api.add(trunk);
    [[0, 9, 0, 4.5], [-2.5, 8, 1, 3], [2.5, 8, -1, 3]].forEach(([x, y, z, r]) => {
      const c = new T.Mesh(new T.IcosahedronGeometry(r, 2), api.mat(x===0?0x5f8d4e:0x739958));
      c.position.set(x, ty + y, tz + z); c.castShadow = true; api.add(c);
    });
    api.leaves([[path(-8), -8], [path(-11), -11], [path(-14), -14], [path(-22), -22], [path(-25), -25], [path(-30), -30], [path(-34), -34], [path(-38), -38]]);
    // Optional imagined dialogue; Scripture and task actions keep their own meaning/priority.
    const adam=api.storyPerson(0xb49668,0x63804b,1,{hair:0x483021});adam.position.set(-4.5,api.terrain(-4.5,37),37);api.add(adam);EDEN.adam=adam;
    EDEN.conversation=api.conversation({person:adam,speaker:'Adam',label:'Ask Adam about the garden',clue(){
      const plant=EDEN.plants.find(z=>!z.done);
      if(plant)return {text:'God gave me this garden to care for. The young plants are beside the path.',at:[plant.x,api.terrain(plant.x,plant.z)+1,plant.z]};
      const pair=EDEN.pairs.find(p=>p.need&&!p.named);
      if(pair)return {text:'God brought the animals to me to name. Look for the next pair beside the path.',at:[pair.a.pos.x,pair.a.pos.y+1,pair.a.pos.z]};
      return {text:'God made His creation very good. Meet at the great tree.',at:[0,api.terrain(0,-45)+1,-45]};
    }});
    EDEN.finalView=api.camZone({minX:-13,maxX:13,minZ:-56,maxZ:-36,yaw:.15,height:13,back:20,focus:[0,3,-45],pull:.15});

  },

  update(api, dt) {
    if(EDEN.entry&&!EDEN.entry.done&&api.players().some(p=>p.pos.z<38)){EDEN.entry.done=true;api.checkpoint({x:0,z:36,label:'Garden meadow'});}
    api.posePerson(EDEN.adam,{dt,expression:'listen'});
    if(EDEN.brook.material.map)EDEN.brook.material.map.offset.x+=dt*.012;
    const ps = api.activePlayers();
    EDEN.pairs.forEach((pr, i) => {
      // God brings them: when the family comes near, the pair walks to meet them beside the path
      if (!pr.coming && ps.some((p) => Math.hypot(p.pos.x - pr.a.pos.x, p.pos.z - pr.a.pos.z) < 13)) pr.coming = true;
      if (pr.coming && !pr.named) {
        [[pr.a, -0.7], [pr.b, 0.7]].forEach(([f, side]) => {
          const tx = pr.meet[0], tz = pr.meet[1] + side, dx = tx - f.pos.x, dz = tz - f.pos.z, d = Math.hypot(dx, dz);
          f.home.set(tx, f.home.y, tz);
          if (d > 0.6) { const sp = Math.min(d, 2.6 * dt); f.pos.x += dx / d * sp; f.pos.z += dz / d * sp; }
        });
      }
      if (pr.named) return;
      const mx = (pr.a.pos.x + pr.b.pos.x) / 2, mz = (pr.a.pos.z + pr.b.pos.z) / 2, my = Math.max(pr.a.pos.y, pr.b.pos.y);
      pr.inter.x = mx; pr.inter.z = mz; pr.inter.y = my;
      pr.mark.position.set(mx, my + 1.9 + Math.sin(api.time * 3 + i) * 0.15, mz);
      pr.mark.rotation.y += dt * 2;
    });
    // one gentle hint each, the first time a kid comes near a plant or a pair
    if (!EDEN.plantHint && EDEN.plants.some((z) => !z.done && ps.some((p) => Math.hypot(p.pos.x - z.x, p.pos.z - z.z) < 4))) {
      EDEN.plantHint = true;
      api.toast('🌱 Run through the green ring to tend the plant!', 2600);
    }
    if (!EDEN.nameHint && EDEN.pairs.some((pr) => !pr.named && ps.some((p) => Math.hypot(p.pos.x - pr.inter.x, p.pos.z - pr.inter.z) < 3.5))) {
      EDEN.nameHint = true;
      api.toast('❗ Press Y on a controller (E on the keyboard) to name them!', 2600);
    }
  },

  storyScene(api,page) {
    if(!EDEN.finalView)return;
    const good=page&&page.ref==='Genesis 1:31';EDEN.readingScene=good?'good-garden':null;
    // verse() owns this transient page; the source Scripture and declaration are untouched.
    if(good)page.scene='good-garden';
    Object.assign(EDEN.finalView,good?{yaw:.12,height:12,back:20,focus:[6,3,-45],pull:.45}:{yaw:.15,height:13,back:20,focus:[0,3,-45],pull:.15});
  },

  objective(api) {
    if(EDEN.entry&&!EDEN.entry.done){const p=api.activePlayers()[0];const next=EDEN.entry.route.find(r=>p&&p.pos.z>r[2]+1);return next||[0,api.terrain(0,38)+1,38];}
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
    const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const todo = [];
    EDEN.plants.forEach((z) => { if (!z.done) todo.push([z.x, z.y + 0.5, z.z]); });
    EDEN.pairs.forEach((pr) => { if (pr.need && !pr.named) todo.push([pr.inter.x, pr.inter.y + 1, pr.inter.z]); });
    if (!todo.length) return null;
    todo.sort((a, b) => (Math.hypot(a[0] - cx, a[2] - cz) + Math.max(0, a[2] - cz) * 0.6) - (Math.hypot(b[0] - cx, b[2] - cz) + Math.max(0, b[2] - cz) * 0.6));   // prefer what's ahead
    return todo[0];
  },

  finale: {
    message: '🌳 Everyone gather at the great tree in the middle of the garden!',
    beacon: [0, 3, -40],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z + 45) < 8; },
    onUpdate(api, t) {
      if (!EDEN.gathered) {                                               // the named animals come to the tree too
        EDEN.gathered = true;
        EDEN.animals.forEach((an, i) => {
          if (!an.named) return;
          const a = i / EDEN.animals.length * Math.PI * 2;
          an.f.home.set(Math.cos(a) * 6.5, an.f.home.y, -45 + Math.sin(a) * 6.5);
        });
      }
      EDEN.animals.forEach((an) => {
        if (!an.named) return;
        const f = an.f, dx = f.home.x - f.pos.x, dz = f.home.z - f.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.8) { const sp = Math.min(d, 8 * (1 / 60)); f.pos.x += dx / d * sp; f.pos.z += dz / d * sp; }
      });
      if (t > 0.5 && !EDEN.saidGood) {
        EDEN.saidGood = true;
        api.sfx('fanfare');
        api.puff(0, api.terrain(0, -45) + 6, -45, 0xf9a8d4, 30);
        api.verse('Very good', 'And God saw every thing that he had made, and, behold, it was very good.', 'Genesis 1:31');
      }
      return t > 5;
    }
  }
};
