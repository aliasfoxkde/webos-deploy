import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_AGENT_STORAGE_SLOT, clearPageAgentToken, executePageAgentTask,
  hasPageAgentToken, loadPageAgentConfig, normalizeProviderBaseURL,
  pageAgentExtensionStatus, savePageAgentConfig, savePageAgentToken, stopPageAgentTask,
} from '../src/apps/chat/pageAgentBridge.js';

beforeEach(() => localStorage.clear());

describe('Page Agent provider configuration', () => {
  it('normalizes endpoints and stores only model/base URL', () => {
    expect(normalizeProviderBaseURL(' https://api.example.com/v1/ ')).toBe('https://api.example.com/v1');
    const config = savePageAgentConfig({ baseURL: 'http://localhost:11434/v1/', model: 'qwen3:14b', apiKey: 'do-not-store' });
    expect(config).toEqual({ baseURL: 'http://localhost:11434/v1', model: 'qwen3:14b' });
    expect(loadPageAgentConfig()).toEqual(config);
    expect(localStorage.getItem('webos.pageAgent.config')).not.toContain('apiKey');
    expect(localStorage.getItem('webos.pageAgent.config')).not.toContain('do-not-store');
  });
  it.each(['ftp://provider.example/v1','javascript:alert(1)','https://user:pass@provider.example/v1','https://provider.example/v1?key=secret'])(
    'rejects unsafe provider URL %s', (baseURL) => expect(() => normalizeProviderBaseURL(baseURL)).toThrow()
  );
  it('requires a model identifier', () => {
    expect(() => savePageAgentConfig({ baseURL: 'https://api.example.com/v1', model: ' ' })).toThrow(/model/i);
  });
  it('falls back when stored JSON or stored field types are malformed', () => {
    localStorage.setItem('webos.pageAgent.config', '{');
    expect(loadPageAgentConfig()).toEqual({ baseURL: '', model: '' });
    localStorage.setItem('webos.pageAgent.config', JSON.stringify({ baseURL: 42, model: null }));
    expect(loadPageAgentConfig()).toEqual({ baseURL: '', model: '' });
  });
});
describe('Page Agent extension authorization', () => {
  it('stores the user-copied token under the official key and disconnects', () => {
    expect(hasPageAgentToken()).toBe(false);
    savePageAgentToken(' user-approved-token ');
    expect(localStorage.getItem(PAGE_AGENT_STORAGE_SLOT)).toBe('user-approved-token');
    expect(hasPageAgentToken()).toBe(true);
    clearPageAgentToken();
    expect(hasPageAgentToken()).toBe(false);
  });
  it('detects the official API and uses its version when the global version is absent', () => {
    expect(pageAgentExtensionStatus({})).toEqual({ available: false, version: '' });
    expect(pageAgentExtensionStatus({ PAGE_AGENT_EXT: { execute: vi.fn() } })).toEqual({ available: false, version: '' });
    expect(pageAgentExtensionStatus({ PAGE_AGENT_EXT: { execute: vi.fn(), stop: vi.fn(), version: 'api-version' } }))
      .toEqual({ available: true, version: 'api-version' });
    expect(pageAgentExtensionStatus({ PAGE_AGENT_EXT_VERSION: '1.2.3', PAGE_AGENT_EXT: { execute: vi.fn(), stop: vi.fn() } }))
      .toEqual({ available: true, version: '1.2.3' });
  });

  it('rejects empty extension tokens and propagates storage write errors', () => {
    expect(() => savePageAgentToken('  ')).toThrow(/authorization token/i);
    const brokenStorage = { setItem: () => { throw new Error('quota'); } };
    expect(() => savePageAgentToken('token', brokenStorage)).toThrow('quota');
  });

  it('handles unavailable storage when checking or clearing tokens', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(hasPageAgentToken(brokenStorage)).toBe(false);
    expect(() => clearPageAgentToken(brokenStorage)).not.toThrow();
  });
  it('excludes the WebOS shell tab and disables all-tabs access', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, data: 'Done', history: [] });
    const result = await executePageAgentTask('Research WASM', {
      baseURL: 'https://api.example.com/v1', model: 'local-model', apiKey: 'ephemeral',
    }, { PAGE_AGENT_EXT: { execute, stop: vi.fn() } });
    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith('Research WASM', expect.objectContaining({
      baseURL: 'https://api.example.com/v1', model: 'local-model', apiKey: 'ephemeral',
      includeInitialTab: false, experimentalIncludeAllTabs: false,
    }));
  });
  it('rejects empty/oversized tasks, missing models, and missing extension', async () => {
    const config = { baseURL: 'https://api.example.com/v1', model: 'm' };
    await expect(executePageAgentTask(' ', config, {})).rejects.toThrow(/describe/i);
    await expect(executePageAgentTask('x'.repeat(4001), config, {})).rejects.toThrow(/4,000/i);
    await expect(executePageAgentTask('Run task', { ...config, model: ' ' }, {})).rejects.toThrow(/model/i);
    await expect(executePageAgentTask('Run task', config, {})).rejects.toThrow(/not connected/i);
  });

  it('omits the API key when absent and invokes the extension with its own receiver', async () => {
    const extension = {
      execute: vi.fn(function execute() {
        expect(this).toBe(extension);
        return Promise.resolve({ success: true });
      }),
      stop: vi.fn(),
    };
    await executePageAgentTask('Read a page', {
      baseURL: 'https://api.example.com/v1', model: 'model-id',
    }, { PAGE_AGENT_EXT: extension });
    const options = extension.execute.mock.calls[0][1];
    expect(options).not.toHaveProperty('apiKey');
    expect(options.includeInitialTab).toBe(false);
    expect(options.experimentalIncludeAllTabs).toBe(false);
  });
  it('stops a running extension task', () => {
    const stop = vi.fn();
    stopPageAgentTask({ PAGE_AGENT_EXT: { execute: vi.fn(), stop } });
    expect(stop).toHaveBeenCalledOnce();
  });
});
