export type CircuitState = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private lastFailureTime = 0
  private halfOpenSuccesses = 0

  constructor(
    private readonly name: string,
    private readonly maxFailures: number = 3,
    private readonly resetTimeoutMs: number = 30_000,
    private readonly halfOpenMaxSuccesses: number = 2,
  ) {}

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.state = 'half-open'
      this.halfOpenSuccesses = 0
    }
    return this.state
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState()

    if (currentState === 'open') {
      throw new Error(`Circuit breaker ${this.name} is OPEN (${this.failureCount} failures)`)
    }

    try {
      const result = await fn()

      if (this.state === 'half-open') {
        this.halfOpenSuccesses++
        if (this.halfOpenSuccesses >= this.halfOpenMaxSuccesses) {
          this.reset()
        }
      }

      return result
    } catch (err) {
      this.recordFailure()
      throw err
    }
  }

  recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.maxFailures) {
      this.state = 'open'
    }
  }

  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
    this.halfOpenSuccesses = 0
  }

  getMetrics(): { name: string; state: CircuitState; failureCount: number } {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>()

  getOrCreate(
    name: string,
    maxFailures?: number,
    resetTimeoutMs?: number,
  ): CircuitBreaker {
    let breaker = this.breakers.get(name)
    if (!breaker) {
      breaker = new CircuitBreaker(name, maxFailures, resetTimeoutMs)
      this.breakers.set(name, breaker)
    }
    return breaker
  }

  getBreakers(): CircuitBreaker[] {
    return Array.from(this.breakers.values())
  }

  allStates(): Array<{ name: string; state: CircuitState; failureCount: number }> {
    return this.getBreakers().map((b) => b.getMetrics())
  }
}
