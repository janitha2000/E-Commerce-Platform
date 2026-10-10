# Stylora

Stylora is a responsive fashion storefront with a product catalogue, saved shopping bag, customer accounts, curated edits, and hosted PayHere checkout.

## Run locally

1. Install Node.js 20 or newer and MongoDB.
2. Copy `.env.example` to `.env`, then set `MONGODB_URI` and a unique `SESSION_SECRET` of at least 32 characters.
3. Run `npm install`.
4. Run `npm run dev` in one terminal. Open `http://localhost:5000` for the simplest setup, or use VS Code Live Server on port 5500 in a second terminal; the app routes its API calls to port 5000 in that setup.

The store can be browsed without payment credentials. Checkout stays unavailable until PayHere is configured; it does not simulate or claim successful payments.

If the page reports that the store database is unavailable, account registration, sign-in, products, and checkout will not work until MongoDB is reachable. The server stays available and retries the connection automatically. For MongoDB Atlas, confirm that the cluster is running, the database user credentials in `MONGODB_URI` are current, and your current public IP is allowed under **Security → Network Access**. If Atlas still rejects the TLS handshake, check whether a VPN, proxy, or firewall is interfering. Do not disable TLS to work around connection errors.

When using Live Server, keep the Stylora backend running with `npm run dev`. Live Server serves only the frontend files; it does not replace the backend.

## Customer accounts

Email/password accounts are stored in MongoDB. Passwords are hashed with bcrypt; login and registration requests are rate limited; sessions are stored in MongoDB and use HTTP-only, same-site cookies.

The standalone account page is available at `/login.html`; the storefront's **Sign in** button opens it. Customers can switch between sign-in and account creation on that page.

Google sign-in is optional. Create a Google OAuth web client and add its client ID and secret to `.env`. Add this authorized redirect URI to that client:

```text
http://localhost:5000/api/auth/google/callback
```

For deployment, use the HTTPS callback matching `APP_BASE_URL`:

```text
https://your-store.example/api/auth/google/callback
```

The app only accepts Google profiles with a verified email and does not silently link Google identities to existing password accounts.

## PayHere setup

1. Create a PayHere merchant account and add the public store domain under **Integrations**.
2. After PayHere approves the domain, copy its merchant ID and that domain's merchant secret into `.env`.
3. Set `APP_BASE_URL` to the exact public origin registered with PayHere. The server notification URL is `${APP_BASE_URL}/api/payments/payhere/notify`; it must be publicly reachable. A local-only URL cannot receive payment notifications.
4. Test with `PAYHERE_MODE=sandbox`. Set `PAYHERE_MODE=live` only after PayHere activates the merchant integration and HTTPS is enabled.
5. For production, set `NODE_ENV=production`, use HTTPS for `APP_BASE_URL`, and set a strong `SESSION_SECRET`.

PayHere hosts the payment page. The app verifies PayHere's signed server notifications, reserves stock during checkout, and marks an order paid only after a valid success notification. Card details are never collected by Stylora. If a payment arrives after an expired stock reservation, the order is marked `Refund Required` for merchant follow-up instead of being incorrectly fulfilled.

## Checks

Run the automated tests, JavaScript syntax checks, and dependency audit:

```text
npm test
node --check server.js
node --check src/auth.js
node --check src/payhere.js
node --check public/script.js
npm audit
```

Checkout and account integration checks require a reachable MongoDB instance. PayHere transactions and Google OAuth also require the merchant and OAuth credentials described above.
