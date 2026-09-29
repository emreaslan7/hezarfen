import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOTAL_DISTANCE, UI } from './state.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.FogExp2(0xb8dcf5, 0.00008); // Very light distant atmospheric haze

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 30000);
camera.position.set(-14.07, 187.04, 182.47);
camera.lookAt(-9.13, 186.21, 173.48);
export const renderer = new THREE.WebGLRenderer({ canvas: UI.canvas3d, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// Environment Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.4);
hemiLight.position.set(0, 1000, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff8ee, 2.2);
dirLight.position.set(-800, 1500, -400);
dirLight.castShadow = true;
scene.add(dirLight);

// ==========================================
// NATURAL BOSPHORUS WATER SHEEN (Doğal Boğaz Suyu)
// ==========================================
// Load official seamless water normal map
const waterTexLoader = new THREE.TextureLoader();
export const waterNormal = waterTexLoader.load('./scenes/waternormals.jpg');
waterNormal.wrapS = THREE.RepeatWrapping;
waterNormal.wrapT = THREE.RepeatWrapping;
waterNormal.repeat.set(120, 120); // Fine, realistic wind-blown sea micro-ripples

const waterGeo = new THREE.PlaneGeometry(16000, 16000, 16, 16);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x16688e,           // Natural Mediterranean / Bosphorus azure-turquoise tint
  roughness: 0.15,           // Gentle liquid gloss
  metalness: 0.0,            // Real dielectric water (ZERO metalness, no black tarp look)
  normalMap: waterNormal,
  normalScale: new THREE.Vector2(0.12, 0.12), // Subtle natural surface chop, not giant lumps
  transparent: true,
  opacity: 0.35,             // Transparent sheen: lets the real photographic satellite seabed and coast show through!
  depthWrite: false
});

export const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, 1.2, -1500); // Rests gently at 1.2m over the sea floor
scene.add(water);

// Load and display the 3D Istanbul Map Model directly as it is
export let istanbulMap = null;
export const terrainMeshes = [];
const gltfLoader = new GLTFLoader();

gltfLoader.load('./scenes/istanbul_map.glb', (gltf) => {
  istanbulMap = gltf.scene;

  // Completely remove and dispose Adornments (North arrow, 4km scale bar, Esri/DEM text)
  const adornments = istanbulMap.getObjectByName('Adornments');
  if (adornments && adornments.parent) {
    adornments.parent.remove(adornments);
    adornments.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }

  // Load the 32MB full-quality uncompressed satellite texture with 16x Anisotropic Filtering
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load('./scenes/map/textures/gltf_embedded_0.jpeg', (hiresTex) => {
    hiresTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    hiresTex.generateMipmaps = true;
    hiresTex.minFilter = THREE.LinearMipmapLinearFilter;
    hiresTex.magFilter = THREE.LinearFilter;
    hiresTex.colorSpace = THREE.SRGBColorSpace;
    hiresTex.needsUpdate = true;

    istanbulMap.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.map = hiresTex;
        child.material.roughness = 0.9;
        child.material.metalness = 0.0;
        child.material.needsUpdate = true;
      }
    });
    console.log('32MB High-Res Texture applied with 16x Anisotropy!');
  });

  istanbulMap.traverse((child) => {
    if (child.name.includes('Adornment') || (child.material && child.material.name && child.material.name.includes('Adornment'))) {
      child.visible = false;
      return;
    }
    if (child.isMesh) {
      terrainMeshes.push(child);
      child.receiveShadow = true;
      if (child.material) {
        if (child.material.map) {
          child.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        child.material.transparent = false;
        child.material.opacity = 1.0;
        child.material.side = THREE.DoubleSide;
        child.material.depthWrite = true;
        child.material.needsUpdate = true;
      }
    }
  });

  // EXACT GEOGRAPHIC ALIGNMENT based on user-picked coordinates from 3D map:
  // Galata: (-1790.0, 116.4, 1023.8)
  // Doğancılar: (2587.7, 112.7, 2014.7)
  const RAW_GALATA_X = -1790.0;
  const RAW_GALATA_Y = 116.4;
  const RAW_GALATA_Z = 1023.8;

  const RAW_DOGAN_X = 2587.7;
  const RAW_DOGAN_Y = 112.7;
  const RAW_DOGAN_Z = 2014.7;

  const vx = RAW_DOGAN_X - RAW_GALATA_X; // 4377.7
  const vz = RAW_DOGAN_Z - RAW_GALATA_Z; // 990.9
  const mapDistance = Math.hypot(vx, vz); // 4488.45m

  const MAP_SCALE = 3300.0 / mapDistance; // ~0.73522
  const MAP_ROTY = Math.atan2(vx, -vz);    // 1.7934 rad (102.75 deg)

  const mapPivot = new THREE.Group();
  scene.add(mapPivot);

  // Offset map so Galata is the rotation pivot center
  istanbulMap.position.set(-RAW_GALATA_X, 0, -RAW_GALATA_Z);
  mapPivot.add(istanbulMap);

  // Rotate so vector from Galata to Doğancılar points down the -Z flight corridor
  mapPivot.rotation.y = MAP_ROTY;
  mapPivot.scale.set(MAP_SCALE, MAP_SCALE, MAP_SCALE);

  // Position pivot so Galata is at (0, 0, 200) in world coordinates
  mapPivot.position.set(0, 0, 200);

  console.log(`3D Istanbul Map aligned! RotY: ${(MAP_ROTY * 180 / Math.PI).toFixed(2)} deg, Scale: ${MAP_SCALE.toFixed(5)}`);
}, (progress) => {
  if (progress.total > 0) {
    console.log(`Loading map: ${Math.round((progress.loaded / progress.total) * 100)}%`);
  }
}, (err) => {
  console.error('Failed to load Istanbul Map GLB:', err);
});

// Takeoff Point Landmark (Galata Tower) - seated on Galata Hill
// Galata terrain elevation = 116.4 * 0.73522 = 85.6m
export const towerGroup = new THREE.Group();
const towerBase = new THREE.Mesh(
  new THREE.CylinderGeometry(14, 16, 67, 24),
  new THREE.MeshStandardMaterial({ color: 0xd9cbb6, roughness: 0.8 })
);
towerBase.position.y = 33.5;
towerGroup.add(towerBase);

const towerCap = new THREE.Mesh(
  new THREE.ConeGeometry(15, 25, 24),
  new THREE.MeshStandardMaterial({ color: 0x5a3d31, roughness: 0.6 })
);
towerCap.position.y = 67 + 12.5;
towerGroup.add(towerCap);
towerGroup.position.set(0, 85.6, 200);
scene.add(towerGroup);

// Destination Landing Zone (Doğancılar Meydanı)
// Doğancılar terrain elevation = 112.7 * 0.73522 = 82.9m
export const landingMarker = new THREE.Mesh(
  new THREE.CylinderGeometry(35, 35, 2.5, 32),
  new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.85 })
);
landingMarker.position.set(0, 83.5, -3100);
scene.add(landingMarker);

// Asset Readiness Tracking for Loading Screen
let markGalataReady, markHezarfenReady;
export const assetsReadyPromise = new Promise((resolve) => {
  let g = false, h = false;
  const check = () => { if (g && h) resolve(); };
  markGalataReady = () => { g = true; check(); };
  markHezarfenReady = () => { h = true; check(); };
});

export const placedLandmarks = {};

const landmarksToLoad = [
  {
    name: 'galata_tower',
    file: 'galata_tower_opt.glb',
    pos: [-3, 85, 193],
    rotY_deg: 2,
    scale: 32.8,
    onLoaded: (group) => {
      towerGroup.visible = false; // Hide placeholder cylinder once high-res 3D model loads
      markGalataReady();
    }
  },
  {
    name: 'vodafone_arena',
    file: 'vodafone-arena.glb',
    pos: [-1813, 29, -1133],
    rotY_deg: 280,
    scale: 1.01
  },
  {
    name: 'maidens_tower',
    file: 'maidens_tower.glb',
    pos: [-70, -28, -2322],
    rotY_deg: 203,
    scale: 10.5
  },
  {
    name: 'vapur',
    file: 'vapur.glb',
    pos: [110, -1, -1595],
    rotY_deg: 27,
    scale: 1.5
  },
  {
    name: 'vapur_2',
    file: 'vapur_2.glb',
    pos: [-473, -1, -1632],
    rotY_deg: 88,
    scale: 40.3
  },
  {
    name: 'vapur_2_3',
    file: 'vapur_2.glb',
    pos: [312, -1, -1114],
    rotY_deg: 88,
    scale: 40.3
  }
];

landmarksToLoad.forEach((item) => {
  gltfLoader.load(`./scenes/${item.file}`, (gltf) => {
    const raw = gltf.scene;

    // Normalize model pivot to bottom-center (same as in editor.html)
    const box = new THREE.Box3().setFromObject(raw);
    const center = box.getCenter(new THREE.Vector3());
    raw.position.x -= center.x;
    raw.position.z -= center.z;
    raw.position.y -= box.min.y;

    // Special brightening & cleanup for Maiden's Tower (Kız Kulesi)
    if (item.name === 'maidens_tower') {
      raw.traverse((child) => {
        if (child.isMesh) {
          // Hide baked dark sea disk mesh
          if (child.name.toLowerCase().includes('sea')) {
            child.visible = false;
            return;
          }
          if (child.material) {
            // Reduce harsh dark ambient occlusion baking
            if (child.material.aoMap) {
              child.material.aoMapIntensity = 0.2;
            }
            // Brighten textures and colors to make the white walls glow under sunlight
            child.material.roughness = 0.45;
            child.material.metalness = 0.02;
            if (child.material.color) {
              child.material.color.multiplyScalar(1.65);
            }
            child.material.needsUpdate = true;
          }
        }
      });

      // Dedicated sunlit fill light for Maiden's Tower
      const kizLight = new THREE.DirectionalLight(0xfff8ee, 2.0);
      kizLight.position.set(item.pos[0] - 120, item.pos[1] + 250, item.pos[2] + 150);
      kizLight.target.position.set(item.pos[0], item.pos[1], item.pos[2]);
      scene.add(kizLight);
      scene.add(kizLight.target);
    }

    const wrapper = new THREE.Group();
    wrapper.name = `landmark_${item.name}`;
    wrapper.add(raw);

    wrapper.scale.set(item.scale, item.scale, item.scale);
    wrapper.rotation.y = (item.rotY_deg * Math.PI) / 180;
    wrapper.position.set(item.pos[0], item.pos[1], item.pos[2]);

    scene.add(wrapper);
    placedLandmarks[item.name] = wrapper;

    if (item.onLoaded) item.onLoaded(wrapper);
    console.log(`Landmark ${item.name} placed successfully at ${item.pos}!`);
  }, undefined, (err) => {
    console.error(`Failed to load landmark ${item.file}:`, err);
    if (item.name === 'galata_tower') markGalataReady();
  });
});

// HEZARFEN GLIDER MODEL
export const hezarfen = new THREE.Group();
hezarfen.rotation.order = 'YXZ';
hezarfen.position.set(-3.68, 184.61, 175.55);
hezarfen.scale.set(1.7, 1.7, 1.7);
scene.add(hezarfen);

export const bones = {
  leftArm: null,
  rightArm: null,
  leftShoulder: null,
  rightShoulder: null,
  leftForeArm: null,
  rightForeArm: null,
  leftWingTip: null,
  rightWingTip: null,
  spine: null,
  head: null
};

export let hezarfenModel = null;

// 3D Upper-Body Rig Visualizer (Matched tracking landmarks on Hezarfen)
export const rigMarkersGroup = new THREE.Group();
rigMarkersGroup.renderOrder = 9999;
scene.add(rigMarkersGroup);

const markerSphereGeo = new THREE.SphereGeometry(0.11, 16, 16);
const markerCoreGeo = new THREE.SphereGeometry(0.05, 12, 12);
export const markerMat = new THREE.MeshBasicMaterial({ 
  color: 0xf39c12, 
  transparent: true, 
  opacity: 0.95, 
  depthTest: false 
});
const markerCoreMat = new THREE.MeshBasicMaterial({ 
  color: 0xffffff, 
  depthTest: false 
});

function createMarker() {
  const g = new THREE.Group();
  g.renderOrder = 9999;
  const s = new THREE.Mesh(markerSphereGeo, markerMat);
  s.renderOrder = 9999;
  const c = new THREE.Mesh(markerCoreGeo, markerCoreMat);
  c.renderOrder = 9999;
  g.add(s);
  g.add(c);
  rigMarkersGroup.add(g);
  return g;
}

export const rigMarkers = {
  leftShoulder: createMarker(),
  rightShoulder: createMarker(),
  leftElbow: createMarker(),
  rightElbow: createMarker(),
  leftWingTip: createMarker(),
  rightWingTip: createMarker(),
  spine: createMarker(),
  head: createMarker()
};

// 7 connecting neon lines between upper-body joints
const linePosArray = new Float32Array(7 * 2 * 3);
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(linePosArray, 3));
export const rigLineMat = new THREE.LineBasicMaterial({ 
  color: 0xf39c12, 
  transparent: true, 
  opacity: 0.85, 
  linewidth: 3, 
  depthTest: false 
});
export const rigLines = new THREE.LineSegments(lineGeo, rigLineMat);
rigLines.renderOrder = 9998;
rigMarkersGroup.add(rigLines);

export function updateRigMarkers(isPaired) {
  if (!bones.leftArm || !hezarfen) return;
  hezarfen.updateMatrixWorld(true);

  const col = isPaired ? 0x2ecc71 : 0xf39c12;
  markerMat.color.setHex(col);
  rigLineMat.color.setHex(col);

  const getPos = (bone, targetGroup) => {
    if (bone) {
      bone.getWorldPosition(targetGroup.position);
    }
    return targetGroup.position;
  };

  const pLSh = getPos(bones.leftArm, rigMarkers.leftShoulder);
  const pRSh = getPos(bones.rightArm, rigMarkers.rightShoulder);
  const pLEl = getPos(bones.leftForeArm, rigMarkers.leftElbow);
  const pREl = getPos(bones.rightForeArm, rigMarkers.rightElbow);
  const pLWg = getPos(bones.leftWingTip, rigMarkers.leftWingTip);
  const pRWg = getPos(bones.rightWingTip, rigMarkers.rightWingTip);
  const pSpn = getPos(bones.spine, rigMarkers.spine);
  const pHd  = getPos(bones.head, rigMarkers.head);

  // Position Head right on the face/turban
  if (pHd) pHd.y += 0.22;
  // Position Spine right in mid-chest/torso
  if (pSpn) pSpn.y -= 0.15;

  const arr = rigLines.geometry.attributes.position.array;
  const setSeg = (idx, a, b) => {
    arr[idx * 6 + 0] = a.x; arr[idx * 6 + 1] = a.y; arr[idx * 6 + 2] = a.z;
    arr[idx * 6 + 3] = b.x; arr[idx * 6 + 4] = b.y; arr[idx * 6 + 5] = b.z;
  };
  setSeg(0, pLSh, pRSh);
  setSeg(1, pLSh, pLEl);
  setSeg(2, pLEl, pLWg);
  setSeg(3, pRSh, pREl);
  setSeg(4, pREl, pRWg);
  setSeg(5, pSpn, pLSh);
  setSeg(6, pSpn, pHd);
  rigLines.geometry.attributes.position.needsUpdate = true;
}

gltfLoader.load('./scenes/hezarfen.glb', (gltf) => {
  const model = gltf.scene;

  // Normalize model pivot to bottom-center (exact match with editor.html)
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  hezarfenModel = model;
  
  // Initial stance: upright standing, facing forward out the window
  model.rotation.set(0, Math.PI, 0);

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
    if (child.isBone) {
      child.userData.baseRot = child.rotation.clone();
      child.userData.baseQuat = child.quaternion.clone();

      if (child.name.includes('LeftArm') && !child.name.includes('Fore')) bones.leftArm = child;
      if (child.name.includes('RightArm') && !child.name.includes('Fore')) bones.rightArm = child;
      if (child.name.includes('LeftShoulder')) bones.leftShoulder = child;
      if (child.name.includes('RightShoulder')) bones.rightShoulder = child;
      if (child.name.includes('LeftForeArm')) bones.leftForeArm = child;
      if (child.name.includes('RightForeArm')) bones.rightForeArm = child;
      if (child.name.includes('LeftHandMiddle4') || (child.name.includes('LeftHand') && !bones.leftWingTip)) bones.leftWingTip = child;
      if (child.name.includes('RightHandMiddle4') || (child.name.includes('RightHand') && !bones.rightWingTip)) bones.rightWingTip = child;
      if (child.name.includes('Spine')) bones.spine = child;
      if (child.name.includes('Head') && !child.name.includes('Top')) bones.head = child;
    }
  });
  hezarfen.add(model);
  console.log('Hezarfen GLB loaded with bones!');
  markHezarfenReady();
}, undefined, (err) => {
  console.error('Failed to load Hezarfen GLB:', err);
  markHezarfenReady();
});
