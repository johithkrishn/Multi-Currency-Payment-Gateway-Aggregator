# Mobile companion (Expo Go)

React Native app for the **Multi-Currency Payment Gateway Aggregator**.
This is an **educational simulation**. It never contacts a real payment provider, has no card fields and moves no real money.

- Expo SDK **58** (`expo ~58.0.26`), React Native 0.88.1, React 19.3, JavaScript (no TypeScript)
- Dependencies beyond the blank template: `react-native-safe-area-context`, plus `react-dom`, `react-native-web` and `@expo/metro-runtime` (only needed for the web preview). All were installed with `npx expo install`.
- It has no navigation library, Reanimated, Gesture Handler or bottom-sheet package. The sheet uses React Native's `Modal`, `Animated` and `PanResponder`, so it runs in Expo Go without any extra native modules.

## Run it on a phone (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

Install **Expo Go** from the App Store or Play Store. It must support SDK 58. Then scan the QR code: on Android, scan it inside Expo Go; on iPhone, use the Camera app. The phone and the computer must be on the same network. If they can't be, use `npx expo start --tunnel`.

> The Expo SDK 58 toolchain (React Native 0.88) needs **Node ≥ 22.13** (Node 24 LTS recommended). On older Node versions, `npm install` prints `EBADENGINE` warnings and the bundler may fail.

Browser preview, used for quick checks only (it is not a replacement for testing on a device):

```bash
npx expo start --web           # dev server
npx expo export --platform web # static bundle in dist/
```

## What's in the app

| | |
|---|---|
| **Screen 1 — Checkout** (`src/screens/CheckoutScreen.js`) | A persistent "SIMULATION MODE — no real payment is processed" pill, the amount field (decimal pad, validated live), USD/INR/EUR source and target pickers with **Swap currencies**, the FX preview: a **Live / Demo** switch; a pulsing "Live reference rate" badge; the rate in both directions; the difference from the demo table; the source and "as of" time with **Refresh**; the converted amount; and a disclaimer, two mock provider cards with the estimated fee and total and a **Lowest fee** badge, the **Demo outcome** developer control (Success / Failure / Rules) and a sticky **Review Payment** button. |
| **Checkout bottom sheet** (`src/components/CheckoutBottomSheet.js`) | A modal that belongs to the checkout screen, not a third screen. It contains an editable amount, a target-currency picker (the rate updates as soon as you change it), the full breakdown (converted × fee% = fee; converted + fee = total), the provider and the disclaimers, and then **Confirm Simulation**. While the simulation runs, the sheet shows the CREATED → AUTHORIZING → PROCESSING → SUCCESS/FAILED steps (`run()` with 450 ms latency) and then opens the result. You can close it with the **Back to Checkout** button, by dragging the handle down, by tapping the backdrop or with the Android back button. None of these submit anything, and closing is blocked while a simulation is running. |
| **Screen 2 — Payment result** (`src/screens/PaymentResultScreen.js`) | An icon and a heading ("Simulated payment successful" / "Simulated payment failed"), a SIMULATED badge, the failure reason, the reference (`SIM-<TAG>-YYYYMMDD-XXXXXX`), the provider, amounts, rate, fee, total, timestamp, outcome mode and rule, and the status timeline. It has **Back to Checkout** (keeps your values) and, after a failure, **Retry** (returns to checkout and reopens the review sheet). The Android back button returns to checkout. |

Navigation is a single `screen` state in `App.js` (`"checkout" | "result"`), plus a `BackHandler` listener.

### Demo rules (Rules mode)

- An amount ending in **.13** (e.g. `10.13`) → simulated issuer decline.
- An amount above **25,000 USD-equivalent** → simulated risk-limit decline.
- Otherwise → simulated success.

## Live reference rates

`src/hooks/useLiveRates.js` uses the shared `live-rates.js` module, the same one the web app uses.
- **Sources:** it fetches real reference rates, trying the European Central Bank (via Frankfurter) first, then ExchangeRate-API, then currency-api.
- **When it checks:** on launch, every 5 minutes, whenever the app returns to the foreground, and when you tap **Refresh**.
- **Fallback:** if no source responds, it keeps the last snapshot from this session. If there isn't one, it uses the demo table and labels it "Demo rate · live unavailable".
- **Storage:** the live snapshot is kept in memory only, so it isn't saved between app launches (no extra storage package is needed in Expo Go). The **Demo** switch uses the PRD table.
- **Saved attempts:** each attempt stores the rate source it used.
- **Network:** the phone needs internet access for Live mode, and only the three public rate endpoints are contacted.

## Shared core: sync rule

`src/core/currency.js`, `src/core/payment-simulator.js` and `src/core/live-rates.js` are **verbatim copies** of the same files in `web/js/`, with a sync header added on top. The web and mobile apps must produce **identical numbers** for the same input, so:

1. Never edit the files in `mobile/src/core/` directly.
2. Change the file in `web/js/` first, then run `npm run sync-core` from the project root (it rewrites both copies with the header).
3. Run `npm test` from the project root. It fails if the copies drift and checks that web and mobile return identical quotes for every fixture.

The UI code only formats values. Every amount, rate, fee, outcome and reference comes from the shared core. Display helpers live in `src/format.js`. Rate formatting delegates to the shared `formatRate` (`1 USD = 83.0000 INR`), so it matches the web app exactly.

Quick check that the numbers match:

```bash
node -e 'const C=require("./mobile/src/core/currency.js");const q=C.quote({amount:"100",source:"USD",target:"INR",provider:C.DEFAULT_PROVIDERS[0],table:C.buildRateTable()});console.log(q.convertedDisplay,q.feeDisplay,q.totalDisplay)'
# → 8300 240.7 8540.7
```

## History is local and in memory only

The mobile app keeps this session's attempts in a `useState` array in `App.js`. The checkout screen shows "N simulated attempts this session (local to this app)" and the last three references. This history is **not persisted and not shared with the web app**. It disappears when the app is reloaded or closed.

## Project structure

```
mobile/
  App.js                       screen state, session history, Android back
  src/core/                    shared logic (synced from web/js — do not edit)
  src/theme.js                 "Dusk" palette + type + spacing tokens
  src/format.js                display-only helpers (rate precision, times)
  src/hooks/useReduceMotion.js OS "reduce motion" setting
  src/components/              AmountField, CurrencyPicker, ProviderSelector, FXPreview,
                               PrimaryButton, CheckoutBottomSheet, StatusTimeline,
                               OutcomeModeControl, SimulationBanner, StatusIcon,
                               BrandLogo, DuskGradient (svg sunset wash)
  src/screens/                 CheckoutScreen, PaymentResultScreen
```

## Accessibility notes

- Every control has an accessible role, label and state (radio groups for currencies, providers and outcome; buttons for swap, close and confirm).
- Touch targets are at least 44 pt. `allowFontScaling` is left on, and amounts use tabular numerals.
- Success and failure are shown with text **and** an icon, not with colour alone.
- When the OS "Reduce motion" setting is on, the sheet appears without the slide or spring and the result screen skips the scale animation.

## Physical-device test checklist (students: please fill in)

Copy this table once for each device you test.

| Field | Value |
|---|---|
| Device model | |
| OS and version | |
| Expo Go version | |
| Tester / date | |

| # | PRD mobile check | Expected | Result (Pass/Fail) | Notes |
|---|---|---|---|---|
| 1 | App loads in Expo Go from the QR code | Checkout screen with SIMULATION MODE pill | | |
| 2 | Amount field opens the decimal keypad | Numeric keypad with a decimal key | | |
| 3 | Empty / `0` / `-5` / `1.234` / `abc` amount | Exact error under the field, value kept, Review Payment disabled | | |
| 4 | Swap currencies | Source and target swap, rate and converted amount update | | |
| 5 | FX preview `100 USD → INR` | `1 USD = 83.0000 INR`, `₹8,300.00`, disclaimer visible | | |
| 6 | Provider cards | Stripe-like fee ₹240.70 / total ₹8,540.70; Razorpay-like ₹166.00 / ₹8,466.00 with "Lowest fee" | | |
| 7 | Review Payment opens the sheet | Slides up with dimmed backdrop | | |
| 8 | Change target currency inside the sheet | Rate, converted amount, fee and total update immediately | | |
| 9 | Keyboard open inside the sheet (short screen) | Confirm Simulation and Back to Checkout stay visible / reachable | | |
| 10 | Drag handle down | Sheet closes, nothing submitted | | |
| 11 | Tap backdrop | Sheet closes, nothing submitted | | |
| 12 | Android hardware back with sheet open | Sheet closes, nothing submitted | | |
| 13 | Double-tap Confirm Simulation | Exactly one attempt recorded | | |
| 14 | Processing state | Steps animate CREATED → AUTHORIZING → PROCESSING → outcome | | |
| 15 | Success (mode Success or Rules with 100) | "Simulated payment successful" with details and timeline | | |
| 16 | Failure (amount `10.13` in Rules mode) | "Simulated payment failed", issuer-decline reason, Retry visible | | |
| 17 | Retry | Back on checkout with the same values and the review sheet open | | |
| 18 | Back to Checkout from result | Previous values kept; attempts counter incremented | | |
| 19 | Android back on result screen | Returns to checkout | | |
| 20 | Safe areas (notch / home indicator / Android nav bar) | No content hidden behind system UI | | |
| 21 | Large text (OS font size max) | Text scales; nothing critical clipped | | |
| 22 | Screen reader (VoiceOver / TalkBack) | Controls announced with name, role and state; errors announced | | |
| 23 | Reduce motion on | Sheet and result appear without spring/scale animation | | |
| 24 | Numbers match the web app for the same input | Identical converted, fee and total values | | |

Known item to check on device: on some locales the decimal keypad shows `,` instead of `.`. The shared validator only accepts a comma as a digit-group separator (`1,000` or `1,00,000`), so `99,5` is safely rejected with "Enter a valid number…" instead of being misread as 995. If your device's keypad shows a comma, note it in row 3.
