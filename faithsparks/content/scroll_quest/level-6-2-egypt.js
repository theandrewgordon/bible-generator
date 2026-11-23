/* =====================================================================
 * LEVEL 6-2: THE NIGHT ROAD TO EGYPT  (Matthew 2:13-15)
 * ---------------------------------------------------------------------
 * Night in Bethlehem. An angel warned Joseph in a dream: take the young child and his mother and
 * go to Egypt. North (Joseph's house) to south (the road out of town).
 *   1. Pack for the journey: carry three bundles to the donkey by the door.
 *   2. Lead the donkey (Mary rides it, holding the child; Jesus is never shown) through the back
 *      lanes. King Herod's soldiers search with lanterns: keep out of their light. If one sees you,
 *      you simply slip back to the last safe corner (never caught). Out before dawn for a bonus.
 * Only edit THIS file to change the level. See GEMINI.md and CAMPAIGN.md.
 * ===================================================================== */

const EGYPT = {
  HOUSE: [0, 28],
  DONKEY0: [4.5, 25.5],
  EXIT: [0, -31],
  CHECKS: [[2, 24], [0, 5], [0, -8], [0, -21]],   // safe corners (always 3.5+ from a patrol line)
  blocks: [],                  // houses (also block the soldiers' view): [minX, maxX, minZ, maxZ]
  bundles: [],
  soldiers: [],
  spotted: 0
};

function egyptBlocked(ax, az, bx, bz) {
  for (let k = 1; k < 8; k++) {
    const x = ax + (bx - ax) * k / 8, z = az + (bz - az) * k / 8;
    if (EGYPT.blocks.some((r) => x > r[0] && x < r[1] && z > r[2] && z < r[3])) return true;
  }
  return false;
}

const LEVEL = {
  id: '6-2',
  bibleConnection: {"passage": "Matthew 2:13–23", "text": "God warned Joseph to flee with Mary and Jesus because Herod sought to kill the child. Herod’s cruel killing of Bethlehem’s boys is told in the story. Our shadow route and donkey packing imagine the family’s urgent journey."},
  world: 'World 6-2',
  title: 'The Night Road to Egypt',
  town: true,                 // houses get doors, windows, awnings (engine house kit)
  time: 'night',
  leafIcon: '⭐',
  reactive: false,                    // soldiers searching: nobody turns to look at you (stealth stays clear)
  leafColor: 0xfde68a,
  leafShape: 'round',
  spawn: [-2, 26],
  bounds: { minX: -21, maxX: 21, minZ: -34, maxZ: 34 },
  approach: ['stones', 'meadow:lion', 'crumbles'],   // the way in (engine): a stretch before the level's own start
  startMessage: 'Quick and quiet! Carry the bundles to the donkey by the door.',

  intro: [
    { text: 'When he arose, he took the young child and his mother by night, and departed into Egypt:', ref: 'Matthew 2:14' },
    { text: 'The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore.', ref: 'Psalm 121:8' }
  ],

  introStory: [
    { art: '🎁', text: 'And when they were come into the house, they saw the young child with Mary his mother, and fell down, and worshipped him: and when they had opened their treasures, they presented unto him gifts; gold, and frankincense, and myrrh.', ref: 'Matthew 2:11' },
    { art: '💤', text: 'And when they were departed, behold, the angel of the Lord appeareth to Joseph in a dream, saying, Arise, and take the young child and his mother, and flee into Egypt, and be thou there until I bring thee word: for Herod will seek the young child to destroy him.', ref: 'Matthew 2:13' }
  ],

  tasks: [
    { id: 'pack', icon: '🎒', label: 'Pack the bundles onto the donkey', total: 3 },
    { id: 'road', icon: '🫏', label: 'Lead the donkey out of Bethlehem', total: 1, lockedUntil: 'pack' }
  ],

  memoryVerse: { text: 'The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore.', ref: 'Psalm 121:8' },

  ending: {
    verse: { text: 'And was there until the death of Herod: that it might be fulfilled which was spoken of the Lord by the prophet, saying, Out of Egypt have I called my son.', ref: 'Matthew 2:15' },
    message: 'Joseph obeyed God right away, and God kept His Son safe, just as He had promised.'
  },

  quiz: [
    { q: 'How did God warn Joseph?', ref: 'Matthew 2:13', options: ['An angel in a dream', 'A letter', 'A soldier told him'], answer: 0 },
    { q: 'When did Joseph leave?', ref: 'Matthew 2:14', options: ['Next week', 'By night, right away', 'After a big party'], answer: 1 },
    { q: 'Where did they go?', ref: 'Matthew 2:14', options: ['Rome', 'Egypt', 'Nineveh'], answer: 1 }
  ],

  music: {
    bpm: 76,
    notes: [64, 0, 67, 0, 71, 0, 69, 67, 66, 0, 62, 0, 64, 0, 0, 0,
            67, 0, 71, 72, 71, 0, 69, 67, 66, 0, 64, 0, 62, 64, 0, 0],
    bass: [40, 40, 45, 45, 42, 42, 40, 40]
  },

  onCallText() {                                                 // said once; after that they just come
    if (EGYPT.saidCall) return '';
    EGYPT.saidCall = true;
    return 'The donkey follows you, with Mary and the little child.';
  },

  /* ---------- ground shape ---------- */
  terrain(x, z) {
    let h = Math.sin(x * 0.3) * Math.cos(z * 0.22) * 0.1;
    h += Math.max(0, Math.abs(x) - 18) * 1.2;
    const wd = Math.hypot(x + 14, z - 19);                              // the well
    if (wd < 1.2) h -= 2.5;
    return h;
  },

  groundColor(x, z) {
    if (z < -26) return 0x8a7b5e;
    return (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? 0x8a8070 : 0x827868;
  },

  /* ---------- build ---------- */
  build(api) {
    const T = api.THREE;
    const person = (robe, scarf, s, o) => api.person(robe, scarf, s, o);   // friendly round townsfolk (engine)

    // --- Bethlehem: houses make the lanes (they also hide you from the soldiers) ---
    const house = (x, z, w, d, h) => { api.box({ x, z, w, d, h, color: 0x9c8f78 }); EGYPT.blocks.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]); };
    house(0, 31, 8, 4, 3.4);                                             // Joseph's house
    [[-10, 26, 5, 5, 3], [12, 26, 6, 5, 3.2], [-5, 16, 7, 4, 3], [7, 16, 6, 4, 3.4], [-13, 8, 6, 5, 3], [11, 6, 7, 4, 3],
     [-3, 2, 6, 4, 3.2], [-9, -6, 6, 5, 3], [8, -8, 6, 6, 3.2], [-2, -12, 5, 3, 3], [-12, -18, 6, 5, 3], [10, -20, 6, 5, 3],
     [-4, -24, 5, 3, 3]].forEach(([x, z, w, d, h]) => house(x, z, w, d, h));
    const lamp = new T.PointLight(0xffd59e, 1.0, 9, 2); lamp.position.set(0, 2.4, 27.5); api.add(lamp);
    const joseph = person(0x7c5a3a, 0xe7e5e4, 1, { beard: true, belt: 0x6b4a2b }); joseph.position.set(2.2, 0, 27); api.add(joseph); EGYPT.joseph = joseph;

    // --- the donkey, with Mary riding and holding the child (only Mary is shown) ---
    const dk = new T.Group();
    const beast = api.animalMesh('donkey'); dk.add(beast);                    // a round donkey with walking legs
    const back = beast.userData.back || 1.08, up = back - 1.15 + 0.05;
    const mary = person(0x1d4ed8, 0xe0e7ff, 0.75); mary.position.set(0, 1.15 + up, -0.1); dk.add(mary);
    const shawl = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), api.mat(0xe0e7ff)); shawl.scale.set(1, 0.7, 0.8); shawl.position.set(0, 1.85 + up, 0.2); dk.add(shawl);   // her shawl wrapped round the child
    const packs = new T.Group(); packs.visible = false; dk.add(packs); EGYPT.packs = packs;
    EGYPT.donkey = api.follower({ x: EGYPT.DONKEY0[0], z: EGYPT.DONKEY0[1], kind: 'donkey', mesh: dk,
      deliverTo: { x: EGYPT.EXIT[0], z: EGYPT.EXIT[1], r: 3 },
      parkAt: [EGYPT.EXIT[0], 0, EGYPT.EXIT[1] - 1.5],
      onDeliver(p) {
        api.task('road'); api.servant(p, 6, 'for keeping the little family safe!');
        if (EGYPT.cd && !EGYPT.cd.over) { EGYPT.cd.stop(); api.activePlayers().forEach((q) => api.servant(q, 4, 'out before dawn!')); }
      } });
    EGYPT.donkey.callable = () => (api.taskDone('pack') ? true : 'Mary waits on the donkey. Pack the bundles first.');
    EGYPT.donkey.state = 'parked';

    // --- bundles to pack ---
    [['food sack', 0xa16207, -3, 27], ['water skin', 0x7c2d12, -6, 22], ['gifts chest', 0xd4a017, 5, 21]].forEach(([name, col, x, z], k) => {
      const m = new T.Mesh(name === 'gifts chest' ? new T.BoxGeometry(0.7, 0.45, 0.5) : new T.SphereGeometry(0.35, 10, 8), api.mat(col));
      EGYPT.bundles.push(api.carryable({ x, z, mesh: m, name, to: 'the donkey',
        deliverTo: { x: EGYPT.DONKEY0[0], z: EGYPT.DONKEY0[1], r: 2.2 },
        onDeliver(p) {
          api.task('pack'); api.servant(p, 3);
          const b = new T.Mesh(new T.BoxGeometry(0.35, 0.35, 0.45), api.mat(col)); b.position.set(k === 1 ? 0.5 : -0.5, 1.1, -0.5 + k * 0.3); packs.add(b); packs.visible = true;
          if (api.taskDone('pack')) LEVEL._go(api);   // (the task board counts the others: no pop-up)
        } }));
    });

    // --- Herod's soldiers with lanterns ---
    [[20, 12, 2.2], [11, 12, 2.6], [-1, 11, 2.0], [-15, 12, 2.4], [-27, 12, 2.2]].forEach(([z, amp, sp], i) => {
      const m = person(0x7f1d1d, 0x9ca3af); api.add(m);
      const lt = new T.PointLight(0xffb347, 0.9, 7, 2); lt.position.set(0.5, 1.6, 0.4); m.add(lt);
      const cone = new T.Mesh(new T.CircleGeometry(6, 18, -0.6, 1.2), new T.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false }));
      cone.rotation.x = -Math.PI / 2; api.add(cone);
      EGYPT.soldiers.push({ m, cone, z, amp, sp, t: i * 2.1, x: 0, dir: 1 });
    });

    // --- fragments ---
    // 1: down the old well (the Fisherman casts a net)
    api.stump(-14, 19, 0.9, 1.1);
    api.fragment({ x: -14, z: 19, y: -1.4, net: true });
    // 2: crumbling stones onto a rooftop
    [[16, 12, 1.2], [17.4, 9.6, 2.3], [16, 7.2, 3.3]].forEach(([x, z, t]) => api.crumble({ x, z, top: api.terrain(x, z) + t }));
    api.fragment({ x: 13, z: 6, y: 3 + 1.3 });
    // 3: a spring up onto the watchtower by the road out
    api.box({ x: 14, z: -28, w: 2.4, d: 2.4, h: 4.2, color: 0x8a7f6a });
    api.spring({ x: 14, z: -24.8 });
    api.fragment({ x: 14, z: -28, y: 4.2 + 1.3 });

    // --- Golden Scroll challenge course: along the west edge ---
    const plan = [['block', 1.0], ['float', 1.0], ['crumble', 0.9], ['float', 0.8], ['spring', 0.2], ['float', 4.2], ['crumble', 0.6]];
    let ctop = 0;
    api.course(plan.map(([kind, rise], i) => {
      const z = 2 - i * 2.9, x = -19.5 + (i % 2 ? 0.3 : -0.3);
      ctop = i === 0 ? api.terrain(x, z) + 1.0 : ctop + rise;
      return { x, z, top: ctop, kind };
    }));

    api.leaves([[0, 22], [-4, 20], [4, 11], [-7, 11], [2, 4], [4, -2], [-4, -2], [2, -16], [-6, -14], [4, -26], [17.4, 9.6, 3.1], [-16, 2]]);
    // (no challenge corner: the quiet night journey is the level)
  },

  _go(api) {
    api.story([
      { art: '🫏', text: 'When he arose, he took the young child and his mother by night, and departed into Egypt:', ref: 'Matthew 2:14' }
    ], () => { api.toast('🏮 Call the donkey and lead it through the back lanes. Keep out of the soldiers\' lantern light, and get out of town before the sun comes up!', 4500);
      EGYPT.donkey.state = 'idle';
      EGYPT.joseph.visible = false;
      EGYPT.cd = api.countdown({ seconds: 180, label: '🌅 Before dawn', onEnd: () => api.toast('The sun is rising. Keep going, quietly: God is watching over them.', 2600) });
    });
  },

  update(api, dt) {
    const ps = api.activePlayers();
    const seen = {};
    EGYPT.soldiers.forEach((s) => {
      s.t += dt;
      const x = Math.sin(s.t * s.sp / s.amp) * s.amp, v = Math.cos(s.t * s.sp / s.amp);
      s.x = x; s.dir = v >= 0 ? 1 : -1;
      s.m.position.set(x, api.terrain(x, s.z), s.z); s.m.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      s.cone.position.set(x, api.terrain(x, s.z) + 0.08, s.z); s.cone.rotation.z = s.dir > 0 ? 0 : Math.PI;
      if (!api.taskDone('pack') || api.taskDone('road')) return;          // they only matter on the way out
      ps.forEach((p) => {
        const dx = p.pos.x - x, dz = p.pos.z - s.z, d = Math.hypot(dx, dz);
        if (d > 6 || d < 0.01) return;
        if (Math.acos(Math.max(-1, Math.min(1, (dx * s.dir) / d))) > 0.6 || egyptBlocked(x, s.z, p.pos.x, p.pos.z)) return;
        seen[p.slot] = s;
      });
    });
    LEVEL._watch(api, ps, seen, dt);
  },

  // gentle: a soldier has to see you for most of a second (his cone turns orange: hide!) before you slip back
  _watch(api, ps, seen, dt) {
    EGYPT.soldiers.forEach((s) => { s.cone.material.color.setHex(0xffd27a); s.cone.material.opacity = 0.28; });
    ps.forEach((p) => {
      const s = seen[p.slot];
      if (!s) { p._seen = 0; return; }
      if (!p._seen && !EGYPT.toldLook) { EGYPT.toldLook = true; api.toast('👀 Careful! When a cone turns orange, he is looking your way: duck behind something!', 3000); }
      p._seen = (p._seen || 0) + dt;
      s.cone.material.color.setHex(0xf97316); s.cone.material.opacity = 0.45;
      if (p._seen > (api.settings.gentle ? 1.8 : 0.8)) { p._seen = 0; LEVEL._spotted(api, p); }   // gentler sneaking: more time to hide
    });
  },

  _spotted(api, p) {
    const back = EGYPT.CHECKS.filter((c) => c[1] > p.pos.z + 1).sort((a, b) => a[1] - b[1])[0] || EGYPT.CHECKS[0];
    p.pos.set(back[0], api.groundAt(back[0], back[1]), back[1]); p.vel.set(0, 0, 0); p.lastSafe.copy(p.pos);
    const d = EGYPT.donkey;
    if (d.state === 'follow' && d.leader === p) { d.pos.set(back[0] - 1, api.groundAt(back[0], back[1]), back[1] + 1.6); d.mesh.position.copy(d.pos); }
    EGYPT.spotted++;
    api.sfx('bubble');
    api.toast('🏮 A soldier\'s lantern! You slipped back into the shadows. Wait for him to turn away.', 2600);
  },

  objective(api) {
    const ps = api.activePlayers();
    if (!ps.length) return null;
    const held = ps.map((p) => p.holding).find((h) => h && h.deliverTo);
    if (held) return [held.deliverTo.x, 2, held.deliverTo.z];
    if (!api.taskDone('pack')) { const b = EGYPT.bundles.find((it) => !it.delivered && !it.holder); return b ? [b.x, b.y + 1, b.z] : null; }
    const d = EGYPT.donkey;
    if (d.state !== 'follow') return [d.pos.x, d.pos.y + 2.2, d.pos.z];
    return [EGYPT.EXIT[0], 1.5, EGYPT.EXIT[1]];
  },

  finale: {
    message: '🌄 Everyone gather on the road out of town.',
    beacon: [EGYPT.EXIT[0], 3, EGYPT.EXIT[1]],
    inZone(p) { return Math.hypot(p.pos.x - EGYPT.EXIT[0], p.pos.z - EGYPT.EXIT[1]) < 6; },
    onUpdate(api, t) {
      if (t > 0.5 && !EGYPT.done) {
        EGYPT.done = true;
        api.story([
          { art: '🏜️', title: 'Safe in Egypt', text: 'Joseph, Mary and the little child travelled all the way to Egypt. God kept them safe there.' },
          { art: '📜', text: 'And was there until the death of Herod: that it might be fulfilled which was spoken of the Lord by the prophet, saying, Out of Egypt have I called my son.', ref: 'Matthew 2:15' },
          { art: '🏡', text: 'And he came and dwelt in a city called Nazareth: that it might be fulfilled which was spoken by the prophets, He shall be called a Nazarene.', ref: 'Matthew 2:23' },
          { art: '💛', text: 'For he shall give his angels charge over thee, to keep thee in all thy ways.', ref: 'Psalm 91:11' }
        ], () => { EGYPT.endT = api.time; });
      }
      return EGYPT.endT !== undefined && api.time - EGYPT.endT > 2;
    }
  }
};
