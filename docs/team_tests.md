# Team API Test Documentation

## Overview

The Team test suite validates:

- team listing
- adding staff/managers
- member updates
- password resets
- role hierarchy and authorization
- cross-store isolation
- phone normalization
- generated temporary passwords
- password hashing
- real PostgreSQL persistence

The shared fixture is named `team_service`, so it does not collide with the existing module fixtures.

## API route tests

### List team

`GET /stores/{store_id}/team?actor_id={actor_id}`

Checks:
- valid request returns a team list
- store ID and actor ID are passed correctly
- `actor_id` is required
- malformed UUIDs return HTTP 422

### Add member

`POST /stores/{store_id}/team?actor_id={actor_id}`

Checks:
- HTTP 201
- name trimming
- phone normalization
- default role is `staff`
- optional password is passed through
- invalid names, phone numbers, roles, and password lengths return HTTP 422
- permission errors propagate as HTTP 403
- duplicate phone propagates as HTTP 409

A strict expected-failure test documents the current whitespace-only-name validation issue in `MemberCreate`.

### Update member

`PATCH /stores/{store_id}/team/{user_id}?actor_id={actor_id}`

Checks:
- full update
- partial update
- role parsing
- active/inactive changes
- invalid role returns HTTP 422
- missing target propagates HTTP 404
- invalid UUIDs return HTTP 422

### Reset password

`POST /stores/{store_id}/team/{user_id}/reset-password?actor_id={actor_id}`

Checks:
- successful reset returns a one-time temporary password
- correct store, actor, and target IDs are passed to the service

## PostgreSQL integration tests

### Authorization

Checks:
- owner can list the team
- manager can list the team
- staff cannot list the team
- inactive actors are denied
- actors from another store are denied

### Add-member rules

Checks:
- owner can add managers
- owner can add staff
- manager can add staff
- manager cannot add managers or owners
- owner cannot add another owner
- duplicate phone returns HTTP 409
- explicit password is hashed in PostgreSQL
- generated temporary password is hashed and verifiable

### Update rules

Checks:
- owner can rename staff, promote staff to manager, and deactivate them
- manager can rename/deactivate staff
- manager cannot change roles
- nobody can manage the owner
- manager cannot manage another manager
- a target belonging to another store returns HTTP 404
- owner cannot promote another member to owner

### Password reset rules

Checks:
- owner can reset staff password
- manager can reset staff password
- manager cannot reset manager password
- owner cannot reset owner password
- reset changes the stored hash
- returned temporary password verifies against the new hash

## Temporary-password helper

Checks:
- generated passwords are exactly 10 characters
- only the configured safe alphabet is used
- ambiguous characters `0`, `O`, `1`, `l`, and `I` are excluded

## Shared fixture names

- Store: `service`
- QR: `qr_service`
- Orders: `order_service`
- Notifications: `notification_service`
- Auth: `auth_service`
- Team: `team_service`

All modules use one combined `conftest.py`.
