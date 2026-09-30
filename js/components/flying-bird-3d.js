import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * FlyingBird3D - Hezarfen süzülerek soldan sağa uçar
 * Ponytail: zero deps, native Three.js only
 *
 * @param {Object} options
 * @param {HTMLElement} [options.container]
 * @param {string}      [options.pathColor='#a855f7']
 * @param {number}      [options.speed=1.0]
 * @param {string}      [options.modelUrl='./scenes/hezarfen_opt.glb']
 * @returns {{ dispose(): void }}
 */
export function initFlyingBird3D(options = {}) {
  const {
    container = document.body,
    pathColor = '#a855f7',
    speed = 1.0,
    modelUrl = './scenes/hezarfen_opt.glb'
  } = options;

  // --- Canvas ---
  const canvas = document.createElement('canvas');
  canvas.id = 'flying-bird-canvas';
  Object.assign(canvas.style, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '52'
  });
  container.appendChild(canvas);

  // --- Scene / Camera / Renderer ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.4, 11.5);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
  sunLight.position.set(6, 10, 8);
  scene.add(sunLight);

  const pathLight = new THREE.PointLight(pathColor, 3.2, 10);
  scene.add(pathLight);

  // --- Open Arc Flight Path (sol → sağ, gentle S-eğrisi) ---
  // closed=false → teleport geri sola, no spinning loop
  const flightCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-11.0,  0.5, -4.0),
    new THREE.Vector3( -6.5,  2.8, -3.2),
    new THREE.Vector3( -1.5,  1.8, -4.8),
    new THREE.Vector3(  3.5,  0.2, -3.5),
    new THREE.Vector3(  8.0,  1.6, -4.2),
    new THREE.Vector3( 12.0,  0.8, -3.8),
  ], false, 'centripetal', 0.5);

  // Glowing neon path tube (sadece görünür segment - open)
  const tubeGeo  = new THREE.TubeGeometry(flightCurve, 160, 0.038, 8, false);
  const tubeMat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(pathColor), transparent: true, opacity: 0.50, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Mesh(tubeGeo, tubeMat));

  const haloGeo  = new THREE.TubeGeometry(flightCurve, 80, 0.11, 6, false);
  const haloMat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(pathColor), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Mesh(haloGeo, haloMat));

  // Sparkle particles along path
  const NUM_PTS = 40;
  const pPositions = new Float32Array(NUM_PTS * 3);
  for (let i = 0; i < NUM_PTS; i++) {
    const pt = flightCurve.getPointAt(i / (NUM_PTS - 1));
    pPositions[i * 3]     = pt.x + (Math.random() - 0.5) * 0.18;
    pPositions[i * 3 + 1] = pt.y + (Math.random() - 0.5) * 0.18;
    pPositions[i * 3 + 2] = pt.z + (Math.random() - 0.5) * 0.18;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = new THREE.PointsMaterial({ color: new THREE.Color(pathColor), size: 0.075, transparent: true, opacity: 0.70, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(pGeo, pMat));

  // --- Hezarfen Model ---
  const flightGroup = new THREE.Group();
  scene.add(flightGroup);

  const bones = { leftArm: null, rightArm: null, leftWingTip: null, rightWingTip: null };
  let hezarfenModel = null;

  // Pre-alloc - zero GC per frame
  const _tempQ  = new THREE.Quaternion();
  const _axisR  = new THREE.Vector3();
  const _axisL  = new THREE.Vector3();
  const _tangent = new THREE.Vector3();
  const _charFwd = new THREE.Vector3();

  const loader = new GLTFLoader();
  loader.load(modelUrl, (gltf) => {
    const model = gltf.scene;

    // Center pivot
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // Prone flight stance
    model.rotation.set(-Math.PI / 2, Math.PI, 0);

    model.traverse((child) => {
      if (!child.isBone) return;
      child.userData.baseQuat = child.quaternion.clone();
      if (child.name.includes('LeftArm')  && !child.name.includes('Fore')) bones.leftArm      = child;
      if (child.name.includes('RightArm') && !child.name.includes('Fore')) bones.rightArm     = child;
      if (child.name.includes('LeftHandMiddle4')  || (child.name.includes('LeftHand')  && !bones.leftWingTip))  bones.leftWingTip  = child;
      if (child.name.includes('RightHandMiddle4') || (child.name.includes('RightHand') && !bones.rightWingTip)) bones.rightWingTip = child;
    });

    hezarfenModel = model;
    flightGroup.add(model);
    flightGroup.scale.setScalar(0.72);
  }, undefined, (err) => {
    console.warn('Hezarfen model yüklenemedi:', err);
  });

  // --- Mouse Parallax ---
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  function onMouseMove(e) {
    mouse.tx = (e.clientX / innerWidth)  * 2 - 1;
    mouse.ty = -(e.clientY / innerHeight) * 2 + 1;
  }
  window.addEventListener('mousemove', onMouseMove);

  // --- Resize ---
  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  }
  window.addEventListener('resize', onResize);

  // --- Render Loop ---
  const clock = new THREE.Clock();
  let animId = null;

  // Flight orientation helpers
  const _UP    = new THREE.Vector3(0, 1, 0);
  const _RIGHT = new THREE.Vector3(1, 0, 0);

  function animate() {
    animId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const t     = clock.getElapsedTime() * speed;

    // Camera parallax sway
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    camera.position.x = mouse.x * 1.5;
    camera.position.y = 0.4 + mouse.y * 1.0;
    camera.lookAt(0, 0, -4.0);

    // Progress along open arc — pingpong so it never teleports jarringly
    // 0→1 sol-sağ, 1→0 sağ-sol (arka planda geri döner, görünmez tarafta)
    const rawT  = (t * 0.055) % 2.0;          // tam tur süresi ~18 saniye
    const loopT = rawT < 1.0 ? rawT : 2.0 - rawT; // pingpong [0..1..0]

    flightCurve.getPointAt(loopT, flightGroup.position);
    flightCurve.getTangentAt(loopT, _tangent);

    // Gidiş yönüne göre modeli çevir (sağa = normal, sola = ters)
    const goingRight = rawT < 1.0;
    const sign = goingRight ? 1.0 : -1.0;

    // Basit ve kararlı yönelim:
    // Y ekseni etrafında ilerleme yönüne bak (sadece yatay)
    // X ekseni etrafında eğim (hafif burun yukarı/aşağı)
    // Z ekseninde banka OLMADAN — sade süzülüş
    const yaw   = Math.atan2(_tangent.x * sign, _tangent.z * sign);
    const pitch = _tangent.y * 0.5;            // hafif eğim, max ±0.5 rad

    flightGroup.rotation.order = 'YXZ';
    flightGroup.rotation.set(pitch, yaw + Math.PI, 0.0);

    pathLight.position.copy(flightGroup.position);

    // --- Süzülme Kanat Animasyonu ---
    // Yavaş sinüs: 1.4 Hz, küçük genlik → hava üstünde süzülüş hissi
    if (hezarfenModel && bones.leftArm && bones.rightArm) {
      _charFwd.set(0, 0, 1).applyQuaternion(hezarfenModel.quaternion);

      const flapAngle = Math.sin(t * 1.4) * 0.35;  // Yavaş & küçük

      // Right wing
      bones.rightArm.quaternion.copy(bones.rightArm.userData.baseQuat);
      bones.rightArm.parent.getWorldQuaternion(_tempQ);
      _axisR.copy(_charFwd).applyQuaternion(_tempQ.invert());
      bones.rightArm.rotateOnAxis(_axisR, flapAngle);

      // Left wing (ters)
      bones.leftArm.quaternion.copy(bones.leftArm.userData.baseQuat);
      bones.leftArm.parent.getWorldQuaternion(_tempQ);
      _axisL.copy(_charFwd).applyQuaternion(_tempQ.invert());
      bones.leftArm.rotateOnAxis(_axisL, -flapAngle);

      // Wingtip follow-through (hafif lag hissi)
      if (bones.leftWingTip && bones.rightWingTip) {
        const tipAngle = Math.sin(t * 1.4 - 0.3) * 0.12;
        bones.rightWingTip.quaternion.copy(bones.rightWingTip.userData.baseQuat);
        bones.leftWingTip.quaternion.copy(bones.leftWingTip.userData.baseQuat);
        bones.rightWingTip.rotateOnAxis(_axisR, tipAngle);
        bones.leftWingTip.rotateOnAxis(_axisL, -tipAngle);
      }
    }

    // Path pulse
    tubeMat.opacity = 0.40 + Math.sin(t * 2.2) * 0.14;
    haloMat.opacity = 0.14 + Math.sin(t * 2.2) * 0.06;

    renderer.render(scene, camera);
  }

  animate();

  return {
    dispose() {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      canvas.parentNode?.removeChild(canvas);
      renderer.dispose();
      tubeGeo.dispose(); tubeMat.dispose();
      haloGeo.dispose(); haloMat.dispose();
      pGeo.dispose();    pMat.dispose();
    }
  };
}
