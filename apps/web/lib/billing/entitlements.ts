const paidPayments = new Set<string>();

export function markPaid(paymentId: string): void {
  if (paymentId) paidPayments.add(paymentId);
}
export function isPro(): boolean {
  return paidPayments.size > 0;
}
/** test helper */
export function _resetEntitlements(): void {
  paidPayments.clear();
}
