# Storefront matrix (S1–S25)

The customer rows of the Feature Matrix (`biogas-dissertation.md` §6.1). For each row: the URL, the clicks that reach it from the home page, and the record it was last checked on. Screens live in `features/storefront/screens/`; `app/(storefront)/` holds only the route wrappers.

Click paths start on the home page `/`. "Header" is the top bar (the menu button on phones). "Account" means signed in, reached through Header → Your account.

| Row | What the customer does | URL | How to get there from `/` | Checked on |
|---|---|---|---|---|
| S1 | See what the company sells, how it works, stories, questions | `/` | Home page. It shows the hero, the four steps, systems, stories, plans and questions, in the order of the picked design | Juniper Biogas data |
| S2 | Compare digester systems side by side | `/systems` | Header → Systems, or Home → "Compare all systems" | 6 systems |
| S3 | One system: specs, kit, warranty, price, "from X a month", manual | `/systems/[slug]` | Home → a system card (e.g. HomeBag 2 → `/systems/homebag-2`) | `homebag-2`. Manuals show only when the company has uploaded a file or a link |
| S4 | Size my system, savings and payback | `/calculator` | Header → Calculator, or a system page → "Size my system" | `sizeSystem` |
| S5 | Ask for a quote, with an optional survey time and a referral code; told at once if the area isn't served | `/get-a-quote` | Header → Get a quote | Leads made through the form; the survey slot is booked from `availableVisitSlots` |
| S6 | Open my quote, compare options and plans | `/quote/[code]` | Link in the quote message, or Account → Orders and quotes → the quote, or Account → Overview → "Quotes waiting for you" → Open | Q-000009 `Q-H77K-VZ7J-C6HY-A9R2`, Q-000005 `Q-7AZ1-XHAM-VCFP-0SCW` |
| S7 | Sign and accept, pay the deposit, or decline | `/quote/[code]` | As S6 → pick an option and a plan → type your name → tick → "Sign and pay the $X deposit". "Decline" sits under the options | Q-000009 → O-000020 (20% + 8 monthly); Q-000005 → O-000017 as a guest; Q-000008 → O-000016 pay in full |
| S8 | Shop parts, by category or by the system they fit | `/shop` | Header → Shop | Category chips and "Fits my system" |
| S9 | One part: price, stock, what it fits | `/shop/p/[slug]` | Header → Shop → a part, or a system page → "Parts and appliances for this system" | `single-burner-biogas-stove` |
| S10 | Cart | `/cart` | Header → cart icon (after "Add to cart" on a part) | |
| S11 | Checkout with delivery or branch pickup | `/checkout` | Cart → Checkout | O-000011, O-000018 (pickup at Buda) |
| S12 | Pay by card | `/checkout`, `/pay/[code]`, `/quote/[code]` | Same pages as S13 | The Stripe adapter is in place. The card option stays hidden while the company has no Stripe keys (`storefrontInfo.cardPayments`), so it has not been run on this deployment |
| S13 | Pay by mobile money or bank and send the reference | the same three pages | The pay page that checkout, a quote deposit or a staff link opens → pick "Zelle or Venmo" / "Bank transfer" → reference → "I have paid: send the reference" | O-000020 deposit ref ACH360287616 → staff verified → receipt R-000010; O-000011 ref ACH355303373 → verified → R-000009 |
| S14 | Pay anything due by a staff link | `/pay/[code]` | The link staff share, or Account → Overview → "Pay now" / "See and pay" | `PAY-WZTH-808R-2222-42WJ` (paid), `PAY-DQR8-W4E6-WHT0-BD5W` (instalment) |
| S15 | Order status by code | `/order/[code]` | Link on the receipt or the pay page → "Order O-…", or Account → Payments → order number | `O-85YW-WWYS-VYPC-FAGV` (O-000020), `O-T11E-ZY9E-F4NH-57XS` (O-000001) |
| S16 | Visit date and status by code; reschedule or cancel | `/visit/[code]` | Link in the visit message, or Account → Systems → a system → Visits → Details | `V-VQJK-2F6A-JQR1-RQHC` |
| S17 | Service plans and prices | `/service-plans` | Header → Service plans | Care, Care Plus |
| S18 | Report a problem, signed in or with the sticker code | `/support` | Header → Support | T-000004 (signed in). The sticker code `S-B4HH-M7FX-3Z01-9KNK` still has to be run as a guest |
| S19 | Sign in, register, reset password | `/sign-in`, `/register`, `/reset-password` | Header → Sign in; Sign in → "Create an account"; Sign in → "Forgot your password?" | Register with quote code Q-H77K-… linked Rosa to her quote. Register with a matching phone and no code shows the server's refusal. With no mail server set, reset says to call |
| S20 | Account overview: what's next | `/account` | Header → Your account | James, Rosa |
| S21 | My quotes and orders, receipts, installation progress, tick the get-ready list | `/account/orders`, `/account/orders/[id]` | Account → Orders and quotes → an order | O-000001, O-000016 |
| S22 | Payment plan: schedule, pay one or several instalments or the balance, history | `/account/payments` | Account → Payments | O-000001 plan (James), O-000020 plan (Rosa) |
| S23 | My systems: serial, warranty ends, service plan; buy a plan | `/account/systems`, `/account/systems/[id]` | Account → Systems → a system, or Header → Service plans → "Add to my system" | SYS-000001 HomeBag 2 |
| S24 | My problem reports; approve and pay an out-of-warranty repair | `/account/support`, `/account/support/[id]` | Account → Problem reports → a report, or Header → Support → "Your reports". The repair quote opens at `/quote/[code]` with "Approve the repair" | T-000004. The approve-the-repair step has not yet been run end to end |
| S25 | Profile: name, phone, language, how to reach me, password | `/account/profile` | Account → Profile | James |

Not in the matrix but on the storefront: `/[...missing]` and bad codes show the storefront "We could not find that page".

Route screenshots at 1440 and 402, one sheet per route: `~/Code/Euler/state/screenshots/b7-biogas/routes/sheets/`.
