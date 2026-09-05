/**
 * ============================================================================
 * ROBCO SOUND SYNTHESIS ENGINE (audio.js)
 * 100% Procedural Web Audio API sound synthesis. Zero audio files required.
 * ============================================================================
 */

class RobCoAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.alarmInterval = null;

    // Check stored preference
    try {
      const stored = localStorage.getItem('robco_audio_enabled');
      if (stored !== null) {
        this.enabled = stored === 'true';
      }
    } catch (e) {}
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleAudio() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('robco_audio_enabled', String(this.enabled));
    } catch (e) {}
    return this.enabled;
  }

  /**
   * Subtle mechanical key click on typing.
   * Bandpass noise click + low frequency bottoming-out thud with random pitch jitter.
   */
  playKeyClick() {
    if (!this.enabled) return;
    if ('vibrate' in navigator) {
      try { navigator.vibrate(6); } catch (e) {}
    }
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Damped low mechanical thud
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      const jitter = (Math.random() - 0.5) * 30;

      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(160 + jitter, now);
      thudOsc.frequency.exponentialRampToValueAtTime(50, now + 0.025);

      thudGain.gain.setValueAtTime(0.2, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);

      thudOsc.start(now);
      thudOsc.stop(now + 0.025);

      // 2. High crisp switch snap (filtered noise buffer)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.015); // 15ms
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200 + jitter * 10, now);
      filter.Q.setValueAtTime(3, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.015);
    } catch (e) {
      console.warn('Audio playKeyClick error:', e);
    }
  }

  /**
   * Retro FSK teletype relay chirp on incoming transmission.
   */
  playTeletypeChirp() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Pulse 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1450, now);
      osc1.frequency.setValueAtTime(1850, now + 0.03);

      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.08);

      // Pulse 2
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(920, now + 0.05);

      gain2.gain.setValueAtTime(0.04, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      osc2.start(now + 0.05);
      osc2.stop(now + 0.12);
    } catch (e) {
      console.warn('Audio playTeletypeChirp error:', e);
    }
  }

  /**
   * Power-on CRT boot hum:
   * 60Hz transformer mains hum + 15.7kHz flyback whistle swell + relay click.
   */
  playBootHum() {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 60Hz hum with harmonics
      const humOsc = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      humOsc.type = 'sawtooth';
      humOsc.frequency.setValueAtTime(60, now);

      const humFilter = this.ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.setValueAtTime(180, now);

      humGain.gain.setValueAtTime(0.01, now);
      humGain.gain.linearRampToValueAtTime(0.15, now + 0.4);
      humGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      humOsc.connect(humFilter);
      humFilter.connect(humGain);
      humGain.connect(this.ctx.destination);

      humOsc.start(now);
      humOsc.stop(now + 1.2);

      // Flyback transformer high frequency whistle swell
      const whistleOsc = this.ctx.createOscillator();
      const whistleGain = this.ctx.createGain();
      whistleOsc.type = 'sine';
      whistleOsc.frequency.setValueAtTime(8000, now);
      whistleOsc.frequency.exponentialRampToValueAtTime(15734, now + 0.7);

      whistleGain.gain.setValueAtTime(0.001, now);
      whistleGain.gain.linearRampToValueAtTime(0.05, now + 0.5);
      whistleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      whistleOsc.connect(whistleGain);
      whistleGain.connect(this.ctx.destination);

      whistleOsc.start(now);
      whistleOsc.stop(now + 1.3);

      // Relay 'CLACK' click
      setTimeout(() => this.playKeyClick(), 450);
    } catch (e) {
      console.warn('Audio playBootHum error:', e);
    }
  }

  /**
   * Red Alert two-tone siren loop
   */
  startRedAlertSiren() {
    if (!this.enabled) return;
    this.stopRedAlertSiren();
    this.ensureContext();

    const playTone = (freq, duration) => {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    };

    let high = true;
    const tick = () => {
      playTone(high ? 780 : 540, 0.45);
      high = !high;
    };

    tick();
    this.alarmInterval = setInterval(tick, 550);
  }

  stopRedAlertSiren() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  /**
   * Fallout Hacking puzzle feedback sounds
   */
  playHackSound(type) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      if (type === 'select') {
        // High soft blip
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'dud') {
        // Sci-fi chirp descending
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'reset') {
        // Recharge sweep ascending
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'wrong') {
        // Denied harsh double buzz
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'win') {
        // Access Granted 4-note victory chord
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.1, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.3);
        });
      }
    } catch (e) {
      console.warn('Audio playHackSound error:', e);
    }
  }
}

// Global audio singleton
window.robcoAudio = new RobCoAudio();
