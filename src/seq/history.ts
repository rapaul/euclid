/** Generic undo/redo stack over serialisable snapshots. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private current: T, private limit = 100) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  /** Record a new state (clears redo). No-op if identical to current. */
  push(next: T) {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.current = next;
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    return (this.current = prev);
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    return (this.current = next);
  }
}
