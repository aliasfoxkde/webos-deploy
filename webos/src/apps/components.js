// React components for bundled plugin apps, keyed by app id. Kept separate
// from manifests.js so the registry can import app DATA without pulling the
// component graph (and without import cycles through os/state.jsx).
//
// All plugins are lazy: each becomes its own chunk, fetched on first launch
// (Window.jsx wraps plugin renders in <Suspense>), so heavyweight deps like
// CodeMirror stay out of the shell bundle.
import { lazy } from 'react';

export const APP_COMPONENTS = {
  terminal: lazy(() => import('./terminal/Terminal.jsx')),
  video: lazy(() => import('./video/VideoApp.jsx')),
  calc: lazy(() => import('./calculator/Calculator.jsx')),
  editor: lazy(() => import('./editor/Editor.jsx')),
  weather: lazy(() => import('./weather/WeatherApp.jsx')),
  files: lazy(() => import('./files/Files.jsx')),
  chat: lazy(() => import('./chat/Chat.jsx')),
  photos: lazy(() => import('./photos/Photos.jsx')),
  notepad: lazy(() => import('./notepad/Notepad.jsx')),
};
