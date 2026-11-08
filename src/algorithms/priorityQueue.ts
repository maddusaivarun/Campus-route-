import { BinaryMinHeap, HeapEntry } from './minHeap';

export interface PriorityQueueSnapshotItem<T> {
  item: T;
  priority: number;
}

/**
 * Priority Queue backed by BinaryMinHeap<T> for Dijkstra, A*, and Yen's K-Shortest Paths.
 */
export class PriorityQueue<T> {
  private minHeap: BinaryMinHeap<T>;

  constructor(keyExtractor: (item: T) => string) {
    this.minHeap = new BinaryMinHeap<T>(keyExtractor);
  }

  enqueue(item: T, priority: number): void {
    this.minHeap.insert(item, priority);
  }

  dequeue(): HeapEntry<T> | undefined {
    return this.minHeap.extractMin();
  }

  updatePriority(item: T, newPriority: number): void {
    this.minHeap.decreaseKey(item, newPriority);
  }

  peek(): HeapEntry<T> | undefined {
    return this.minHeap.peek();
  }

  isEmpty(): boolean {
    return this.minHeap.isEmpty();
  }

  size(): number {
    return this.minHeap.size();
  }

  containsKey(key: string): boolean {
    return this.minHeap.contains(key);
  }

  getPriority(key: string): number | undefined {
    return this.minHeap.getPriority(key);
  }

  getSnapshot(): PriorityQueueSnapshotItem<T>[] {
    return this.minHeap.toArray().map((entry) => ({
      item: entry.item,
      priority: Number(entry.priority.toFixed(2)),
    }));
  }
}
