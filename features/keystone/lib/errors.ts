/** A business-rule failure with a stable code. Messages reach the caller; database detail never does. */
export class DomainError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.details = details
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError

export const Codes = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  STALE_STATE: 'STALE_STATE',
  GUARD_FAILED: 'GUARD_FAILED',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  CAPACITY_FULL: 'CAPACITY_FULL',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  OUT_OF_AREA: 'OUT_OF_AREA',
  EXPIRED: 'EXPIRED',
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  OVER_REFUND: 'OVER_REFUND',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
} as const

export const fail = (code: keyof typeof Codes, message: string, details?: Record<string, unknown>): never => {
  throw new DomainError(Codes[code], message, details)
}
