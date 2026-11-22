# Storefront operations

All operations are on `POST /api/graphql`. Every one returns `JSON`. Money is always an **integer in minor units** with a `currencyCode` beside it (USD: cents). Dates are ISO strings.

**Errors.** A refused request is a GraphQL error whose `message` is written for the customer and can be shown as it is. `extensions.code` is one of: `NOT_AUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`, `INVALID_TRANSITION`, `STALE_STATE`, `GUARD_FAILED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `CAPACITY_FULL`, `OUT_OF_STOCK`, `OUT_OF_AREA`, `EXPIRED`, `DUPLICATE_REFERENCE`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`. Some errors also carry `currentStatus` or `field`.

**Idempotency keys.** Every operation that takes an `idempotencyKey` accepts 8 to 200 characters from `A-Z a-z 0-9 . _ : -`. Make one key per user intent, for example `crypto.randomUUID()` when the form mounts, and reuse it on retry. A retry with the same key and the same input returns the first result. The same key with different input is refused with `IDEMPOTENCY_KEY_REUSED`.

**Access.**
- **Guests** reach a record only through its public code (`Q-…`, `O-…`, `V-…`, `S-…`, `PAY-…`).
- **`my*` operations** need a signed-in customer. Sign in with Keystone's `authenticateUserWithPassword(email, password)`; the session is a cookie. Without one they fail with `NOT_AUTHORIZED`.
- **Cart.** The guest cart is an httpOnly cookie, `biogas_cart`, set on the first `addToCart`. Server-side calls can forward it or send header `x-cart-token: <token>`. `addToCart` returns `cartToken` only when it created the cart.

---

## Company and catalogue (S1–S3, S8, S9, S17)

### `storefrontInfo` (query, public)
Returns:
- Company: `name, legalName, country, currencyCode, timezone, units, phone, whatsappNumber, email, address`.
- Tax: `taxLabel, taxRatePercent, taxInclusive`.
- Content: `heroText, about, impactNumbers`.
- Policies: `surveyFeeAmount, quoteValidDays, returnWindowDays, visitCancelCutoffHours`.
- `cardPayments` (boolean).
- `branches[] { id, name, code, address, phone, lat, lng }`.
- `paymentMethods[] { code, label, kind: 'card'|'reference', customerCanSubmit, instructions, publishableKey }`.

### Generated list queries (public reads)
These are filtered to published rows for guests:
- `products(where:{ isPublished:{equals:true} })` with:
  - `name, slug, sku, type` (`digester_kit | appliance | part | consumable | service`)
  - `description, image { url }, imageUrl`
  - `priceAmount, compareAtAmount, currencyCode, taxable, sellOnline`
  - `requiresInstallation, requiresSurvey, installFeeAmount, warrantyMonths, weightKg`
  - `category { name slug }`
  - `digesterSpec { capacityM3 technology dailyGasM3 cookingHoursPerDay servesPeople minDailyFeedKg maxDailyFeedKg feedstockTypes minAnimals footprintLengthM footprintWidthM waterPerDayL reactorWarrantyMonths partsWarrantyMonths installHours }`
  - `kitComponents { quantity component { name sku } }`
  - `compatibleWith { name slug }` (the kits a part fits), `fitsParts { name slug }`
  - `resources { title kind url file { url } language }`
- `productCategories`, `stories`, `faqs`, `servicePlans`, `paymentPlanTemplates(where:{isActive:{equals:true}})`.
- **"From X a month":**
  - take the template with the most instalments
  - deposit = `percent(depositPercent)` of the price
  - monthly = `(price − deposit) × (1 + planFeePercent/100) / instalmentCount`, rounded up
  - Juniper's HomeBag 2 at $1,290 with the 10% + 24 monthly template (22% fee) gives $59.
- **Stock for S9:** read `stockLevels { onHand reserved }`, or rely on `activeCart.lines[].available`.

### `sizeSystem(input: JSON!)` (mutation, public; S4)
Input fields:
- `cattle, pigs, poultry` (head counts)
- `kitchenWasteKgPerDay`
- `people` (who eat from the kitchen)
- `monthlyFuelSpendAmount` (minor units)
- `interest` (`home | farm | institution`)

At least one animal count or the kitchen waste is required.

Returns:
- `assessmentId`
- `input`, `dailyFeedKg`, `estimatedGasM3`, `cookingHours`
- `coversPercent`, `fuelSavedAmountPerMonth`, `paybackMonths` (null if no saving)
- `recommended { id, name, slug, priceAmount, installFeeAmount, currencyCode, capacityM3, dailyGasM3 } | null`
- `note`

Pass `assessmentId` to `submitQuoteRequest`.

## Quote request and survey (S5)

### `checkServiceArea(postcode, region, country)` (query, public)
Returns `{ served, area: { name, deliveryFeeAmount, installSurchargeAmount, branch } | null }`.

### `availableVisitSlots(from, days, postcode, region, country)` (query, public)
- Covers up to 14 days from today, in the company time zone.
- Returns `{ served, slots: [{ date: 'YYYY-MM-DD', slotIndex, windowStart, windowEnd, free }] }`.
- `served:false` with no slots means the area is not covered.

### `submitQuoteRequest(input: JSON!, idempotencyKey: String!)` (mutation, public)
Input:
- Required: `name`, plus `phone` or `email`.
- Optional:
  - `customerType` (`household | farm | institution`), `organisationName`
  - `interest` (`home | farm | institution | parts | service`), `message`
  - Address: `addressLine, city, region, country, postcode, lat, lng, directions`
  - Site: `siteType`, `animals`, `kitchenWasteKgPerDay`, `peopleServed`, `monthlyFuelSpendAmount`, `currentFuels[]`
  - `preferredContact`, `preferredLanguage`, `contactConsent`
  - `assessmentId`, `referralCode`, `utm {}`
  - `survey { date, slotIndex }` to book at once

Returns:
- `leadNumber`, `leadCode`, `served`, `areaName`
- `survey: { visitCode, windowStart, windowEnd, sessionCode, feeAmount } | null`

If the survey has a fee, `sessionCode` is a pay link. Send the customer to `/pay/[sessionCode]`.

### `bookSurveyVisit(leadCode, date, slotIndex, idempotencyKey)` (mutation, public)
Books the survey later, using the `leadCode` from `submitQuoteRequest`. Returns the same shape as `survey` above.

## Quote (S6, S7)

### `getQuoteByCode(code)` (query, public)
Returns `null` for an unknown code or a quote that is not yet sent. The first open moves the quote to `viewed`.

Fields:
- `code, number, version, kind, status, validUntil, sentAt`
  - `status` is one of `sent | viewed | accepted | declined | expired | superseded`.
- `notes, terms, currencyCode, customerName, site { label city region }`
- `canAccept`, `signedName, signedAt, acceptedOptionId, acceptedPlanOfferId`
- `order { code status } | null`
- `options[] { id, label, description, isRecommended, subtotalAmount, discountAmount, taxAmount, totalAmount, lines[], planOffers[] }`
  - `lines[] { id, kind, description, quantity, unitAmount, totalAmount, productId, warrantyMonths }`
  - `planOffers[] { id, label, depositAmount, instalmentAmount, instalmentCount, frequency, planFeeAmount, totalAmount, schedule[] { sequence, label, amount, trigger } }`

### `acceptQuote(code, optionId, planOfferId, signedName, idempotencyKey)` (mutation, public)
- One accept wins. Expired or superseded quotes are refused.
- Returns `{ quoteId, orderId, orderNumber, orderCode, sessionCode, amount, currencyCode }`.
- `sessionCode` is the deposit (or full) pay link. Take payment on the same page with the operations under Pay, below.

### `declineQuote(code, reason, idempotencyKey)` (mutation, public)
Returns `{ status: 'declined' }`.

## Cart and checkout (S10, S11)

All cart operations return the priced cart:
- `id, fulfilment ('delivery'|'pickup'), currencyCode`
- `serviceArea { id name } | null`, `pickupBranch { id name address } | null`
- `address {}`, `name, email, phone`
- `lines[] { id, productId, name, slug, imageUrl, quantity, unitAmount, totalAmount, available }`
- `planDiscountPercent, discountAmount, deliveryAmount, subtotalAmount, taxAmount, totalAmount, count`

Prices always come from the catalogue.

| Operation | Notes |
|---|---|
| `activeCart` (query) | `null` when there is no cart |
| `addToCart(productId, quantity)` | Creates the cart. Refuses kits that need a survey (`GUARD_FAILED`); send those to `/get-a-quote`. |
| `updateCartLineQuantity(lineId, quantity)` | 0 removes the line (named so it does not clash with the generated `updateCartLine`) |
| `removeCartLine(lineId)` | |
| `setCartFulfilment(input)` | `{ fulfilment, pickupBranchId?, address { addressLine city region country postcode directions }, name, email, phone }`. Delivery outside the service areas fails with `OUT_OF_AREA`. |
| `completeCart(idempotencyKey)` | Stock is checked first (`OUT_OF_STOCK`). Returns `{ orderId, orderNumber, orderCode, sessionCode, amount, currencyCode }`. |

## Pay (S12, S13, S14)

### `getPaymentSession(code)` (query, public)
Returns `null` if the code is unknown. Fields:
- `code, amount, currencyCode, purpose, description, expiresAt`
- `status`: `pending | awaiting_verification | captured | expired | cancelled | refunded | partially_refunded | failed`
- `provider`
- `order { number code status }`, `visit { number code }`, `plan { name }`
- `installments[] { id label amount paidAmount dueDate }`
- `payments[] { status method reference amount receiptNumber rejectReason at }`
- `canPay`, `methods[]` (same shape as in `storefrontInfo`)

### `initiatePaymentSession(code, provider, email)` (mutation, public)
- **Card** (`provider: 'stripe'`): returns `{ provider, clientSecret, publishableKey, amount, currencyCode }`. Confirm with Stripe.js (`stripe.confirmPayment` / Payment Element), then call `completePaymentSession`.
- **Reference methods**: returns `{ provider, instructions, amount, currencyCode, reference }`. `reference` is the code the customer should quote.
- Card is unavailable when Stripe keys are unset (`PROVIDER_UNAVAILABLE`). The reference methods always work.

### `completePaymentSession(code)` (mutation, public)
- Reads the card outcome back from Stripe. The signed webhook does the same thing on its own.
- Returns `getPaymentSession`'s shape. Call it on return from 3-D Secure, or after `confirmPayment` resolves.

### `submitOfflinePayment(code, provider, reference, payerPhone, idempotencyKey)` (mutation, public)
- `provider` is `mobile_money` or `bank_transfer`. Cash is staff-only.
- Returns `{ paymentId, status: 'submitted', reference }`. The session then reads `awaiting_verification` until finance verifies it.
- Errors: a reused reference gives `DUPLICATE_REFERENCE`; a bad format gives `INVALID_INPUT`.

## Track by code (S15, S16)

### `getOrderByCode(code)` (query, public)
Fields:
- `id, code, number, status, channel, fulfilment, currencyCode`
- Amounts: `subtotalAmount, discountAmount, deliveryAmount, taxAmount, totalAmount, paidAmount, refundedAmount, balanceAmount, surveyFeeCreditAmount`
- `trackingNumber, carrier, cancelReason`
- Dates: `createdAt, confirmedAt, pickedAt, deliveredAt, completedAt, cancelledAt`
- `branch { name address phone }`, `quote { code number }`
- `lines[] { id kind name sku quantity unitAmount taxAmount totalAmount warrantyMonths returnedQuantity }`
- `payments[] { status method amount reference receiptNumber refundedAmount at }`
- `refunds[] { amount status reason at }`
- `payLinks[] { code amount purpose expiresAt }`
- `plan` (see `myPayments`)
- `installation { number status targetDate prepTasks[] { id prompt helpText isRequired status doneAt doneBy } visits[] { type status windowStart windowEnd publicCode number } } | null`
- `invoices[] { number status totalAmount issuedAt dueAt }`
- `systems[] { id number publicCode }`

Order statuses: `pending_payment, confirmed, preparing, ready, shipped, out_for_install, delivered, installed, completed, closed, cancelled`.

### `getVisitByCode(code)` (query, public)
Fields:
- `code, number, type, status, date, slotIndex, windowStart, windowEnd`
- `technicians[]` (first names), `site { label city addressLine }`
- `canChange, freeChangeUntil, cutoffHours`
- `feeAmount, feePaid, cancelReason`

### `rescheduleVisitByCode(code, date, slotIndex, idempotencyKey)` (mutation, public)
Get the slots from `availableVisitSlots`. Returns `getVisitByCode`'s shape. Changes after the cut-off are refused with `GUARD_FAILED`.

### `cancelVisitByCode(code, reason, idempotencyKey)` (mutation, public)
Returns `{ status: 'cancelled', feeKept }`.

### `getSystemByCode(code)` (query, public)
Uses the code on the system's sticker. Returns `{ code, number, status, model, productSlug, commissionedAt, site { label city } }`.

## Support (S18)

### `createTicket(input: JSON!, idempotencyKey)` (mutation)
- A signed-in customer passes `systemId` (or nothing). A guest passes `systemCode`.
- Input: `{ systemCode? | systemId?, category, description, callbackPhone?, severity?: 'urgent', mediaIds? }`.
- `category` is one of `no_gas | low_pressure | smell | leak | stove_fault | slurry_overflow | other`.
- Returns `{ number, id (signed in only), status, responseDueAt }`.

## Account (S19–S25)

### `registerCustomer(input: JSON!)` (mutation, public; S19)
Input: `{ name, email, phone?, password (8+ chars), code?, idempotencyKey }`.

Behaviour:
- Creates a login with no dashboard access, linked to a Customer. Returns `{ customerId }`. Then call `authenticateUserWithPassword(email, password)`.
- If the email already has a login: `GUARD_FAILED`, "An account with this email already exists. Sign in."
- If the email or phone matches an existing customer (someone who enquired or bought before), it links only when `code` is the public code of one of **that** customer's quotes, orders, visits or systems.
  - Otherwise: `GUARD_FAILED`, "We already have your details from an earlier enquiry or order. To link this account, enter the code on your quote, receipt or system sticker."
  - Show a code field when you get this error, then retry with the same key's input plus `code`. A new key is fine as well.
- Password reset stays the starter's (`/reset-password`).

### `myOverview` (query, customer; S20)
Fields:
- `customer { name number referralCode storeCreditAmount currencyCode }`
- `nextVisits[] { number type status windowStart windowEnd publicCode }`
- `paymentsDue[] { id sequence label amount paidAmount dueDate status planId order { number id } }`
- `toGetReady[] { installationNumber orderId orderNumber status tasks[] { id prompt helpText isRequired } }`
- `openQuotes[] { number code validUntil status totalAmount currencyCode }`
- `systemCount, openTicketCount`

### `myOrders` (query, customer; S21)
Returns:
- `orders[] { id number code status totalAmount paidAmount refundedAmount balanceAmount currencyCode createdAt fulfilment }`
- `quotes[] { number version code status validUntil totalAmount currencyCode kind createdAt }`

### `myOrder(id)` (query, customer)
Returns `getOrderByCode`'s shape, or `null` if the order is not theirs.

### `completeSitePrepTask(taskId, done, note, idempotencyKey)` (mutation, customer)
Returns `{ id, status }`. Ticking the last required item makes the installation ready.

### `myPayments` (query, customer; S22)
Returns `{ storeCreditAmount, plans[], payments[] }`:
- `plans[]`: `{ id, status, kind, currencyCode, totalAmount, paidAmount, balanceAmount, planFeeAmount, depositAmount, frequency, nextDueAt, installments[], order { number code } }`
  - `status` is `active | in_arrears | defaulted | completed | settled_early | pending`.
  - `installments[]`: `{ id sequence label amount paidAmount dueDate status trigger paidAt }`, with `status` one of `scheduled | due | partially_paid | overdue | paid | waived | cancelled`.
- `payments[]`: `{ status method amount currencyCode reference receiptNumber refundedAmount createdAt order { number } }`.

### `payInstallment(planId, installmentIds, payoff, idempotencyKey)` (mutation, customer)
- Takes one instalment, several, or `payoff: true` for the whole balance. A payoff waives the remaining plan fee by default.
- Payment always covers the oldest unpaid instalment first.
- Returns `{ sessionCode, amount, currencyCode }`. Then pay with `initiatePaymentSession`.

### `mySystems` / `mySystem(id)` (query, customer; S23)
Fields:
- `id, code, number, status, model, productSlug, serialNumber`
- Dates: `installedAt, commissionedAt, lastCheckedAt, nextCheckDueAt`
- `warranties[] { component startsAt endsAt isVoid active }`
- `servicePlan { id name status currentPeriodEnd visitsUsed visitsPerYear } | null`
- `tickets[]`, `visits[]`

`mySystem` adds `availablePlans[] { id name slug priceAmount currencyCode billing visitsPerYear partsDiscountPercent priorityResponse includedItems description }`.

### `subscribeToPlan(planId, systemId, idempotencyKey)` (mutation, customer)
Returns `{ subscriptionId, sessionCode, amount, currencyCode }`.

### `myTickets` / `myTicket(id)` (query, customer; S24)
- **List:** `[{ id number status category createdAt resolvedAt system { number } nextVisitAt }]`.
- **Detail:**
  - `id, number, status, category, severity, description, createdAt, resolvedAt, resolution, warrantyDecision`
  - `system { number code model }`
  - `events[] { type body at }`
  - `visits[]`
  - `repairQuote` (the quote shape) or `null`
  - `payLinks[] { code amount expiresAt }`

### `acceptServiceQuote(code, optionId, signedName, idempotencyKey)` (mutation, customer)
Accepts the repair quote on the customer's own ticket. Returns `{ quoteId, orderId, orderNumber, orderCode, sessionCode, amount, currencyCode }`.

### `myProfile` (query) / `updateMyProfile(input)` (mutation, customer; S25)
- Read fields: `name, organisationName, type, phone, altPhone, email, preferredLanguage, preferredContact, contactConsent, referralCode, storeCreditAmount, currencyCode, number`.
- Update input: `{ name?, phone?, altPhone?, preferredLanguage?, preferredContact?: 'call'|'sms'|'whatsapp'|'email', contactConsent? }`.
- Change the password with Keystone's `updateUser(where:{id}, data:{password})` on your own user.
