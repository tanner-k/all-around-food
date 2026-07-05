# Text a shopping list via Apple Messages

**Date:** 2026-06-07
**Status:** Approved (design)

## Goal
From the Shop page, send the current shopping list as an iMessage/SMS to any
phone number. The message is sent automatically through Messages.app on the Mac
running the backend (via AppleScript / `osascript`).

## Decisions
- **Send mechanism:** AppleScript backend auto-send. Only works when the backend
  runs on a signed-in Mac; on any other platform the endpoint returns a clear
  503-style error.
- **UI placement:** New "Text list" button in the Shop footer action row,
  alongside the existing disabled "Send to Kroger" placeholder.
- **Recipient:** Free-text phone input plus remembered recently-used numbers
  (stored client-side in `localStorage`, capped at 5).
- **Items sent:** Currently-visible (unchecked) items, grouped by aisle.

## Data flow
```
ShoppingListView (footer "Text list" button)
  → TextListModal (phone input + remembered-number chips)
    → lib/api.ts: textShoppingList(recipient)
      → POST /api/shopping-list/text   (Next route, proxyToBackend)
        → FastAPI POST /shopping-list/text
          → load list → format message → normalize recipient → osascript send
```

## Backend — new `allaroundfood/messaging/` package
- **`formatter.py`** — `format_shopping_list(items) -> str`. Renders unchecked
  items grouped by aisle as plain text with a header line and bulleted items;
  appends `quantity_text` in parentheses when present.
- **`phone.py`** — `normalize_phone(raw) -> str`. Strips formatting, keeps an
  optional leading `+` and digits, validates length (7–15 digits). Raises
  `ValueError` otherwise. This is the security boundary before `osascript`.
- **`imessage.py`** — `send_imessage(recipient, body) -> None`. Guards on
  `platform.system() == "Darwin"`. Runs `osascript` via `subprocess.run`
  passing recipient + body as `on run argv` arguments (never string-interpolated
  into the script) to prevent AppleScript/shell injection. Raises
  `MessagingError` on platform mismatch or `osascript` failure.

## API — `api.py`
- `POST /shopping-list/text`, body `{ "recipient": str }`.
- Loads the current list, filters to unchecked items, formats, normalizes the
  recipient, sends. Returns `{ "sent_to": str, "item_count": int }`.
- Errors (raised as `HTTPException`, surfaced by the proxy under `error`):
  - empty list → 400 "Nothing to send — your shopping list is empty."
  - invalid number → 422 (ValueError message)
  - non-Mac / osascript failure → 503 "Texting only works when the app runs on a
    signed-in Mac."

## Frontend
- **`app/api/shopping-list/text/route.ts`** — proxies to backend (mirrors
  `generate/route.ts`).
- **`lib/api.ts`** — `textShoppingList(recipient): Promise<TextResult>`,
  Zod-validated (`TextResultSchema = { sent_to, item_count }`).
- **`components/shopping/TextListModal.tsx`** — phone input, remembered-number
  chips, Send/Cancel, inline error + success. Remembered numbers in
  `localStorage` key `aaf.sms.recipients` (most-recent-first, max 5).
- **`ShoppingListView.tsx`** — "Text list" button in the footer opens the modal.

## Testing (TDD)
- Backend unit: `formatter` (grouping, quantity, empty), `phone`
  (valid/invalid/normalization — security-critical), `imessage` with
  `subprocess`/`platform` mocked (asserts argv passing, never shell strings;
  platform guard raises).
- API: `/shopping-list/text` happy path, empty-list, bad-number, non-Darwin
  (osascript mocked).
- Frontend: `TextListModal` render, remembered-number persistence, error display.

## Out of scope (YAGNI)
No Twilio/SMS gateway, no Contacts integration, no scheduling, no delivery
receipts, no backend storage of recipients.
