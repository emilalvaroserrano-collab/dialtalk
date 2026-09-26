# DialTalk

DialTalk is the ABI Tech call-center CRM frontend for **AbbieCSR**. It includes a mobile-style dialer, KYC context, customer queue, live transcript UI, and a real browser-to-LiveKit voice connection.

## Stack

- React + Vite
- Tailwind CSS
- LiveKit Client SDK
- Vercel serverless token endpoint
- Explicit LiveKit agent dispatch to `AbbieCSR`

## Vercel environment variables

Set these in Vercel as encrypted server-side variables:

```text
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Do not prefix them with `VITE_`. The LiveKit API secret must never be exposed to the browser.

## Voice worker

Run the separate AbbieCSR LiveKit worker with the same LiveKit project. Its environment also needs:

```text
GOOGLE_API_KEY=
CARTESIA_API_KEY=
```

## Development

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
```

Each new dialer call creates a unique room, so the token's room configuration dispatches the `AbbieCSR` agent when the room is created.
