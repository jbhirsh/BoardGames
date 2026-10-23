/** Why a signal aborted, typed: lib.dom gives `AbortSignal.reason` the type `any`. */
export function abortReason(signal: { reason: unknown } | null | undefined): unknown {
  return signal?.reason;
}
