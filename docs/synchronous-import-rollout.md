# Synchronous import rollout

This change runs recipe and pantry imports within the POST request. It removes BullMQ, the worker, and Redis. PostgreSQL rate limits replace the Redis auth limiter. Successful recipe import records remain in `AiJob` so the image endpoint can verify source image ownership. They expire for authorization after 24 hours; expired rows are removed in bounded batches during later source-image imports.

Before deploying:

1. Apply the `AuthRateLimit` migration while the existing app is still running. The new auth limiter fails closed when its table is unavailable.
2. Stop accepting new queue-backed imports and let the existing worker finish queued and processing jobs. Confirm no active jobs remain before removing the worker and Redis. Do not strand user imports in the old queue.
3. Deploy the updated UI and API together. Existing open tabs still expect `202` plus status and cancel routes; users with an old tab should refresh before importing again.
4. Set a function duration longer than the application's 90-second import deadline. Confirm the host accepts the image request size after base64 and JSON encoding.
5. Smoke test sign-in, sign-up, recipe URL and image imports, pantry image extraction, and saving an imported source image. Verify a 3 MiB image is accepted and an oversized image gets `413`.

The import API returns a completed draft or an error. Closing the import dialog aborts its request; an import does not continue as a durable background job. The database quota allows 20 validated recipe or pantry import requests per user in a 24-hour window starting with the first request. Review this policy before rollout.
