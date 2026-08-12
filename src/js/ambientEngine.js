/**
 * Ambient Engine — Dynamically updates the UI background glow and theme accent
 * based on the primary emotion detected by EmotiSync.
 */

export const EMOTION_THEMES = {
  happy: { class: 'theme-happy', color: '#f59e0b', emoji: '😊', quote: 'Vibrant & Uplifting', positivity: 95 },
  neutral: { class: 'theme-neutral', color: '#06b6d4', emoji: '😐', quote: 'Calm & Centered', positivity: 60 },
  surprised: { class: 'theme-surprised', color: '#a855f7', emoji: '😲', quote: 'Energetic & Curious', positivity: 80 },
  sad: { class: 'theme-sad', color: '#3b82f6', emoji: '😔', quote: 'Melancholic & Reflective', positivity: 25 },
  angry: { class: 'theme-angry', color: '#ef4444', emoji: '😠', quote: 'Intense & Focused', positivity: 10 },
  fearful: { class: 'theme-fearful', color: '#f97316', emoji: '😨', quote: 'Apprehensive & Alert', positivity: 20 },
  disgusted: { class: 'theme-disgusted', color: '#10b981', emoji: '🤢', quote: 'Aversive & Guarded', positivity: 15 }
};

export class AmbientEngine {
  constructor() {
    this.currentEmotion = 'neutral';
    this.isSyncEnabled = true;
  }

  setSyncEnabled(enabled) {
    this.isSyncEnabled = enabled;
    if (!enabled && typeof document !== 'undefined' && document.body) {
      document.body.className = 'theme-neutral';
    }
  }

  applyTheme(emotion) {
    const themeKey = (emotion || 'neutral').toLowerCase();
    const theme = EMOTION_THEMES[themeKey] || EMOTION_THEMES.neutral;
    
    this.currentEmotion = themeKey;

    if (this.isSyncEnabled && typeof document !== 'undefined' && document.body) {
      document.body.className = theme.class;
    }

    return theme;
  }
}

export const ambientEngine = new AmbientEngine();
