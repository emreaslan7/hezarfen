import { STATE, UI } from './state.js';
import { poseState, startCamera } from './pose.js';

export const controls = {
  keys: {},
  mouse: {
    x: 0,
    y: 0
  }
};

// Start Flight Handler
export async function startGame(useCamera = false) {
  UI.overlay.classList.add('hidden');
  if (UI.hud) UI.hud.style.display = 'flex';
  if (UI.toast) UI.toast.style.display = 'block';

  if (useCamera) {
    poseState.active = true;
    // Set immediate flight baseline to current resting posture!
    if (poseState.currentRawRoll !== undefined) {
      poseState.baselineRoll = poseState.currentRawRoll;
    }
    poseState.roll = 0;
    STATE.rollAngle = 0;
    if (UI.camBox) UI.camBox.style.display = 'block';
    UI.toast.innerText = "🦅 DÜZ SÜZÜLÜŞ (SIFIRLAMAK İÇİN R VEYA SPACE)";
    setTimeout(() => { if (STATE.started) UI.toast.style.display = 'none'; }, 3000);
  } else {
    poseState.active = false;
    STATE.speed = 150;
    UI.toast.innerText = "⌨️ KLAVYE MODU: [A/D] YATIŞ | [W/S] DALIŞ | [SPACE] KANAT";
  }

  STATE.started = true;
}

// Menu Action Listeners
if (UI.btnCameraMode) {
  UI.btnCameraMode.addEventListener('click', async () => {
    if (UI.briefingPanel) UI.briefingPanel.style.display = 'none';
    if (UI.calibPanel) UI.calibPanel.style.display = 'block';
    poseState.isCalibrating = true;

    try {
      await startCamera();
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("Kameraya erişilemedi! Lütfen tarayıcı izinlerinden kamerayı açın.");
      if (UI.calibPanel) UI.calibPanel.style.display = 'none';
      if (UI.briefingPanel) UI.briefingPanel.style.display = 'block';
      poseState.isCalibrating = false;
    }
  });
}

if (UI.calibBackBtn) {
  UI.calibBackBtn.addEventListener('click', () => {
    if (UI.calibPanel) UI.calibPanel.style.display = 'none';
    if (UI.briefingPanel) UI.briefingPanel.style.display = 'block';
    poseState.isCalibrating = false;
  });
}

let isCalibratingCountdown = false;

export function triggerBodyPairing() {
  if (isCalibratingCountdown || poseState.isPaired) return;
  isCalibratingCountdown = true;

  if (UI.calibStartBtn) {
    UI.calibStartBtn.disabled = true;
    UI.calibStartBtn.innerText = "DİK DURUN (2)...";
  }

  let samples = [];
  const sampleInterval = setInterval(() => {
    if (poseState.currentRawRoll !== undefined) {
      samples.push(poseState.currentRawRoll);
    }
  }, 50);

  let sec = 2;
  const timer = setInterval(() => {
    sec--;
    if (sec > 0) {
      if (UI.calibStartBtn) UI.calibStartBtn.innerText = `DİK DURUN (${sec})...`;
    } else {
      clearInterval(timer);
      clearInterval(sampleInterval);
      isCalibratingCountdown = false;
      if (samples.length > 0) {
        poseState.baselineRoll = samples.reduce((a, b) => a + b, 0) / samples.length;
      } else {
        poseState.baselineRoll = poseState.currentRawRoll !== undefined ? poseState.currentRawRoll : 0;
      }
      poseState.roll = 0;
      poseState.isPaired = true;
      if (UI.calibStartBtn) {
        UI.calibStartBtn.disabled = false;
        UI.calibStartBtn.innerText = "UÇUŞA BAŞLA 🦅";
      }
      if (UI.badgeStatus) {
        const span = UI.badgeStatus.querySelector('span:last-child');
        if (span) span.innerText = "Eşleştirildi (Canlı)";
      }
    }
  }, 750);
}

if (UI.calibStartBtn) {
  UI.calibStartBtn.addEventListener('click', () => {
    if (!poseState.isPaired) {
      triggerBodyPairing();
    } else {
      poseState.isCalibrating = false;
      startGame(true);
    }
  });
}

if (UI.btnKeyboardMode) {
  UI.btnKeyboardMode.addEventListener('click', () => {
    startGame(false);
  });
}

// Auto-start flight or calibration after 5 seconds loading
const urlParams = new URLSearchParams(window.location.search);
const initialMode = urlParams.get('mode');

const LOADING_DURATION_MS = 5000;

setTimeout(() => {
  STATE.isLoading = false;
  const loader = document.getElementById('loading-screen');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }

  if (initialMode === 'keyboard') {
    startGame(false);
  } else if (initialMode === 'camera') {
    if (UI.btnCameraMode) UI.btnCameraMode.click();
  }
}, LOADING_DURATION_MS);

// Keyboard controls
window.addEventListener('keydown', (e) => {
  if (STATE.isLoading) {
    return;
  }

  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  controls.keys[e.code] = true;

  if (!STATE.started) {
    if (poseState.isCalibrating && poseState.isBodyReady && (e.code === 'Space' || e.code === 'Enter')) {
      if (!poseState.isPaired) {
        triggerBodyPairing();
      } else {
        poseState.isCalibrating = false;
        startGame(true);
      }
    } else if (!poseState.isCalibrating && (e.code === 'Space' || e.code === 'Enter')) {
      startGame(false);
    }
  }

  if ((e.code === 'KeyR' || e.code === 'Space') && STATE.started && poseState.active) {
    if (poseState.currentRawRoll !== undefined) {
      poseState.baselineRoll = poseState.currentRawRoll;
      poseState.roll = 0;
      STATE.rollAngle = 0;
      if (UI.toast) {
        UI.toast.innerText = "DURUŞ SIFIRLANDI: 0° (TAM DÜZ)";
        UI.toast.style.display = 'block';
        setTimeout(() => { if (STATE.started) UI.toast.style.display = 'none'; }, 2000);
      }
    }
  } else if (e.code === 'Space' && STATE.started && !poseState.active) {
    triggerWingFlap(6.2);
  }

  if (e.code === 'KeyR' && !poseState.active) {
    controls.mouse.x = 0;
    controls.mouse.y = 0;
    UI.toast.innerText = "KAMERA SIFIRLANDI";
  }
});

window.addEventListener('keyup', (e) => {
  controls.keys[e.code] = false;
});

// Mouse direction tracking
window.addEventListener('mousemove', (e) => {
  controls.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  controls.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

export function triggerWingFlap(impulse = 6.2) {
  STATE.flapImpulse = impulse;
  STATE.flapTime = 0.45;
  UI.toast.innerText = `🦅 KANAT ÇIRPIŞI: +${impulse.toFixed(1)} m/s KALDIRMA!`;
}
