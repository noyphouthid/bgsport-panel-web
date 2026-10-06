# Factory receipt QR integration

`/factory-receipts` accepts camera scans, scanner input, pasted factory links, shop QR labels, and manually entered order/bill codes.

For `https://bgsport.lifefootball.la/agent/orders/<id>`, the authenticated panel API logs into the factory site on the server and reads `/api/agent-portal/orders/<id>`. The value in `order.code` is the heading on the order page (e.g. `#26-564653`). `production.orderCode` is a separate production identifier and is not used for matching.

The page matches the complete code against `orders.factory_bill_code`, with or without a leading `#`. It preserves the year prefix and rejects ambiguous matches. The local lookup uses the user's Supabase session and existing row access rules. Scanning adds the order to the receipt queue; the user still confirms the receipt to save it. Existing duplicate receipt and shipped/completed order checks apply.

Configure these **server-only** environment variables in `.env.local` and in the deployment environment:

```dotenv
LIFEFOOTBALL_AGENT_USERNAME=<factory username>
LIFEFOOTBALL_AGENT_PASSWORD=<factory password>
```

Restart the application after updating its environment. Do not prefix these variables with `NEXT_PUBLIC_` or commit credentials. The existing Supabase server configuration is also required for panel authentication.

Factory requests are restricted to the fixed HTTPS factory origin. Credentials and factory session cookies never reach the browser. Sessions are cached in server memory for ten minutes; an expired session triggers one login retry. Connection failures, login failures, missing orders, and missing configuration produce messages on the receipt page.

Example: the supplied factory link resolves to `26-564653`, which matches local order `RK26-9097`.
