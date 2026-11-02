import { describe, it, expect } from 'vitest';
import { addSource, removeSource, toggleSource, paintOrder, stopAll, nextSourceId } from '../src/apps/cast/scene.js';

const src = (id, z, visible = true, stream = null) => ({ id, label: id, kind: 'screen', z, visible, stream });

describe('addSource', () => {
  it('appends with the next z and visible=true', () => {
    const next = addSource([src('a', 0)], { id: 'b' });
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: 'b', visible: true, z: 1 });
  });
  it('does not mutate the input', () => {
    const prev = [src('a', 0)];
    addSource(prev, { id: 'b' });
    expect(prev).toHaveLength(1);
  });
});

describe('removeSource', () => {
  it('removes and reindexes z', () => {
    const s = [src('a', 0), src('b', 1), src('c', 2)];
    const next = removeSource(s, 'b');
    expect(next.map((x) => x.id)).toEqual(['a', 'c']);
    expect(next.map((x) => x.z)).toEqual([0, 1]);
  });
});

describe('toggleSource', () => {
  it('flips only the target', () => {
    const s = [src('a', 0), src('b', 1)];
    const next = toggleSource(s, 'a');
    expect(next[0].visible).toBe(false);
    expect(next[1].visible).toBe(true);
  });
});

describe('paintOrder', () => {
  it('filters hidden and sorts by z', () => {
    const s = [src('a', 2, false), src('b', 0), src('c', 1)];
    expect(paintOrder(s).map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('stopAll', () => {
  it('stops every track and survives null streams', () => {
    const stopped = [];
    const stream = { getTracks: () => [{ stop: () => stopped.push('t1') }] };
    stopAll([src('a', 0, true, stream), src('b', 1, true, null), { id: 'c', stream: null }]);
    expect(stopped).toEqual(['t1']);
  });
  it('swallows a throwing track stop', () => {
    const stream = { getTracks: () => [{ stop: () => { throw new Error('dead'); } }] };
    expect(() => stopAll([src('a', 0, true, stream)])).not.toThrow();
  });
});

describe('nextSourceId', () => {
  it('is unique across calls', () => {
    expect(nextSourceId()).not.toBe(nextSourceId());
  });
});
