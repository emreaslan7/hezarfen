import { STATE, UI } from './state.js';
import { poseState, startCamera, stopCamera } from './pose.js';
import { assetsReadyPromise } from './scene.js';
import { initWindAudio } from './audio.js';

export const controls = {
  keys: {},
  mouse: {
    x: 0,
    y: 0
  }
};

// Start Flight Handler
export async function startGame(useCamera = false) {
  initWindAudio();
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
  STATE.flapImpulse = 5.0; // Strong initial takeoff leap into the wind
  STATE.flapTime = 0.52;   // Triggers fluid organic wing flap on leap off balcony

  // Control hints fade out 6s into the flight (hover to bring back);
  // updateHUD un-fades them whenever STATE.started is false (restart/reset).
  if (UI.hudControls) {
    UI.hudControls.classList.remove('faded');
    clearTimeout(UI.hudControls._fadeTimer);
    UI.hudControls._fadeTimer = setTimeout(() => UI.hudControls.classList.add('faded'), 6000);
  }
}

// Menu Action Listeners
function showCalibError(message) {
  if (!UI.calibError) return;
  if (!message) {
    UI.calibError.style.display = 'none';
    UI.calibError.innerText = '';
    return;
  }
  UI.calibError.innerText = message;
  UI.calibError.style.display = 'block';
}

if (UI.btnCameraMode) {
  UI.btnCameraMode.addEventListener('click', async () => {
    if (UI.briefingPanel) UI.briefingPanel.style.display = 'none';
    if (UI.calibPanel) UI.calibPanel.style.display = 'block';
    showCalibError(null);
    poseState.isCalibrating = true;

    try {
      await startCamera();
    } catch (err) {
      console.error("Camera access failed:", err);
      poseState.isCalibrating = false;
      showCalibError(
        'Kameraya erişilemedi. Tarayıcı adres çubuğundaki kamera simgesinden izni aç, ' +
        'sonra "Geri" ile tekrar dene. Sayfa yalnızca https:// veya localhost üzerinden çalışır.'
      );
      if (UI.calibStartBtn) {
        UI.calibStartBtn.disabled = true;
        UI.calibStartBtn.innerText = 'KAMERA ERİŞİMİ YOK';
      }
      if (UI.badgeStatus) {
        UI.badgeStatus.classList.remove('active');
        const span = UI.badgeStatus.querySelector('span:last-child');
        if (span) span.innerText = 'Duruş: Kamera Kapalı';
      }
    }
  });
}

if (UI.calibBackBtn) {
  UI.calibBackBtn.addEventListener('click', () => {
    if (UI.calibPanel) UI.calibPanel.style.display = 'none';
    if (UI.briefingPanel) UI.briefingPanel.style.display = 'block';
    poseState.isCalibrating = false;
    poseState.isPaired = false;
    isCalibratingCountdown = false;
    // Kamerayı da kapat: kullanıcı menüye döndüğünde cihaz ışığı yanmasın
    stopCamera();
    if (UI.calibStartBtn) {
      UI.calibStartBtn.disabled = true;
      UI.calibStartBtn.innerText = 'DURUŞ BEKLENİYOR...';
      UI.calibStartBtn.classList.remove('btn-hero');
    }
    showCalibError(null);
  });
}

let isCalibratingCountdown = false;

export function triggerBodyPairing() {
  if (isCalibratingCountdown || poseState.isPaired || !poseState.isCalibrating) return;
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
    // Geri'e basılırsa geri sayım iptal olsun
    if (!poseState.isCalibrating) {
      clearInterval(timer);
      clearInterval(sampleInterval);
      isCalibratingCountdown = false;
      return;
    }
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
    // Klavye moduna geçiyorsan kamera akışını ve kalibrasyon durumunu temizle
    if (poseState.active || poseState.isCalibrating) stopCamera();
    if (UI.overlay) UI.overlay.classList.add('hidden');
    if (UI.hud) UI.hud.style.display = 'flex';
    if (UI.toast) {
      UI.toast.innerText = "🗼 GALATA PENCERESİNDESİN • UÇUŞU BAŞLATMAK İÇİN [SPACE] TUŞUNA BAS!";
      UI.toast.style.display = 'block';
    }
  });
}

// Smooth loading: minimum 2.0s + wait for assets, with a strict 3.8s timeout so it NEVER hangs
const urlParams = new URLSearchParams(window.location.search);
const initialMode = urlParams.get('mode');
const minTimer = new Promise((resolve) => setTimeout(resolve, 2000));
const maxTimer = new Promise((resolve) => setTimeout(resolve, 3800));

Promise.race([
  Promise.all([minTimer, assetsReadyPromise]),
  maxTimer
]).then(() => {
  STATE.isLoading = false;
  const loader = document.getElementById('loading-screen');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }

  if (initialMode === 'keyboard') {
    if (UI.overlay) UI.overlay.classList.add('hidden');
    if (UI.hud) UI.hud.style.display = 'flex';
    if (UI.toast) {
      UI.toast.innerText = "🗼 GALATA PENCERESİNDESİN • UÇUŞU BAŞLATMAK İÇİN [SPACE] TUŞUNA BAS!";
      UI.toast.style.display = 'block';
    }
  } else if (initialMode === 'camera') {
    if (UI.btnCameraMode) UI.btnCameraMode.click();
  }
});

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
      // Çarpışma/yeniden başlatma sonrası: kamera modundaysak klavye moduna düşme
      startGame(poseState.active);
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
    if (!e.repeat) {
      triggerWingFlap(6.2);
    }
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
  STATE.flapTime = 0.52;
  UI.toast.innerText = `🦅 KANAT ÇIRPIŞI: +${impulse.toFixed(1)} m/s KALDIRMA!`;
}
