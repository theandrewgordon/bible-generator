/* =====================================================================
 * LEVEL 7-4: THE CROSS  (Matthew 26-27; Luke 23; John 19)
 * ---------------------------------------------------------------------
 * Night. A short, quiet walk toward -z:
 *   City street (z 42..30)  out through the city gate
 *   The valley  (z 30..-2)  down to the Kidron brook, stepping stones
 *   Gethsemane  (z -4..-40) the olive grove; gather at the stone where Jesus prayed
 * Task: light 6 lanterns along the way. Then there is nothing to do or win:
 * the story is told in cards, plainly and gently. SOLEMN: no stars, no fanfare,
 * no collectibles, no Golden Scroll. Jesus is never shown; a plain cross stands
 * far away on a hill, out of reach.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const CROSS = {
  lanterns: [],
  ROCK: [0, -33],
  SPOTS: [[3, 34], [-2, 22], [2, 11], [-1, -3], [2, -15], [-2, -25]]
};

function crossGround(z) {
  if (z > 30) return 3;                                // Jerusalem is up on the hill
  if (z > 10) return 3 - (30 - z) * 0.2;              // the slope down into the valley
  if (z > -8) return -1;                               // the valley and the brook
  if (z > -20) return -1 + (-8 - z) * 0.25;           // up the Mount of Olives
  return 2;
}

const LEVEL = {
  id: '7-4',
  bibleConnection: {"passage": "Matthew 26–27; John 19", "text": "Jesus was arrested, crucified and truly died for our sins; His body was buried in a tomb. Our quiet lantern walk prepares us to hear these events. Lighting lamps does not earn forgiveness or cause His sacrifice."},
  world: 'World 7-4',
  title: 'The Cross',
  time: 'night',
  solemn: true,
  decor: { grass: 65, flowers: 0, pebbles: 28 },
  reactive: false,
  life: false,
  artDirection: { textureStrength: .24, storyPlants: 8, ambientCount: 0, checkpointSigns: false },
  leafIcon: '🕯️',
  spawn: [0, 40],
  bounds: { minX: -18, maxX: 18, minZ: -44, maxZ: 44 },
  startMessage: 'Walk quietly with the disciples. Light the lanterns on the way to the garden.',

  intro: [
    { text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.', ref: 'Romans 5:8' },
    { text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.', ref: 'Isaiah 53:5' }
  ],

  introStory: [
    { art: '🌙', title: 'After the supper', text: 'After supper, Jesus and His disciples went to the garden. There He would be arrested. Our lantern walk is just for our game.' }
  ],

  tasks: [
    { id: 'lanterns', icon: '🕯️', label: 'Light the lanterns', total: 6 }
  ],

  memoryVerse: { text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.', ref: 'Romans 5:8' },

  ending: {
    verse: { text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.', ref: 'Romans 5:8' },
    message: 'Jesus died on the cross for our sins. His body was buried in a tomb. But this is not the end of the story...'
  },

  quiz: [
    { q: 'Why did Jesus die on the cross?', ref: '1 Corinthians 15:3', options: ['For our sins', 'Because He had sinned', 'To earn points'], answer: 0, explain: 'Jesus never sinned. He died for our sins.' },
    { q: 'What happened to Jesus\' body after He died?', ref: 'Matthew 27:59–60', options: ['He was only sleeping', 'Joseph wrapped it and laid it in a tomb', 'It disappeared from the cross'], answer: 1, explain: 'Jesus really died. Joseph wrapped His body and laid it in a tomb.' },
    { q: 'What happened to the veil of the temple when Jesus died?', ref: 'Matthew 27:51', options: ['Nothing happened', 'It turned gold', 'It was torn from the top to the bottom'], answer: 2, explain: 'The temple veil was torn from top to bottom when Jesus died.' }
  ],

  music: {
    bpm: 64,
    notes: [57, 0, 0, 0, 60, 0, 0, 0, 64, 0, 62, 0, 60, 0, 0, 0,
            57, 0, 0, 0, 59, 0, 0, 0, 60, 0, 59, 0, 57, 0, 0, 0],
    bass: [45, 45, 41, 41, 43, 43, 40, 40]
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = crossGround(z) + Math.sin(x * 0.4) * Math.cos(z * 0.3) * 0.12;
    h += Math.max(0, Math.abs(x) - 13) * 1.2;                          // valley sides
    if (Math.abs(z - 4) < 2.2) h -= 2.6 * Math.min(1, (2.2 - Math.abs(z - 4)) / 0.6);   // the Kidron brook
    return h;
  },

  groundColor(x, z, h) {
    if (Math.abs(z - 4) < 2.2 && h < -2) return 0x1e3a5f;
    if (z > 30) return Math.abs(x)<4.5?0x93846c:0x827963;   // stone street
    if (z < -6) return Math.abs(x)<3.6?0x79765b:Math.sin(x*.13+z*.09)>.3?0x657653:0x60704f;      // the olive grove
    return 0x6b6a4a;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const stone = 0x9c8c6c;

    // the house of the upper room beside the street, and the city wall with its gate
    api.box({ x: -10, z: 38, w: 7, d: 6, h: 4, y: 3, color: stone });
    [[-11, 30, 12], [11, 30, 12]].forEach(([x, z, w]) => api.box({ x, z, w, d: 1.6, h: 4, y: 3, color: 0x7d6f55 }));
    const arch = new T.Mesh(new T.BoxGeometry(10, 1, 1.8), api.mat(0x7d6f55)); arch.position.set(0, 3 + 4.5, 30); api.add(arch);

    // the Kidron brook with stepping stones
    const brook = new T.Mesh(new T.PlaneGeometry(40, 4.4), new T.MeshLambertMaterial({ color: 0x2b5c8a, transparent: true, opacity: 0.8 }));
    brook.rotation.x = -Math.PI / 2; brook.position.set(0, -1.7, 4); api.add(brook);
    api.hazard({ x: 0, z: 4, w: 40, d: 4.2 }, { maxY: -1.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Use the stepping stones across the brook.' });
    [[-0.8, 5.6], [0.9, 4], [-0.6, 2.4]].forEach(([x, z]) => api.stump(x, z, 2.7, 0.9));

    // the olive grove
    [[-8, -8], [8, -10], [-11, -16], [10, -19], [-7, -22], [7, -27], [-10, -30], [11, -34], [-6, -38], [6, -40], [-12, -40], [12, -24]]
      .forEach(([x, z], i) => crossOlive(api, x, z, .85+(i%3)*.1));

    // the stone where Jesus prayed ("about a stone's cast", Luke 22:41)
    const rock = new T.Mesh(new T.DodecahedronGeometry(1.3, 0), api.mat(0x8a8478)); rock.scale.y = 0.6;
    rock.position.set(CROSS.ROCK[0], api.terrain(CROSS.ROCK[0], CROSS.ROCK[1]) + 0.5, CROSS.ROCK[1] - 2); api.add(rock);

    // far away on a hill, out of reach: a plain cross (shown at the end of the walk)
    const hill = new T.Mesh(new T.SphereGeometry(10, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), api.mat(0x3d3a33));
    hill.scale.y = 0.5; hill.position.set(0, 0, -64); api.add(hill);
    const cross = new T.Group();
    const post = new T.Mesh(new T.BoxGeometry(0.6, 7, 0.6), api.mat(0x3b2a1a)); post.position.y = 3.5; cross.add(post);
    const beam = new T.Mesh(new T.BoxGeometry(4, 0.6, 0.6), api.mat(0x3b2a1a)); beam.position.y = 5.2; cross.add(beam);
    cross.position.set(0, 5, -64); cross.visible = false; api.add(cross);
    const hillFoot=new T.Mesh(new T.CylinderGeometry(9.8,13,28,24),api.mat(0x3d3a33));hillFoot.position.set(0,-14,-64);api.add(hillFoot);
    CROSS.cross = cross;
    crossScenery(api);
    crossTableaux(api);
    CROSS.gardenView=api.camZone({minX:-18,maxX:18,minZ:-44,maxZ:-20,yaw:.15,height:9,back:19,focus:[0,3,-35],pull:.25});
    api.camZone({minX:-17,maxX:17,minZ:-5,maxZ:10,yaw:.25,height:11,back:17,focus:[0,-.4,4],pull:.2});
    api.camZone({minX:-17,maxX:17,minZ:29,maxZ:44,yaw:.15,height:10,back:17,focus:[0,4,31],pull:.2});

    // lanterns to light along the way
    CROSS.SPOTS.forEach(([x, z], i) => {
      const y = api.terrain(x, z);
      const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.1, 1.6, 6), api.mat(0x3b2a1a)); pole.position.set(x + 1.3, y + 0.8, z); api.add(pole);
      const glass = new T.Mesh(new T.BoxGeometry(0.35, 0.45, 0.35), new T.MeshBasicMaterial({ color: 0x3f3f46 })); glass.position.set(x + 1.3, y + 1.8, z); api.add(glass);
      crossLantern(api,x+1.3,y,z);
      const L = { x, z, glass, lit: false };
      L.zone = api.zone({
        x, z, y, r: 1.6, time: 0.8, color: 0xfde68a,
        onDone() {
          L.lit = true; glass.material.color.setHex(0xfde047);
          const light = new T.PointLight(0xffd58a, 0.9, 9, 2); light.position.set(x + 1.3, y + 1.9, z); api.add(light);
          api.task('lanterns');
        }
      });
      if (i > 0) L.zone.show(false);                                  // one at a time, in order
      CROSS.lanterns.push(L);
    });
  },

  update(api,dt) {
    CROSS.friends.forEach(p=>api.posePerson(p,{dt,expression:'worry',headPitch:.12}));
    // the next lantern appears when the last one is lit
    const next = CROSS.lanterns.find((l) => !l.lit);
    if (next && !next.zone.visible) next.zone.show(true);
  },

  storyScene(api,page) {
    if(!CROSS.gathered)return;
    const scene=page&&page.scene||'garden';CROSS.readingScene=page?scene:null;
    CROSS.cross.visible=scene==='cross'||!page;
    CROSS.otherCrosses.visible=scene==='cross';
    CROSS.veil.visible=scene==='veil';CROSS.burial.visible=scene==='burial';CROSS.sceneLight.visible=!!page&&scene!=='garden';
    const view=scene==='garden'?{yaw:.15,height:9,back:19,focus:[0,3,-35],pull:.25}:{yaw:0,height:10,back:25,focus:[12,6,-53],pull:.52};
    Object.assign(CROSS.gardenView,view);
  },

  objective(api) {
    const L = CROSS.lanterns.find((l) => !l.lit);
    if (L) return [L.x, api.terrain(L.x, L.z) + 1, L.z];
    return [CROSS.ROCK[0], api.terrain(CROSS.ROCK[0], CROSS.ROCK[1]) + 1.5, CROSS.ROCK[1]];
  },

  finale: {
    message: '🌿 Everyone gather quietly by the stone in the garden.',
    beacon: [0, 4, -33],
    inZone(p) { return Math.hypot(p.pos.x - CROSS.ROCK[0], p.pos.z - CROSS.ROCK[1]) < 5; },
    onUpdate(api, t) {
      if(!CROSS.gathered){const ps=api.players();if(!ps.length||!ps.every(p=>!p.bubble&&LEVEL.finale.inZone(p)))return false;CROSS.gathered=true;api.finishCaption(false,false);}
      if (t > 0.5 && !CROSS.told) {
        CROSS.told = true;
        api.music(false);                                                // quiet
        CROSS.cross.visible = true;
        api.story([
          { scene:'garden', art: '🙏', title: 'In the garden, before the soldiers came', text: 'And he went a little further, and fell on his face, and prayed, saying, O my Father, if it be possible, let this cup pass from me: nevertheless not as I will, but as thou wilt.', ref: 'Matthew 26:39', connection:{passage:'Matthew 26:47–27:26',text:'Jesus was betrayed, arrested and condemned to death. He had done no sin.'} },
          { scene:'cross', art: '✝️', title: 'The cross', text: 'And he bearing his cross went forth into a place called the place of a skull, which is called in the Hebrew Golgotha: Where they crucified him, and two other with him, on either side one, and Jesus in the midst.', ref: 'John 19:17–18' },
          { scene:'cross', art: '💛', title: 'Jesus forgave', text: 'Then said Jesus, Father, forgive them; for they know not what they do.', ref: 'Luke 23:34' },
          { scene:'cross', art: '❓', title: 'Why did Jesus die?', text: 'Jesus never sinned. We have all sinned, and sin separates us from God. Jesus took the punishment for our sins in our place. He really died on the cross. His body was buried in a tomb.' },
          { scene:'cross', art: '📜', text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.', ref: 'Isaiah 53:5' },
          ...(api.shownRef('Romans 5:8') ? [] : [{ scene:'cross', art: '❤️', text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.', ref: 'Romans 5:8' }]),
          { scene:'cross', art: '🕯️', title: 'Jesus died on the cross', text: 'When Jesus therefore had received the vinegar, he said, It is finished: and he bowed his head, and gave up the ghost.', ref: 'John 19:30' },
          { scene:'veil', art: '🚪', title: 'The veil was torn: the way back to God is open!', text: 'And, behold, the veil of the temple was rent in twain from the top to the bottom;', ref: 'Matthew 27:51' },
          { scene:'burial', art: '🪨', title: 'Jesus was buried in a tomb', text: 'And when Joseph had taken the body, he wrapped it in a clean linen cloth, And laid it in his own new tomb, which he had hewn out in the rock: and he rolled a great stone to the door of the sepulchre, and departed.', ref: 'Matthew 27:59–60' }
        ], () => { CROSS.endT = api.time; });
      }
      return CROSS.endT !== undefined && api.time - CROSS.endT > 3;
    }
  }
};


// Authored scenery has no collision: the six original supports and every tree trunk stay put.
function crossOlive(api,x,z,s) {
  const T=api.THREE,t=api.tree(x,z,s,0x7a8f5c);t.clear();t.scale.setScalar(1);
  const g=new T.Group(),wood=api.texMat(0x77705b,'wood'),leaf=api.texMat(0x758466,'leaves');
  const branch=(a,b,r1,r2)=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),v=bv.clone().sub(av),m=new T.Mesh(new T.CylinderGeometry(r2,r1,v.length(),8),wood);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());g.add(m);};
  branch([0,0,0],[.12,2,0],.32,.22);branch([.12,1.25,0],[-.9,2.8,.1],.19,.08);branch([.12,1.7,0],[1,2.9,-.3],.17,.07);branch([.1,1.9,0],[0,3.4,.55],.16,.07);
  [[-.9,2.9,.1,1.3],[1,3,-.3,1.3],[0,3.6,.55,1.45],[.2,3.05,-.7,1.2]].forEach(([a,b,c,r])=>{const m=new T.Mesh(new T.SphereGeometry(r,12,8),leaf);m.scale.set(1,.48,.85);m.position.set(a,b,c);g.add(m);});
  g.scale.setScalar(s);api.scenery(g);t.add(g);return t;
}
function crossScenery(api) {
  const T=api.THREE,g=new T.Group();g.name='jerusalem-night-stonework';
  const block=(x,y,z,w,h,d,c,tex='stone')=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),api.texMat(c,tex));m.position.set(x,y,z);g.add(m);return m;};
  // Courses hug the old walls. The full ten-unit gate and house footprint remain clear.
  for(const side of [-1,1])for(let row=0;row<5;row++)for(let i=0;i<7;i++){const x=side*(5.1+i*1.7+.8);if(Math.abs(x)>16.7)continue;block(x,3.4+row*.73,30.83,1.62,.67,.10,row%2?0x9d9076:0xa6987d);}
  for(const x of [-5.15,5.15])block(x,5.05,30.88,.28,3.9,.22,0xb9aa8c);
  block(0,8.1,30,10.3,.25,1.9,0xaa997c);block(-10,7.07,38,6.9,.12,5.9,0xa79677);
  for(const x of [-11.55,-8.45]){block(x,4.8,41.035,1,1.1,.05,0x342f29,'wood');block(x,4.8,41.075,.78,.85,.035,0xd3aa61,'wood');}
  block(-10,4.15,41.04,1.3,2.3,.08,0x614e38,'wood');
  for(const x of [-10.78,-9.22])block(x,4.25,41.1,.2,2.5,.14,0xc0af8c);block(-10,5.6,41.1,1.8,.25,.14,0xc0af8c);
  // Thin paving stays at terrain height; it introduces no raised landing or false objective.
  for(let i=0;i<6;i++)for(let j=0;j<4;j++){const x=(j-1.5)*1.8,z=32+i*1.65;block(x,api.terrain(x,z)+.018,z,1.73,.025,1.57,(i+j)%3?0x978970:0xa2957c,'paving');}
  api.scenery(g);CROSS.cityDress=g;
  const light=new T.PointLight(0xffc77d,.7,12,2);light.position.set(-10,5.4,42);api.add(light);
  CROSS.friends=[[-4.1,-32.5],[4,-34.8]].map(([x,z],i)=>{const m=api.storyPerson(i?0x797367:0x6b776e,0xbaa888,1,{register:false,beard:true});m.position.set(x,api.terrain(x,z),z);m.rotation.y=i?-.55:.6;api.add(m);return m;});
}
function crossLantern(api,x,y,z) {
  const T=api.THREE,g=new T.Group();g.name='garden-lantern-frame';
  const material=api.texMat(0x6e624d,'wood');
  for(const h of [1.55,2.06]){const m=new T.Mesh(new T.BoxGeometry(.48,.09,.48),material);m.position.set(x,y+h,z);g.add(m);}
  for(const dx of [-.21,.21])for(const dz of [-.21,.21]){const m=new T.Mesh(new T.BoxGeometry(.045,.52,.045),material);m.position.set(x+dx,y+1.8,z+dz);g.add(m);}
  api.scenery(g);
}
function crossTableaux(api) {
  const T=api.THREE,wood=api.texMat(0x4d3c2e,'wood'),stone=api.texMat(0x938b7b,'stone');
  const lamp=new T.PointLight(0xffe3b0,1.3,45,2);lamp.position.set(0,12,-46);lamp.visible=false;api.add(lamp);CROSS.sceneLight=lamp;
  const crosses=new T.Group();crosses.name='two-other-crosses';
  for(const sd of [-1,1]){const g=new T.Group();for(const [w,h,y]of [[.4,5.7,2.85],[3,.4,4.3]]){const m=new T.Mesh(new T.BoxGeometry(w,h,.4),wood);m.position.y=y;g.add(m);}g.position.set(sd*4.3,4.3,-64+sd);crosses.add(g);}api.scenery(crosses);crosses.visible=false;CROSS.otherCrosses=crosses;
  // The veil and sealed tomb are symbolic story views beyond the playable garden, never new tasks.
  const veil=new T.Group();veil.name='torn-temple-veil';veil.position.set(0,3.4,-58);
  for(const sd of [-1,1]){const pillar=new T.Mesh(new T.BoxGeometry(.8,6,.8),stone);pillar.position.set(sd*3.2,3,0);veil.add(pillar);
    const sh=new T.Shape(),pts=sd<0?[[-2.8,5.7],[-.02,5.7],[-.38,4.7],[-.06,3.8],[-.5,2.7],[-.15,1.6],[-.75,.35],[-2.8,.35]]:[[.03,5.7],[2.8,5.7],[2.8,.35],[.75,.35],[.2,1.7],[.56,2.8],[.12,3.8],[.4,4.7]];sh.moveTo(...pts[0]);pts.slice(1).forEach(p=>sh.lineTo(...p));sh.closePath();const m=new T.Mesh(new T.ShapeGeometry(sh),api.texMat(sd<0?0x6f536e:0x795b77,'cloth').clone());m.material.side=T.DoubleSide;m.position.z=.5;veil.add(m);
  }
  const lintel=new T.Mesh(new T.BoxGeometry(7.2,.6,1),stone);lintel.position.y=6;veil.add(lintel);api.scenery(veil);veil.visible=false;CROSS.veil=veil;
  const burial=new T.Group();burial.name='sealed-burial-tomb';burial.position.set(0,3.4,-58);
  [[0,1.7,0,4,2.5,2],[-2.7,1.2,.1,2,1.7,1.6],[2.7,1.1,-.3,2,1.7,1.7]].forEach(([x,y,z,a,b,c])=>{const m=new T.Mesh(new T.DodecahedronGeometry(1,1),stone);m.position.set(x,y,z);m.scale.set(a,b,c);burial.add(m);});
  const disc=new T.Mesh(new T.CylinderGeometry(1.65,1.65,.5,24),api.texMat(0xb1a38d,'stone'));disc.rotation.x=Math.PI/2;disc.position.set(0,1.65,2.1);burial.add(disc);api.scenery(burial);burial.visible=false;CROSS.burial=burial;
}
