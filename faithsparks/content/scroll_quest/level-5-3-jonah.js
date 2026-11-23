/* =====================================================================
 * LEVEL 5-3: JONAH'S SECOND CHANCE  (Jonah 1-3)
 * ---------------------------------------------------------------------
 * South to north:
 *   The ship      (z -40..-22) a storm at sea: throw the cargo over, wake Jonah. Jonah tells the
 *                 truth: he ran away from God. He is cast into the sea, and the sea goes calm.
 *   The great fish            God prepared a great fish. A special shared ride:
 *                 everyone climbs on, then the team STEERS it round the ship through five golden rings,
 *                 past the rocks, to the beach, while Jonah prays inside. Every rider's stick helps steer.
 *   The beach     (z -4..4)   the fish puts Jonah out on dry land
 *   Nineveh       (z 22..44)  lead Jonah to five crowds; they believe God and turn from evil
 * God is merciful to Jonah AND to Nineveh. Thread: the sign of Jonah (Matthew 12:40).
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const JONAH = {
  DECK: 3,
  SHIP: [0, -31],
  CHUTE: [-4.2, -30],
  FISH0: [8.2, -28],           // where the fish waits beside the ship
  FISH1: [8.2, -2.5],          // where it stops at the beach
  BEACH: [6, 2],
  crates: [],
  crowds: [],
  calm: false,
  fish: null,
  fishPos: [8.2, -12, -28],    // under the sea until God sends it
  rideT: undefined,
  // the steered swim: golden rings in order, rocks to steer round, then the beach
  RINGS: [[16, -39], [14, -13], [-15, -16], [-15, -39], [-3, -12]],
  ROCKS: [[13, -34], [14, -22], [-14, -21], [-15, -29], [0, -9.5], [-17, -8]],   // each leaves a way round on both sides (never a trap against the ship)
  LAND: [8, -7],
  swim: null,
  jonah: null,                 // asleep on deck, then the follower in Nineveh
  told: {}
};

const LEVEL = {
  id: '5-3',
  seaHorizon: { side: -1 },
  bibleConnection: {"passage": "Jonah 1–4", "text": "Jonah fled, was thrown into the sea and was swallowed by a great fish God appointed. God sent him again, and Nineveh repented. Our fish ride and city walk explore the story; God’s mercy also challenged Jonah’s anger."},
  world: 'World 5-3',
  title: 'Jonah\'s Second Chance',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  leafIcon: '🐟',
  leafColor: 0x60a5fa,
  leafShape: 'round',
  spawn: [0, -36],
  startsAboard: true,          // (the level begins on a ship and goes north)
  bounds: { minX: -22, maxX: 22, minZ: -44, maxZ: 46 },
  startMessage: 'A great storm! Throw the cargo over the side to lighten the ship.',

  intro: [
    { text: 'Arise, go to Nineveh, that great city, and cry against it; for their wickedness is come up before me.', ref: 'Jonah 1:2' },
    { text: 'But I will sacrifice unto thee with the voice of thanksgiving; I will pay that that I have vowed. Salvation is of the LORD.', ref: 'Jonah 2:9' }
  ],

  introStory: [
    { art: '🏃', title: 'Jonah ran away', text: 'God told Jonah to go to the great city of Nineveh and warn the people. But Jonah ran the other way, onto a ship sailing far from Nineveh. That was disobeying God.' }
  ],

  tasks: [
    { id: 'cargo', icon: '📦', label: 'Throw the cargo over the side', total: 4 },
    { id: 'wake', icon: '😴', label: 'Wake Jonah', total: 1, lockedUntil: 'cargo' },
    { id: 'ride', icon: '🐟', label: 'Steer the great fish to shore', total: 1, lockedUntil: 'wake' },
    { id: 'preach', icon: '📣', label: 'Go with Jonah to the people of Nineveh', total: 5, lockedUntil: 'ride' }
  ],

  memoryVerse: { text: 'But I will sacrifice unto thee with the voice of thanksgiving; I will pay that that I have vowed. Salvation is of the LORD.', ref: 'Jonah 2:9' },

  ending: {
    verse: { text: 'And God saw their works, that they turned from their evil way; and God repented of the evil, that he had said that he would do unto them; and he did it not.', ref: 'Jonah 3:10' },
    message: 'God gave Jonah a second chance, and He gave Nineveh one too. Salvation is of the LORD!'
  },

  quiz: [
    { q: 'Why was Jonah on the ship?', ref: 'Jonah 1:3', options: ['He was running away from God', 'He was going to Nineveh', 'He was a fisherman'], answer: 0 },
    { q: 'What did God prepare to save Jonah?', ref: 'Jonah 1:17', options: ['A boat', 'A great fish', 'A bridge'], answer: 1 },
    { q: 'What did the people of Nineveh do?', ref: 'Jonah 3:5', options: ['Laughed at Jonah', 'Believed God and turned from evil', 'Ran away'], answer: 1 }
  ],

  music: {
    bpm: 92,
    notes: [64, 0, 67, 0, 71, 69, 67, 0, 64, 0, 62, 64, 67, 0, 0, 0,
            69, 0, 71, 72, 74, 0, 71, 69, 67, 0, 64, 0, 62, 64, 0, 0],
    bass: [40, 40, 45, 45, 43, 43, 40, 40]
  },

  onCallText() {                                                 // said once; after that they just come
    if (JONAH.saidCall) return '';
    JONAH.saidCall = true;
    return '';                                                       // (the pop-up before already says it)
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    if (z < -4) return -2.2;                                           // the sea floor
    if (z < 4) return -2.2 + 2.6 * (z + 4) / 8;                         // the beach
    return 0.4 + Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.12 + Math.max(0, Math.abs(x) - 20) * 1.2;
  },

  groundColor(x, z, h) {
    if (z < -4) return 0x1e3a5f;
    if (z < 6) return 0xd9c79b;
    if (z > 22 && Math.abs(x) < 18) return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0xc2ad84 : 0xb8a37a;   // Nineveh streets
    return (Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0x9cae6a : 0x93a463;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE, D = JONAH.DECK, [sx, sz] = JONAH.SHIP;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)
    JONAH.person = person;
    api.rain(true);

    // --- the sea ---
    const sea = new T.Mesh(new T.PlaneGeometry(50, 44, 25, 22), new T.MeshLambertMaterial({ color: 0x1e40af, emissive: 0x0b1f4a, transparent: true, opacity: 0.85 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.5, -24); api.add(sea); JONAH.sea = sea;
    api.hazard({ x: 0, z: -24, w: 50, d: 40 }, { maxY: -0.6, except: (p) => p.role.id === 'fisherman', msg: 'Splash! Into the waves (the Fisherman can swim). A friend can pop your bubble.' });

    // --- the ship ---
    JONAH.deck = api.box({ x: sx, z: sz, w: 10, d: 18, h: D + 2.2, y: -2.2, color: 0x6b4423 });
    JONAH.rails = [];
    const rail = (x, z, w, d) => JONAH.rails.push(api.box({ x, z, w, d, h: 1.1, y: D, color: 0x8b5a2b }));
    rail(-5.2, sz, 0.4, 18); rail(0, sz - 9.2, 10.8, 0.4); rail(0, sz + 9.2, 10.8, 0.4);
    rail(5.2, sz - 6.5, 0.4, 5); rail(5.2, sz + 6, 0.4, 6);              // a gap on the right side (where the fish comes)
    const hull = LEVEL._hull(api); hull.position.set(sx, 0, sz); api.add(hull); JONAH.hull = hull;   // a boat-shaped hull that rocks in the storm
    const mast = new T.Mesh(new T.CylinderGeometry(0.22, 0.28, 9, 10), api.mat(0x5c3d22)); mast.position.set(sx, D + 4.5, sz - 1); api.add(mast);
    const sail = new T.Mesh(new T.PlaneGeometry(6.5, 4.5, 6, 4), new T.MeshLambertMaterial({ color: 0xe7e0cc, side: T.DoubleSide, map: api.texMat(0xe7e0cc, 'cloth').map })); sail.position.set(sx, D + 5.6, sz - 0.6); api.add(sail); api.fadeScenery(sail,3.25); JONAH.sail = sail;
    api.mud({ x: -1.5, z: sz + 4, w: 4, d: 3 });                          // a slippery wet deck
    // sailors praying to their gods (Jonah 1:5)
    JONAH.sailors = [[-3.4, sz - 6], [3.2, sz + 3], [-3.6, sz + 6]].map(([x, z], i) => { const m = api.storyPerson([0x57534e, 0x1e3a8a, 0x9a3412][i], 0xd6d3d1, 1, { beard: i !== 1 }); m.position.set(x, D, z); m.rotation.y = [2.2, -1.2, 1.6][i]; api.add(m); return m; });
    // cargo to throw over (Jonah 1:5)
    [[-2.5, sz + 6.5], [2.5, sz + 1], [-2, sz - 3], [2.5, sz - 6.5]].forEach(([x, z]) => {
      const g = new T.Group();
      const c = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), api.texMat(0x8b5a2b, 'wood')); g.add(c);
      const band = new T.Mesh(new T.BoxGeometry(0.95, 0.12, 0.95), api.mat(0x3f2a14)); g.add(band);
      JONAH.crates.push(api.carryable({
        x, z, mesh: g, name: 'cargo', to: 'the side of the ship',
        deliverTo: { x: JONAH.CHUTE[0], z: JONAH.CHUTE[1], r: 1.6, y: D },
        onDeliver(p) {
          api.task('cargo'); api.servant(p, 3); api.puff(-5.8, 0, JONAH.CHUTE[1], 0xbfdbfe, 10);
          if (api.taskCount('cargo') >= 4) api.toast('😴 The storm is still raging... and someone is ASLEEP below! Wake Jonah.', 3000);
        }
      }));
    });
    const chute = new T.Mesh(new T.RingGeometry(1.2, 1.5, 24), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    chute.rotation.x = -Math.PI / 2; chute.position.set(JONAH.CHUTE[0], D + 0.06, JONAH.CHUTE[1]); api.add(chute);
    // Jonah, fast asleep by the stern
    const sleeper = api.storyPerson(0x854d0e, 0xfef3c7, 1, { beard: true, register: false }); sleeper.rotation.z = Math.PI / 2; sleeper.position.set(2.4, D + 0.32, sz + 7.6); sleeper.userData.storyActor.eyes.scale.y = 0.15; api.add(sleeper); JONAH.sleeper = sleeper;   // "fast asleep" (1:5)
    JONAH.wakeI = api.interact({
      x: 2.4, z: sz + 7.6, y: D, r: 2.4, label: 'Wake Jonah',
      can: () => (api.taskDone('cargo') ? true : 'Someone fast asleep. Help with the cargo first!'),
      use(p) { this.remove(); api.task('wake'); api.servant(p, 3); LEVEL._confess(api); }
    });

    // --- the great fish (a ride: a platform on its back) ---
    const fish = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshLambertMaterial({ color: 0x475569 })); body.scale.set(2.4, 1.6, 6); fish.add(body);
    const belly = new T.Mesh(new T.SphereGeometry(1, 16, 10), new T.MeshLambertMaterial({ color: 0xcbd5e1 })); belly.scale.set(2.1, 1.1, 5.4); belly.position.y = -0.55; fish.add(belly);
    // the tail: a stalk and two broad flukes that sway (children[2] is still the tail)
    const tail = new T.Group(); tail.position.set(0, 0.2, -5.6); fish.add(tail);
    const stalk = new T.Mesh(new T.CylinderGeometry(0.5, 1.0, 2.2, 12), new T.MeshLambertMaterial({ color: 0x3d4b5e })); stalk.rotation.x = Math.PI / 2; stalk.position.z = -0.6; tail.add(stalk);
    [-1, 1].forEach((sd) => { const fl = new T.Mesh(new T.SphereGeometry(1, 14, 8), new T.MeshLambertMaterial({ color: 0x334155 })); fl.scale.set(1.9, 0.18, 0.9); fl.position.set(sd * 1.4, 0, -2.0); fl.rotation.y = sd * 0.5; tail.add(fl); });
    [-1.2, 1.2].forEach((dx) => { const eye = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), new T.MeshBasicMaterial({ color: 0x0f172a })); eye.position.set(dx * 1.6, 0.5, 4.6); fish.add(eye); });
    // fins, a long mouth line and pale grooves on the throat, like a great whale-sized fish
    const finMat = new T.MeshLambertMaterial({ color: 0x3d4b5e });
    const dorsal = new T.Mesh(new T.ConeGeometry(0.6, 1.4, 6), finMat); dorsal.scale.z = 2.2; dorsal.position.set(0, 1.55, -1.6); dorsal.rotation.x = -0.5; fish.add(dorsal);
    [-1, 1].forEach((sd) => { const pf = new T.Mesh(new T.SphereGeometry(1, 10, 6), finMat); pf.scale.set(1.5, 0.12, 0.6); pf.position.set(sd * 2.4, -0.5, 1.6); pf.rotation.set(0, sd * 0.6, sd * -0.4); fish.add(pf); });
    const mouth = new T.Mesh(new T.TorusGeometry(2.0, 0.07, 6, 24, Math.PI * 0.9), new T.MeshBasicMaterial({ color: 0x1e293b })); mouth.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); mouth.position.set(0, -0.2, 3.6); mouth.scale.set(1, 1.35, 1); fish.add(mouth);
    for (let k = -2; k <= 2; k++) { const gr = new T.Mesh(new T.BoxGeometry(0.06, 0.04, 3.4), new T.MeshLambertMaterial({ color: 0xa8b6c6 })); gr.position.set(k * 0.38, -1.62, 2.8); fish.add(gr); }
    api.add(fish); JONAH.fishMesh = fish;
    const ride = api.mover({ w: 3.2, h: 0.4, d: 8, color: 0x475569, path: () => JONAH.fishPos });
    ride.mesh.visible = false; JONAH.ride = ride;
    const fishRing = new T.Mesh(new T.RingGeometry(1.4, 1.7, 24), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    fishRing.rotation.x = -Math.PI / 2; fishRing.visible = false; api.add(fishRing); JONAH.fishRing = fishRing;
    // the swim: five golden rings to steer through, rocks with surf to steer round
    JONAH.ringMeshes = JONAH.RINGS.map(([x, z], i) => {
      const r = new T.Mesh(new T.TorusGeometry(2.6, 0.22, 10, 32), new T.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85 }));
      const nx = (JONAH.RINGS[i + 1] || JONAH.LAND); r.position.set(x, 1.6, z); r.rotation.y = Math.atan2(nx[0] - x, nx[1] - z) + Math.PI / 2; r.visible = false; api.add(r); return r;
    });
    JONAH.ROCKS.forEach(([x, z], i) => {
      const rk = new T.Mesh(new T.DodecahedronGeometry(1.5 + (i % 3) * 0.3, 0), api.mat(0x57534e)); rk.position.set(x, 0.3, z); rk.rotation.set(i, i * 2, 0); rk.scale.y = 1.3; api.add(rk);
      const foam = new T.Mesh(new T.RingGeometry(1.7, 2.4, 20), new T.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.5, side: T.DoubleSide })); foam.rotation.x = -Math.PI / 2; foam.position.set(x, -0.3, z); api.add(foam);
    });

    // --- the beach and the road ---
    const jonah = api.follower({ x: JONAH.BEACH[0], z: JONAH.BEACH[1], kind: 'Jonah', mesh: person(0x854d0e, 0xfef3c7, 1, { beard: true }) });
    jonah.mesh.visible = false;
    jonah.callable = () => (api.taskDone('ride') ? true : 'Not yet.');
    JONAH.jonah = jonah;

    // --- Nineveh: walls with a gate, houses, five crowds, the king's palace ---
    JONAH.walls = [api.box({ x: -11.5, z: 22, w: 17, d: 1.2, h: 4.2, color: 0xc9a66b }), api.box({ x: 11.5, z: 22, w: 17, d: 1.2, h: 4.2, color: 0xc9a66b })];
    [[-6, 30, 4], [7, 31, 3.5], [-14, 34, 4], [15, 30, 3], [-4, 40, 3], [9, 40, 3.5]].forEach(([x, z, w]) => api.box({ x, z, w, d: w, h: 3 + (x > 0 ? 0.6 : 0), color: 0xd9c08f }));
    JONAH.palace = api.box({ x: 0, z: 44, w: 10, d: 3, h: 5, color: 0xe2c992 });             // the king's palace
    const throne = new T.Mesh(new T.BoxGeometry(1.4, 1.6, 1), api.mat(0x7c3aed)); throne.position.set(0, 0.8, 41.8); api.add(throne);
    const king = person(0x6d28d9, 0xfacc15, 1, { beard: true, band: 0xfacc15 }); king.position.set(0, 0, 41.2); king.rotation.y = Math.PI; api.add(king); JONAH.king = king;
    const robes = [0xb91c1c, 0x0e7490, 0xca8a04, 0x15803d, 0x9d174d, 0x475569];
    [[-12, 27], [11, 26], [-9, 36], [12, 36], [1, 34]].forEach(([x, z], c) => {
      const people = [];
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; const m = api.crowdPerson(c * 4 + k, robes[(c + k) % robes.length], 0xf5f5f4); m.position.set(x + Math.cos(a) * 1.3, api.terrain(x, z), z + Math.sin(a) * 1.3); m.rotation.y = -a - Math.PI / 2; api.add(m); people.push(m); }
      const ring = new T.Mesh(new T.RingGeometry(3, 3.3, 28), new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, api.terrain(x, z) + 0.07, z); api.add(ring);
      JONAH.crowds.push({ x, z, people, ring, heard: false });
    });

    // --- fragments ---
    // 1: in the shallows (the Fisherman nets it)
    api.fragment({ x: -11, z: -9, y: -0.2, net: true });
    // 2: crumbling stones up to the top of Nineveh's wall
    [[-17, 18.4, 1.2], [-18.6, 20, 2.2], [-17, 21.6, 3.2]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.fragment({ x: -14, z: 22, y: api.terrain(-14, 22) + 4.2 + 1.3 });
    // 3: a spring on deck up to the lookout on the mast
    api.spring({ x: sx + 2.2, z: sz - 4.5, top: D + 0.35 });
    api.box({ x: sx, z: sz - 1, w: 2.4, d: 2.4, h: 0.3, y: D + 4.5, color: 0x6b4423 });
    api.fragment({ x: sx, z: sz - 1, y: D + 4.8 + 1.3 });

    // --- Golden Scroll challenge course: west of the road ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 7 + i * 2.2, x = -19 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, sz + 4, D + 1], [-3, sz - 2, D + 1], [3, sz - 8, D + 1], [5, 6], [0, 12], [-4, 17], [4, 18], [0, 26],
      [-6, 34], [6, 36], [-17, 20, 2.3], [14, 12]]);
    JONAH.seaLeaves = api.leaves([[15, -26, 2.2], [0, -18, 2.2], [-16, -27, 2.2], [-10, -12, 2.2], [17, -34, 2.2]]);   // swim the fish over these
    JONAH.seaLeaves.forEach((lf) => { lf.ride = true; });
    // camera for the swim (switched on when the fish sets off): from behind, looking toward the beach
    JONAH.swimCam = api.camZone({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, yaw: Math.PI, height: 13, back: 16, pull: 0 });
    LEVEL._dress(api);
    // camera: on the rocking deck, a little higher to see the hatch and the cargo chute
    api.camZone({ minX: -8, maxX: 8, minZ: JONAH.CHUTE[1] - 10, maxZ: JONAH.CHUTE[1] + 10, yaw: 0, height: 13, back: 11, focus: [0, D, JONAH.CHUTE[1]], pull: 0.3 });
  },

  /* ---------- presentation only: nothing here is solid, and no rule changes ---------- */
  // A ship's hull: a boat shape below the deck, rising to a high stem and stern, with oar ports and oars.
  _hull(api) {
    const T = api.THREE, g = new T.Group(), D = JONAH.DECK, wood = api.texMat(0x4a2f17, 'wood'), dark = api.texMat(0x2f1d0e, 'wood');
    const sh = new T.Shape(), lift = (u) => Math.max(0, Math.abs(u) - 6.5) / 3.0;
    sh.moveTo(-9.8, D + 0.2); for (let u = -9.8; u <= 9.81; u += 0.5) sh.lineTo(u, D + 1.15 + lift(u) * lift(u) * 2.2);
    sh.lineTo(9.8, D + 0.2); sh.quadraticCurveTo(7, -1.9, 0, -2.0); sh.quadraticCurveTo(-7, -1.9, -9.8, D + 0.2);
    const geo = new T.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
    [-1, 1].forEach((sd) => { const m = new T.Mesh(geo, wood); m.rotation.y = Math.PI / 2; m.position.set(sd * 5.15 + (sd < 0 ? -0.3 : 0), 0, 0); m.castShadow = true; g.add(m); });
    const keel = new T.Mesh(new T.BoxGeometry(10.4, 0.5, 15), dark); keel.position.y = -1.6; g.add(keel);
    [-1, 1].forEach((end) => { const post = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 4.2, 8), dark); post.position.set(0, D + 1.4, end * 9.6); post.rotation.x = end * 0.35; g.add(post); });
    for (let k = -3; k <= 3; k++) [-1, 1].forEach((sd) => { const oar = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 4.4, 6), api.texMat(0x8b6a44, 'wood')); oar.position.set(sd * 6.6, D - 1.4, k * 2.2); oar.rotation.z = sd * 1.0; g.add(oar); const blade = new T.Mesh(new T.BoxGeometry(0.08, 0.9, 0.36), api.texMat(0x8b6a44, 'wood')); blade.position.set(sd * 8.2, D - 2.6, k * 2.2); blade.rotation.z = sd * 1.0; g.add(blade); });
    return g;
  },

  _dress(api) {
    const T = api.THREE, g = new T.Group();
    const M = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const B = (w, h, d, mat, x, y, z) => M(new T.BoxGeometry(w, h, d), mat, x, y, z);
    JONAH.deck.mesh.material = api.texMat(0x7a5232, 'wood'); JONAH.rails.forEach((r) => { r.mesh.material = api.texMat(0x8b5a2b, 'wood'); });
    // Nineveh: brick walls with battlements, a gate with towers, the palace with columns
    const brick = api.texMat(0xc9a66b, 'brick'), dark = new T.MeshLambertMaterial({ color: 0x2a1d12 });
    JONAH.walls.forEach((w) => { w.mesh.material = brick; });
    for (let x = -19.5; x <= 19.6; x += 1.5) if (Math.abs(x) > 3.6) B(0.7, 0.55, 1.2, brick, x, 4.45, 22);
    [-1, 1].forEach((sd) => { B(2.4, 6.2, 2.4, brick, sd * 4.2, 3.1, 22); for (let k = -1; k <= 1; k++) B(0.5, 0.5, 0.5, brick, sd * 4.2 + k * 0.8, 6.45, 22 - 0.95); });
    JONAH.palace.mesh.material = api.texMat(0xe2c992, 'brick');
    for (let x = -4; x <= 4.1; x += 2) { M(new T.CylinderGeometry(0.28, 0.32, 4.6, 12), api.texMat(0xf0e2bf, 'stone'), x, 2.3, 42.3); B(0.75, 0.25, 0.75, api.texMat(0xd2a64c, 'gold'), x, 4.65, 42.3); }
    B(10.4, 0.5, 3.6, api.texMat(0xc9a66b, 'brick'), 0, 5.25, 43.8);
    [-3, 3].forEach((dx) => B(0.9, 1.6, 0.05, api.texMat(0x1d4ed8, 'cloth'), dx, 3.6, 42.5 - 0.02));   // banners
    // the beach: driftwood and rocks
    [[2, 1.2, 0.5], [12, 2.4, 1.6], [-6, 0.6, 2.4]].forEach(([x, z, r]) => { const l = M(new T.CylinderGeometry(0.16, 0.22, 2.4, 7), api.texMat(0x8c7a64, 'bark'), x, api.terrain(x, z) + 0.16, z); l.rotation.set(Math.PI / 2, 0, r); });
    api.scenery(g);
    [['PalmTree_1', -12, 8, 6.5], ['PalmTree_3', 16, 10, 6], ['PalmTree_2', -18, 30, 7], ['PalmTree_4', 18, 38, 6.5]].forEach(([n, x, z, h]) => { const m = api.model(n, h); if (!m) return; const t = new T.Group(); t.position.set(x, api.terrain(x, z), z); t.rotation.y = x + z; t.add(m); api.add(t); api.fadeScenery(t, 2.6); });
    // a sailor who knows the ship (optional; just for our game)
    JONAH.sailorTalk = api.conversation({
      person: JONAH.sailors[0], speaker: 'A sailor', label: 'Talk with the sailor',
      clue(api) {
        if (!api.taskDone('cargo')) { const c = JONAH.crates.find((it) => !it.delivered && !it.holder); return { text: 'The storm will break the ship! Throw the cargo over the side, at the gold ring.', at: c ? [c.x, c.y + 1, c.z] : undefined }; }
        if (!api.taskDone('wake')) return { text: 'Someone is fast asleep down at the back of the ship. Wake him!', at: [2.4, JONAH.DECK + 1.5, JONAH.SHIP[1] + 7.6] };
        if (!api.taskDone('ride')) return { text: 'The sea is calm now. The LORD is great!' };
        return { text: 'Did you hear? The whole city of Nineveh is turning back to God!' };
      }
    });
  },

  _poses(api, dt) {
    const t = api.time;
    (JONAH.sailors || []).forEach((m, i) => {
      api.posePerson(m, { dt, expression: JONAH.calm ? 'wonder' : 'worry', headPitch: JONAH.calm ? 0 : -0.35 });
      if (!JONAH.calm && i !== 0) { const a = m.userData.storyActor; a.arms.forEach((arm) => { arm.rotation.x = -2.4 + Math.sin(t * 3 + i) * 0.15; }); }   // crying out in the storm (1:5)
    });
    if (JONAH.sleeper && JONAH.sleeper.visible) JONAH.sleeper.userData.storyActor.body.position.y = Math.sin(t * 1.1) * 0.01;
  },

  // Jonah wakes and tells the truth; cast into the sea; the sea goes calm; God prepares a fish
  _confess(api) {
    api.story([
      { art: '🐟', title: 'Jonah said the storm was his fault, and they put him in the sea', text: 'Now the LORD had prepared a great fish to swallow up Jonah. And Jonah was in the belly of the fish three days and three nights.', ref: 'Jonah 1:17' }
      ,{ art: '🎮', title: 'Just for our game', text: "Jonah prayed inside the fish (Jonah 2:1). Our ride on its back is imagined. Steer through the golden rings. God guided the real fish." }
    ], () => { api.toast('🐟 Everyone climb on the fish\'s back. When the whole team is on, steer it together through the golden rings to the shore!', 4500);
      JONAH.calm = true; api.rain(false);
      JONAH.sleeper.visible = false;
      api.puff(8, 0, -28, 0xbfdbfe, 16); api.sfx('drop');
      JONAH.fishPos = [JONAH.FISH0[0], 0.9, JONAH.FISH0[1]]; JONAH.fishMesh.rotation.y = Math.PI;   // facing out to sea, ready to swim
      JONAH.fishRing.visible = true;
    });
  },

  // Steering the great fish: every rider's stick adds up; the fish keeps swimming forward, turns toward the sticks,
  // bumps off rocks, the ship and the edge of the sea (never hurting anyone), and finishes at the beach after the rings.
  _swim(api, dt, ps) {
    const W = JONAH.swim || (JONAH.swim = { x: JONAH.FISH0[0], z: JONAH.FISH0[1], h: Math.PI, sp: 3, next: 0, bumpT: 0, told: {} });
    if (!W.told.go) { W.told.go = true; JONAH.ringMeshes.forEach((r) => { r.visible = true; }); Object.assign(JONAH.swimCam, { minX: -30, maxX: 30, minZ: -50, maxZ: -3 }); }
    // seats along the fish's back; a player who joins now hops straight on
    ps.forEach((p) => { if (!p.seat) p.seat = () => { if (!JONAH.swim || JONAH.swim.done) return null; const k = api.activePlayers().indexOf(p), Wn = JONAH.swim, fwd = 1.6 - Math.floor(Math.max(0, k) / 2) * 1.6, side = k % 2 ? 0.6 : -0.6, c = Math.cos(Wn.h), sn = Math.sin(Wn.h); return [Wn.x + sn * fwd + c * side, JONAH.fishPos[1] + 0.4, Wn.z + c * fwd - sn * side, Wn.h]; }; });
    let ix = 0, iz = 0; ps.forEach((p) => { if (p.inp) { ix += p.inp.mx; iz += p.inp.mz; } });
    const held = Math.hypot(ix, iz) > 0.25;
    if (held) { let d = Math.atan2(ix, iz) - W.h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; W.h += Math.max(-2.4 * dt, Math.min(2.4 * dt, d)); }
    W.sp += ((held ? 6.5 : 3) - W.sp) * Math.min(1, dt * 2);
    W.bumpT = Math.max(0, W.bumpT - dt); W.glT = Math.max(0, (W.glT || 0) - dt);
    let nx = W.x + Math.sin(W.h) * W.sp * dt, nz = W.z + Math.cos(W.h) * W.sp * dt;
    const R = 2.4, bump = (msg) => { if (W.bumpT <= 0) { W.bumpT = 0.8; api.sfx('splash'); api.puff(nx, 0, nz, 0xe0f2fe, 8); if (msg && !W.told.bump) { W.told.bump = true; api.toast('🪨 Bonk! Nobody is hurt. Steer round the rocks and the ship.', 2600); } } W.sp = 1.5; };
    if (nx < -19 || nx > 19 || nz < -42.5 || nz > -5.5) { nx = Math.max(-19, Math.min(19, nx)); nz = Math.max(-42.5, Math.min(-5.5, nz)); bump(null); W.h += Math.PI * dt * 2; }
    const sx0 = -5.3 - R, sx1 = 5.3 + R, sz0 = -40.6 - R, sz1 = -21.4 + R;     // the ship
    if (nx > sx0 && nx < sx1 && nz > sz0 && nz < sz1) {
      const m = Math.min(nx - sx0, sx1 - nx, nz - sz0, sz1 - nz);
      const hx = Math.sin(W.h), hz = Math.cos(W.h), slide = 3 * dt;                 // slide along the hull instead of sticking
      if (m === nx - sx0) { nx = sx0; nz += (hz >= 0 ? 1 : -1) * slide; } else if (m === sx1 - nx) { nx = sx1; nz += (hz >= 0 ? 1 : -1) * slide; }
      else if (m === nz - sz0) { nz = sz0; nx += (hx >= 0 ? 1 : -1) * slide; } else { nz = sz1; nx += (hx >= 0 ? 1 : -1) * slide; }
      bump(true);
    }
    JONAH.ROCKS.forEach(([rx, rz]) => {
      const dx = nx - rx, dz = nz - rz, d = Math.hypot(dx, dz), min = R + 1.5;
      if (d < min && d > 1e-4) {
        const tx = -dz / d, tz = dx / d;                                    // glance off to one side (picked once per bump)
        if (!(W.glT > 0)) W.gl = Math.sign(Math.sin(W.h) * tx + Math.cos(W.h) * tz) || 1; W.glT = 0.5;
        nx = rx + dx / d * min + tx * W.gl * 4 * dt; nz = rz + dz / d * min + tz * W.gl * 4 * dt; bump(true);
      }
    });
    W.x = nx; W.z = nz;
    (JONAH.seaLeaves || []).forEach((lf) => { if (!lf.got && ps[0] && Math.hypot(lf.x - W.x, lf.z - W.z) < 3) { lf.x = ps[0].pos.x; lf.z = ps[0].pos.z; lf.y = ps[0].pos.y + 1; } });   // the fish swims over it: a rider grabs it
    JONAH.fishPos = [W.x, 0.9 + Math.sin(api.time * 2.2) * 0.12, W.z];
    JONAH.fishMesh.children[2].rotation.y = Math.sin(api.time * (4 + W.sp)) * 0.35;
    // rings in order; the next one glows, the rest are dim
    JONAH.ringMeshes.forEach((r, i) => { r.material.opacity = i < W.next ? 0 : i === W.next ? 0.9 : 0.3; r.visible = i >= W.next; r.rotation.z = api.time * 0.8; });
    const nr = JONAH.RINGS[W.next];
    if (nr && Math.hypot(W.x - nr[0], W.z - nr[1]) < 3.2) {
      W.next++; api.sfx('coin'); api.puff(nr[0], 1.6, nr[1], 0xfde68a, 12); ps.forEach((p) => api.servant(p, 1));
      if (W.next === 2 && !JONAH.told.pray) {
        JONAH.told.pray = true;
        if (api.shownRef('Jonah 2:9')) api.toast('🙏 Inside the fish, Jonah prayed: "Salvation is of the LORD" (Jonah 2:9).', 4000);
        else api.story([{ art: '🙏', title: 'Inside the fish', text: 'But I will sacrifice unto thee with the voice of thanksgiving; I will pay that that I have vowed. Salvation is of the LORD.', ref: 'Jonah 2:9' }]);
      }
    }
    if (W.next >= JONAH.RINGS.length) { JONAH.fishRing.visible = true; JONAH.fishRing.position.set(JONAH.LAND[0], 0.2, JONAH.LAND[1]); }
    if (W.next >= JONAH.RINGS.length && Math.hypot(W.x - JONAH.LAND[0], W.z - JONAH.LAND[1]) < 3.5) {
      W.done = true; JONAH.fishRing.visible = false; JONAH.landAt = [W.x, W.z]; Object.assign(JONAH.swimCam, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
      ps.forEach((p, i) => { p.seat = null; const bx = JONAH.BEACH[0] - 2 + i * 1.3, bz = JONAH.BEACH[1] + 1.5; p.pos.set(bx, api.terrain(bx, bz) + 0.05, bz); p.vel.set(0, 0, 0); if (p.lastSafe) p.lastSafe.copy(p.pos); });
      api.task('ride'); ps.forEach((p) => api.servant(p, 4));
      const j = JONAH.jonah; j.mesh.visible = true; j.pos.set(JONAH.BEACH[0], api.terrain(JONAH.BEACH[0], JONAH.BEACH[1]), JONAH.BEACH[1]); j.home.copy(j.pos);
      api.puff(JONAH.BEACH[0], 0.5, JONAH.BEACH[1], 0xbfdbfe, 14);
      api.story([
        { art: '🔁', title: 'A second chance', text: 'And the word of the LORD came unto Jonah the second time, saying,', ref: 'Jonah 3:1' }
      ], () => api.toast('🏖️ God told the fish to put Jonah out on dry land (Jonah 2:10). This time Jonah obeyed: call him and walk with him to each crowd in Nineveh.', 5000));
      JONAH.swimAway = api.time;
    }
  },

  update(api, dt) {
    const ps = api.activePlayers();
    // the storm rocks the sea and the ship
    const rough = JONAH.calm ? 0.15 : 1;
    JONAH.sea.position.y = -0.5 + Math.sin(api.time * 1.3) * 0.15 * rough;
    JONAH.hull.rotation.z = Math.sin(api.time * 1.1) * 0.04 * rough;
    JONAH.sail.rotation.y = Math.sin(api.time * 2.3) * 0.2 * rough;
    LEVEL._poses(api, dt);
    if (!JONAH.calm) ps.forEach((p) => { if (p.pos.y > JONAH.DECK - 0.2 && p.pos.z < -21) api.push(p, Math.sin(api.time * 0.9) * 2.2, 0, dt); });
    // the fish waits; when everyone is on its back, it swims to shore
    const f = JONAH.fishPos, top = f[1] + 0.4;
    const onFish = (p) => Math.abs(p.pos.x - f[0]) < 1.7 && Math.abs(p.pos.z - f[2]) < 4.1 && Math.abs(p.pos.y - top) < 0.6;
    if (JONAH.calm && JONAH.rideT === undefined && ps.length && ps.every(onFish)) {
      JONAH.rideT = api.time; JONAH.fishRing.visible = false;
      api.sfx('splash');   // (the fish moving says it)
    }
        if (JONAH.rideT !== undefined && !api.taskDone('ride')) LEVEL._swim(api, dt, ps);
    if (JONAH.swimAway !== undefined) {                                  // the fish goes back to sea
      const k = Math.min(1, (api.time - JONAH.swimAway - 2) / 6), L0 = JONAH.landAt;
      if (k > 0) JONAH.fishPos = [L0[0] + k * 6, 0.9 - k * 5, L0[1] - k * 14];
    }
    JONAH.fishMesh.position.set(JONAH.fishPos[0], JONAH.fishPos[1] - 1.1, JONAH.fishPos[2]);
    if (JONAH.swim) JONAH.fishMesh.rotation.y = JONAH.swim.h;
    JONAH.fishMesh.children[2].rotation.y = Math.sin(api.time * 4) * 0.3;
    if (JONAH.fishRing.visible) { JONAH.fishRing.position.set(f[0], top + 0.05, f[2]); }
    // Jonah speaks to each crowd he is brought to
    const j = JONAH.jonah;
    if (api.taskDone('ride')) JONAH.crowds.forEach((c) => {
      if (c.heard || Math.hypot(j.pos.x - c.x, j.pos.z - c.z) > 3.6) return;
      c.heard = true; c.ring.visible = false;
      c.people.forEach((m) => { m.children[0].material = api.mat(0x6b5a45); m.children[2].material = api.mat(0x6b5a45); m.scale.y = 0.85; });   // sackcloth, bowing
      api.task('preach'); api.sfx('coin');
      const lead = j.leader || ps[0];
      api.servant(lead, 5, 'for going with Jonah!');
      if (api.taskCount('preach') === 1) api.toast('📣 Jonah cried: "Yet forty days, and Nineveh shall be overthrown" (Jonah 3:4).', 4000);
      else if (api.taskCount('preach') === 3) api.toast('🧎 "So the people of Nineveh believed God" (Jonah 3:5)', 3500);   // a pop-up, not a card: keeps the run going
    });
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, JONAH.DECK + 1, held.deliverTo.z];
    if (!api.taskDone('cargo')) { const c = JONAH.crates.find((it) => !it.delivered && !it.holder); return c ? [c.x, c.y + 1, c.z] : null; }
    if (!api.taskDone('wake')) return [2.4, JONAH.DECK + 1.5, JONAH.SHIP[1] + 7.6];
    if (!api.taskDone('ride')) {
      const W = JONAH.swim;
      if (W && !W.done) { const r = JONAH.RINGS[W.next] || JONAH.LAND; return [r[0], 2.2, r[1]]; }
      const f = JONAH.fishPos; return [f[0], f[1] + 2, f[2]];
    }
    const j = JONAH.jonah;
    if (j.state !== 'follow') return [j.pos.x, j.pos.y + 2, j.pos.z];
    const c = JONAH.crowds.filter((cr) => !cr.heard).sort((a, b) => Math.hypot(a.x - j.pos.x, a.z - j.pos.z) - Math.hypot(b.x - j.pos.x, b.z - j.pos.z))[0];
    return c ? [c.x, 1.5, c.z] : null;
  },

  finale: {
    message: '👑 Everyone go to the king of Nineveh!',
    beacon: [0, 3, 40],
    inZone(p) { return Math.hypot(p.pos.x, p.pos.z - 40) < 6; },
    onUpdate(api, t) {
      if (t > 0.3 && !JONAH.kingDown) { JONAH.kingDown = true; JONAH.king.children[0].material = api.mat(0x6b5a45); JONAH.king.scale.y = 0.8; }
      if (t > 0.5 && !JONAH.done) {
        JONAH.done = true;
        api.story([
          { art: '💛', text: 'And God saw their works, that they turned from their evil way; and God repented of the evil, that he had said that he would do unto them; and he did it not.', ref: 'Jonah 3:10' },
          { art: '🐟', title: 'The sign of Jonah', text: 'For as Jonas was three days and three nights in the whale’s belly; so shall the Son of man be three days and three nights in the heart of the earth.', ref: 'Matthew 12:40' },
          { art: '✝️', text: 'Jesus spoke about Jonah. Jonah came back after three days, and Jesus rose from the dead on the third day, to save everyone who turns to Him.' }
        ], () => { JONAH.endT = api.time; });
      }
      return JONAH.endT !== undefined && api.time - JONAH.endT > 2;
    }
  }
};
