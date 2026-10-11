// BrowserApp shell: tab strip lifecycle, address-bar navigation, per-host
// mode overrides, and the Chromium keyboard model (capture-phase shortcuts).
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import BrowserApp from '../src/apps/browser/BrowserApp.jsx';

const mount = (args) => render(<BrowserApp args={args} />);

const key = (el, opts) => act(() => {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts }));
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

const tabs = (c) => c.container.querySelectorAll('.bw-tab');
const activeTab = (c) => c.container.querySelector('.bw-tab.active .bw-tab-title')?.textContent;
const iframeSrcs = (c) => [...c.container.querySelectorAll('iframe.bw-frame')].map((f) => f.getAttribute('src'));

describe('tab strip', () => {
  it('starts on the new-tab page; + opens tabs; × closes and fixes focus', () => {
    const c = mount();
    expect(c.container.querySelector('.bw-home')).toBeTruthy();
    expect(tabs(c)).toHaveLength(1);
    fireEvent.click(c.container.querySelector('.bw-newtab'));
    expect(tabs(c)).toHaveLength(2);
    expect(activeTab(c)).toBe('New tab');
    // navigate the second tab so it has a title
    const input = c.container.querySelector('.bw-address input');
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(c.container.querySelector('.bw-address-form'));
    expect(activeTab(c)).toBe('example.com');
    // switch back to tab 1, then close tab 2 while tab 1 is focused
    fireEvent.click(tabs(c)[0]);
    expect(activeTab(c)).toBe('New tab');
    fireEvent.click(c.container.querySelector('.bw-tab:nth-child(2) .bw-tab-close'));
    expect(tabs(c)).toHaveLength(1);
    expect(activeTab(c)).toBe('New tab');
  });

  it('closing the last tab hands back a fresh new-tab page', () => {
    const c = mount({ url: 'https://example.com/' });
    expect(activeTab(c)).toBe('example.com');
    fireEvent.click(c.container.querySelector('.bw-tab-close'));
    expect(tabs(c)).toHaveLength(1);
    expect(c.container.querySelector('.bw-home')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('address bar resolves through classify: embed for YouTube, proxy for search', () => {
    const c = mount();
    const input = c.container.querySelector('.bw-address input');
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=abc12345678' } });
    fireEvent.submit(c.container.querySelector('.bw-address-form'));
    expect(iframeSrcs(c)).toEqual(['https://www.youtube-nocookie.com/embed/abc12345678']);
    expect(c.container.querySelector('.bw-shield').textContent).toContain('Embed');

    fireEvent.change(input, { target: { value: 'tabby cats' } });
    fireEvent.submit(c.container.querySelector('.bw-address-form'));
    expect(iframeSrcs(c)[0]).toContain('/proxy?url=');
    expect(c.container.querySelector('.bw-shield').textContent).toContain('Proxy');
  });

  it('external sites render the honest hand-off with the real reason', () => {
    const c = mount({ url: 'https://discord.com/app' });
    expect(c.container.querySelectorAll('iframe')).toHaveLength(0);
    const page = c.container.querySelector('.bw-external');
    expect(page.textContent).toMatch(/CORS/);
    expect(page.textContent).toContain('discord.com');
  });

  it('back/forward move through history and the shield flips proxy↔direct in place', () => {
    const c = mount();
    const input = c.container.querySelector('.bw-address input');
    const form = c.container.querySelector('.bw-address-form');
    fireEvent.change(input, { target: { value: 'news.ycombinator.com' } });
    fireEvent.submit(form);
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(form);
    const back = c.container.querySelector('button[aria-label="Back"]');
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    expect(iframeSrcs(c)).toEqual(['https://news.ycombinator.com/']);
    // flip the shield: same entry re-rendered through the proxy
    fireEvent.click(c.container.querySelector('.bw-shield'));
    expect(iframeSrcs(c)[0]).toContain('/proxy?url=');
    // …and the choice sticks for the host on a later navigation
    fireEvent.change(input, { target: { value: 'news.ycombinator.com/next' } });
    fireEvent.submit(form);
    expect(iframeSrcs(c)[0]).toContain('/proxy?url=');
    expect(JSON.parse(localStorage.getItem('webos.browser.modes'))['news.ycombinator.com']).toBe('proxy');
  });

  it('persists the session and restores it on remount', () => {
    const c = mount();
    const input = c.container.querySelector('.bw-address input');
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(c.container.querySelector('.bw-address-form'));
    cleanup();
    const c2 = mount();
    expect(activeTab(c2)).toBe('example.com');
    expect(iframeSrcs(c2)).toEqual(['https://example.com/']);
  });

  it('deep links (args.url) land on a resolved tab', () => {
    const c = mount({ url: 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3' });
    expect(activeTab(c)).toBe('open.spotify.com');
    expect(iframeSrcs(c)).toEqual(['https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3']);
  });
});

describe('keyboard model', () => {
  it('Ctrl+T / Ctrl+W manage tabs; Ctrl+L focuses the address bar', () => {
    const c = mount();
    const root = c.container.querySelector('.bw');
    key(root, { ctrlKey: true, key: 't' });
    expect(tabs(c)).toHaveLength(2);
    key(root, { ctrlKey: true, key: 'w' });
    expect(tabs(c)).toHaveLength(1);
    key(root, { ctrlKey: true, key: 'l' });
    expect(document.activeElement).toBe(c.container.querySelector('.bw-address input'));
  });

  it('Ctrl+W keeps the window alive at one tab; F5 and Alt+arrows are handled', () => {
    const c = mount();
    const root = c.container.querySelector('.bw');
    key(root, { ctrlKey: true, key: 'w' });
    expect(tabs(c)).toHaveLength(1); // no close on last tab
    expect(() => {
      key(root, { key: 'F5' });
      key(root, { altKey: true, key: 'ArrowLeft' });
      key(root, { altKey: true, key: 'ArrowRight' });
      key(root, { ctrlKey: true, shiftKey: true, key: 'Tab' });
    }).not.toThrow();
  });
});
