# Staff operations

Every staff operation is a GraphQL mutation or query on `/api/graphql`, called from the platform pages through `features/platform/actions/commands.ts`. Keyed commands take an `idempotencyKey` (`^[A-Za-z0-9._:-]{8,200}$`). Reuse the key when you retry the same intent; a different body under the same key is refused with `IDEMPOTENCY_KEY_REUSED`. Errors come back as GraphQL errors with `extensions.code` set to one of `NOT_AUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`, `INVALID_TRANSITION`, `STALE_STATE`, `GUARD_FAILED`, `CAPACITY_FULL`, `OUT_OF_STOCK`, `OUT_OF_AREA`, `EXPIRED` or `DUPLICATE_REFERENCE`.

The full list is the `staffTypeDefs` in `features/keystone/mutations/staff.ts`. The operations below have rules that are not obvious from their names.

## Payments

### `collectOnSite(visitId, provider, reference, payerPhone, amount, idempotencyKey)` (mutation; P30)

A technician takes a payment on site.

- **Who:** `canDoFieldWork` and on that visit's crew, or `canManageVisits`.
- **When:** while the visit is `on_site`, or on the day it was completed (company time zone). It is refused for cancelled visits, future visits and visits completed on an earlier day.
- **What it pays:** the visit's unpaid survey fee first, then the accepted repair on the visit's ticket, then the balance of the visit's installation order.
- **How much:** `amount` is in minor units and defaults to everything still owed. "Owed" counts references that are already submitted and waiting for finance. It is refused with `INVALID_INPUT` if it is above what is owed, and with `GUARD_FAILED` if nothing is owed.
- **`provider`:** `cash`, `mobile_money` or `bank_transfer`. A card is not taken here.
- **Duplicates:** the same reference twice is refused with `DUPLICATE_REFERENCE`, as everywhere else.
- **Result:** a payment that stays `submitted` and has `collectedBy` set to the technician, with an audit row `visit.payment_collected`. It appears on Payments → To verify with the technician's name. Only finance (`canManagePayments`) verifies it with `verifyOfflinePayment` or rejects it with `rejectOfflinePayment`. The technician cannot verify, refund or read payments through this operation.
- **Returns** `{ paymentId, status, reference, amount, currencyCode, purpose, sessionCode }`.

### `verifyOfflinePayment(paymentId, expectedVersion, idempotencyKey)` / `rejectOfflinePayment(paymentId, reason, expectedVersion, idempotencyKey)`

These need `canManagePayments`. Verifying applies the money to the order, its plan's instalments (oldest first), the visit fee or the subscription. It also confirms a `pending_payment` order. Rejecting frees the reference so it can be sent again.

### `recordOfflinePayment(sessionCode, provider, reference, payerPhone, idempotencyKey)`

Finance records and verifies a payment in one step. A technician with `canDoFieldWork` can record against an existing pay link; that payment waits for finance.

### `createPayLink(input: { orderId | visitId | ticketId, amount? }, idempotencyKey)`

Makes a `/pay/[code]` link for what is owed. It needs `canManagePayments`, `canManageOrders`, `canManageVisits` or `canManageTickets`.
