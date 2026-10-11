import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('privacy / offline guarantees', () => {
  it('bundles every model file locally (manifests point at files that exist)', () => {
    const dir = path.join(root, 'public', 'models');
    const manifests = fs.readdirSync(dir).filter((f) => f.endsWith('-weights_manifest.json'));
    expect(manifests.length).toBeGreaterThanOrEqual(3);
    for (const m of manifests) {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, m), 'utf8'));
      for (const group of manifest) {
        for (const p of group.paths) {
          expect(fs.existsSync(path.join(dir, p)), `${p} referenced by ${m}`).toBe(true);
        }
      }
    }
  });

  it('has no third-party network URLs in the app source or HTML', () => {
    const files = [path.join(root, 'index.html'), ...walk(path.join(root, 'src')).filter((f) => /\.(js|css|html)$/.test(f))];
    const allowed = ['www.w3.org']; // SVG/XML namespaces are identifiers, not requests
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        if (!allowed.includes(match[1].toLowerCase())) offenders.push(`${path.relative(root, f)} → ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never sends camera data over the network', () => {
    const files = walk(path.join(root, 'src')).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
    }
  });
});
