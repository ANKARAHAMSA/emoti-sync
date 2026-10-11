/**
 * Icons — bundles only the Lucide icons the app uses, so no icon CDN is needed at runtime.
 * Exposes `window.lucide.createIcons()` for the existing UI code.
 */
import {
  createIcons,
  Activity, Aperture, Camera, Copy, Download, FileSearch, FolderOpen, Grid,
  Headphones, Image, Info, LineChart, Music, Pause, Play, PlayCircle, Power,
  RotateCcw, ScanFace, Sliders, Square, Trash2, UploadCloud, Video, VideoOff, X
} from 'lucide';

const icons = {
  Activity, Aperture, Camera, Copy, Download, FileSearch, FolderOpen, Grid,
  Headphones, Image, Info, LineChart, Music, Pause, Play, PlayCircle, Power,
  RotateCcw, ScanFace, Sliders, Square, Trash2, UploadCloud, Video, VideoOff, X
};

if (typeof window !== 'undefined') {
  window.lucide = { createIcons: () => createIcons({ icons }) };
}
