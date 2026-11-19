# Orders API Test Documentation

## Overview

The Orders test suite validates both:

- FastAPI route behavior and request validation
- Real PostgreSQL database behavior
- Order status transitions
- Order history creation
- Store isolation
- Ring-again behavior
- Analytics calculations

The suite is split into two files:

- `test_order_routes.py` — API route and validation tests using a mocked `OrderService`
- `test_order_postgres.py` — integration tests using the real PostgreSQL database and real `OrderService`

The shared `conftest.py` contains fixtures for Stores, QR, and Orders.

---

# 1. Route and Validation Tests

## `test_create_order`

**Endpoint**

`POST /orders/`

**Purpose**

Verifies that a valid order creation request is passed correctly to `OrderService`.

**Checks**

- Returns HTTP `201`
- Returns the correct order number
- Converts `store_id` into a UUID
- Passes the correct `OrderCreate` object to the service

---

## `test_create_order_rejects_non_positive_number`

**Endpoint**

`POST /orders/`

**Purpose**

Ensures order numbers must be positive.

**Values tested**

- `0`
- `-1`
- `-100`

**Checks**

- Returns HTTP `422`
- `OrderService.create_order()` is not called

---

## `test_create_order_rejects_invalid_store_uuid`

**Endpoint**

`POST /orders/`

**Purpose**

Ensures malformed store IDs are rejected by FastAPI/Pydantic.

**Checks**

- Returns HTTP `422`
- Service is not called

---

## `test_get_orders`

**Endpoint**

`GET /orders/?store_id={store_id}`

**Purpose**

Tests retrieving the orders belonging to a store.

**Checks**

- Returns HTTP `200`
- Returns the expected list
- Calls `get_orders(store_id)`

---

## `test_get_orders_requires_store_id`

**Endpoint**

`GET /orders/`

**Purpose**

Ensures `store_id` is required when requesting the order list.

**Checks**

- Returns HTTP `422`
- Service is not called

---

## `test_get_order`

**Endpoint**

`GET /orders/{order_id}`

**Purpose**

Tests retrieving one order.

**Checks**

- Returns HTTP `200`
- Returns the correct order ID
- Calls `get_order(order_id)`

---

## `test_get_order_rejects_invalid_uuid`

**Endpoint**

`GET /orders/not-a-uuid`

**Purpose**

Ensures malformed order IDs are rejected before reaching the service.

**Checks**

- Returns HTTP `422`

---

## `test_get_order_propagates_404`

**Endpoint**

`GET /orders/{order_id}`

**Purpose**

Ensures a missing order returns the error produced by the service.

**Checks**

- Returns HTTP `404`
- Returns `"Order not found"`

---

# 2. Analytics Route Tests

## `test_analytics`

**Endpoint**

`GET /orders/analytics`

**Purpose**

Tests the standard analytics request.

**Checks**

- Returns HTTP `200`
- Correct `store_id` is passed
- Correct `days` value is passed
- Analytics response matches the expected schema

---

## `test_analytics_rejects_invalid_days`

**Purpose**

Validates the allowed analytics range.

The API allows:

```text
1 <= days <= 365
```

**Invalid values tested**

- `0`
- `366`
- `-1`

**Checks**

- Returns HTTP `422`
- Analytics service is not called

---

## `test_analytics_default_days_is_30`

**Purpose**

Checks the default analytics period.

**Checks**

Calling:

```text
GET /orders/analytics?store_id=...
```

without specifying `days` causes the service to receive:

```text
days = 30
```

---

# 3. Order Status Route Tests

## `test_update_status_accepts_valid_status`

**Endpoint**

`PATCH /orders/{order_id}/status`

**Statuses tested**

- `preparing`
- `ready`
- `collected`
- `cancelled`

**Purpose**

Checks that valid `OrderStatus` values are accepted by the route.

**Checks**

- Returns HTTP `200`
- Status is parsed as the proper enum
- Correct order ID is passed
- Optional store ID defaults to `None`

---

## `test_update_status_passes_optional_store_id`

**Endpoint**

`PATCH /orders/{order_id}/status?store_id={store_id}`

**Purpose**

Ensures the optional `store_id` query parameter is passed to the service.

This is important for preventing one store from modifying another store's order.

---

## `test_update_status_rejects_invalid_status`

**Purpose**

Ensures unknown status values are rejected.

Example:

```json
{
  "status": "unknown"
}
```

**Checks**

- Returns HTTP `422`
- Service is not called

---

## `test_update_status_propagates_conflict`

**Purpose**

Verifies invalid state transitions are returned as conflicts.

Example:

```text
pending -> collected
```

**Checks**

- Returns HTTP `409`

---

# 4. Ring-Again Route Tests

## `test_ring_again`

**Endpoint**

`POST /orders/{order_id}/ring`

**Purpose**

Verifies the route calls the service correctly when staff request another customer notification.

**Checks**

- Returns HTTP `200`
- Calls `ring_again(order_id, store_id=None)`

---

## `test_ring_again_passes_store_id`

**Endpoint**

`POST /orders/{order_id}/ring?store_id={store_id}`

**Purpose**

Ensures store scoping is passed through to the service.

**Checks**

- Correct `store_id` is supplied

---

## `test_ring_again_propagates_conflict`

**Purpose**

Checks that an order which cannot currently be rung returns a conflict.

For example, a pending order cannot be rung.

**Checks**

- Returns HTTP `409`

---

## `test_management_routes_reject_invalid_order_uuid`

**Purpose**

Checks invalid UUID handling for management endpoints.

**Routes tested**

- Status update
- Ring again

**Checks**

- Returns HTTP `422`

---

# 5. PostgreSQL Integration Tests

These tests use the real:

- PostgreSQL database
- SQLAlchemy models
- Order repository
- Order service
- FastAPI routes

Each test runs inside a rollback-only transaction so test data does not remain in the database.

Notification delivery and loyalty side effects are mocked so tests do not accidentally send real notifications or trigger unrelated workflows.

---

## `test_create_order_persists_order_and_initial_history`

**Purpose**

Tests the complete order creation workflow.

**Checks**

- Order is inserted into PostgreSQL
- Status starts as `pending`
- Correct store ID is stored
- Correct order number is stored
- Initial order history is created
- Initial history has:
  - `previous_status = None`
  - `new_status = pending`

---

## `test_create_order_missing_store_returns_404`

**Purpose**

Ensures orders cannot be created for a nonexistent store.

**Checks**

- Returns HTTP `404`

---

## `test_duplicate_order_number_same_day_returns_409`

**Purpose**

Tests the database uniqueness rule for order numbers.

Within the same store and date, the same order number cannot be used twice.

**Flow**

1. Create order number `25`
2. Create order number `25` again

**Checks**

- First request returns `201`
- Second request returns `409`

---

## `test_same_order_number_allowed_for_different_stores`

**Purpose**

Ensures the order-number uniqueness rule is scoped to each store.

Two different stores may both have:

```text
Order #9
```

on the same day.

**Checks**

- Both requests return HTTP `201`

---

# 6. Order Retrieval Integration Tests

## `test_get_order`

**Purpose**

Retrieves a real order stored in PostgreSQL.

**Checks**

- Returns HTTP `200`
- Correct order ID is returned

---

## `test_get_missing_order_returns_404`

**Purpose**

Tests retrieval of a nonexistent order.

**Checks**

- Returns HTTP `404`

---

## `test_get_orders_is_scoped_to_store`

**Purpose**

Verifies store isolation.

**Flow**

1. Create Store A
2. Create Store B
3. Give each store an order
4. Request Store A's orders

**Checks**

- Store A's order is returned
- Store B's order is not returned

---

# 7. Order State Machine Tests

Your service defines the following valid transitions:

```text
pending
├── preparing
└── cancelled

preparing
├── ready
└── cancelled

ready
└── collected

collected
└── no transitions

cancelled
└── no transitions
```

---

## `test_valid_status_flow_and_timestamps`

**Purpose**

Tests the normal complete order lifecycle:

```text
pending -> preparing -> ready -> collected
```

**Checks**

- Each transition succeeds
- `ready_at` is set when entering `ready`
- `completed_at` is set when entering `collected`
- History rows are created for:

```text
pending -> preparing
preparing -> ready
ready -> collected
```

The test checks transition pairs rather than relying on database row order.

---

## `test_invalid_status_transitions_return_409`

**Purpose**

Tests forbidden state transitions.

Examples include:

```text
pending -> ready
pending -> collected
preparing -> collected
ready -> cancelled
collected -> ready
cancelled -> pending
```

**Checks**

Every invalid transition returns:

```text
409 Conflict
```

---

## `test_cancel_from_pending_is_allowed`

**Purpose**

Verifies the valid cancellation path:

```text
pending -> cancelled
```

**Checks**

- Returns HTTP `200`
- Final status is `cancelled`

---

## `test_store_id_hides_other_stores_order`

**Purpose**

Tests multi-store security/isolation behavior.

If the supplied `store_id` does not own the order, the order behaves as if it does not exist.

**Checks**

- Returns HTTP `404`

---

# 8. Ring-Again Integration Tests

## `test_ring_requires_ready_order`

**Purpose**

Ensures only ready orders may be rung again.

**Checks**

A pending order returns:

```text
409 Conflict
```

---

## `test_ring_ready_order_sets_timestamp_and_clears_seen`

**Purpose**

Tests the actual ring-again behavior.

For a ready order:

- `ring_requested_at` is updated
- `customer_seen_at` is cleared

Clearing `customer_seen_at` means the kitchen can wait for the customer to see the new notification again.

---

## `test_ring_store_scope_returns_404_for_other_store`

**Purpose**

Ensures another store cannot ring an order it does not own.

**Checks**

- Returns HTTP `404`

---

# 9. Analytics Integration Tests

## `test_analytics_empty_store`

**Purpose**

Tests analytics for a store with no orders.

**Checks**

- Returns HTTP `200`
- `orders = 0`
- `collected = 0`
- `cancelled = 0`
- `ratings = 0`
- Requested `days` value is preserved
- All 24 hourly preparation buckets are returned

---

## `test_analytics_missing_store_returns_404`

**Purpose**

Ensures analytics cannot be requested for a nonexistent store.

**Checks**

- Returns HTTP `404`

---

## `test_analytics_counts_status_scan_coming_and_rating`

**Purpose**

Tests actual analytics calculations using PostgreSQL data.

The test creates a collected order with:

- Creation timestamp
- Ready timestamp
- Completion timestamp
- Customer-coming timestamp
- QR scan
- 4-star rating

**Checks**

Analytics correctly reports:

```text
orders = 1
collected = 1
scanned = 1
customers_coming = 1
ratings = 1
avg_rating = 4.0
```

It also verifies:

```text
avg_prep_seconds ≈ 300
avg_pickup_seconds ≈ 300
```

---

# 10. Shared Test Fixture Structure

All API modules now use one shared `conftest.py`.

The service mocks are deliberately named differently:

```text
Store API  -> service
QR API     -> qr_service
Orders API -> order_service
```

This prevents one module's mocked service from accidentally being used by another module.

The shared FastAPI test application includes:

```text
Store router
QR router
Orders router
```

Each route's `get_db` dependency is overridden during route-level tests.

---

# Coverage Summary

The Orders suite currently covers:

- Order creation
- Input validation
- Positive order-number validation
- Store existence checks
- Duplicate order numbers
- Cross-store order-number reuse
- Order retrieval
- Order lists
- Store isolation
- Status enum validation
- Valid state transitions
- Invalid state transitions
- Status history
- Ready timestamps
- Completion timestamps
- Cancellation
- Ring-again restrictions
- Ring timestamps
- Customer seen reset
- Store-scoped ring requests
- Analytics date range validation
- Empty analytics
- Status analytics
- QR scan analytics
- Customer-coming analytics
- Rating analytics
- Average preparation time
- Average pickup time
- Real PostgreSQL persistence
- Transaction rollback between tests
- Notification side-effect isolation
- Loyalty side-effect isolation