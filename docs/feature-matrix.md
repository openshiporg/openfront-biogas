# Biogas feature matrix

Binding source: `~/Code/Euler/state/dossiers/b7/biogas-dissertation.md` §6. Route existence is not live verification. Staff routes below are relative to `/dashboard/platform/`; all use feature screens, not generic list screens. Sidebar permissions determine which group a role sees.

## Customer operations (S1–S25)

See [the storefront matrix](STOREFRONT-MATRIX.md) for click paths, records and screenshots.

| Row | Route | Operation / data |
|---|---|---|
| S1 | `/` | `storefrontInfo`; published products, stories, FAQs |
| S2 | `/systems` | Published Product + DigesterSpec |
| S3 | `/systems/[slug]` | Product, DigesterSpec, KitComponent, Resource |
| S4 | `/calculator` | `sizeSystem` |
| S5 | `/get-a-quote` | `checkServiceArea`, `availableVisitSlots`, `submitQuoteRequest`, `bookSurveyVisit` |
| S6 | `/quote/[code]` | `getQuoteByCode` |
| S7 | `/quote/[code]` | `acceptQuote`, `declineQuote`, payment session |
| S8 | `/shop` | Published Product, categories and compatibility |
| S9 | `/shop/p/[slug]` | Product, stock and compatibility |
| S10 | `/cart` | `activeCart`, `addToCart`, `updateCartLineQuantity`, `removeCartLine` |
| S11 | `/checkout` | `setCartFulfilment`, `completeCart` |
| S12 | `/pay/[code]` | `initiatePaymentSession`, `completePaymentSession`; Stripe webhook at `/api/payments/stripe/webhook` |
| S13 | `/pay/[code]` | `submitOfflinePayment`; staff verify through P44 |
| S14 | `/pay/[code]` | `getPaymentSession`, same real payment operations |
| S15 | `/order/[code]` | `getOrderByCode` |
| S16 | `/visit/[code]` | `getVisitByCode`, `rescheduleVisitByCode`, `cancelVisitByCode` |
| S17 | `/service-plans` | Published ServicePlan |
| S18 | `/support` | `createTicket` |
| S19 | `/sign-in`, `/register`, `/reset-password` | Authentication, `registerCustomer`; password reset needs a configured mail path |
| S20 | `/account` | `myOverview` |
| S21 | `/account/orders`, `/account/orders/[id]` | `myOrders`, `myOrder`, `completeSitePrepTask` |
| S22 | `/account/payments` | `myPayments`, `payInstallment` |
| S23 | `/account/systems`, `/account/systems/[id]` | `mySystems`, `mySystem`, `subscribeToPlan` |
| S24 | `/account/support`, `/account/support/[id]` | `myTickets`, `myTicket`, `addTicketNote`, `acceptServiceQuote` |
| S25 | `/account/profile` | `myProfile`, `updateMyProfile`, authenticated user password update |

## Platform (P1–P64)

| Row | Route / tab | Operations / authoritative records |
|---|---|---|
| P1 | `home` | Derived operational counts |
| P2 | `leads` | Lead board, `transitionLead` |
| P3 | `leads` | `addLead`, referral input |
| P4 | `leads/[id]` | `logContact`, `assignLead`, `transitionLead`; contact links |
| P5 | `leads/[id]` | `staffSizeSystem` |
| P6 | `leads/[id]` | `checkServiceArea` |
| P7 | `quotes/new`, `quotes/[id]` | `saveQuoteDraft` |
| P8 | `quotes` approval tab | `approveQuote` |
| P9 | `quotes/[id]` | `sendQuote`, `reviseQuote` |
| P10 | `quotes` | Quote status derived from validity date |
| P11 | `quotes/[id]` | `staffAcceptQuote`; deposit goes through payments |
| P12 | `orders`, `orders/[id]` | Order, lines, money, audit history (history permission required) |
| P13 | `orders/new` | `staffStartCart`, `staffAddToCart`, `staffSetCartFulfilment`, `staffCompleteCart` |
| P14 | `orders/[id]` | `fulfilOrder`, serial binding |
| P15 | `orders/[id]` | `proposeOrderChange`, `decideOrderChange` |
| P16 | `orders/[id]` | Cancellation refund calculation, `cancelOrder` |
| P17 | `orders/[id]` | `returnOrderLines` |
| P18 | `orders/[id]` | `issueInvoice`, `voidInvoice` |
| P19 | `installations` | Stage board |
| P20 | `installations/[id]` | `setSitePrepTask`, `transitionInstallation` ready override |
| P21 | `installations/[id]` | `transitionInstallation` hold/resume/cancel |
| P22 | `schedule` | `staffVisitSlots`, `scheduleVisit`, `assignVisit`, `cancelVisit` |
| P23 | `schedule` | `addTechnicianTimeOff`, `removeTechnicianTimeOff` |
| P24 | `field` | Crew-scoped Visit, map/call links |
| P25 | `field/[id]` | `startVisitTravel`, `checkInVisit` |
| P26 | `field/[id]` | `visitChecklist`, `saveVisitChecklist`; scoped Media photo upload/gallery |
| P27 | `field/[id]` | `completeVisit` survey payload |
| P28 | `field/[id]` | `logPartUsage` |
| P29 | `field/[id]` | `commissionSystem`, signature and TrainingRecord |
| P30 | `field/[id]` | `collectOnSite`; submitted references await finance |
| P31 | `field/[id]` | `completeVisit` complete/no_access |
| P32 | `systems` | InstalledSystem status board and site map |
| P33 | `systems/[id]` | Warranty, visits, readings, tickets, training |
| P34 | `systems` follow-ups tab | Due Visit + SystemReading |
| P35 | `systems/[id]` | `submitReading`, readings CSV |
| P36 | `systems/[id]` | `setSystemStatus`, `voidWarranty` |
| P37 | `tickets` | ServiceTicket queue, past-target first |
| P38 | `tickets` | `staffCreateTicket` |
| P39 | `tickets/[id]` | TroubleshootingGuide, `transitionTicket` |
| P40 | `tickets/[id]` | `transitionTicket` warranty decision |
| P41 | `tickets/[id]`, `quotes/new?ticketId=…` | Service `saveQuoteDraft`, `sendQuote`, pay link |
| P42 | `tickets/[id]` | `transitionTicket`, `addTicketNote` |
| P43 | `service-plans` | `staffSubscribeToPlan`, `renewSubscription`, `cancelSubscription` |
| P44 | `payments` verify tab | `verifyOfflinePayment`, `rejectOfflinePayment` |
| P45 | `payments` | Payment receipts, `refundPayment` |
| P46 | `payments?view=reconcile` | `reconcilePaymentSession`, `reconcileRefund` |
| P47 | `plans` | Derived due/overdue/defaulted queue, `logContact` reminders |
| P48 | `plans/[id]` | `waiveInstallment`, `staffInstallmentLink`, `reschedulePlan` |
| P49 | `incentives` | `openIncentiveApplication`, `transitionIncentiveApplication`, Media documents |
| P50 | `referrals` | `grantReferralReward`, Customer credit |
| P51 | `commissions` | `approveCommission` |
| P52 | `catalogue`, `catalogue/[id]` | Authorized Product, DigesterSpec, KitComponent CRUD |
| P53 | `inventory` | `adjustStock`, `transferStock`, levels/movements |
| P54 | `purchasing` | Supplier CRUD, `savePurchaseOrder`, `transitionPurchaseOrder`, `receivePurchaseOrder` |
| P55 | `inventory` serials tab | `moveSerial`, SerializedUnit |
| P56 | `customers`, `customers/[id]` | Customer, sites, contacts, linked activity, store credit |
| P57 | `reports`, `reports/export` | Derived metrics; payment/invoice CSV |
| P58 | `settings` | Authorized CompanySettings CRUD |
| P59 | `settings/areas` | Authorized Branch / ServiceArea CRUD |
| P60 | `settings/payments` | Authorized PaymentProvider CRUD |
| P61 | `settings/plans` | Plan templates, ServicePlan, IncentiveProgram, CommissionRule CRUD |
| P62 | `settings/checklists` | ChecklistTemplate / ChecklistItem CRUD |
| P63 | `settings/content` | Story, Faq, TroubleshootingGuide, Resource CRUD |
| P64 | `settings/team`, `settings/webhooks`, `settings/audit`; onboarding dialog | User / Role CRUD, WebhookEndpoint, AuditEvent, `runBiogasOnboarding` |

## Evidence and outstanding launch gates

- Staff browser evidence: `~/Code/Euler/state/screenshots/b7-biogas/platform/`. Sales, finance, storekeeper, dispatcher, technician and care workflows were exercised on shared `:3961`, not production.
- Combined database run: `sale.test.ts`, `money-care.test.ts`, `transitions.test.ts`: **49 passed, none skipped**. The isolation assertion was then simplified and independently re-passed. Matrices cover named manual moves, not every automatic transition in §4.
- P13/P15–P18/P46 are mounted by `8570c63`; browser click-through confirms entry points. P26 photo upload/retrieval is checked at 402 px as dispatcher (`105ccfd`); technician upload still needs its own role check.
- `tests/helpers/{company,flow,keystone}.ts`, `tests/helpers/verify.sh`, and `tests/state/sale.test.ts` remain untracked inherited files pending ownership resolution. A clean checkout cannot run the committed state suites until those dependencies are adopted.
- Card capture is exercised with signed webhook fixtures against the real database; no actual Stripe payment has been claimed. Configure real provider keys and endpoint secret, then perform the provider-key transaction through the live UI.
- Live deployment, full per-role main action, permanent upload storage, and live record/URL evidence remain required. This document is not a launch signoff.
