/**
 * Build a serializer that runs async operations one at a time, in call order.
 *
 * Our JSON5 stores all read-modify-write a whole file. Two of those interleaving
 * means both read the same array, both append, and the second write silently
 * drops the first one's row. Atomic writes stop the file being *corrupt*; they
 * don't stop one writer clobbering another.
 *
 * Every mutating path on a store must go through the same serializer instance,
 * covering the read as well as the write — serializing only the write leaves
 * the race wide open.
 */
export function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve()

  return <T>(fn: () => Promise<T>): Promise<T> => {
    // Run fn whether or not the previous operation settled, so one failure
    // doesn't wedge the queue for everything behind it.
    const result = queue.then(fn, fn)
    queue = result.catch(() => {})
    return result
  }
}
