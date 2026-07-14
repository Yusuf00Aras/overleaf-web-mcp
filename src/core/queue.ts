export class FifoQueue {
  #tail: Promise<void> = Promise.resolve()
  #pending = 0

  get pending(): number {
    return this.#pending
  }

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    this.#pending += 1
    const result = this.#tail.then(operation)
    this.#tail = result.then(
      () => undefined,
      () => undefined
    )
    return result.finally(() => {
      this.#pending -= 1
    })
  }

  async onIdle(): Promise<void> {
    await this.#tail
  }
}
