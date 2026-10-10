// Photos plugin manifest (data only; see apps/components.js).
export default {
  id: 'photos',
  singleInstance: false, // each file opens its own viewer window
  category: 'Media',
  name: 'Photos',
  tagline: 'Image viewer & quick edits',
  version: '1.0',
  icon: 'icons/photos.svg',
  accent: '#fbbf24',
  win: { w: 900, h: 640 },
};
