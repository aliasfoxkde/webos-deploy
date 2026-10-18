// Settings shell edge cases: deep-link retargeting, nav clicks.
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import Settings from '../src/shell/Settings.jsx';

const mount = (args = {}) => {
  const c = render(<OSProvider><Settings args={args} /></OSProvider>);
  const heading = () => c.container.querySelector('h2');
  const btn = (name) => [...c.container.querySelectorAll('button')].find((b) => b.textContent.includes(name));
  return { ...c, heading, btn };
};

describe('Settings shell — edge cases', () => {
  it('deep-links to a named section on mount', () => {
    const { heading } = mount({ initial: 'about' });
    expect(heading().textContent).toBe('About');
  });

  it('retargets when args.initial changes after mount', () => {
    const { rerender, heading } = mount({ initial: 'appearance' });
    expect(heading().textContent).toBe('Appearance');
    rerender(<OSProvider><Settings args={{ initial: 'about' }} /></OSProvider>);
    expect(heading().textContent).toBe('About');
  });

  it('ignores an unknown section and stays on current', () => {
    const { rerender, heading } = mount({ initial: 'appearance' });
    rerender(<OSProvider><Settings args={{ initial: 'no-such-section' }} /></OSProvider>);
    expect(heading().textContent).toBe('Appearance');
  });

  it('clicking a nav button changes the active section', () => {
    const { btn, heading } = mount({ initial: 'appearance' });
    fireEvent.click(btn('Desktop'));
    expect(heading().textContent).toBe('Desktop');
  });
});
