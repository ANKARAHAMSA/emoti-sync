/**
 * Model Loader — loads the face-api.js networks once, from this app's own origin
 * (public/models), so inference never depends on a third-party CDN and the app
 * works offline. Reports a real status ('idle' | 'loading' | 'ready' | 'error')
 * that the UI shows, instead of silently degrading to a lower-quality path.
 */

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
export const MODEL_URL = `${BASE}models`;

let faceapiPromise = null;
let status = { state: 'idle', message: 'Models not loaded yet' };
const listeners = new Set();

function setStatus(state, message) {
  status = { state, message };
  listeners.forEach((cb) => {
    try { cb(status); } catch { /* listener errors must not break loading */ }
  });
}

export function getModelStatus() {
  return status;
}

/** Subscribe to status changes. Calls back immediately with the current status. */
export function onModelStatus(cb) {
  listeners.add(cb);
  cb(status);
  return () => listeners.delete(cb);
}

/**
 * Load (once) and return the face-api module. Safe to call from several places;
 * after a failure the next call retries.
 */
export function loadModels() {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      setStatus('loading', 'Loading emotion models…');
      try {
        const faceapi = await import('@vladmandic/face-api');
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        setStatus('ready', 'Local engine ready');
        return faceapi;
      } catch (err) {
        faceapiPromise = null;
        console.error('Emotion model load failed:', err);
        setStatus('error', 'Could not load emotion models');
        throw err;
      }
    })();
  }
  return faceapiPromise;
}
