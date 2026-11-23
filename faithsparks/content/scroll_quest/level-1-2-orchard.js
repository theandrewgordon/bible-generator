/* =====================================================================
 * LEVEL 1-2: THE FIRST CHOICE  (Genesis 2:16-17, 3:1)
 * ---------------------------------------------------------------------
 * Linear walk, start → finish (players walk toward -z):
 *   Orchard     (z 38..8)    pick good fruit, the forbidden tree + serpent, Belt of Truth
 *   The stream  (z 4..-4)    a pretty bridge that is a LIE (left) and a hidden TRUE path (right)
 *   Meadow      (z -8..-21)  lamp 1, a truth staircase up to lamp 2
 *   The chasm   (z -22..-30) another lie bridge, a truth bridge, and a moving platform
 *   Garden gate (z -36..-46) lamp 3, then everyone gathers at the gate
 * One idea: God's Word is true. The Belt of Truth shows which paths are real (lie bridges vanish
 * under you; true paths appear). Tasks happen on the run: brush past 6 of the 8 good fruit trees,
 * light 3 lamps of truth by running through them.
 * Ending (story cards at the gate, told plainly): Adam and Eve disobeyed, sin
 * separated them from God, they were sent out of the garden, and God gave the
 * first promise of a Saviour (Genesis 3:15). A flaming sword then guards the gate.
 * The gameplay never "undoes" the Fall: the kids help, God acts.
 * Only edit THIS file to change the level. See GEMINI.md.
 * ===================================================================== */

const ORCH = {
  trees: [],
  lamps: [],
  serpent: null,
  sawSerpent: false,
  obeyed: {},
  firstFruit: true,
  BELT: [0, 12]
};

// These are storybook scenery only: no new solid, task, reward or interaction.
function orchardTree(api,tree) {
  const T=api.THREE;while(tree.children.length)tree.remove(tree.children[0]);
  const g=new T.Group();g.name='knowledge-tree-crown';
  const branch=(a,b,r0,r1)=>{const v=new T.Vector3(...b).sub(new T.Vector3(...a)),m=new T.Mesh(new T.CylinderGeometry(r1,r0,v.length(),10),api.texMat(0x6e533b,'bark'));m.position.copy(new T.Vector3(...a)).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());g.add(m);};
  branch([0,0,0],[.15,4.5,0],.67,.28);branch([.1,2.6,0],[-1.4,4.6,.3],.26,.09);branch([.12,3,0],[1.55,4.8,-.2],.24,.08);
  [[-.2,5.4,0,2.05,0x557348],[-1.65,4.9,.3,1.6,0x6c8550],[1.55,5.1,-.3,1.65,0x637b48],[.4,6.45,-.35,1.45,0x738957]].forEach(([x,y,z,r,c])=>{const m=new T.Mesh(new T.IcosahedronGeometry(r,2),api.texMat(c,'leaves'));m.position.set(x,y,z);m.scale.y=.82;g.add(m);});
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;branch([0,.3,0],[Math.sin(a)*1.8,.02,Math.cos(a)*1.8],.16,.035);}
  api.scenery(g);tree.add(g);tree.name='tree-of-knowledge';return tree;
}
function orchardGate(api,gz) {
  const T=api.THREE,g=new T.Group();g.name='garden-stone-arch';g.position.set(0,api.terrain(0,gz),gz);
  const stone=api.texMat(0xc8c0a0,'stone'),light=api.texMat(0xd8cfb1,'stone');
  const block=(x,y,w,h,d,mat,angle=0)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,0);m.rotation.z=angle;m.castShadow=true;g.add(m);};
  [-3.1,3.1].forEach(x=>{for(let row=0;row<4;row++)block(x,.34+row*.67,.9,.65,1.05,row%2?light:stone);block(x,.12,1.12,.24,1.2,stone);});
  for(let i=0;i<11;i++){const angle=(i+.5)/11*Math.PI;block(Math.cos(angle)*3.1,2.4+Math.sin(angle)*3.1,.86,.70,1.05,i%3?stone:light,angle-Math.PI/2);}
  api.scenery(g);api.fadeScenery(g,3.7);return g;
}
function orchardWitnesses(api,gz) {
  const T=api.THREE;
  ORCH.witnesses=[api.storyPerson(0x667246,0x807452,1,{register:false,hair:0x4b3024}),api.storyPerson(0x6f7c4b,0x8b7957,.95,{register:false,hair:0x39271e})];
  ORCH.witnesses.forEach((g,i)=>{g.name=i?'eve-story-witness':'adam-story-witness';g.position.set(i?1.3:-1.3,api.terrain(i?1.3:-1.3,gz-1.2),gz-1.2);g.visible=false;api.add(g);});
  ORCH.guardians=new T.Group();ORCH.guardians.name='garden-guardians';ORCH.guardians.visible=false;
  [-1,1].forEach(sd=>{
    const figure=api.storyPerson(0xd5cfb5,0xc1b994,1.2,{register:false,skin:0xc3a281});figure.position.set(sd*4.1,api.terrain(sd*4.1,gz-.8),gz-.8);const wings=new T.Group();
    [-1,1].forEach(side=>{for(let feather=0;feather<6;feather++){const m=new T.Mesh(new T.SphereGeometry(.13,8,6),api.mat(feather%2?0xc7c8b5:0xe3e0ce));m.scale.set(1,4.5-feather*.35,.45);m.position.set(side*(.45+feather*.12),1.05+feather*.08,-.12);m.rotation.z=-side*(.20+feather*.14);wings.add(m);}});
    api.scenery(wings);figure.add(wings);api.posePerson(figure,{dt:1,expression:'listen'});ORCH.guardians.add(figure);
  });api.add(ORCH.guardians);
}
function orchardPoseWitnesses(api,scene) {
  const outside=scene!=='fall';
  ORCH.witnesses.forEach((g,i)=>{
    const x=i?1.3:-1.3,z=outside?-44.5:-47.2;g.visible=true;g.position.set(x,api.terrain(x,z),z);g.rotation.y=outside?.14*(i?1:-1):0;
    const a=g.userData.storyActor;a.body.children[0].material.color.setHex(outside?i?0xb49b75:0xa88a62:i?0x6f7c4b:0x667246);
    api.posePerson(g,{dt:1,headPitch:scene==='judgment'?.18:.03,expression:scene==='fall'||scene==='judgment'?'worry':'listen',grip:scene==='fall'||scene==='judgment'?[[-.1,.62,.31],[.1,.62,.31]]:undefined});a.smile.scale.y=scene==='fall'||scene==='judgment'?.12:.6;
  });
}

const LEVEL = {
  id: '1-2',
  bibleConnection: {"passage": "Genesis 3:1–24", "text": "Adam and Eve disobeyed God, bringing sin and death. Our fruit, lamps and truth paths illustrate trusting God’s word; collecting things cannot undo the Fall. God promised victory over the serpent."},
  world: 'World 1-2',
  title: 'The First Choice',
  keepArmor: ['belt'],          // the Belt of Truth shows the true paths, so falls and bumps never take it
  sky: 0x93c5fd,
  ambient: 0.8,
  artDirection:{textureStrength:.32,storyPlants:20,ambientCount:18,checkpointSigns:false,roundTrees:true,groundCover:'garden'},
  decor:{grass:80,flowers:16,pebbles:16,plants:false},
  soundscape:{water:[{x:0,z:0,halfWidth:18,range:12}]},
  leafIcon: '🍑',
  leafColor: 0xfb923c,
  leafShape: 'round',
  spawn: [0, 38],
  bounds: { minX: -19, maxX: 19, minZ: -54, maxZ: 42 },
  approach: ['stones', 'log', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Run past the fruit trees to gather good fruit! Follow the golden arrow ↓',

  intro: [
    { text: 'And the LORD God commanded the man, saying, Of every tree of the garden thou mayest freely eat:', ref: 'Genesis 2:16' },
    { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' }
  ],

  introStory: [                                                        // a garden full of good fruit, and one rule to keep
    { art: '🌳', title: 'The First Choice: one rule', text: 'But of the tree of the knowledge of good and evil, thou shalt not eat of it: for in the day that thou eatest thereof thou shalt surely die.', ref: 'Genesis 2:17' }
  ],

  tasks: [
    { id: 'fruit', icon: '🍑', label: 'Gather good fruit', total: 6 },
    { id: 'lamps', icon: '🪔', label: 'Light the lamps of truth', total: 3 }
  ],

  memoryVerse: { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' },

  ending: {
    verse: { text: 'And I will put enmity between thee and the woman, and between thy seed and her seed; it shall bruise thy head, and thou shalt bruise his heel.', ref: 'Genesis 3:15' },
    message: 'Sin separated us from God. But God promised a Saviour who would open the way back: Jesus!'
  },

  quiz: [
    { q: 'What did God say about the trees of the garden?', ref: 'Genesis 2:16–17', options: ['Eat from none of them', 'Eat freely from every tree, except one', 'Eat from all of them'], answer: 1 },
    { q: 'How did the serpent twist God\'s words?', ref: 'Genesis 3:1', options: ['"Let there be light"', '"Yea, hath God said…?"', '"Make thee an ark"'], answer: 1 },
    { q: 'What did God promise after Adam and Eve sinned?', ref: 'Genesis 3:15', options: ['A rainbow in the sky', 'One day a Saviour would defeat the serpent', 'They could stay in the garden'], answer: 1 }
  ],

  music: {
    bpm: 100,
    notes: [67, 0, 71, 0, 74, 0, 72, 71, 69, 0, 67, 0, 71, 0, 0, 0,
            72, 0, 76, 0, 74, 72, 71, 0, 69, 0, 71, 0, 67, 0, 0, 0],
    bass: [43, 43, 48, 48, 50, 50, 43, 43]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.27) * 0.3 + Math.cos(z * 0.21) * 0.3;
    h += Math.max(0, Math.abs(x) - 15) * 1.6;                          // hills at the sides
    const ds = Math.abs(z);                                             // stream across z = 0
    if (ds < 4.5) h -= 2.6 * Math.min(1, (4.5 - ds) / 0.8);
    const dc = Math.abs(z + 26);                                        // chasm across z = -26
    if (dc < 4) h -= 8 * Math.min(1, (4 - dc) / 0.6);
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z) < 4.5 && h < -1) return 0x2563eb;
    if (Math.abs(z + 26) < 4 && h < -2) return 0x3f3a36;
    if (Math.abs(x) > 16) return 0x60834d;
    if (Math.abs(x) < 2 && z > 6) return 0xc8b88a;                      // path
    const base=Math.sin(x*.17+Math.sin(z*.09))*Math.cos(z*.12)>.15?0x8eaf6d:0x7ea35f,wet=Math.max(0,1-Math.abs(Math.abs(z)-4.75)/.8);
    return new THREE.Color(base).lerp(new THREE.Color(0x9b9877),wet*.55).getHex();
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const fruitColors = [0xef4444, 0xf59e0b, 0xa855f7, 0xfb923c];

    // --- good fruit trees: press ACTION at a tree to gather its fruit ---
    [[-9, 33], [9, 31], [-12, 25], [12, 23], [-9, 16], [9, 14], [-13, 9], [13, 8]].forEach(([x, z], ti) => {
      api.tree(x, z, 1.1, 0x2f8f3a);
      const fruit = [];
      for (let i = 0; i < 4; i++) {
        const f = new T.Mesh(new T.SphereGeometry(0.26, 8, 6), api.mat(fruitColors[ti % 4]));
        f.position.set(x + Math.cos(i * 1.6) * 1.5, api.terrain(x, z) + 4.2 + (i % 2) * 0.8, z + Math.sin(i * 1.6) * 1.5);
        api.add(f); fruit.push(f);
      }
      const tree = { x, z, fruit, picked: false };
      tree.zone = api.zone({                                          // brush past the tree: the fruit drops into your basket
        x, z, r: 3.0, time: 0.3, color: fruitColors[ti % 4],
        onDone(helpers) {
          tree.picked = true;
          fruit.forEach((f) => { f.visible = false; });
          api.puff(x, api.terrain(x, z) + 3, z, fruitColors[ti % 4], 12);
          api.sfx('coin');
          if (api.taskCount('fruit') < 6) api.task('fruit');               // (6 are needed; the extra trees are a bonus)
          helpers.forEach((p) => api.servant(p, 2));
        }
      });
      ORCH.trees.push(tree);
    });

    // --- the forbidden tree in the midst of the garden (fenced; we obey) ---
    ORCH.knowledgeTree=orchardTree(api,api.tree(0,22,1.4,0x6b21a8));
    for (let i = 0; i < 5; i++) {
      const f = new T.Mesh(new T.SphereGeometry(0.3, 8, 6), api.mat(0xfacc15, { emissive: 0x6b4f00 }));
      f.position.set(Math.cos(i * 1.3) * 1.6, api.terrain(0, 22) + 4.8 + (i % 2) * 0.9, 22 + Math.sin(i * 1.3) * 1.6);
      api.add(f);
    }
    for (let i = 0; i < 10; i++) {                                      // a ring of stones
      const a = (i / 10) * Math.PI * 2;
      api.rock(Math.cos(a) * 3.2, 22 + Math.sin(a) * 3.2, 0.32);
    }
    api.interact({
      x: 0, z: 22, r: 4.4, vRange: 4, priority: 1, label: 'Leave it (obey)',
      use(p) {
        api.sfx('block');
        if (!ORCH.obeyed[p.slot]) {
          ORCH.obeyed[p.slot] = true;
          api.servant(p, 5, 'chose to obey');
          api.toast('🙏 God said not this tree. P' + (p.slot + 1) + ' chooses to obey!', 3000);
        }
      }
    });

    // --- the serpent (just talks; never hurts anyone) ---
    const snake = new T.Group();
    const curve=new T.CatmullRomCurve3([[.8,.10,-.55],[-.3,.15,-.8],[-.8,.18,0],[0,.18,.65],[.7,.2,.1],[.28,.28,-.45],[-.33,.38,-.25],[-.35,.58,.10],[-.16,.85,.23],[0,1,.2]].map(p=>new T.Vector3(...p)));
    const tube=new T.TubeGeometry(curve,48,.18,8,false),positions=tube.attributes.position,colors=[];
    for(let i=0;i<positions.count;i++){const u=Math.floor(i/9)/48,c=curve.getPointAt(u),k=.25+.75*u,x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);positions.setXYZ(i,c.x+(x-c.x)*k,c.y+(y-c.y)*k,c.z+(z-c.z)*k);const col=new T.Color(y<c.y-.06?0xa5a16d:0x526f40).multiplyScalar(.96+.04*Math.sin(u*120));colors.push(col.r,col.g,col.b);}
    tube.setAttribute('color',new T.Float32BufferAttribute(colors,3));tube.computeVertexNormals();const body=new T.Mesh(tube,new T.MeshPhongMaterial({color:0xffffff,vertexColors:true,specular:0x171b12,shininess:9}));body.castShadow=true;snake.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.3,16,10),api.mat(0x617d47));
    head.scale.set(1,.8,1.3);head.position.set(0,1,.2);snake.add(head);
    [-.55,.55].forEach(sd=>{
      const eye=new T.Mesh(new T.SphereGeometry(.072,10,8),api.mat(0xd6c384));eye.position.set(sd*.31,.13,.24);head.add(eye);
      const pupil=new T.Mesh(new T.SphereGeometry(.037,8,6),api.mat(0x242b1b));pupil.scale.set(.55,1,.45);pupil.position.set(sd*.31,.13,.30);head.add(pupil);
    });
    snake.position.set(3.4, api.terrain(3.4, 19.6), 19.6);
    snake.rotation.y = -0.6;
    api.add(snake);
    ORCH.serpent = { mesh: snake, head };

    // --- Belt of Truth, right on the path ---
    api.armor('belt', ORCH.BELT[0], ORCH.BELT[1]);

    // --- fragment 1: climb the stumps in the orchard corner ---
    api.stump(-11, 37, 1.0);
    api.stump(-13, 34, 2.2);
    api.stump(-13.5, 30.5, 3.4);
    api.fragment({ x: -13.5, z: 30.5, y: api.terrain(-13.5, 30.5) + 3.4 + 1.4 });

    // --- the stream ---
    const water = new T.Mesh(new T.PlaneGeometry(38, 9), new T.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.7, 0);
    api.add(water);
    const lieMsg = 'Splash! That path was a lie. 🎗️ The Belt of Truth shows the true way.';
    api.hazard({ x: 0, z: 0, w: 60, d: 8.4 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: lieMsg });
    // left: a lovely bridge that is NOT real
    api.box({ x: -6, z: 0, w: 3, h: 0.3, d: 10, y: -0.05, lie: true, color: 0xa0703c });
    [-7.4, -4.6].forEach((rx) => api.box({ x: rx, z: 0, w: 0.2, h: 0.9, d: 10, y: 0.25, lie: true, color: 0x7a5230 }));
    // right: the true path (only seen with the Belt of Truth)
    [[6, 3], [6, 0], [6, -3]].forEach(([x, z]) => api.box({ x, z, w: 2.6, h: 0.7, d: 2.6, y: -0.4, truth: true }));
    api.camZone({ minX: -11, maxX: 11, minZ: -5, maxZ: 7, yaw: 0.45, height: 10, back: 13.5, focus: [5, 0, -2], pull: 0.3 });   // both bridges in view
    api.fragment({ x: -13, z: 0, y: 0.6, net: true });                 // fragment 2: the Fisherman nets it

    // --- lamps of truth (stand by a lamp until it lights) ---
    const lamp = (x, z, y) => {
      const post = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 2.2, 8), api.mat(0x6b4a2b));
      post.position.set(x, y + 1.1, z); api.add(post);
      const glass = new T.Mesh(new T.SphereGeometry(0.42, 12, 8), new T.MeshLambertMaterial({ color: 0x78716c, emissive: 0x000000 }));
      glass.position.set(x, y + 2.45, z); api.add(glass);
      const L = { x, z, glass, lit: false };
      L.zone = api.zone({
        x, z, y, r: 1.9, time: 0.5, color: 0xfacc15,
        onDone(helpers) {
          L.lit = true;
          glass.material.color.setHex(0xfde047); glass.material.emissive.setHex(0xf59e0b);
          api.puff(x, y + 2.4, z, 0xfde047, 14);
          api.sfx('fanfare');
          api.task('lamps');
          helpers.forEach((p) => api.servant(p, 4));
          if (api.taskCount('lamps') === 1) {
            api.verse('A lamp unto my feet', 'Thy word is a lamp unto my feet, and a light unto my path.', 'Psalm 119:105');
          }
        }
      });
      ORCH.lamps.push(L);
    };
    lamp(0, -9, api.terrain(0, -9));

    // --- truth staircase up to a high ledge (lamp 2) ---
    [[-7.5, -13, 0.7], [-9.5, -15.5, 1.9], [-11.5, -18, 3.1]].forEach(([x, z, y]) => api.box({ x, z, w: 2.2, h: 0.5, d: 2.2, y, truth: true }));
    const ledgeY = api.terrain(-14, -20.5);
    api.box({ x: -14, z: -20.5, w: 4, h: 4.3 - ledgeY, d: 3.5, y: ledgeY, color: 0x8b6b4a });
    lamp(-14, -20.5, 4.3);
    // a "shortcut" plank that is a lie (you just drop back onto the grass)
    api.box({ x: -12, z: -12, w: 1.2, h: 0.3, d: 5, y: 2.2, lie: true, color: 0xa0703c });

    // --- the chasm ---
    api.hazard({ x: 0, z: -26, w: 60, d: 7.6 }, { maxY: -2, msg: lieMsg });
    api.camZone({ minX: -10, maxX: 15, minZ: -32, maxZ: -19, yaw: 0, height: 12.5, back: 13, focus: [0, 0, -31], pull: 0.35 });   // see across the chasm
    api.box({ x: 5, z: -26, w: 3, h: 0.3, d: 10, y: -0.1, lie: true, color: 0xa0703c });          // lie bridge
    [3.6, 6.4].forEach((rx) => api.box({ x: rx, z: -26, w: 0.2, h: 0.9, d: 10, y: 0.2, lie: true, color: 0x7a5230 }));
    api.box({ x: -4, z: -26, w: 3, h: 0.4, d: 10, y: -0.2, truth: true });                        // truth bridge
    // a slow moving platform on the right, with fragment 3 floating above its path
    api.mover({ w: 3, h: 0.5, d: 3, path: [[12, -0.5, -20.5], [12, -0.5, -31.5]], speed: 2.2, wait: 1.0 });
    api.fragment({ x: 12, z: -26, y: 2.4 });

    // --- garden gate: lamp 3 and the gate ---
    lamp(0, -36, api.terrain(0, -36));
    const gz = -46;
    ORCH.gate=orchardGate(api,gz);orchardWitnesses(api,gz);
    ORCH.gateView=api.camZone({minX:-11,maxX:11,minZ:-53,maxZ:-42,yaw:.05,height:10,back:18,focus:[0,2,-46],pull:.2});
    ORCH.treeView=api.camZone({minX:-6,maxX:6,minZ:16,maxZ:29,yaw:.12,height:10,back:16,focus:[0,2,22],pull:.2});
    // the flaming sword "which turned every way" (Genesis 3:24), shown after the ending story
    const sword = new T.Group();
    const blade = new T.Mesh(new T.BoxGeometry(0.35, 3.6, 0.12), new T.MeshBasicMaterial({ color: 0xfb923c }));
    const glow = new T.Mesh(new T.BoxGeometry(0.7, 3.9, 0.2), new T.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.45 }));
    sword.add(glow); sword.add(blade);
    const hilt=new T.Mesh(new T.BoxGeometry(.95,.14,.22),api.texMat(0xb38f48,'bronze'));hilt.position.y=-1.4;sword.add(hilt);
    const grip=new T.Mesh(new T.CylinderGeometry(.09,.09,.7,10),api.texMat(0x705338,'wood'));grip.position.y=-1.8;sword.add(grip);
    sword.position.set(0, api.terrain(0, gz) + 2.6, gz);
    sword.visible = false; api.add(sword);
    ORCH.sword = sword;

    // --- collectibles (some only reachable on true paths) ---
    // --- Golden Scroll challenge course (high above the garden gate): blocks, crumbling platforms, a spring ---
    api.course([
      { x: -15, z: -40.6, top: 1.05, kind: 'block' },
      { x: -11.6, z: -39.4, top: 2.05, kind: 'float' },
      { x: -8.2, z: -40.6, top: 2.95, kind: 'crumble' },
      { x: -4.8, z: -39.4, top: 3.75, kind: 'crumble' },
      { x: -1.4, z: -40.6, top: 3.95, kind: 'float' },
      { x: 2, z: -39.4, top: 4.25, kind: 'spring' },
      { x: 5.4, z: -40.6, top: 8.45, kind: 'float' },
      { x: 8.8, z: -39.4, top: 9.05, kind: 'crumble' },
      { x: 12.2, z: -40.6, top: 9.65, kind: 'float' }
    ]);

    api.leaves([[0, 34], [0, 30], [0, 26], [-2, 17], [2, 17], [0, 8], [6, 3, 1.2], [6, 0, 1.2], [6, -3, 1.2],
      [0, -14], [-9.5, -15.5, 3.0], [-4, -23, 1.2], [-4, -26, 1.2], [-4, -29, 1.2], [0, -40], [0, -43]]);

  },

  update(api, dt) {
    if(ORCH.sword.visible&&!api.settings.gentle)ORCH.sword.rotation.y+=dt*.85;
    if(ORCH.endT!==undefined){
      ORCH.departClock=(ORCH.departClock||0)+dt;const u=Math.min(1,ORCH.departClock/2.4);
      ORCH.witnesses.forEach((g,i)=>{const sd=i?1:-1,x=sd*(1.3+u*2.2),z=-44.5+u*3.7;g.position.set(x,api.terrain(x,z),z);g.rotation.y=Math.atan2(sd*2.2,3.7);api.posePerson(g,{dt,stride:u<1?.6:0,expression:'listen',headPitch:.06});});
    }
    // the serpent sways and speaks its twisted words once
    const s = ORCH.serpent;
    s.head.position.y = 1.0 + Math.sin(api.time * 2) * 0.1;
    s.head.rotation.y = Math.sin(api.time * 1.3) * 0.4;
    if (!ORCH.sawSerpent && api.near(0, 21, 7).length) {
      ORCH.sawSerpent = true;
      api.story([
        { art: '🐍', scene:'serpent', text: 'Now the serpent was more subtil than any beast of the field which the LORD God had made. And he said unto the woman, Yea, hath God said, Ye shall not eat of every tree of the garden?', ref: 'Genesis 3:1' }
      ], () => api.toast('🎗️ The serpent twisted God\'s words. Find the Belt of Truth: it shows the true paths!', 3500));
    }
  },

  storyScene(api,page,again) {
    const scene=page&&page.scene;ORCH.readingScene=scene||null;
    if(ORCH.treeView)Object.assign(ORCH.treeView,scene==='serpent'?{yaw:0,height:8,back:15,focus:[6,2,22],pull:.65}:{yaw:.12,height:10,back:16,focus:[0,2,22],pull:.2});
    if(ORCH.gateView)Object.assign(ORCH.gateView,scene==='fall'||scene==='judgment'||scene==='promise'?{maxZ:-37,yaw:.55,height:8,back:18,focus:[7,2,-46],pull:.65}:{maxZ:-42,yaw:.05,height:10,back:18,focus:[0,2,-46],pull:.2});
    if(!again&&(scene==='fall'||scene==='judgment'||scene==='promise'))orchardPoseWitnesses(api,scene);
    if(!again&&scene==='promise'){ORCH.guardians.visible=true;ORCH.sword.visible=true;}
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const cx = ps.reduce((s, p) => s + p.pos.x, 0) / ps.length;
    const cz = ps.reduce((s, p) => s + p.pos.z, 0) / ps.length;
    const near = (list) => list.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    const tree = near(ORCH.trees.filter((t) => !t.picked));
    if (tree) return [tree.x, api.terrain(tree.x, tree.z) + 2, tree.z];
    if (!api.players().some((p) => p.armor.belt)) return [ORCH.BELT[0], api.terrain(ORCH.BELT[0], ORCH.BELT[1]) + 1, ORCH.BELT[1]];
    const L = ORCH.lamps.find((l) => !l.lit);                          // lamps in order along the path
    if (L) return [L.x, L.zone.y + 0.5, L.z];
    return null;
  },

  finale: {
    message: '🚪 Everyone gather at the garden gate!',
    beacon: [0, 3, -44],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z + 44) < 6; },
    // The true story of Genesis 3, told plainly, ending in God's promise.
    onUpdate(api, t) {
      if (t > 0.5 && !ORCH.toldFall) {
        ORCH.toldFall = true;
        api.story([
          { art: '🍎', scene:'fall', title: 'They disobeyed', text: 'And when the woman saw that the tree was good for food, and that it was pleasant to the eyes, and a tree to be desired to make one wise, she took of the fruit thereof, and did eat, and gave also unto her husband with her; and he did eat.', ref: 'Genesis 3:6' },
          { art: '💔', scene:'judgment', title: 'What sin does', text: 'Adam and Eve disobeyed God. Sin brought death and separation from God. God sent them out of the garden. Every one of us has sinned too. God still cared for them and made them clothes of skins.' },
          { art: '🌅', scene:'judgment', title: 'The first promise', text: 'And I will put enmity between thee and the woman, and between thy seed and her seed; it shall bruise thy head, and thou shalt bruise his heel.', ref: 'Genesis 3:15' },
          { art: '✝️', scene:'promise', title: 'The promised One', text: 'Jesus is the promised Saviour who defeats the serpent. He died for sinners and rose again. Cherubim and a flaming sword guarded Eden’s way to the tree of life (Genesis 3:24).' }
        ], () => { ORCH.sword.visible = true;ORCH.guardians.visible=true; api.sfx('door'); ORCH.endT = api.time;ORCH.departClock=0; });   // the flaming sword now guards the way (Genesis 3:24)
      }
      return ORCH.endT !== undefined && api.time - ORCH.endT > 2.5;
    }
  }
};
