// Window → FireCraft export-to-Files handoff.
//
// FireCraft asks the shell for a PNG export (an `exportPng` bridge message).
// The window turns that into a Save dialog; confirming writes the PNG into
// the WebOS disk under /Apps/firecraft/exports and hands it to Photos.
//
// EmbedFrame is replaced by a stub here: the real one is covered on its own
// in shell-window.test.jsx, and all this spec needs is a way to fire the
// export request the way the bridge does.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ putFile: vi.fn() }));

vi.mock('../src/os/db.js', () => ({ filePut: (...a) => h.putFile(...a) }));

vi.mock('../src/shell/EmbedFrame.jsx', () => ({
  default: ({ onExportRequest }) => (
    <button type="button" onClick={() => onExportRequest(new Uint8Array([1, 2, 3]).buffer)}>
      request export
    </button>
  ),
}));

import { OSProvider, useOS } from '../src/os/state.jsx';
import Window from '../src/shell/Window.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};

const WIN = {
  id: 1,
  appId: 'firecraft',
  args: undefined,
  rect: { x: 20, y: 20, w: 900, h: 600 },
  z: 1,
  min: false,
  max: false,
};

const mount = () => render(
  <OSProvider>
    <Probe />
    <Window win={WIN} />
  </OSProvider>,
);

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  h.putFile.mockClear();
  h.putFile.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const saveBtn = () => [...screen.getAllByRole('button')].find((b) => b.textContent === 'Save');

describe('Window — FireCraft export-to-Files', () => {
  it('opens a Save dialog when the app requests an export', async () => {
    mount();
    fireEvent.click(screen.getByText('request export'));
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Save as' })).toBeTruthy();
    expect(screen.getByText('/Apps/firecraft/exports')).toBeTruthy();
    expect(screen.getByText('Save PNG as')).toBeTruthy();
    expect(screen.getByDisplayValue(/^firecraft-export-\d+\.png$/)).toBeTruthy();
  });

  it('writes the PNG into the WebOS disk and hands it to Photos on save', async () => {
    mount();
    fireEvent.click(screen.getByText('request export'));
    await act(async () => {});
    const input = screen.getByDisplayValue(/^firecraft-export-\d+\.png$/);
    fireEvent.change(input, { target: { value: 'my-design.png' } });
    fireEvent.click(saveBtn());
    await act(async () => {});
    expect(h.putFile).toHaveBeenCalledTimes(1);
    const [path, blob, type] = h.putFile.mock.calls[0];
    expect(path).toBe('/Apps/firecraft/exports/my-design.png');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(type).toBe('image/png');
    expect(cur.windows[0]?.appId).toBe('photos');
    expect(cur.windows[0]?.args?.path).toBe('/Apps/firecraft/exports/my-design.png');
    // The dialog closes once the export is handed off.
    expect(screen.queryByRole('dialog', { name: 'Save as' })).toBeNull();
  });

  it('closes the dialog without writing anything when the export is cancelled', async () => {
    mount();
    fireEvent.click(screen.getByText('request export'));
    await act(async () => {});
    const cancel = [...screen.getAllByRole('button')].find((b) => b.textContent === 'Cancel');
    fireEvent.click(cancel);
    await act(async () => {});
    expect(h.putFile).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Save as' })).toBeNull();
    expect(cur.windows).toHaveLength(0);
  });

  it('keeps the export silent when the disk write fails', async () => {
    h.putFile.mockRejectedValue(new Error('disk full'));
    mount();
    fireEvent.click(screen.getByText('request export'));
    await act(async () => {});
    fireEvent.click(saveBtn());
    await act(async () => {});
    expect(h.putFile).toHaveBeenCalledTimes(1);
    expect(cur.windows).toHaveLength(0); // no Photos hand-off after a failed write
    expect(screen.queryByRole('dialog', { name: 'Save as' })).toBeNull();
  });
});
