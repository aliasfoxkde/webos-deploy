// ErrorBoundary containment. React's default on an uncaught render throw is
// to unmount the ENTIRE tree — the "clicked an app and the whole desktop
// went blank" defect (rejected lazy import: a stale cached shell asking for
// a hashed chunk the deploy deleted). These tests pin the contract: a crash
// renders a recovery card, sibling subtrees keep running, the root never
// blanks, and soft (window-tier) boundaries can close just the broken app.
import React, { Suspense, lazy } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import ErrorBoundary, { HardBoundary } from '../src/shell/ErrorBoundary.jsx';

afterEach(cleanup);

const Boom = () => { throw new Error('kaboom in render'); };
const OK = () => <span data-testid="sibling">alive</span>;

describe('ErrorBoundary', () => {
  it('renders children untouched while healthy', () => {
    const c = render(<ErrorBoundary><OK /></ErrorBoundary>);
    expect(c.queryByTestId('sibling')).toBeTruthy();
    expect(c.queryByRole('alert')).toBeNull();
  });

  it('a throwing child becomes a recovery card; siblings survive', () => {
    const c = render(
      <div>
        <ErrorBoundary><Boom /></ErrorBoundary>
        <OK />
      </div>,
    );
    const alert = c.getByRole('alert');
    expect(alert.textContent).toContain('Something went wrong');
    expect(alert.textContent).toContain('kaboom in render');
    expect(alert.textContent).not.toContain('stale cached page'); // generic path
    expect(c.getByTestId('sibling')).toBeTruthy();
  });

  it('soft tier: labelled card, Close dismisses just this window', () => {
    const onClose = vi.fn();
    const c = render(
      <ErrorBoundary soft label="Browser" onClose={onClose}><Boom /></ErrorBoundary>,
    );
    expect(c.getByRole('alert').textContent).toContain('Browser can’t start');
    fireEvent.click(c.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(c.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });

  it('root tier (HardBoundary): card names WebOS and offers no Close', () => {
    const c = render(<HardBoundary><Boom /></HardBoundary>);
    expect(c.getByRole('alert').textContent).toContain('WebOS');
    expect(c.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('rejected lazy import (stale-shell chunk 404) is contained', async () => {
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: http://x/assets/BrowserApp-ABC.js',
    );
    const Broken = lazy(() => Promise.reject(chunkError));
    const c = render(
      <div>
        <ErrorBoundary soft label="Browser" onClose={() => {}}>
          <Suspense fallback="loading"><Broken /></Suspense>
        </ErrorBoundary>
        <OK />
      </div>,
    );
    // the rejection surfaces on a later render pass — flush until it lands
    for (let i = 0; i < 6 && !c.queryByRole('alert'); i++) {
      // bounded flush of the lazy rejection
      await act(async () => { await Promise.resolve(); });
    }
    const alert = c.getByRole('alert');
    expect(alert.textContent).toContain('Browser can’t start');
    expect(alert.textContent).toContain('stale cached page'); // chunk-specific guidance
    expect(c.getByTestId('sibling')).toBeTruthy(); // the desktop survives
  });
});
