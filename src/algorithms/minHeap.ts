export interface HeapEntry<T> {
  item: T;
  priority: number;
}

/**
 * Generic Binary Min-Heap with an internal HashMap (`Map<string, number>`)
 * supporting O(log V) insert, O(log V) extractMin, O(log V) decreaseKey, and O(1) peek.
 */
export class BinaryMinHeap<T> {
  private heap: HeapEntry<T>[];
  private indexMap: Map<string, number>;
  private keyExtractor: (item: T) => string;

  constructor(keyExtractor: (item: T) => string) {
    this.heap = [];
    this.indexMap = new Map<string, number>();
    this.keyExtractor = keyExtractor;
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  peek(): HeapEntry<T> | undefined {
    return this.heap[0];
  }

  contains(key: string): boolean {
    return this.indexMap.has(key);
  }

  getPriority(key: string): number | undefined {
    const idx = this.indexMap.get(key);
    return idx !== undefined ? this.heap[idx].priority : undefined;
  }

  insert(item: T, priority: number): void {
    const key = this.keyExtractor(item);
    if (this.indexMap.has(key)) {
      this.decreaseKey(item, priority);
      return;
    }
    const entry: HeapEntry<T> = { item, priority };
    this.heap.push(entry);
    const index = this.heap.length - 1;
    this.indexMap.set(key, index);
    this.bubbleUp(index);
  }

  extractMin(): HeapEntry<T> | undefined {
    if (this.heap.length === 0) return undefined;

    const minEntry = this.heap[0];
    const minKey = this.keyExtractor(minEntry.item);
    this.indexMap.delete(minKey);

    const lastEntry = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = lastEntry;
      this.indexMap.set(this.keyExtractor(lastEntry.item), 0);
      this.sinkDown(0);
    }

    return minEntry;
  }

  decreaseKey(item: T, newPriority: number): void {
    const key = this.keyExtractor(item);
    const index = this.indexMap.get(key);
    if (index === undefined) {
      this.insert(item, newPriority);
      return;
    }

    if (newPriority >= this.heap[index].priority) {
      return;
    }

    this.heap[index] = { item, priority: newPriority };
    this.bubbleUp(index);
  }

  toArray(): HeapEntry<T>[] {
    return [...this.heap].sort((a, b) => a.priority - b.priority);
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parentIndex = Math.floor((current - 1) / 2);
      if (this.heap[current].priority >= this.heap[parentIndex].priority) {
        break;
      }
      this.swap(current, parentIndex);
      current = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * current + 1;
      const rightChild = 2 * current + 2;
      let smallest = current;

      if (
        leftChild < length &&
        this.heap[leftChild].priority < this.heap[smallest].priority
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < length &&
        this.heap[rightChild].priority < this.heap[smallest].priority
      ) {
        smallest = rightChild;
      }

      if (smallest === current) {
        break;
      }

      this.swap(current, smallest);
      current = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;

    this.indexMap.set(this.keyExtractor(this.heap[i].item), i);
    this.indexMap.set(this.keyExtractor(this.heap[j].item), j);
  }
}
