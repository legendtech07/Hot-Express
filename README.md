# Hot Express

A logistics web app for **Ondo** and **Enugu**. Buyers request nearby riders to pick things up or send packages; vendors post items and fulfil orders through the same rider network; riders choose which open jobs to accept — nobody is force-assigned a job.

This build follows the file structure you laid out, using vanilla HTML/CSS/JS and Firebase (Auth + Firestore).

## How the core flow works

1. A buyer creates a **delivery request** — either "request a rider" (go collect something from somewhere, e.g. a Jumia pickup point), "send a package" (deliver something to someone else), or a **vendor order** (bought an item from a vendor's listing).
2. Every rider who is (a) registered in the same city and (b) currently switched **Available** on their dashboard gets a notification.
3. The first rider to hit **Accept** on `rider/available-jobs.html` gets the job. Nobody is assigned automatically.
4. The rider walks the job through **Picked up → In transit → Delivered** from `rider/active-delivery.html`, and the requester watches the same progress live on their `delivery-details.html` page.
5. Payment is POD (pay on delivery) for now — the rider logs the fee collected when marking a job delivered, and Hot Express's commission is calculated from that (see `js/payments.js`).

## Accounts & roles

Every account is a **buyer** by default. At sign-up, a person can optionally add **one** extra role:
- **Buyer + Vendor** — can also post items for sale (`vendor/dashboard.html`).
- **Buyer + Rider** — can also see and accept open jobs (`rider/dashboard.html`).

This was built as mutually exclusive (vendor *or* rider, not both) since that's how you described it and it keeps each dashboard's permissions simple. If you actually want someone to be able to hold both extra roles at once, that's a small change to `register.html` (swap the radio buttons for checkboxes) and `js/auth.js`.

Admins aren't self-serve — there's no "become an admin" option anywhere in the UI. Set `isAdmin: true` by hand on a user's Firestore document to grant access to `/admin`.

## What's fully working

- Registration with role selection, login, auth-guarded pages (`js/utils.js` → `requireAuth` / `requireRole`)
- Buyer: request a rider, send a package, live tracking, notifications, browsing/buying nearby vendor listings (built into `user/dashboard.html` — see note below)
- Vendor: post/list items, see fulfilments, manually request a rider for an order, notifications
- Rider: availability toggle, live open-jobs feed scoped to their city, accept-first-wins, job status updates, POD fee logging, earnings
- Admin: read-only overview of users/vendors/riders/deliveries, payments/commission report

## What's stubbed / a reasonable next step

- **Marketplace browsing page** — your file tree doesn't include a dedicated "browse vendors" page under `/user`, so buying is built directly into `user/dashboard.html` (a "Marketplace near you" section). Worth splitting into its own page once you have more than a handful of vendors.
- **Disputes** (`admin/disputes.html`) — the table reads from a `disputes` collection, but there's no "report an issue" button anywhere yet for a buyer/vendor/rider to actually create one.
- **Payment gateway** — no Paystack/Flutterwave integration. Everything assumes cash-on-delivery collected by the rider. `js/payments.js` is written so that plugging in a gateway later is a change in one file.
- **Admin settings** (`admin/settings.html`) saves a commission rate to Firestore, but `js/payments.js` still uses a fixed constant — wire the two together when you're ready.
- **Vendor verification / user suspension** — fields exist (`vendorInfo.verified`, could add `isActive`) but there's no admin UI to flip them yet.
- `assets/images/logo.png` / `logo-white.png` are referenced everywhere but not included in this build — drop your actual logo files in at those exact paths and everything picks them up automatically.

## Firestore data model

- **users/{uid}** — `name, phone, email, location, roles[], isAdmin, vendorInfo{businessName, verified}?, riderInfo{vehicleType, available, completedJobs}?`
- **products/{id}** — `vendorId, vendorName, title, description, price, location, status`
- **deliveryRequests/{id}** — `requesterId, type ("pickup"|"send"|"vendor_order"), location, pickupAddress, dropoffAddress, itemDescription, status, riderId, fee, vendorId?`
- **notifications/{id}** — `toUserId, title, body, requestId, read`
- **disputes/{id}** — reserved, not yet written to by any page
- **settings/global** — `commissionRate`

## Setup

1. **Enable Email/Password auth** in the Firebase console (Authentication → Sign-in method).
2. **Create a Firestore database** (production mode).
3. **Deploy the security rules** in `firestore.rules` (added in this build — the app isn't safe to run without it): `firebase deploy --only firestore:rules`.
4. **Composite indexes**: the rider "available jobs" query and the "notify nearby riders" query both filter on multiple fields. Firestore will show a direct "create index" link in the browser console the first time each query runs — click through those the first time you test each flow. You'll need indexes roughly matching:
   - `deliveryRequests`: `location ==`, `status ==`, `createdAt desc`
   - `users`: `roles array-contains`, `location ==`, `riderInfo.available ==`
5. **Serve the site.** Since everything is static files with ES module imports, any static server works, e.g. `firebase deploy --only hosting`, or `npx serve .` for local testing (opening `index.html` directly via `file://` won't work — ES modules require http).
6. **Make yourself an admin**: register a normal account, then in the Firestore console set `isAdmin: true` on that user's document.

## Structure

Matches the layout you provided — `user/`, `vendor/`, `rider/`, `admin/` each hold that role's pages; `css/` and `js/` are shared; `js/deliveries.js` is the one file every role's request/accept/track logic funnels through, so that's the place to look first when changing how requests behave.
