import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatApp from '../src/apps/chat/Chat.jsx';
import PageAgentPanel from '../src/apps/chat/PageAgentPanel.jsx';

const bridge = vi.hoisted(() => ({
  clearPageAgentToken: vi.fn(),
  executePageAgentTask: vi.fn(),
  hasPageAgentToken: vi.fn(),
  loadPageAgentConfig: vi.fn(),
  pageAgentExtensionStatus: vi.fn(),
  savePageAgentConfig: vi.fn(),
  savePageAgentToken: vi.fn(),
  stopPageAgentTask: vi.fn(),
}));

vi.mock('../src/apps/chat/pageAgentBridge.js', () => ({
  MAX_PAGE_AGENT_TASK_LENGTH: 4000,
  clearPageAgentToken: bridge.clearPageAgentToken,
  executePageAgentTask: bridge.executePageAgentTask,
  hasPageAgentToken: bridge.hasPageAgentToken,
  loadPageAgentConfig: bridge.loadPageAgentConfig,
  pageAgentExtensionStatus: bridge.pageAgentExtensionStatus,
  savePageAgentConfig: bridge.savePageAgentConfig,
  savePageAgentToken: bridge.savePageAgentToken,
  stopPageAgentTask: bridge.stopPageAgentTask,
}));

const byId = (container, id) => container.querySelector(`#${id}`);
const button = (container, label) =>
  [...container.querySelectorAll('button')].find((element) => element.textContent.trim() === label);

beforeEach(() => {
  localStorage.clear();
  bridge.clearPageAgentToken.mockReset();
  bridge.executePageAgentTask.mockReset();
  bridge.hasPageAgentToken.mockReset();
  bridge.loadPageAgentConfig.mockReset();
  bridge.pageAgentExtensionStatus.mockReset();
  bridge.savePageAgentConfig.mockReset();
  bridge.savePageAgentToken.mockReset();
  bridge.stopPageAgentTask.mockReset();

  bridge.loadPageAgentConfig.mockReturnValue({
    baseURL: 'https://provider.example/v1',
    model: 'test-model',
  });
  bridge.hasPageAgentToken.mockReturnValue(false);
  bridge.pageAgentExtensionStatus.mockReturnValue({ available: false, version: '' });
  bridge.savePageAgentConfig.mockImplementation((value) => value);
  bridge.savePageAgentToken.mockReturnValue(true);
  bridge.executePageAgentTask.mockResolvedValue({ success: true, data: 'Task completed.' });
  bridge.stopPageAgentTask.mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Page Agent panel', () => {
  it('explains the optional extension boundary when no extension is installed', () => {
    const { container } = render(<PageAgentPanel />);
    expect(container.querySelector('.pa-panel')).not.toBeNull();
    expect(container.querySelector('.pa-status').textContent).toBe('Extension unavailable');
    expect(container.textContent).toContain('cross-origin iframe contents');
    expect(container.textContent).toContain('normal browser windows');
    expect(button(container, 'Run browser task').disabled).toBe(true);
    expect(byId(container, 'pa-provider-url').value).toBe('https://provider.example/v1');
  });

  it('saves provider details without persisting the session API key', () => {
    const { container } = render(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-provider-url'), { target: { value: 'https://local-gateway.example/v1' } });
    fireEvent.change(byId(container, 'pa-provider-model'), { target: { value: 'qwen-local' } });
    fireEvent.change(byId(container, 'pa-provider-key'), { target: { value: 'ephemeral-secret' } });
    fireEvent.click(button(container, 'Save provider settings'));

    expect(bridge.savePageAgentConfig).toHaveBeenCalledWith({
      baseURL: 'https://local-gateway.example/v1',
      model: 'qwen-local',
    });
    expect(bridge.savePageAgentConfig.mock.calls[0][0]).not.toHaveProperty('apiKey');
    expect(container.textContent).toContain('API key remains in memory only');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports provider configuration failures', () => {
    bridge.savePageAgentConfig.mockImplementationOnce(() => { throw new Error('invalid endpoint'); });
    const { container } = render(<PageAgentPanel />);
    fireEvent.click(button(container, 'Save provider settings'));
    expect(container.querySelector('[role="alert"]').textContent).toBe('invalid endpoint');
  });

  it('saves extension authorization, refreshes status, and disconnects', () => {
    const { container } = render(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-extension-token'), { target: { value: 'copied-token' } });
    fireEvent.click(button(container, 'Save token'));
    expect(bridge.savePageAgentToken).toHaveBeenCalledWith('copied-token');
    expect(container.textContent).toContain('Extension token saved');

    bridge.hasPageAgentToken.mockReturnValue(true);
    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '1.2.3' });
    fireEvent.click(button(container, 'Refresh status'));
    expect(container.querySelector('.pa-status').textContent).toContain('1.2.3');
    expect(button(container, 'Disconnect').disabled).toBe(false);

    fireEvent.click(button(container, 'Disconnect'));
    expect(bridge.clearPageAgentToken).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('authorization removed');
    expect(container.querySelector('.pa-status').textContent).toBe('Extension unavailable');
  });

  it('reports invalid extension tokens and refreshes version fallback', () => {
    bridge.savePageAgentToken.mockImplementationOnce(() => { throw new Error('bad extension token'); });
    const { container } = render(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-extension-token'), { target: { value: 'bad-token' } });
    fireEvent.click(button(container, 'Save token'));
    expect(container.querySelector('[role="alert"]').textContent).toBe('bad extension token');

    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '' });
    bridge.hasPageAgentToken.mockReturnValue(true);
    fireEvent.click(button(container, 'Refresh status'));
    expect(container.querySelector('.pa-status').textContent).toBe('Connected · Page Agent');
  });

  it('runs an explicitly consented task and renders bounded activity history', async () => {
    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '2.0' });
    bridge.executePageAgentTask.mockImplementation(async (task, options) => {
      options.onStatusChange('thinking');
      [
        {},
        { type: 'executing', tool: 'click' },
        { type: 'executed', tool: 'click' },
        { type: 'executing' },
        { type: 'retrying' },
        { type: 'thinking' },
        { type: 'error' },
        { type: 'other' },
        null,
      ].forEach((item) => options.onActivity(item));
      return { success: true, data: 'The page task finished.' };
    });

    const { container } = render(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-task'), { target: { value: 'Summarize this page' } });
    fireEvent.click(byId(container, 'pa-agent-consent'));
    const run = button(container, 'Run browser task');
    expect(run.disabled).toBe(false);

    await act(async () => { fireEvent.click(run); });

    expect(bridge.executePageAgentTask).toHaveBeenCalledOnce();
    expect(bridge.executePageAgentTask.mock.calls[0][0]).toBe('Summarize this page');
    expect(bridge.executePageAgentTask.mock.calls[0][1]).toMatchObject({
      baseURL: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: '',
    });
    expect(container.textContent).toContain('Result · completed');
    expect(container.textContent).toContain('The page task finished.');
    expect(container.querySelectorAll('.pa-activity p')).toHaveLength(8);
    expect(container.textContent).toContain('Running: click');
    expect(container.textContent).toContain('Completed: click');
    expect(container.textContent).toContain('Running: browser action');
    expect(container.textContent).toContain('Retrying provider request');
    expect(container.textContent).toContain('Agent reported an error');
    expect(container.textContent).toContain('Agent activity');
    expect(byId(container, 'pa-agent-consent').checked).toBe(false);
  });

  it('renders the unsuccessful/no-result outcome', async () => {
    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '2.0' });
    bridge.executePageAgentTask.mockResolvedValue({ success: false });
    const { container } = render(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-task'), { target: { value: 'Check the current tab' } });
    fireEvent.click(byId(container, 'pa-agent-consent'));
    await act(async () => { fireEvent.click(button(container, 'Run browser task')); });
    expect(container.textContent).toContain('Result · error');
    expect(container.textContent).toContain('The agent returned no text result.');
  });

  it('reports provider task failures, including failures without a message', async () => {
    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '2.0' });
    bridge.executePageAgentTask.mockRejectedValueOnce(new Error('provider unavailable'));
    const { container, rerender } = render(<PageAgentPanel />);

    fireEvent.change(byId(container, 'pa-task'), { target: { value: 'Read this article' } });
    fireEvent.click(byId(container, 'pa-agent-consent'));
    await act(async () => { fireEvent.click(button(container, 'Run browser task')); });
    expect(container.querySelector('[role="alert"]').textContent).toBe('provider unavailable');

    bridge.executePageAgentTask.mockRejectedValueOnce({});
    rerender(<PageAgentPanel />);
    fireEvent.change(byId(container, 'pa-task'), { target: { value: 'Try again' } });
    fireEvent.click(byId(container, 'pa-agent-consent'));
    await act(async () => { fireEvent.click(button(container, 'Run browser task')); });
    expect(container.querySelector('[role="alert"]').textContent).toBe('The browser task failed.');
  });

  it('allows the user to stop an active task even when the extension stop call throws', async () => {
    bridge.pageAgentExtensionStatus.mockReturnValue({ available: true, version: '2.0' });
    bridge.executePageAgentTask.mockImplementation(() => new Promise(() => {}));
    bridge.stopPageAgentTask.mockImplementationOnce(() => { throw new Error('extension disconnected'); });
    const { container } = render(<PageAgentPanel />);

    fireEvent.change(byId(container, 'pa-task'), { target: { value: 'Do a browser task' } });
    fireEvent.click(byId(container, 'pa-agent-consent'));
    await act(async () => { fireEvent.click(button(container, 'Run browser task')); });
    expect(button(container, 'Stop task')).not.toBeUndefined();

    fireEvent.click(button(container, 'Stop task'));
    expect(bridge.stopPageAgentTask).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Result · stopped');
  });

  it('disables the browser agent in an installed PWA window', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { container } = render(<PageAgentPanel />);
    expect(container.textContent).toContain('does not support PWA app windows');
    expect(byId(container, 'pa-task').disabled).toBe(true);
    expect(button(container, 'Run browser task').disabled).toBe(true);
    window.matchMedia = original;
  });

  it('handles standalone detection failures without enabling unsupported features', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => { throw new Error('unsupported'); });
    const { container } = render(<PageAgentPanel />);
    expect(container.querySelector('.pa-panel')).not.toBeNull();
    expect(byId(container, 'pa-task').disabled).toBe(false);
    window.matchMedia = original;
  });
});

describe('AI Workspace integration', () => {
  it('switches between Chat and the Browser Agent without showing chat-only controls', () => {
    const { container } = render(<ChatApp />);
    expect(container.querySelector('.c-thread')).not.toBeNull();
    expect(button(container, 'Clear')).toBeDefined();

    fireEvent.click(button(container, 'Browser Agent'));
    expect(container.querySelector('.pa-panel')).not.toBeNull();
    expect(container.querySelector('.c-thread')).toBeNull();
    expect(button(container, 'Clear')).toBeUndefined();
    expect(container.querySelector('.c-state').textContent).toBe('Page Agent');

    fireEvent.click(button(container, 'Chat'));
    expect(container.querySelector('.c-thread')).not.toBeNull();
    expect(container.querySelector('.pa-panel')).toBeNull();
  });
});
