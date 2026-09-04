import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
  it('undo/redo walk the stack', () => {
    const h = new History({ v: 0 });
    h.push({ v: 1 }); h.push({ v: 2 });
    expect(h.undo()).toEqual({ v: 1 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ v: 1 });
    expect(h.canRedo).toBe(true);
  });
  it('push clears redo and ignores identical states', () => {
    const h = new History({ v: 0 });
    h.push({ v: 1 }); h.undo(); h.push({ v: 5 });
    expect(h.canRedo).toBe(false);
    h.push({ v: 5 });
    expect(h.undo()).toEqual({ v: 0 });
  });
});
