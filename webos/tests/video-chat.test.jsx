// VideoApp (YouTube link → embed URL) and the AI Chat app over its shared
// history store. The echo adapter is the honest no-model default; the store's
// cap/event surface is tested directly.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import VideoApp from '../src/apps/video/VideoApp.jsx';
import ChatApp from '../src/apps/chat/Chat.jsx';
import { loadHistory, saveHistory, clearHistory, onHistory } from '../src/apps/chat/store.js';

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  vi.stubGlobal('fetch', () => new Promise(() => {})); // iframes must stay hermetic
});

afterEach(() => vi.unstubAllGlobals());

const typeChat = (text) => fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: text } });

describe('VideoApp', () => {
  const paste = async (text) => {
    fireEvent.change(screen.getByPlaceholderText(/youtube\.com\/watch/), { target: { value: text } });
    fireEvent.submit(screen.getByPlaceholderText(/youtube\.com\/watch/).closest('form'));
    await act(async () => {});
  };

  it('renders the honest home view with presets', () => {
    render(<VideoApp />);
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText(/itself can.t be embedded/)).toBeTruthy(); // /embed/ is a <code> child
    expect(screen.getByText(/Lofi Girl/)).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull(); // nothing plays until asked
  });

  it('converts watch URLs, bare IDs and short links to embed iframes', async () => {
    render(<VideoApp />);
    await paste('https://www.youtube.com/watch?v=jfKfPfyJRdk&t=30s');
    expect(document.querySelector('iframe').src).toBe('https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1');

    cleanup();
    render(<VideoApp />);
    await paste('dQw4w9WgXcQ');
    expect(document.querySelector('iframe').src).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1');

    cleanup();
    render(<VideoApp />);
    await paste('https://youtu.be/jfKfPfyJRdk');
    expect(document.querySelector('iframe').src).toContain('/embed/jfKfPfyJRdk');

    cleanup();
    render(<VideoApp />);
    await paste('https://www.youtube.com/shorts/abcdefghijk');
    expect(document.querySelector('iframe').src).toContain('/embed/abcdefghijk');
  });

  it('playlists become videoseries embeds', async () => {
    render(<VideoApp />);
    await paste('https://www.youtube.com/playlist?list=PL1234567890a');
    expect(document.querySelector('iframe').src).toBe('https://www.youtube.com/embed/videoseries?list=PL1234567890a');
  });

  it('garbage input does not navigate away from home', async () => {
    render(<VideoApp />);
    await paste('not a youtube link');
    expect(document.querySelector('iframe')).toBeNull();
    await paste('');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('the preset button plays immediately', async () => {
    render(<VideoApp />);
    fireEvent.click(screen.getByText(/Lofi Girl/));
    await act(async () => {});
    expect(document.querySelector('iframe').src).toContain('/embed/jfKfPfyJRdk');
    expect(screen.getByTitle('video player')).toBeTruthy();
  });
});

describe('chat history store', () => {
  it('persists capped at 100 messages and clears cleanly', () => {
    const msgs = Array.from({ length: 105 }, (_, i) => ({ id: `m${i}`, role: 'user', text: String(i) }));
    saveHistory(msgs);
    const loaded = loadHistory();
    expect(loaded).toHaveLength(100);
    expect(loaded[0].text).toBe('5'); // oldest fell off the front
    expect(loaded[99].text).toBe('104');

    let fired = 0;
    const off = onHistory(() => { fired += 1; });
    clearHistory();
    expect(loadHistory()).toEqual([]);
    expect(fired).toBe(1);
    off();
    clearHistory();
    expect(fired).toBe(1); // unsubscribed
  });

  it('corrupt or absent history reads as empty', () => {
    expect(loadHistory()).toEqual([]);
    localStorage.setItem('webos.chat.history', '!!!');
    expect(loadHistory()).toEqual([]);
    localStorage.setItem('webos.chat.history', '{"not":"an array"}');
    expect(loadHistory()).toEqual([]);
  });
});

describe('ChatApp', () => {
  it('introduces itself honestly: no model, local-only storage', () => {
    render(<ChatApp />);
    expect(screen.getByText('No model configured')).toBeTruthy();
    expect(screen.getByText(/No model is configured yet/)).toBeTruthy();
    expect(screen.getByText(/replies are honest placeholders/)).toBeTruthy();
  });

  it('sends a message and streams the adapter reply into the thread', async () => {
    render(<ChatApp />);
    typeChat('hello there');
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    // the adapter streams async — wait for the reply, don't race it
    expect(await screen.findByText(/No AI model is configured yet/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem('webos.chat.history'));
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(screen.queryByText('…')).toBeNull(); // typing indicator is gone
    expect(screen.getByText('Send')).toBeTruthy(); // busy state released
  });

  it('Enter sends; Shift+Enter and blank drafts do not', async () => {
    render(<ChatApp />);
    const box = screen.getByLabelText('Chat message');
    expect(screen.getByText('Send').disabled).toBe(true); // nothing to send

    typeChat('line one');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    await act(async () => {});
    expect(loadHistory()).toEqual([]); // newline inserted, nothing sent
    expect(box.value).toBe('line one');

    fireEvent.keyDown(box, { key: 'Enter' });
    await screen.findByText('line one');
    await screen.findByText(/No AI model is configured yet/); // both turns saved
    expect(loadHistory()).toHaveLength(2); // user + assistant
  });

  it('Clear wipes the thread only after the user confirms', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<ChatApp />);
    typeChat('keep me');
    fireEvent.click(screen.getByText('Send'));
    await screen.findByText('keep me');
    await screen.findByText(/No AI model is configured yet/); // let the turn finish

    expect(screen.getByText('Clear').disabled).toBe(false);
    fireEvent.click(screen.getByText('Clear'));
    expect(confirm).toHaveBeenCalledWith('Clear the whole conversation?');
    expect(screen.getByText('keep me')).toBeTruthy(); // declined → kept

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('Clear'));
    expect(await screen.findByText(/Say something to get started/)).toBeTruthy();
    expect(loadHistory()).toEqual([]);
    expect(screen.getByText('Clear').disabled).toBe(true); // nothing left to clear

    vi.unstubAllGlobals();
  });
});
