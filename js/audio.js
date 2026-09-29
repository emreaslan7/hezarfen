// Procedural Web Audio Wind Synthesizer (0 KB external download)
// Uses Web Audio API with pink noise and a dynamic low-pass resonance filter

let audioCtx = null;
let windGain = null;
let windFilter = null;
let isAudioStarted = false;

export function initWindAudio() {
  if (isAudioStarted) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    // 2-second pink noise buffer (natural, warm wind rush without harsh digital hiss)
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.45;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(260, audioCtx.currentTime);
    windFilter.Q.setValueAtTime(2.2, audioCtx.currentTime);

    windGain = audioCtx.createGain();
    windGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

    whiteNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioCtx.destination);

    whiteNoise.start(0);
    isAudioStarted = true;
    console.log('Procedural Web Audio Wind Synthesizer initialized!');
  } catch (err) {
    console.warn('Web Audio init skipped or unavailable:', err);
  }
}

export function updateWindAudio(diveIntensity = 0, speedRatio = 1.0, brakeIntensity = 0) {
  if (!audioCtx || !windFilter || !windGain) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (brakeIntensity > 0.05) {
    // Air-brake / "Rüzgarı Göğüsleme" [S]: Deep resonant air buffeting & drag
    const targetFreq = Math.max(160, 260 - (brakeIntensity * 90));
    const targetGain = 0.05 + (brakeIntensity * 0.22);
    const targetQ = 2.2 + (brakeIntensity * 4.0);

    windFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
    windFilter.Q.setTargetAtTime(targetQ, audioCtx.currentTime, 0.08);
    windGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.08);
  } else {
    // Frequency range: 260 Hz (peaceful sea breeze) -> 1750 Hz (roaring falcon dive)
    const targetFreq = 260 + (diveIntensity * 1450) + ((speedRatio - 1) * 200);
    const targetGain = 0.05 + (diveIntensity * 0.35);

    windFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.06);
    windFilter.Q.setTargetAtTime(2.2, audioCtx.currentTime, 0.06);
    windGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.06);
  }
}

export function stopWindAudio() {
  if (windGain && audioCtx) {
    windGain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.1);
  }
}
