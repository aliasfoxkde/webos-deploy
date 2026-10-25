// Direct unit coverage for the real adapters module. chat-branches.test.jsx
// mocks it out (to inject fake streaming adapters), which leaves the echo
// adapter's run() generator never executed — here it runs for real.
import { describe, it, expect } from 'vitest';
import { ADAPTERS, adapterById } from '../src/apps/chat/adapters.js';

describe('chat/adapters.js', () => {
  it('registers the echo adapter as not ready', () => {
    expect(ADAPTERS).toHaveLength(1);
    expect(ADAPTERS[0].id).toBe('echo');
    expect(adapterById('echo').ready()).toBe(false);
  });

  it('falls back to the echo adapter for unknown ids', () => {
    expect(adapterById('no-such-model')).toBe(adapterById('echo'));
  });

  it('echo.run() yields the honest not-configured message', async () => {
    const adapter = adapterById('echo');
    const chunks = [];
    for await (const chunk of adapter.run([], { signal: undefined })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatch(/No AI model is configured/);
    expect(chunks[0]).toContain('src/apps/chat/adapters.js');
  });
});
