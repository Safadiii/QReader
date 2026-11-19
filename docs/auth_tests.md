# Auth API Test Documentation

## Overview

The Auth test suite covers:

- login
- signup
- current-member session validation
- phone normalization
- password hashing and verification
- login failure lockout
- role permissions
- internal API-key enforcement
- real PostgreSQL persistence

The Auth service mock is named `auth_service`, so it does not collide with the existing Store (`service`), QR (`qr_service`), Orders (`order_service`), or Notifications (`notification_service`) fixtures.

## Route tests

### `test_login`

Validates `POST /auth/login`.

Checks:
- HTTP 200
- response schema
- raw login phone/password are forwarded to `AuthService.login`

### Login validation tests

Check:
- empty phone
- empty password
- phone over 40 characters
- password over 200 characters

Invalid requests return HTTP 422 before the service is called.

### Login error propagation

Checks:
- HTTP 401 for wrong credentials
- HTTP 429 for too many attempts

### `test_signup_normalizes_and_trims_body`

Validates `POST /auth/signup`.

Checks:
- HTTP 201
- store name is trimmed
- member name is trimmed
- phone is normalized to international canonical format
- timezone and password are passed correctly

### Signup validation tests

Reject:
- whitespace-only store name
- whitespace-only member name
- phone without country code
- invalid international phone number
- password shorter than 10 characters
- store name over 150 characters
- timezone over 64 characters

### Signup duplicate phone

Checks service HTTP 409 is returned unchanged.

### Current-member tests

Validate `GET /auth/members/{user_id}`.

Checks:
- active member returns 200
- malformed UUID returns 422
- missing/inactive member error returns 404

## PostgreSQL integration tests

### Signup persistence

Checks that signup:
- creates a Store
- creates a User belonging to that store
- gives the first user the `owner` role
- stores the normalized phone
- stores a password hash instead of plaintext
- persists a valid supplied timezone

### Timezone behavior

Checks:
- invalid timezone falls back to `Asia/Beirut`
- omitted timezone defaults to `Asia/Beirut`

### Duplicate phone

Checks a phone already belonging to a user returns HTTP 409.

### Login behavior

Checks:
- correct password succeeds
- formatted phone numbers normalize correctly
- `00` international prefix is accepted
- wrong password returns generic HTTP 401
- unknown phone returns the exact same generic HTTP 401
- inactive users cannot sign in

### Failure tracking and lockout

Checks:
- failed attempts are recorded
- a later successful login clears the failure history
- after five failed attempts, the next attempt returns HTTP 429

The lockout test mocks password verification because password cryptography is tested separately.

### Current-member session check

Checks:
- active user returns 200
- inactive user returns 404
- unknown user returns 404

## Phone helper tests

`normalize_phone()` is tested for:
- spaces
- hyphens
- parentheses
- dots
- `00` international prefix
- surrounding whitespace

It rejects:
- local numbers without a country code
- missing `+`
- country codes beginning with zero
- too-short numbers
- too-long numbers
- alphabetic characters
- empty input

## Password tests

Checks:
- scrypt hash round trip
- wrong passwords fail
- plaintext is never returned as the stored hash
- identical passwords receive different hashes because of random salts
- malformed/unsupported stored hashes return `False`

## Permission tests

`require_actor()` is tested across the role hierarchy:

- Owner can act as Owner, Manager, or Staff
- Manager can act as Manager or Staff
- Staff can act as Staff

It rejects:
- insufficient role
- missing user
- inactive user
- user from another store

## API-key tests

Checks:
- when `API_KEY` is empty, the dependency allows requests
- correct configured key succeeds
- missing/wrong configured key returns HTTP 401

## Shared fixture names

- Store: `service`
- QR: `qr_service`
- Orders: `order_service`
- Notifications: `notification_service`
- Auth: `auth_service`

One combined `conftest.py` supports all modules.
