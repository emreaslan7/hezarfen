export const TOTAL_DISTANCE = 3300;

export const STATE = {
  isLoading: true,
  started: false,
  altitude: 184.61, // meters (Galata Tower window sill)
  speed: 150, // km/h
  distanceLeft: TOTAL_DISTANCE,
  rollAngle: 0, // radians
  lateralPos: 0, // meters left/right
  flapImpulse: 0,
  flapTime: 0,
  lastWristY: 0.5,
  isLanded: false,
  isCrashed: false
};

export const UI = {
  loadingScreen: document.getElementById('loading-screen'),
  alt: document.getElementById('val-alt'),
  spd: document.getElementById('val-spd'),
  dist: document.getElementById('val-dist'),
  roll: document.getElementById('val-roll'),
  attitudeFill: document.getElementById('attitude-fill'),
  toast: document.getElementById('status-toast'),
  overlay: document.getElementById('overlay'),
  briefingPanel: document.getElementById('briefing-panel'),
  calibPanel: document.getElementById('calib-panel'),
  btnCameraMode: document.getElementById('btn-camera-mode'),
  btnKeyboardMode: document.getElementById('btn-keyboard-mode'),
  calibCanvas: document.getElementById('calib-canvas'),
  calibStartBtn: document.getElementById('calib-start-btn'),
  calibBackBtn: document.getElementById('calib-back-btn'),
  badgeShoulders: document.getElementById('badge-shoulders'),
  badgeArms: document.getElementById('badge-arms'),
  badgeRoll: document.getElementById('badge-roll'),
  badgeStatus: document.getElementById('badge-status'),
  hud: document.getElementById('hud'),
  camBox: document.getElementById('cam-box'),
  video: document.getElementById('webcam-video'),
  camCanvas: document.getElementById('cam-canvas'),
  canvas3d: document.getElementById('canvas3d'),
  impactFlash: document.getElementById('impact-flash'),
  crashOverlay: document.getElementById('crash-overlay'),
  crashIcon: document.getElementById('crash-icon'),
  crashTitle: document.getElementById('crash-title'),
  crashReason: document.getElementById('crash-reason'),
  crashDistFlown: document.getElementById('crash-dist-flown'),
  crashDistLeft: document.getElementById('crash-dist-left'),
  btnRestart: document.getElementById('btn-restart')
};

export function updateHUD(actualAlt) {
  const displayAlt = (actualAlt !== undefined) ? actualAlt : STATE.altitude;
  UI.alt.innerText = `${Math.round(displayAlt)} m`;
  UI.spd.innerText = `${Math.round(STATE.speed)} km/s`;
  UI.dist.innerText = `${Math.round(STATE.distanceLeft)} m`;
  const deg = Math.round((STATE.rollAngle * 180) / Math.PI);
  UI.roll.innerText = `${deg}°`;
  const fillPct = Math.min(100, Math.max(0, 50 + (deg * 1.5)));
  UI.attitudeFill.style.width = `${fillPct}%`;
}
