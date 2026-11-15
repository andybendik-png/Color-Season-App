// Copies the MediaPipe WASM runtime into public/ so it is served from this origin (offline-capable).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm', dst = 'public/mediapipe-wasm';
if (existsSync(src)) { mkdirSync(dst, { recursive: true }); cpSync(src, dst, { recursive: true }); console.log('copied mediapipe wasm'); }
if (!existsSync('public/models/face_landmarker.task')) console.warn('NOTE: public/models/face_landmarker.task missing; automatic face finding will fall back to manual points. CI downloads it.');
