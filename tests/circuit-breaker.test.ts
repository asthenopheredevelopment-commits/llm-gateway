import { describe, it, expect } from 'vitest'
import { CircuitBreaker, CircuitBreakerRegistry } from '../src/gateway/circuit-breaker.js'

describe('CircuitBreaker', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker('test', 3, 1000)
    expect(cb.getState()).toBe('closed')
  })

  it('opens after max failures', () => {
    const cb = new CircuitBreaker('test', 2, 5000)
    cb.recordFailure()
    expect(cb.getState()).toBe('closed')
    cb.recordFailure()
    expect(cb.getState()).toBe('open')
  })

  it('rejects execution when open', async () => {
    const cb = new CircuitBreaker('test', 1, 5000)
    cb.recordFailure()
    await expect(cb.execute(async () => 'ok')).rejects.toThrow('Circuit breaker')
  })

  it('allows execution when closed', async () => {
    const cb = new CircuitBreaker('test', 3, 5000)
    const result = await cb.execute(async () => 'success')
    expect(result).toBe('success')
  })

  it('transitions to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker('test', 1, 10)
    cb.recordFailure()
    expect(cb.getState()).toBe('open')
    await new Promise((r) => setTimeout(r, 20))
    expect(cb.getState()).toBe('half-open')
  })

  it('closes after enough half-open successes', async () => {
    const cb = new CircuitBreaker('test', 1, 10, 2)
    cb.recordFailure()
    await new Promise((r) => setTimeout(r, 20))
    expect(cb.getState()).toBe('half-open')

    await cb.execute(async () => 'ok')
    expect(cb.getState()).toBe('half-open')

    await cb.execute(async () => 'ok')
    expect(cb.getState()).toBe('closed')
  })

  it('records failure during half-open', async () => {
    const cb = new CircuitBreaker('test', 1, 10, 2)
    cb.recordFailure()
    await new Promise((r) => setTimeout(r, 20))
    expect(cb.getState()).toBe('half-open')

    await expect(cb.execute(async () => { throw new Error('fail') })).rejects.toThrow('fail')
    expect(cb.getState()).toBe('open')
  })
})

describe('CircuitBreakerRegistry', () => {
  it('creates breakers on demand', () => {
    const reg = new CircuitBreakerRegistry()
    const cb = reg.getOrCreate('provider-a', 3, 5000)
    expect(cb.getState()).toBe('closed')
    expect(reg.getBreakers()).toHaveLength(1)
  })

  it('returns same breaker for same name', () => {
    const reg = new CircuitBreakerRegistry()
    const cb1 = reg.getOrCreate('test')
    const cb2 = reg.getOrCreate('test')
    expect(cb1).toBe(cb2)
  })

  it('allStates returns metrics for all breakers', () => {
    const reg = new CircuitBreakerRegistry()
    reg.getOrCreate('a')
    reg.getOrCreate('b')
    const states = reg.allStates()
    expect(states).toHaveLength(2)
    expect(states.every((s) => s.state === 'closed')).toBe(true)
  })
})
