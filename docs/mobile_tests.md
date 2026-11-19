# Mobile Orders and Menu Test Documentation

## Overview

The Mobile test suite covers both customer-facing and staff-facing functionality:

- delivery/collection choices from a QR tracking link
- mobile-order settings
- store menu management
- public menu
- phone orders
- car orders
- active deliveries
- menu item photos
- schema validation and plate normalization
- real PostgreSQL persistence
- staff/manager authorization

The shared service mock is named `mobile_service`. The route tests also isolate the QR resolver and staff authorization so the real QR/Auth code never receives a dummy database session.

## Route tests

### Customer delivery routes

`GET /track/{token}/delivery`

Checks:
- QR token is resolved
- correct order is passed to `MobileService.state`
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`

`POST /track/{token}/delivery`

Checks:
- request is parsed as `DeliveryBody`
- order is resolved through QR
- delivery choice reaches `MobileService.choose`
- invalid delivery modes return HTTP 422 before services run

### Public menu and ordering

Checks:
- public menu route
- placing an order from the menu
- at least one cart line is required
- car page route
- car order request parsing

### Staff settings and menu routes

Checks:
- staff can read mobile settings
- manager authorization is required to save settings
- invalid hours, table counts, and hours modes return HTTP 422
- staff can read active deliveries
- staff can read the menu
- manager authorization is required to save the menu

### Photo routes

Checks:
- exact image bytes and content type are returned
- photo response uses `Cache-Control: public, max-age=300`
- manager authorization for upload/delete
- raw upload bytes are passed unchanged to the service

## Schema tests

Checks:
- Turkish plate normalization
- HH:MM validation
- supported delivery modes
- non-empty order cart
- cart quantity 1-20
- car order number 1-99999

An expected-failure test documents that a whitespace-only menu-item name currently satisfies Pydantic's `min_length` before service-side normalization converts it to an empty string.

## PostgreSQL integration tests

### Mobile settings

Checks:
- default settings when no row exists
- manager can persist settings
- staff can read saved settings
- staff cannot modify settings

### Delivery choices

Checks:
- QR-linked order exposes the available options
- collect selection persists an `OrderDelivery`
- car plate/details are normalized
- invalid Turkish plate returns HTTP 422
- table delivery requires a table label
- collected orders cannot change delivery mode

### Menu

Checks:
- manager can save menu
- category/name/description whitespace is normalized
- menu order is persisted
- public menu reflects ordering availability
- staff can read but cannot save

### Phone order

Checks:
- order number is generated from 1001+
- price is calculated from server-side `MenuItem.price_cents`
- customer text is normalized
- `MobileOrder`, `OrderItem`, and `OrderDelivery` rows are persisted
- QR tracking token is returned
- unavailable menu items return HTTP 409

### Photos

Checks:
- PNG upload/get/delete lifecycle
- menu reports `has_photo`
- unsupported files return HTTP 415
- files over 1 MB return HTTP 413
- deleted photo returns HTTP 404

### Car order

Checks:
- public car page availability
- creating a new car order without an existing order number
- normalized customer request and plate
- generated tracking token

### Deliveries

Checks that active phone orders appear in the staff delivery list with:
- customer name
- note
- total
- item names and quantities
- `phone_order = true`

## Shared fixtures

Existing fixtures remain unchanged:

- Store: `service`
- QR: `qr_service`
- Orders: `order_service`
- Notifications: `notification_service`
- Auth: `auth_service`
- Team: `team_service`
- Screens: `screen_db`, `screen_authorize`, `screen_client`

Mobile adds:

- `mobile_service`
- `mobile_qr_service`
- `mobile_authorize`
- `mobile_client`
- `mobile_routes`
- `mobile_schemas`
- `mobile_services`

All modules continue to use one combined `conftest.py`.
