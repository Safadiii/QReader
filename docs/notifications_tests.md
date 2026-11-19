Notifications Test Documentation
Scope
The Notifications test suite covers the two public notification API routes, subscription persistence, push queue creation, provider validation, and delivery state handling.
Route tests
- test_push_config
  - verifies GET /push/config
  - checks that the route returns the service's VAPID/APNs configuration
- test_subscribe_apns
  - verifies APNs subscription request parsing
  - checks device token and environment are passed to NotificationService
- test_subscribe_web_push
  - verifies Web Push request parsing
  - checks endpoint, keys, and platform
- test_web_push_platform_defaults_to_android
  - confirms omitted Web Push platform defaults to Android
- test_subscribe_rejects_invalid_payloads
  - rejects unknown providers
  - rejects invalid APNs tokens/environments
  - rejects invalid Web Push key lengths, endpoint lengths, and platforms
- error propagation tests
  - verify 404 unknown QR token
  - verify 409 finished order
  - verify 422 unknown push service
PostgreSQL integration tests
- APNs subscriptions are persisted with:
  - iOS platform
  - APNs provider
  - normalized lowercase device token
  - APNs environment
  - active state and expiry
- Web Push subscriptions are persisted with:
  - endpoint
  - p256dh/auth credentials
  - Android platform
  - active state and expiry
- re-subscribing:
  - updates the existing APNs row instead of duplicating it
  - reactivates inactive subscriptions
  - updates Web Push keys instead of creating duplicate rows
- invalid lifecycle cases:
  - unknown token returns 404
  - collected/cancelled orders return 409
  - unknown Web Push service returns 422
  - expired QR link returns 410
- queue behavior:
  - only active, unexpired subscriptions receive queued notifications
  - queued records start in pending
  - status-event linkage is persisted
Provider tests
- APNs reports unconfigured until all required environment variables exist
- only approved HTTPS Web Push hosts are accepted
- insecure/unknown hosts are rejected
- local test hosts can be explicitly allowed through WEB_PUSH_EXTRA_HOSTS
- missing APNs/VAPID configuration returns a controlled error without network access
Delivery tests
- successful APNs delivery marks a notification as sent
- QR tracking URL is included when available
- a provider response indicating the subscription is gone:
  - marks the notification failed
  - deactivates the subscription
- inactive subscriptions are not sent and are marked failed
Safety
The suite never contacts real push providers. External delivery functions are mocked in delivery tests, and provider tests exercise configuration/validation paths that return before network access.