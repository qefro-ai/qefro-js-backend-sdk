# Plain REST Order API (no SDK webhook)

For testing **REST / OpenAPI Business Tools** — including **widget identity forwarding**.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/rest/health` | none | Health |
| GET | `/rest/orders/{orderId}` | `X-API-Key` | Order status by ID |
| GET | `/rest/orders` | `X-API-Key` | List all sample orders |
| GET | `/rest/my-orders?customer_id=` | service `Authorization: Bearer` | Customer list (not identity forward) |
| GET | `/rest/identity/me` | **END_USER_IDENTITY** | Whoami from forwarded JWT/session |
| GET | `/rest/identity/my-orders` | **END_USER_IDENTITY** | Orders for signed-in user |

### Demo end-user tokens (widget.identify)

| Token | Mode | Customer |
| --- | --- | --- |
| `dev-jwt-alice` | jwt | Alice / info@cyberfly.io |
| `dev-jwt-bob` | jwt | Bob |
| `dev-session-alice` | session | Alice |
| `dev-session-bob` | session | Bob |

Default service secrets: `dev-rest-api-key` / `dev-rest-bearer`

## Admin: identity-forward tools

Create REST tools against:

- `https://api.cyberfly.io/rest/identity/me`
- `https://api.cyberfly.io/rest/identity/my-orders`

| Field | Value |
| --- | --- |
| Credential type | **Forward signed-in user** (`END_USER_IDENTITY`) |
| Who can use | **Verified channel** (after `identify()`) |
| Secret | leave empty |
| Allow from chat | off is fine — identity unlocks the tool |

## Widget

```js
widget.identify({
  id: 'cust-alice',
  email: 'info@cyberfly.io',
  name: 'Alice',
  auth: { mode: 'jwt', token: 'dev-jwt-alice' },
});
```

Or open the hosted demo: `https://api.cyberfly.io/widget-identity-demo/` (paste widget token).

## Run

```bash
cp .env.example .env
npm install
npm start
```
