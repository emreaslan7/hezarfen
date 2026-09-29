import * as THREE from 'three';
import { TOTAL_DISTANCE, STATE, UI, updateHUD } from './state.js';
import { scene, camera, renderer, hezarfen, bones, hezarfenModel, rigMarkersGroup, updateRigMarkers, waterNormal } from './scene.js';
import { controls, triggerWingFlap } from './controls.js';
import { poseState } from './pose.js';

const clock = new THREE.Clock();
let currentLookX = 0;
let currentLookY = 0;
let currentPitch = 0;
let flightHeading = 0;
let currentBank = 0;
let flightPoseTransition = 0;
const currentCamLook = new THREE.Vector3(2.8, 155.0, 180.0);

// Interactive 3D Character Inspection in Menu (Horizontal Y-axis spin only)
let isDraggingChar = false;
let pointerStartX = 0;
let charYaw = Math.PI;        // Math.PI = faces camera / player directly
let targetCharYaw = Math.PI;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (!STATE.started) {
    flightHeading = 0;
    currentBank = 0;
    // 3D Upper-Body Tracking Landmarks on Hezarfen
    rigMarkersGroup.visible = false;
    updateRigMarkers(poseState.isPaired);

    // Character showcase view: Hezarfen stands on the left under the name, facing player
    const showcaseCamPos = new THREE.Vector3(2.8, 155.0, 187.0);
    const showcaseLookAt = new THREE.Vector3(2.8, 155.0, 180.0);
    camera.position.lerp(showcaseCamPos, 0.1);
    currentCamLook.lerp(showcaseLookAt, 0.1);
    camera.lookAt(currentCamLook);

    if (hezarfenModel) {
      if (!isDraggingChar && !poseState.isPaired) {
        // Subtle idle rotation when not dragging or paired
        targetCharYaw += 0.0015;
      }
      charYaw += (targetCharYaw - charYaw) * 0.12;
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

    // Smoothly transition from upright showcase into prone flight pose
    if (flightPoseTransition < 1) {
      flightPoseTransition = Math.min(1, flightPoseTransition + dt * 2.2);
      if (hezarfenModel) {
        hezarfenModel.rotation.set(
          THREE.MathUtils.lerp(0, -Math.PI / 2, flightPoseTransition),
          charYaw,
          0
        );
      }
    } else if (hezarfenModel) {
      hezarfenModel.rotation.set(-Math.PI / 2, Math.PI, 0);
    }

    // 1. AVIAN SOARING DYNAMICS: True bird gliding via differential wing lift and banking
    let targetBank = 0;

    if (poseState.active) {
      // Differential wing lift: comparing Right Arm vs Left Arm
      // When dipping right arm / raising left arm (or leaning right) -> bank right & turn right
      // When dipping left arm / raising right arm (or leaning left) -> bank left & turn left
      const wingDelta = (poseState.armLiftRight - poseState.armLiftLeft);
      const torsoLean = poseState.roll;
      const combinedSteer = (wingDelta * 0.75) + (torsoLean * 0.35);

      // Deadzone so holding arms level soars dead straight
      if (Math.abs(combinedSteer) < 0.08) {
        targetBank = 0;
      } else {
        targetBank = THREE.MathUtils.clamp(combinedSteer * 0.95, -0.65, 0.65);
      }
    } else {
      // Keyboard mode: A/Left turns left (bank > 0), D/Right turns right (bank < 0)
      if (keys['KeyA'] || keys['ArrowLeft']) targetBank = 0.55;
      else if (keys['KeyD'] || keys['ArrowRight']) targetBank = -0.55;
      else targetBank = 0;
    }

    // Smooth aerodynamic banking (roll)
    currentBank += (targetBank - currentBank) * Math.min(1, 4.5 * dt);

    // Aerodynamic Heading Turn: Banking curves the flight trajectory across the sky!
    const turnRate = currentBank * 0.85; // rad/s
    flightHeading += turnRate * dt;

    // True forward velocity along heading
    let forwardSpeed = 0;

    if (poseState.active) {
      // CAMERA MODE: Clean, steady, level gliding without acceleration spikes or vertical drops
      STATE.speed = 38; // Constant calm cruising speed (km/h)
      forwardSpeed = (STATE.speed * 1000) / 3600; // m/s
      const vx = -Math.sin(flightHeading) * forwardSpeed;
      const vz = -Math.cos(flightHeading) * forwardSpeed;
      hezarfen.position.x += vx * dt;
      hezarfen.position.z += vz * dt;
      STATE.distanceLeft = Math.max(0, hezarfen.position.z - (-TOTAL_DISTANCE));

      // Fixed level altitude (no sudden sink or vertical acceleration)
      hezarfen.position.y = STATE.altitude;
    } else {
      // KEYBOARD MODE: Constant steady speed (150 km/h) without acceleration spikes
      let targetPitch = 0;
      if (keys['KeyW'] || keys['ArrowUp']) {
        targetPitch = -1;
      } else if (keys['KeyS'] || keys['ArrowDown']) {
        targetPitch = 1;
      }
      currentPitch += (targetPitch - currentPitch) * 3.5 * dt;

      STATE.speed = 150; // Constant steady flight speed
      forwardSpeed = (STATE.speed * 1000) / 3600;
      const vx = -Math.sin(flightHeading) * forwardSpeed;
      const vz = -Math.cos(flightHeading) * forwardSpeed;
      hezarfen.position.x += vx * dt;
      hezarfen.position.z += vz * dt;
      STATE.distanceLeft = Math.max(0, hezarfen.position.z - (-TOTAL_DISTANCE));

      let verticalVelocity = -0.7 + (currentPitch * 2.8);
      if (STATE.flapImpulse > 0) {
        verticalVelocity += STATE.flapImpulse;
        STATE.flapImpulse = Math.max(0, STATE.flapImpulse - dt * 3.5);
      }
      STATE.altitude += verticalVelocity * dt;
      hezarfen.position.y = Math.max(0, STATE.altitude);
    }

    if (bones.leftArm && bones.rightArm) {
      if (poseState.active) {
        // LIVE 1:1 WING TRACKING IN FLIGHT (Right arm -> Right wing, Left arm -> Left wing)
        const charForwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(hezarfenModel.quaternion);
        const _tempQ = new THREE.Quaternion();

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
      } else {
        // Keyboard mode fallback: steady open wings
        bones.leftArm.rotation.copy(bones.leftArm.userData.baseRot);
        bones.rightArm.rotation.copy(bones.rightArm.userData.baseRot);
      }

      // Lock forearms and wingtips straight with wings
      if (bones.leftForeArm && bones.rightForeArm) {
        bones.leftForeArm.quaternion.copy(bones.leftForeArm.userData.baseQuat);
        bones.rightForeArm.quaternion.copy(bones.rightForeArm.userData.baseQuat);
      }
      if (bones.leftWingTip && bones.rightWingTip) {
        bones.leftWingTip.quaternion.copy(bones.leftWingTip.userData.baseQuat);
        bones.rightWingTip.quaternion.copy(bones.rightWingTip.userData.baseQuat);
      }

      if (bones.spine) {
        bones.spine.quaternion.copy(bones.spine.userData.baseQuat);
        if (poseState.active && Math.abs(poseState.roll) > 0.01) {
          const charForwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(hezarfenModel.quaternion);
          const spineParentQ = bones.spine.parent.getWorldQuaternion(new THREE.Quaternion());
          const localAxisSpine = charForwardWorld.clone().applyQuaternion(spineParentQ.invert());
          const spineTilt = THREE.MathUtils.clamp(poseState.roll * 0.65, -0.40, 0.40);
          bones.spine.rotateOnAxis(localAxisSpine, spineTilt);
        }
      }
    }

    // Visual Glider Aerodynamics: Nose points along flight heading, wings bank into turn
    hezarfen.rotation.y = flightHeading;
    hezarfen.rotation.z = currentBank;
    hezarfen.rotation.x = -0.06;

    // FIXED UPPER-REAR CHASE CAMERA:
    // Firmly locked directly behind and above Hezarfen, sweeping with flight heading
    const camOffset = new THREE.Vector3(0, 3.2, 8.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), flightHeading);
    const targetCamPos = hezarfen.position.clone().add(camOffset);
    camera.position.lerp(targetCamPos, Math.min(1, 14.0 * dt));

    const lookOffset = new THREE.Vector3(0, 0.6, -45).applyAxisAngle(new THREE.Vector3(0, 1, 0), flightHeading);
    const targetLookAt = hezarfen.position.clone().add(lookOffset);
    currentCamLook.lerp(targetLookAt, Math.min(1, 14.0 * dt));
    camera.lookAt(currentCamLook);

    // Win / Lose Checks
    if (STATE.altitude <= 5 && STATE.distanceLeft > 100) {
      STATE.isCrashed = true;
      alert("Boğaz'ın serin sularına çakıldın! Daha fazla kanat çırpmalıydın.");
    } else if (STATE.distanceLeft <= 80 && STATE.altitude <= 100) {
      STATE.isLanded = true;
      alert("TEBRİKLER! Hezarfen başarıyla Üsküdar Doğancılar Meydanı'na indi! Tarih yazıldı!");
    }

    updateHUD();
  }

  // Animate Bosphorus Water Current & Ripples
  if (waterNormal) {
    waterNormal.offset.x += 0.003 * dt;
    waterNormal.offset.y += 0.007 * dt;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
