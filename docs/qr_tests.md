# QR API Test Documentation

## Overview

The QR test suite validates both:

- FastAPI route behavior and request validation
- Real PostgreSQL database behavior

The suite is split into two main files:

- `test_qr_routes.py` — route and validation tests using mocked services
- `test_qr_postgres.py` — integration tests using the real database and QR service logic

---

# 1. Route and Validation Tests

## `test_create_or_get_qr`

**Endpoint**

`POST /orders/{order_id}/qr`

**Purpose**

Verifies that the endpoint calls the QR service correctly when creating or retrieving a QR code.

**Checks**

- Returns HTTP `200`
- Returns the correct `order_id`
- Calls `create_or_get(order_id)`

---

## `test_get_qr`

**Endpoint**

`GET /orders/{order_id}/qr`

**Purpose**

Verifies that an existing QR code can be retrieved for an order.

**Checks**

- Returns HTTP `200`
- Calls `get_by_order(order_id)`

---

## `test_order_routes_reject_invalid_uuid`

**Endpoints**

Tests all order-based QR endpoints with an invalid UUID.

**Purpose**

Ensures FastAPI rejects malformed order IDs before calling the service.

**Checks**

- Returns HTTP `422`

Routes tested include:

- Create QR
- Get QR
- Get QR image
- Rotate QR
- Revoke QR

---

## `test_get_qr_image`

**Endpoint**

`GET /orders/{order_id}/qr/image`

**Purpose**

Verifies QR image responses for both supported image formats.

**Formats tested**

- PNG
- SVG

**Checks**

- Returns HTTP `200`
- Correct response bytes
- Correct `Content-Type`
- `Cache-Control: no-store`
- Correct service method is called

---

## `test_get_qr_image_rejects_bad_format`

**Endpoint**

`GET /orders/{order_id}/qr/image?format=jpg`

**Purpose**

Ensures unsupported QR image formats are rejected.

**Checks**

- Returns HTTP `422`
- QR service is not called

---

## `test_rotate_qr`

**Endpoint**

`POST /orders/{order_id}/qr/rotate`

**Purpose**

Verifies the rotate endpoint forwards the request correctly to the QR service.

**Checks**

- Returns HTTP `200`
- Calls `rotate(order_id)`

---

## `test_revoke_qr`

**Endpoint**

`POST /orders/{order_id}/qr/revoke`

**Purpose**

Verifies QR revocation through the API.

**Checks**

- Returns HTTP `200`
- Calls `revoke(order_id)`

---

## `test_public_tracking_routes`

**Endpoints**

- `GET /track/{token}`
- `POST /track/{token}/scan`
- `POST /track/{token}/seen`
- `POST /track/{token}/coming`

**Purpose**

Ensures the public tracking endpoints call the correct service methods and return privacy-related headers.

**Checks**

- Returns HTTP `200`
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- Correct token is sent to the service

---

## `test_rating_accepts_1_to_5`

**Endpoint**

`POST /track/{token}/rating`

**Purpose**

Verifies all allowed rating values.

**Values tested**

`1, 2, 3, 4, 5`

**Checks**

- Returns HTTP `200`
- Returned rating matches submitted rating
- Service receives the correct stars value

---

## `test_rating_rejects_out_of_range`

**Endpoint**

`POST /track/{token}/rating`

**Purpose**

Verifies rating validation.

**Invalid values tested**

- `0`
- `6`
- `-1`
- `99`

**Checks**

- Returns HTTP `422`
- Service is not called

---

## `test_order_route_errors_propagate`

**Purpose**

Ensures errors raised by the QR service are returned correctly through FastAPI.

**Example**

If the service raises:

`404 Not Found`

the API also returns:

`404 Not Found`

---

# 2. PostgreSQL Integration Tests

These tests use the real:

- PostgreSQL database
- SQLAlchemy models
- QR service
- QR repository
- FastAPI routes

Each test runs inside a database transaction that is rolled back afterward.

---

## `test_create_qr_and_get_same_active_qr`

**Purpose**

Verifies QR creation is idempotent while the QR is active.

**Flow**

1. Create QR
2. Create QR again for the same order
3. Compare results

**Checks**

- Both requests return HTTP `200`
- Same QR ID is returned
- Same tracking URL is returned
- Only the existing active QR is reused

---

## `test_get_qr_for_missing_order_qr_returns_404`

**Purpose**

Checks behavior when the order exists but does not yet have a QR code.

**Checks**

- Returns HTTP `404`

---

## `test_rotate_changes_token_and_reactivates`

**Purpose**

Verifies QR rotation generates a new tracking URL.

**Flow**

1. Create QR
2. Save old URL
3. Rotate QR

**Checks**

- New tracking URL differs from old URL
- QR is active
- `revoked_at` becomes `None`
- `scanned_at` is reset

---

## `test_revoke_is_idempotent_and_blocks_tracking`

**Purpose**

Checks that QR revocation is safe to call repeatedly.

**Flow**

1. Create QR
2. Revoke QR
3. Revoke it again
4. Try using the old tracking link

**Checks**

- Both revoke requests succeed
- QR becomes inactive
- Tracking the revoked token returns HTTP `410`

---

## `test_expired_qr_cannot_be_reused_until_rotate`

**Purpose**

Tests expired QR behavior.

**Flow**

1. Create QR
2. Manually expire it
3. Try creating/reusing it
4. Rotate it

**Checks**

- Reusing expired QR returns HTTP `409`
- Rotating creates a usable active QR again

---

## `test_qr_image_generation`

**Purpose**

Tests actual QR image generation.

**Formats tested**

- PNG
- SVG

**Checks**

- Returns HTTP `200`
- Correct MIME type
- `Cache-Control: no-store`
- Actual image bytes are generated

---

## `test_tracking_unknown_token_returns_404`

**Purpose**

Checks handling of invalid or unknown public QR tokens.

**Checks**

- Returns HTTP `404`

---

## `test_scan_sets_scanned_at_once`

**Purpose**

Checks that the first customer scan is recorded only once.

**Flow**

1. Create QR
2. Scan once
3. Save `scanned_at`
4. Scan again

**Checks**

- First scan creates a timestamp
- Second scan does not replace the original timestamp

This verifies the scan operation is idempotent.

---

## `test_seen_only_sets_timestamp_when_ready`

**Purpose**

Verifies `customer_seen_at` only gets recorded when the order is ready.

**Flow**

1. Scan while order is pending
2. Confirm no timestamp
3. Change order status to `READY`
4. Call `/seen` again

**Checks**

- Pending order does not receive `customer_seen_at`
- Ready order does receive `customer_seen_at`

---

## `test_coming_requires_ready_and_sets_seen`

**Purpose**

Tests the customer's "I'm coming" action.

**Flow**

1. Call `/coming` while order is pending
2. Change order to `READY`
3. Call `/coming` again

**Checks**

- Pending order returns HTTP `409`
- Ready order succeeds
- `customer_coming_at` is set
- `customer_seen_at` is also set

The second timestamp is expected because pressing "I'm coming" means the customer has also seen the order.

---

## `test_rating_requires_collected_and_replaces_previous_rating`

**Purpose**

Tests the complete rating workflow.

**Flow**

1. Try rating before collection
2. Change order to `COLLECTED`
3. Submit 5 stars
4. Submit 3 stars

**Checks**

- Rating before collection returns HTTP `409`
- Collected order can be rated
- Second rating replaces the first
- Only one database rating row exists
- Final rating becomes `3`

---

## `test_missing_order_returns_404_for_management_routes`

**Purpose**

Checks management endpoints against a nonexistent order.

**Routes tested**

- Create QR
- Rotate QR
- Revoke QR

**Checks**

- Each returns HTTP `404`

---

# 3. Expected Failure Test

## `test_qr_management_routes_require_auth`

**Status**

Expected failure (`xfail`)

**Purpose**

Documents a security requirement that is not implemented yet.

The QR management routes currently allow operations such as:

- Creating QR codes
- Rotating QR codes
- Revoking QR codes

without requiring staff authentication.

The test expects:

- HTTP `401`, or
- HTTP `403`

It remains marked as `xfail` until authentication is added.

---

# Coverage Summary

The suite currently tests:

- QR creation
- QR retrieval
- QR idempotency
- QR expiration
- QR rotation
- QR revocation
- PNG generation
- SVG generation
- Invalid image formats
- Invalid UUIDs
- Missing orders
- Missing QR codes
- Unknown tracking tokens
- Revoked tracking tokens
- Customer scan tracking
- Customer seen tracking
- "I'm coming" workflow
- Order status restrictions
- Ratings from 1–5
- Invalid ratings
- Rating replacement
- Database persistence
- Database isolation
- Cache-control headers
- Referrer privacy headers
- Missing authentication requirement