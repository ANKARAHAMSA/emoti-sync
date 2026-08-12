/**
 * Main Application Entry Point — Initializes Lucide icons & boots EmotiSync UI Orchestrator.
 */

import { uiController } from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Initialize UI Controller
  uiController.init();
  console.log('🚀 EmotiSync Realtime Face Emotion Engine initialized.');
});
