/**
 * Audio Engine — Generates adaptive ambient soundscapes using HTML5 Web Audio API
 * matching the user's current detected mood.
 */

export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.filterNode = null;
    this.oscillators = [];
    this.currentEmotion = 'neutral';
    this.masterVolume = 0.7;
    this.warmth = 0.6;
    this.binaural = 0.4;
  }

  initAudio() {
    if (this.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.audioCtx.currentTime);

    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(800, this.audioCtx.currentTime);

    this.filterNode.connect(this.masterGain);
    this.masterGain.connect(this.audioCtx.destination);
  }

  togglePlay() {
    this.initAudio();
    if (!this.audioCtx) return false;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.isPlaying) {
      this.stopSoundscape();
      this.isPlaying = false;
    } else {
      this.startSoundscape(this.currentEmotion);
      this.isPlaying = true;
    }

    return this.isPlaying;
  }

  startSoundscape(emotion = 'neutral') {
    this.stopOscillators();
    if (!this.audioCtx) return;

    this.currentEmotion = emotion;
    const now = this.audioCtx.currentTime;

    // Frequencies tailored for emotions
    const FREQ_MAP = {
      happy: [261.63, 329.63, 392.00, 523.25], // C Major chord
      neutral: [220.00, 277.18, 329.63],       // A Warm Ambient
      surprised: [349.23, 440.00, 523.25, 659.25], // F Major 7th
      sad: [174.61, 207.65, 261.63],          // F Minor
      angry: [110.00, 130.81, 164.81],         // A Low Sub
      fearful: [146.83, 155.56, 220.00],       // D Diminished
      disgusted: [196.00, 233.08, 277.18]      // G Diminished
    };

    const freqs = FREQ_MAP[emotion] || FREQ_MAP.neutral;

    freqs.forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Subtle LFO modulation for warmth
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();
      lfo.frequency.setValueAtTime(0.2 + (idx * 0.1), now);
      lfoGain.gain.setValueAtTime(4.0, now);
      lfo.connect(osc.frequency);
      lfo.start(now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.15 / freqs.length, now + 2);

      osc.connect(gain);
      gain.connect(this.filterNode);
      osc.start(now);

      this.oscillators.push({ osc, gain, lfo });
    });

    // Update filter cutoff based on emotion
    const cutoff = emotion === 'happy' || emotion === 'surprised' ? 1400 : 600;
    this.filterNode.frequency.setTargetAtTime(cutoff, now, 1.5);
  }

  updateMood(emotion) {
    if (this.isPlaying && emotion !== this.currentEmotion) {
      this.startSoundscape(emotion);
    }
  }

  setMasterVolume(val) {
    this.masterVolume = val / 100;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.audioCtx.currentTime, 0.1);
    }
  }

  stopOscillators() {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    this.oscillators.forEach(({ osc, gain, lfo }) => {
      try {
        gain.gain.setTargetAtTime(0.001, now, 0.2);
        setTimeout(() => {
          osc.stop();
          lfo.stop();
        }, 300);
      } catch (e) {}
    });
    this.oscillators = [];
  }

  stopSoundscape() {
    this.stopOscillators();
  }
}

export const audioEngine = new AudioEngine();
