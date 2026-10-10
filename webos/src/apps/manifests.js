// Plugin manifests (data only, no React) — imported by the OS registry.
// Adding a bundled app: create apps/<name>/ with a manifest.js (+ component),
// then list it here and in apps/components.js.
import terminal from './terminal/manifest.js';
import video from './video/manifest.js';
import calc from './calculator/manifest.js';
import editor from './editor/manifest.js';
import weather from './weather/manifest.js';
import files from './files/manifest.js';
import chat from './chat/manifest.js';
import photos from './photos/manifest.js';
import notepad from './notepad/manifest.js';
import taskmgr from './taskmgr/manifest.js';

export const PLUGIN_APPS = [terminal, video, calc, editor, weather, files, chat, photos, notepad, taskmgr];
