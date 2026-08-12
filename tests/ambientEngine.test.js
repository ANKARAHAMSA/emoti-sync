import { describe, it, expect, beforeEach } from 'vitest';
import { AmbientEngine } from '../src/js/ambientEngine.js';

describe('AmbientEngine Unit Test Suite', () => {
  let ambient;

  beforeEach(() => {
    ambient = new AmbientEngine();
    globalThis.document = {
      body: { className: '' }
    };
  });

  it('should map emotions to correct theme classes and metadata', () => {
    const themeHappy = ambient.applyTheme('happy');
    expect(themeHappy.class).toBe('theme-happy');
    expect(themeHappy.emoji).toBe('😊');
    expect(globalThis.document.body.className).toBe('theme-happy');

    const themeAngry = ambient.applyTheme('angry');
    expect(themeAngry.class).toBe('theme-angry');
    expect(themeAngry.emoji).toBe('😠');
    expect(globalThis.document.body.className).toBe('theme-angry');
  });

  it('should fallback to neutral theme for invalid/unknown emotion string', () => {
    const themeUnknown = ambient.applyTheme('unknown_emotion_xyz');
    expect(themeUnknown.class).toBe('theme-neutral');
    expect(globalThis.document.body.className).toBe('theme-neutral');
  });

  it('should respect sync enabled / disabled state', () => {
    ambient.setSyncEnabled(false);
    ambient.applyTheme('happy');
    expect(globalThis.document.body.className).toBe('theme-neutral');
  });
});
