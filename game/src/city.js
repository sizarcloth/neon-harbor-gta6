// Port Solmar: sky, ground, ocean, buildings, palms, lamps, neon, road graph, colliders.
import * as THREE from 'three';
import { ROADS, WORLD, PALETTE, GARAGE, HOSPITAL } from './config.js';
import { range, pick } from './random.js';
import { makeGroundTexture, makeFacadeTexture, makeSignTexture } from './textures.js';
import { buildPalmInstances, buildLampInstances } from './models.js';

const SIGNS = [
  ['HOTEL', '#ff2e88'], ['NEON', '#2ee6ff'], ['BAR', '#ffb020'], ['TACOS', '#ff2e88'],
  ['CASINO', '#2ee6ff'], ['SURF', '#ffb020'], ['PIER 9', '#2ee6ff'], ['MOTEL', '#ff2e88'],
  ['CLUB', '#ffb020'], ['GYM', '#2ee6ff'], ['HOSPITAL', '#ffffff'], ['GARAGE', '#ffb020'],
];
const FACADE_BASES = ['#c98f5f', '#b8a88a', '#8fa3b8', '#a87f6d', '#7d8a99'];
const PARKING_BLOCKS = [[-20, 60], [-20, 100]];

function nodeKey(x, z) { return `${x},${z}`; }

export function buildCity(scene, rng) {
  const colliders = [];
  const signMats = [];

  // Sky dome: vertical gradient texture on a big sphere, seen from inside.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e3a68');
  grad.addColorStop(0.55, '#c96a5a');
  grad.addColorStop(0.8, '#ff9e64');
  grad.addColorStop(1, '#ffc490');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(620, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  scene.fog = new THREE.Fog(PALETTE.fog, 140, 480);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.7);
  sun.position.set(-90, 130, 70);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));

  // Ground: one textured plane for the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Sea: a flat teal plane under and beyond the city edge.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.5;
  scene.add(sea);

  // Buildings, one or two per block. Special blocks stay open for their purpose.
  const facades = FACADE_BASES.map((b) => makeFacadeTexture(rng, b, 0.35));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.95 });
  let signIdx = 0;
  const isSpecial = (bx, bz) => PARKING_BLOCKS.some(([px, pz]) => px === bx && pz === bz)
    || (bx === 100 && bz === 100) || (bx === -100 && bz === 140);
  for (let bx = -140; bx <= 140; bx += 40) {
    for (let bz = -140; bz <= 140; bz += 40) {
      if (isSpecial(bx, bz)) continue;
      const downtown = Math.hypot(bx, bz) < 90;
      const count = rng() < 0.45 ? 2 : 1;
      for (let n = 0; n < count; n += 1) {
        const w = range(rng, 16, 24);
        const d = range(rng, 16, count === 2 ? 12 : 24);
        const h = downtown ? range(rng, 18, 42) : range(rng, 8, 22);
        const ox = count === 2 ? (n === 0 ? -7 : 7) : 0;
        const oz = count === 2 ? (n === 0 ? -7 : 7) : 0;
        const cx = bx + ox, cz = bz + oz;
        const tex = pick(rng, facades).clone();
        tex.needsUpdate = true;
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(w / 13)), Math.max(1, Math.round(h / 13)));
        const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofMat, roofMat, side, side]);
        b.position.set(cx, h / 2, cz);
        scene.add(b);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        // Neon sign on the road-facing side of taller buildings.
        if (h > 16 && rng() < 0.55) {
          const [text, color] = SIGNS[signIdx % (SIGNS.length - 2)];
          signIdx += 1;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 2.6),
            new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color), transparent: true }),
          );
          const faceSouth = Math.abs(bz) >= Math.abs(bx);
          sign.position.set(cx, h * 0.72, cz + (faceSouth ? d / 2 + 0.06 : -(d / 2 + 0.06)));
          if (!faceSouth) sign.rotation.y = Math.PI;
          scene.add(sign);
          signMats.push(sign.material);
        }
      }
    }
  }

  // Garage: low wide workshop with a marked spray zone.
  const garage = new THREE.Mesh(
    new THREE.BoxGeometry(26, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x5a6b7d, roughness: 0.85 }),
  );
  garage.position.set(100, 4, 100);
  scene.add(garage);
  colliders.push({ minX: 87, maxX: 113, minZ: 90, maxZ: 110 });
  const gSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('GARAGE', '#ffb020'), transparent: true }),
  );
  gSign.position.set(100, 6.5, 89.9);
  gSign.rotation.y = Math.PI;
  scene.add(gSign);
  const zone = new THREE.Mesh(
    new THREE.CircleGeometry(GARAGE.radius, 28),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(GARAGE.x, 0.03, GARAGE.z);
  scene.add(zone);

  // Hospital: white block with a cyan sign.
  const hosp = new THREE.Mesh(
    new THREE.BoxGeometry(22, 12, 18),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 }),
  );
  hosp.position.set(-100, 6, 140);
  scene.add(hosp);
  colliders.push({ minX: -111, maxX: -89, minZ: 131, maxZ: 149 });
  const hSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('HOSPITAL', '#2ee6ff'), transparent: true }),
  );
  hSign.position.set(-100, 9, 130.9);
  hSign.rotation.y = Math.PI;
  scene.add(hSign);

  // Harbor: pier sign + bollards along the east edge.
  const pSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('PIER 9', '#2ee6ff'), transparent: true }),
  );
  pSign.position.set(168, 5, -30);
  pSign.rotation.y = -Math.PI / 2;
  scene.add(pSign);

  // Palms: beach boulevard, harbor edge, scattered corners.
  const palmPos = [];
  for (let x = -160; x <= 160; x += 20) palmPos.push({ x: x + 4, z: 166, a: rng() * 6.28 });
  for (let z = -40; z <= 40; z += 20) palmPos.push({ x: 166, z, a: rng() * 6.28 });
  for (let i = 0; i < 10; i += 1) {
    palmPos.push({ x: pick(rng, ROADS) + 6, z: pick(rng, ROADS) + 6, a: rng() * 6.28 });
  }
  const [trunks, leaves] = buildPalmInstances(palmPos);
  scene.add(trunks, leaves);

  // Street lamps at every other intersection corner.
  const lampPos = [];
  for (let ix = 0; ix < ROADS.length; ix += 2) {
    for (let iz = 0; iz < ROADS.length; iz += 2) {
      lampPos.push({ x: ROADS[ix] + 5.5, z: ROADS[iz] + 5.5 });
    }
  }
  const [poles, heads] = buildLampInstances(lampPos);
  scene.add(poles, heads);

  // Road graph: 9x9 intersections, 4-connected.
  const nodes = [];
  const nodeIndex = new Map();
  for (const x of ROADS) {
    for (const z of ROADS) {
      nodeIndex.set(nodeKey(x, z), nodes.length);
      nodes.push({ x, z });
    }
  }
  const adj = nodes.map((n) => {
    const out = [];
    for (const [dx, dz] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
      const k = nodeKey(n.x + dx, n.z + dz);
      if (nodeIndex.has(k)) out.push(nodeIndex.get(k));
    }
    return out;
  });
  function nearestNode(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function bfsPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(nodes.length).fill(-1);
    const q = [from];
    prev[from] = from;
    while (q.length) {
      const cur = q.shift();
      for (const nb of adj[cur]) {
        if (prev[nb] === -1) {
          prev[nb] = cur;
          if (nb === to) {
            const path = [to];
            let p = to;
            while (p !== from) { p = prev[p]; path.unshift(p); }
            return path;
          }
          q.push(nb);
        }
      }
    }
    return [to];
  }
  return {
    colliders, graph: { nodes, adj, nearestNode, bfsPath },
    garagePos: { x: GARAGE.x, z: GARAGE.z },
    hospitalPos: { x: HOSPITAL.x, z: HOSPITAL.z },
  };
}

// Push a circle (x, z, radius) out of building AABBs. Returns true if it collided.
export function resolveCollisions(colliders, pos, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.minX - radius;
        else if (m === pr) pos.x = b.maxX + radius;
        else if (m === pt) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(-195, Math.min(195, pos.x));
  pos.z = Math.max(-195, Math.min(195, pos.z));
  return hit;
}
