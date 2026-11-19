# Screens API Test Documentation

## Overview

The Screens test suite validates the token links used by the store's display and waiting screens.

It covers:

- first-time token issuance
- idempotent link retrieval
- manager/owner authorization
- selective token regeneration
- invalidation of old links
- public token resolution
- display vs waiting screen identification
- malformed and oversized token handling
- real PostgreSQL persistence
- token-generation properties

Screens does not have a service class. Route-level tests therefore use dedicated `screen_db`, `screen_authorize`, and `screen_client` fixtures instead of a `screen_service` mock.

## Route tests

### Get screen links

`GET /stores/{store_id}/screens?actor_id={actor_id}`

Checks:
- missing display/waiting tokens are generated
- existing tokens are preserved
- only a missing token is generated when the other already exists
- database commit occurs
- authorization requires at least manager
- missing store returns HTTP 404
- permission errors propagate
- malformed store/actor UUIDs return HTTP 422

### Regenerate screen link

`POST /stores/{store_id}/screens/{kind}/regenerate?actor_id={actor_id}`

Checks:
- `display` regeneration changes only the display token
- `waiting` regeneration changes only the waiting token
- first regeneration initializes both tokens if needed
- invalid kind returns HTTP 422
- missing store returns HTTP 404
- changes are committed

### Resolve token

`GET /screens/{token}`

Checks:
- display token resolves with `kind = display`
- waiting token resolves with `kind = waiting`
- response includes correct store ID/name
- unknown token returns HTTP 404
- tokens longer than 64 characters return HTTP 404 before a database query

## PostgreSQL integration tests

Checks:
- owner can issue links
- manager can issue links
- staff cannot issue links
- inactive manager is rejected
- actor from another store is rejected
- generated tokens persist on the Store row
- repeated reads return the same tokens
- regenerating one token leaves the other unchanged
- old regenerated token immediately stops resolving
- new token resolves successfully
- display and waiting tokens resolve to the correct screen kind
- staff cannot regenerate tokens
- invalid screen kind returns HTTP 422

## Token helper tests

The `_token()` helper is checked for:
- URL-safe characters
- expected length
- no duplicate values across 100 generated samples

## Shared fixtures

Existing fixtures remain unchanged:

- Store: `service`
- QR: `qr_service`
- Orders: `order_service`
- Notifications: `notification_service`
- Auth: `auth_service`
- Team: `team_service`

Screens additionally uses:
- `screen_db`
- `screen_authorize`
- `screen_client`

All modules still share one combined `conftest.py`.
