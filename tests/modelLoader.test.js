import { describe, it, expect, vi, beforeEach } from 'vitest';

const netOk = () => ({ loadFromUri: vi.fn().mockResolvedValue(undefined) });

describe('modelLoader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@vladmandic/face-api');
    vi.spyOn(console, 'error').mockImplementation(() => {}); // the failure path logs on purpose
  });

  it('starts idle and tells subscribers immediately', async () => {
    const { onModelStatus } = await import('../src/js/modelLoader.js');
    const cb = vi.fn();
    onModelStatus(cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ state: 'idle' }));
  });

  it('loads all three networks from the app\'s own /models path and reports ready', async () => {
    const nets = { tinyFaceDetector: netOk(), faceLandmark68Net: netOk(), faceExpressionNet: netOk() };
    vi.doMock('@vladmandic/face-api', () => ({ nets }));
    const { loadModels, getModelStatus, MODEL_URL } = await import('../src/js/modelLoader.js');

    await loadModels();
    expect(getModelStatus().state).toBe('ready');
    expect(MODEL_URL.startsWith('http')).toBe(false); // same-origin, never a CDN
    for (const n of Object.values(nets)) expect(n.loadFromUri).toHaveBeenCalledWith(MODEL_URL);
  });

  it('loads only once even when called from several places', async () => {
    const nets = { tinyFaceDetector: netOk(), faceLandmark68Net: netOk(), faceExpressionNet: netOk() };
    vi.doMock('@vladmandic/face-api', () => ({ nets }));
    const { loadModels } = await import('../src/js/modelLoader.js');
    await Promise.all([loadModels(), loadModels(), loadModels()]);
    expect(nets.tinyFaceDetector.loadFromUri).toHaveBeenCalledTimes(1);
  });

  it('reports a real error (no silent fallback) and allows a retry', async () => {
    const failing = { loadFromUri: vi.fn().mockRejectedValue(new Error('404')) };
    const nets = { tinyFaceDetector: failing, faceLandmark68Net: netOk(), faceExpressionNet: netOk() };
    vi.doMock('@vladmandic/face-api', () => ({ nets }));
    const { loadModels, getModelStatus } = await import('../src/js/modelLoader.js');

    await expect(loadModels()).rejects.toThrow();
    expect(getModelStatus().state).toBe('error');

    failing.loadFromUri.mockResolvedValue(undefined); // network recovered
    await loadModels();
    expect(getModelStatus().state).toBe('ready');
  });
});
