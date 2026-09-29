import * as THREE from 'three';
import { TOTAL_DISTANCE, STATE, UI, updateHUD } from './state.js';
import { scene, camera, renderer, hezarfen, bones, hezarfenModel, rigMarkersGroup, updateRigMarkers, waterNormal, terrainMeshes, landingMarker } from './scene.js';
import { controls, triggerWingFlap } from './controls.js';
import { poseState } from './pose.js';
import { updateWindAudio, stopWindAudio } from './audio.js';

const clock = new THREE.Clock();
let currentLookX = 0;
let currentLookY = 0;
let currentPitch = 0;
let flightHeading = 0;
let currentBank = 0;
let flightPoseTransition = 0;
const currentCamLook = new THREE.Vector3(-9.13, 186.21, 173.48);

const groundRaycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const downVector = new THREE.Vector3(0, -1, 0);

// Pre-allocated vectors for 60fps zero-allocation chase camera
const _upAxis = new THREE.Vector3(0, 1, 0);
const _camOffset = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _lookOffset = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _startCamPos = new THREE.Vector3(-14.07, 187.04, 182.47);
const _startLookAt = new THREE.Vector3(-9.13, 186.21, 173.48);
const _charForwardWorld = new THREE.Vector3();
const _tempQ = new THREE.Quaternion();
const _localAxisR = new THREE.Vector3();
const _localAxisL = new THREE.Vector3();
const _localAxisSpine = new THREE.Vector3();

// 3D High-Speed Aerodynamic Wind Stream Lines
const NUM_WIND_LINES = 52;
const windPosArray = new Float32Array(NUM_WIND_LINES * 2 * 3);
const windGeo = new THREE.BufferGeometry();
windGeo.setAttribute('position', new THREE.BufferAttribute(windPosArray, 3));

const windLineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const windLinesMesh = new THREE.LineSegments(windGeo, windLineMat);
windLinesMesh.frustumCulled = false;
windLinesMesh.visible = false;
scene.add(windLinesMesh);

const windStreams = [];
for (let i = 0; i < NUM_WIND_LINES; i++) {
  windStreams.push({
    rx: (Math.random() - 0.5) * 8.5,
    ry: (Math.random() - 0.45) * 3.5,
    rz: Math.random() * 26 - 13,
    len: 3.5 + Math.random() * 4.5,
    speed: 38 + Math.random() * 25
  });
}

// Interactive 3D Character Inspection in Menu (Horizontal Y-axis spin only)
let isDraggingChar = false;
let pointerStartX = 0;
let charYaw = Math.PI;        // Math.PI = faces forward towards Bosphorus
let targetCharYaw = Math.PI;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!STATE.started) {
    flightHeading = 0;
    currentBank = 0;
    // 3D Upper-Body Tracking Landmarks on Hezarfen
    rigMarkersGroup.visible = false;
    updateRigMarkers(poseState.isPaired);

    // Camera view: Cinematic pre-flight framing chosen in editor
    const showcaseCamPos = new THREE.Vector3(
      -14.07 + (controls.mouse.x * 0.6),
      187.04 + (controls.mouse.y * 0.3),
      182.47
    );
    const showcaseLookAt = new THREE.Vector3(
      -9.13 + (controls.mouse.x * 1.2),
      186.21 + (controls.mouse.y * 0.6),
      173.48
    );
    camera.position.lerp(showcaseCamPos, 0.1);
    currentCamLook.lerp(showcaseLookAt, 0.1);
    camera.lookAt(currentCamLook);

    if (hezarfenModel) {
      if (isDraggingChar) {
        charYaw += (targetCharYaw - charYaw) * 0.12;
      } else {
        targetCharYaw = Math.PI;
        charYaw += (targetCharYaw - charYaw) * 0.12;
      }
      hezarfenModel.rotation.set(0, charYaw, 0);

      // LIVE AVATAR PAIRING: Hezarfen's upper body mirrors the player in real-time
      if (poseState.isPaired) {
        // Character root (legs and feet) stays 100% upright on the ground!
        hezarfen.rotation.set(0, 0, 0);

        // Character's chest forward vector in world space:
        // Always rotates along with hezarfenModel when dragged with the mouse!
        const charForwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(hezarfenModel.quaternion);
        const _tempQ = new THREE.Quaternion();

        // 1. Tilt upper torso from the waist (spine bone) 1:1 with player's lean
        if (bones.spine && bones.spine.parent) {
          bones.spine.quaternion.copy(bones.spine.userData.baseQuat);
          if (Math.abs(poseState.roll) > 0.01) {
            const spineParentQ = bones.spine.parent.getWorldQuaternion(_tempQ);
            const localAxisSpine = charForwardWorld.clone().applyQuaternion(spineParentQ.invert());
            // 1:1 proportional lean: player leans right -> Hezarfen tilts right; player leans left -> tilts left
            const spineTilt = THREE.MathUtils.clamp(poseState.roll * 1.0, -0.60, 0.60);
            bones.spine.rotateOnAxis(localAxisSpine, spineTilt);
          }
        }

        // 2. Wings raise and lower with full expanded range of motion
        // Direct matching: Player's Right Arm -> Hezarfen's Right Arm, Left Arm -> Left Arm
        if (bones.leftArm && bones.rightArm && bones.leftArm.parent && bones.rightArm.parent) {
          // RIGHT WING (Hezarfen's Right Arm): Controlled by Player's Right Arm
          const rightWing = THREE.MathUtils.clamp(poseState.armLiftRight * 1.5, -1.50, 1.25);
          bones.rightArm.quaternion.copy(bones.rightArm.userData.baseQuat);
          const rightParentQ = bones.rightArm.parent.getWorldQuaternion(_tempQ);
          const localAxisR = charForwardWorld.clone().applyQuaternion(rightParentQ.invert());
          bones.rightArm.rotateOnAxis(localAxisR, rightWing);

          // LEFT WING (Hezarfen's Left Arm): Controlled by Player's Left Arm
          const leftWing = THREE.MathUtils.clamp(poseState.armLiftLeft * 1.5, -1.50, 1.25);
          bones.leftArm.quaternion.copy(bones.leftArm.userData.baseQuat);
          const leftParentQ = bones.leftArm.parent.getWorldQuaternion(_tempQ);
          const localAxisL = charForwardWorld.clone().applyQuaternion(leftParentQ.invert());
          bones.leftArm.rotateOnAxis(localAxisL, -leftWing);

          // Lock forearms and wingtips straight with wings
          if (bones.leftForeArm && bones.rightForeArm) {
            bones.leftForeArm.quaternion.copy(bones.leftForeArm.userData.baseQuat);
            bones.rightForeArm.quaternion.copy(bones.rightForeArm.userData.baseQuat);
          }
          if (bones.leftWingTip && bones.rightWingTip) {
            bones.leftWingTip.quaternion.copy(bones.leftWingTip.userData.baseQuat);
            bones.rightWingTip.quaternion.copy(bones.rightWingTip.userData.baseQuat);
          }
        }
      } else {
        hezarfen.rotation.set(0, 0, 0);
        if (bones.spine) bones.spine.quaternion.copy(bones.spine.userData.baseQuat);
        if (bones.leftArm) bones.leftArm.quaternion.copy(bones.leftArm.userData.baseQuat);
        if (bones.rightArm) bones.rightArm.quaternion.copy(bones.rightArm.userData.baseQuat);
      }
    }
  } else if (!STATE.isLanded && !STATE.isCrashed) {
    rigMarkersGroup.visible = false;
    const keys = controls.keys;

    // 1. DYNAMIC TAKEOFF ARC (2.6s Dive & Extended Balcony Clear Curve)
    if (flightPoseTransition < 1) {
      flightPoseTransition = Math.min(1, flightPoseTransition + dt / 2.6);
    }
    const p = flightPoseTransition;
    const speedFactor = p * p * (3 - 2 * p); // smoothstep 0 -> 1

    if (hezarfenModel) {
      // Body tilts into forward dive, then smoothly locks into prone flight pose
      const divePitch = -Math.PI / 2 * Math.sin(p * Math.PI / 2);
      hezarfenModel.rotation.set(divePitch, Math.PI, 0);
    }

    // AVIAN SOARING DYNAMICS: True bird gliding via differential wing lift and banking
    let targetBank = 0;

    if (poseState.active) {
      const wingDelta = (poseState.armLiftRight - poseState.armLiftLeft);
      const torsoLean = poseState.roll;
      const combinedSteer = (wingDelta * 0.75) + (torsoLean * 0.35);

      if (Math.abs(combinedSteer) < 0.08) {
        targetBank = 0;
      } else {
        targetBank = THREE.MathUtils.clamp(combinedSteer * 0.95, -0.65, 0.65);
      }
    } else {
      if (keys['KeyA'] || keys['ArrowLeft']) targetBank = 0.55;
      else if (keys['KeyD'] || keys['ArrowRight']) targetBank = -0.55;
      else targetBank = 0;
    }
    targetBank *= speedFactor; // Gradual steering unlock after clearing window ledge

    // Smooth aerodynamic banking (roll)
    currentBank += (targetBank - currentBank) * Math.min(1, 4.5 * dt);

    // Aerodynamic Heading Turn
    const turnRate = currentBank * 0.85; // rad/s
    flightHeading += turnRate * dt;

    // Forward velocity smoothly accelerates from 0 to full cruise speed
    let forwardSpeed = 0;

    if (poseState.active) {
      STATE.speed = 145 * speedFactor;
      forwardSpeed = (STATE.speed * 1000) / 3600;
      const vx = -Math.sin(flightHeading) * forwardSpeed;
      const vz = -Math.cos(flightHeading) * forwardSpeed;
      hezarfen.position.x += vx * dt;
      hezarfen.position.z += vz * dt;
      STATE.distanceLeft = Math.max(0, Math.round(hezarfen.position.z - landingMarker.position.z));

      let verticalVelocity = -0.45; // Gentle glider sink rate
      if (poseState.flapImpulse > 0) {
        verticalVelocity += poseState.flapImpulse;
        poseState.flapImpulse = Math.max(0, poseState.flapImpulse - dt * 3.5);
      }
      if (poseState.isDiving) {
        verticalVelocity -= 2.5;
      }
      STATE.altitude += verticalVelocity * dt * speedFactor;

      // Parabolic dive dip during takeoff (~4.5m scoop), then level cruising
      const diveDip = -Math.sin(p * Math.PI) * 4.5;
      hezarfen.position.y = Math.max(0, STATE.altitude + diveDip);
    } else {
      let targetPitch = 0;
      if (keys['KeyW'] || keys['ArrowUp']) {
        targetPitch = -1; // Dive
      } else if (keys['KeyS'] || keys['ArrowDown']) {
        targetPitch = 1;  // Climb
      }
      targetPitch *= speedFactor;
      currentPitch += (targetPitch - currentPitch) * 4.5 * dt;

      // Falcon dive acceleration (150 -> 195 km/h) & Air-brake deceleration on [S] (150 -> 105 km/h)
      const diveBoost = Math.max(0, -currentPitch) * 45;
      const brakeDrag = Math.max(0, currentPitch) * 45;
      STATE.speed = Math.round((150 + diveBoost - brakeDrag) * speedFactor);
      forwardSpeed = (STATE.speed * 1000) / 3600;
      const vx = -Math.sin(flightHeading) * forwardSpeed;
      const vz = -Math.cos(flightHeading) * forwardSpeed;
      hezarfen.position.x += vx * dt;
      hezarfen.position.z += vz * dt;
      STATE.distanceLeft = Math.max(0, Math.round(hezarfen.position.z - landingMarker.position.z));

      // Controlled descent rate: dives descend faster, air-brake flare cushions sink rate
      let verticalVelocity = -0.45 + (currentPitch * 2.0);
      if (STATE.flapImpulse > 0) {
        verticalVelocity += STATE.flapImpulse;
        STATE.flapImpulse = Math.max(0, STATE.flapImpulse - dt * 3.5);
      }
      STATE.altitude += verticalVelocity * dt * speedFactor;

      // Parabolic dive dip: dips down ~4.5m then scoops back up as speed reaches 150 km/h
      const diveDip = -Math.sin(p * Math.PI) * 4.5;
      hezarfen.position.y = Math.max(0, STATE.altitude + diveDip);
    }

    if (bones.leftArm && bones.rightArm) {
      const charForwardWorld = _charForwardWorld.set(0, 0, 1).applyQuaternion(hezarfenModel.quaternion);

      if (poseState.active) {
        // LIVE 1:1 WING TRACKING IN FLIGHT (Right arm -> Right wing, Left arm -> Left wing)
        const rightWing = THREE.MathUtils.clamp(poseState.armLiftRight * 1.5, -1.50, 1.25);
        bones.rightArm.quaternion.copy(bones.rightArm.userData.baseQuat);
        const rightParentQ = bones.rightArm.parent.getWorldQuaternion(_tempQ);
        const localAxisR = _localAxisR.copy(charForwardWorld).applyQuaternion(rightParentQ.invert());
        bones.rightArm.rotateOnAxis(localAxisR, rightWing);

        const leftWing = THREE.MathUtils.clamp(poseState.armLiftLeft * 1.5, -1.50, 1.25);
        bones.leftArm.quaternion.copy(bones.leftArm.userData.baseQuat);
        const leftParentQ = bones.leftArm.parent.getWorldQuaternion(_tempQ);
        const localAxisL = _localAxisL.copy(charForwardWorld).applyQuaternion(leftParentQ.invert());
        bones.leftArm.rotateOnAxis(localAxisL, -leftWing);

        if (bones.leftWingTip && bones.rightWingTip) {
          bones.leftWingTip.quaternion.copy(bones.leftWingTip.userData.baseQuat);
          bones.rightWingTip.quaternion.copy(bones.rightWingTip.userData.baseQuat);
        }

        if (bones.leftForeArm && bones.rightForeArm) {
          bones.leftForeArm.quaternion.copy(bones.leftForeArm.userData.baseQuat);
          bones.rightForeArm.quaternion.copy(bones.rightForeArm.userData.baseQuat);
        }
      } else {
        // KEYBOARD MODE: Smooth Wing Flap [SPACE] + Falcon Dive Tuck [W] + Air-Brake Flare [S]
        const diveFactor = THREE.MathUtils.clamp(-currentPitch, 0, 1); // 0 -> 1 (full dive)
        const brakeFactor = THREE.MathUtils.clamp(currentPitch, 0, 1); // 0 -> 1 (air-brake)

        const diveTuckAngle = -1.25 * diveFactor; // Wings fold tightly down on dive
        const brakeBuffet = brakeFactor > 0.05 ? Math.sin(clock.getElapsedTime() * 28) * 0.035 * brakeFactor : 0;
        const brakeWingAngle = (0.28 * brakeFactor) + brakeBuffet;

        let flapAngle = 0;
        if (STATE.flapTime > 0) {
          STATE.flapTime = Math.max(0, STATE.flapTime - dt);
          const p = 1 - (STATE.flapTime / 0.52); // 0.0 -> 1.0
          // Continuous, buttery-smooth sinusoidal flap stroke (up, down, glide settle)
          flapAngle = Math.sin(p * Math.PI * 2) * 0.90;
        } else if (controls.keys['Space']) {
          triggerWingFlap(6.2);
        }

        const totalWingAngle = flapAngle + diveTuckAngle + brakeWingAngle;

        // Right Wing (Upper Arm)
        bones.rightArm.quaternion.copy(bones.rightArm.userData.baseQuat);
        const rightParentQ = bones.rightArm.parent.getWorldQuaternion(_tempQ);
        const localAxisR = _localAxisR.copy(charForwardWorld).applyQuaternion(rightParentQ.invert());
        bones.rightArm.rotateOnAxis(localAxisR, totalWingAngle);

        // Left Wing (Upper Arm)
        bones.leftArm.quaternion.copy(bones.leftArm.userData.baseQuat);
        const leftParentQ = bones.leftArm.parent.getWorldQuaternion(_tempQ);
        const localAxisL = _localAxisL.copy(charForwardWorld).applyQuaternion(leftParentQ.invert());
        bones.leftArm.rotateOnAxis(localAxisL, -totalWingAngle);

        // Forearms stay clean and rigid with upper arm bones
        if (bones.leftForeArm && bones.rightForeArm) {
          bones.leftForeArm.quaternion.copy(bones.leftForeArm.userData.baseQuat);
          bones.rightForeArm.quaternion.copy(bones.rightForeArm.userData.baseQuat);
        }

        // Wingtips flex naturally with the wings
        if (bones.leftWingTip && bones.rightWingTip) {
          bones.rightWingTip.quaternion.copy(bones.rightWingTip.userData.baseQuat);
          bones.leftWingTip.quaternion.copy(bones.leftWingTip.userData.baseQuat);
          if (totalWingAngle !== 0) {
            bones.rightWingTip.rotateOnAxis(localAxisR, totalWingAngle * 0.30);
            bones.leftWingTip.rotateOnAxis(localAxisL, -totalWingAngle * 0.30);
          }
        }
      }

      // Torso & Upper-body biomechanical reactions
      if (bones.spine) {
        bones.spine.quaternion.copy(bones.spine.userData.baseQuat);
        if (poseState.active && Math.abs(poseState.roll) > 0.01) {
          const spineParentQ = bones.spine.parent.getWorldQuaternion(_tempQ);
          const localAxisSpine = _localAxisSpine.copy(charForwardWorld).applyQuaternion(spineParentQ.invert());
          const spineTilt = THREE.MathUtils.clamp(poseState.roll * 0.65, -0.40, 0.40);
          bones.spine.rotateOnAxis(localAxisSpine, spineTilt);
        } else if (!poseState.active && Math.abs(currentBank) > 0.01) {
          const spineParentQ = bones.spine.parent.getWorldQuaternion(_tempQ);
          const localAxisSpine = _localAxisSpine.copy(charForwardWorld).applyQuaternion(spineParentQ.invert());
          const spineTilt = THREE.MathUtils.clamp(-currentBank * 0.25, -0.20, 0.20);
          bones.spine.rotateOnAxis(localAxisSpine, spineTilt);
        }
      }
    }

    // Visual Glider Aerodynamics: Nose points along flight heading, wings bank into turn (Aviation YXZ order)
    const diveNoseTilt = -0.06 - Math.sin(p * Math.PI) * 0.16 + (currentPitch * 0.26);
    hezarfen.rotation.set(diveNoseTilt, flightHeading, currentBank, 'YXZ');

    // DYNAMIC CHASE CAMERA WITH DELAYED TAKEOFF SWOOP (ZERO Jitter Lag, 100% Solid):
    // Air-brake [S] inertia pulls chase camera slightly closer (8.8m -> 7.6m)
    const brakeFactor = THREE.MathUtils.clamp(currentPitch, 0, 1);
    const camDist = 8.8 - (brakeFactor * 1.2);
    _camOffset.set(0, 3.2, camDist).applyAxisAngle(_upAxis, flightHeading);
    _targetCamPos.copy(hezarfen.position).add(_camOffset);

    _lookOffset.set(0, 0.6, -45).applyAxisAngle(_upAxis, flightHeading);
    _targetLookAt.copy(hezarfen.position).add(_lookOffset);

    if (p < 1) {
      // First 0.8s: Camera holds near balcony, watching Hezarfen leap out over the sea
      // 0.8s - 2.6s: Hezarfen is already 25m+ out in the open sky; camera glides outward over the water into chase lock
      const camT = Math.max(0, (p - 0.30) / 0.70);
      const camEase = camT * camT * (3 - 2 * camT);
      const outwardArcZ = -Math.sin(camT * Math.PI) * 7.5; // Arcs forward/outward into the open sky over the sea

      camera.position.lerpVectors(_startCamPos, _targetCamPos, camEase);
      camera.position.z += outwardArcZ;

      currentCamLook.lerpVectors(_startLookAt, _targetLookAt, camEase);
      camera.lookAt(currentCamLook);
    } else {
      // Full Flight: Camera is rigidly locked 8.8m behind Hezarfen in flight direction
      // Absolutely ZERO forward-backward oscillation, ZERO rubberbanding, 100% rock-solid 60 FPS
      camera.position.copy(_targetCamPos);
      currentCamLook.copy(_targetLookAt);
      camera.lookAt(currentCamLook);
    }

    // DYNAMIC FLIGHT VISUALS & AUDIO: Speed FOV, 3D Wind Lines & Procedural Audio
    const diveFactor = poseState.active ? (poseState.isDiving ? 1 : 0) : THREE.MathUtils.clamp(-currentPitch, 0, 1);

    // 1. Dynamic Speed FOV:
    // Expands smoothly 60° -> 68° during dive [W] (speed tunnel)
    // Narrows smoothly 60° -> 54° during air-brake [S] (deceleration focus / air resistance)
    const targetFov = 60.0 + (diveFactor * 8.0) - (brakeFactor * 6.0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, 5.0 * dt);
      camera.updateProjectionMatrix();
    }

    // High-speed aerodynamic turbulence or air-brake resistance buffeting
    const totalTurbulence = Math.max(diveFactor, brakeFactor * 0.75);
    if (totalTurbulence > 0.15 && p >= 1) {
      const shake = totalTurbulence * 0.035;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }

    // 2. 3D Aerodynamic Wind Stream Lines (Only active during high-speed dive [W])
    const targetWindOpacity = diveFactor * 0.85;
    windLineMat.opacity += (targetWindOpacity - windLineMat.opacity) * Math.min(1, 9.0 * dt);

    if (windLineMat.opacity > 0.01) {
      windLinesMesh.visible = true;
      windLinesMesh.position.copy(hezarfen.position);
      windLinesMesh.quaternion.copy(hezarfen.quaternion);

      const posArr = windGeo.attributes.position.array;

      for (let i = 0; i < NUM_WIND_LINES; i++) {
        const s = windStreams[i];
        s.rz += (s.speed + (diveFactor * 50)) * dt;
        if (s.rz > 10) {
          s.rz = -18 - Math.random() * 6;
          s.rx = (Math.random() - 0.5) * 9.5;
          s.ry = (Math.random() - 0.45) * 4.0;
        }

        const idx = i * 6;
        posArr[idx + 0] = s.rx;
        posArr[idx + 1] = s.ry;
        posArr[idx + 2] = s.rz;

        posArr[idx + 3] = s.rx;
        posArr[idx + 4] = s.ry;
        posArr[idx + 5] = s.rz - s.len;
      }
      windGeo.attributes.position.needsUpdate = true;
    } else {
      windLinesMesh.visible = false;
    }

    // 3. Web Audio Wind Rush & Air-Brake Synthesizer Update
    updateWindAudio(diveFactor, STATE.speed / 150, brakeFactor);

    // 1. HARİTA DIŞINA ÇIKILMASINI ENGELLE (Genişletilmiş İstanbul Uçuş Alanı)
    // Tarihi Yarımada, Haliç, Boğaz, Kadıköy ve Üsküdar'ı kapsayan 10 km'lik geniş hava sahası
    const MIN_X = -6000;
    const MAX_X = 4200;
    const MIN_Z = -6000;
    const MAX_Z = 3500;

    if (hezarfen.position.x < MIN_X || hezarfen.position.x > MAX_X || hezarfen.position.z > MAX_Z || hezarfen.position.z < MIN_Z) {
      hezarfen.position.x = THREE.MathUtils.clamp(hezarfen.position.x, MIN_X, MAX_X);
      hezarfen.position.z = THREE.MathUtils.clamp(hezarfen.position.z, MIN_Z, MAX_Z);
      if (UI.toast && (!UI.toast.style.display || UI.toast.style.display === 'none')) {
        UI.toast.innerText = "⚠️ SERT POYRAZ RÜZGARI! Harita sınırına ulaştın, rotana dön!";
        UI.toast.style.display = 'block';
        setTimeout(() => {
          if (STATE.started && !STATE.isCrashed && !STATE.isLanded) {
            UI.toast.style.display = 'none';
          }
        }, 2200);
      }
    }

    // 2. SU TEMASI (Water Collision)
    // Su seviyesi 1.2m. Hezarfen'in gövde ve kanat mesafesiyle 1.8m altı suya çarpma sayılır.
    if (hezarfen.position.y <= 1.8) {
      triggerFlightEnd("Boğaz'ın serin sularına düştün! Daha fazla kanat çırpmalı veya süzülmeliydin.", "🌊");
    }

    // 3. HEDEF İNİŞ (Landing Zone: Üsküdar Doğancılar Meydanı Yeşil Alanı)
    // Yeşil alan dairesi: Merkez (0, 83.5, -3100), Yarıçap = 35m
    const dxLanding = hezarfen.position.x - landingMarker.position.x;
    const dzLanding = hezarfen.position.z - landingMarker.position.z;
    const distToLandingCenter = Math.hypot(dxLanding, dzLanding);

    // Yeşil alan sınırlarına (R <= 35m) tamamen girildiği an zafer!
    if (distToLandingCenter <= 35 && hezarfen.position.y <= 96) {
      triggerFlightEnd("TEBRİKLER! Hezarfen başarıyla Üsküdar Doğancılar Meydanı'na indi! Tarih yazıldı!", "🏆", true);
    }

    // 4. TOPRAK / ARAZİ TEMASI (Terrain / Ground Raycast)
    // 3D binalar/objeler hariç, yalnızca İstanbul yer şekillerine (terrainMeshes) çarpma
    if (terrainMeshes.length > 0 && flightPoseTransition > 0.45) {
      rayOrigin.set(hezarfen.position.x, 350, hezarfen.position.z);
      groundRaycaster.set(rayOrigin, downVector);
      const hits = groundRaycaster.intersectObjects(terrainMeshes, true);
      if (hits.length > 0) {
        const groundAlt = hits[0].point.y;
        if (hezarfen.position.y <= groundAlt + 0.6) {
          triggerFlightEnd("Karaya ve tepelere çarptın! İrtifanı koruyarak Boğaz üzerinde süzülmeliydin.", "⛰️");
        }
      }
    }

    updateHUD(hezarfen.position.y);
  }

  // Animate Bosphorus Water Current & Ripples
  if (waterNormal) {
    waterNormal.offset.x += 0.003 * dt;
    waterNormal.offset.y += 0.007 * dt;
  }

  renderer.render(scene, camera);
}

function triggerFlightEnd(reason, icon = '💥', isVictory = false) {
  if (STATE.isCrashed || STATE.isLanded) return;
  STATE.isCrashed = !isVictory;
  STATE.isLanded = isVictory;
  STATE.speed = 0;
  stopWindAudio();
  windLineMat.opacity = 0;
  windLinesMesh.visible = false;

  if (UI.impactFlash && !isVictory) {
    UI.impactFlash.classList.add('active');
  }

  const flown = Math.max(0, TOTAL_DISTANCE - Math.round(STATE.distanceLeft));
  const left = Math.round(STATE.distanceLeft);

  if (UI.crashIcon) UI.crashIcon.innerText = icon;
  if (UI.crashTitle) {
    UI.crashTitle.innerText = isVictory ? "TARİH YAZILDI!" : "UÇUŞ SONLANDI";
    if (isVictory) UI.crashTitle.classList.add('victory');
    else UI.crashTitle.classList.remove('victory');
  }
  if (UI.crashReason) UI.crashReason.innerText = reason;
  if (UI.crashDistFlown) UI.crashDistFlown.innerText = `${flown.toLocaleString('tr-TR')} m`;
  if (UI.crashDistLeft) UI.crashDistLeft.innerText = `${left.toLocaleString('tr-TR')} m`;

  if (UI.crashOverlay) {
    setTimeout(() => {
      UI.crashOverlay.style.display = 'flex';
    }, 180);
  }
}

export function restartFlight() {
  STATE.started = false;
  STATE.isCrashed = false;
  STATE.isLanded = false;
  STATE.altitude = 184.61;
  STATE.speed = 0;
  STATE.distanceLeft = TOTAL_DISTANCE;
  STATE.flapImpulse = 0;
  flightPoseTransition = 0;
  flightHeading = 0;
  currentBank = 0;
  currentPitch = 0;
  stopWindAudio();
  windLineMat.opacity = 0;
  windLinesMesh.visible = false;
  camera.fov = 60.0;
  camera.updateProjectionMatrix();

  hezarfen.position.set(-3.68, 184.61, 175.55);
  hezarfen.rotation.set(0, 0, 0);
  if (hezarfenModel) hezarfenModel.rotation.set(0, Math.PI, 0);

  camera.position.set(-14.07, 187.04, 182.47);
  currentCamLook.set(-9.13, 186.21, 173.48);
  camera.lookAt(currentCamLook);

  if (UI.impactFlash) UI.impactFlash.classList.remove('active');
  if (UI.crashOverlay) UI.crashOverlay.style.display = 'none';

  updateHUD();
  if (UI.toast) {
    UI.toast.innerText = "🗼 GALATA PENCERESİNDESİN • UÇUŞU BAŞLATMAK İÇİN [SPACE] TUŞUNA BAS!";
    UI.toast.style.display = 'block';
  }
}

if (UI.btnRestart) {
  UI.btnRestart.addEventListener('click', restartFlight);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (STATE.isCrashed || STATE.isLanded)) {
    restartFlight();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
