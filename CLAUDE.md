# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Payment Orchestrator is a serverless BaaS solution that abstracts multiple payment gateways (Efí Bank, Stripe, Asaas) behind a unified SDK. Its core feature is an automatic Circuit Breaker that detects gateway failures and routes traffic to a fallback, preventing lost sales.

## Commands

Each Lambda has its own `node_modules`. Install dependencies per Lambda:

```bash
cd lambdas/proxy && npm install
cd lambdas/webhook-receiver && npm install
cd lambdas/worker && npm install
```

Install root dependencies (dotenv for local scripts):

```bash
npm install
```

Run local test scripts:

```bash
node scripts/create_pix_charge.js
node scripts/send_pix.js
```

Run tests (when implemented):

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:load           # Load tests
npm run test:coverage       # Coverage report
```

Deploy (choose one):

```bash
cdk deploy
sam deploy --guided
terraform apply
```

## Architecture

Three independent AWS Lambda functions form the core system:

**Synchronous path (payment creation):**

```
Client → API Gateway → proxy Lambda → Payment Gateway API → Client
```

**Asynchronous path (webhook delivery):**

```
Gateway → API Gateway → webhook-receiver Lambda → SQS → worker Lambda → Client Callback URL
```

### Lambda Responsibilities

| Lambda | Entry Point | Purpose |
|---|---|---|
| `proxy` | `lambdas/proxy/index.js` | Validate request, check idempotency (DynamoDB), route to gateway, normalize response |
| `webhook-receiver` | `lambdas/webhook-receiver/index.js` | Accept gateway callbacks, validate, enqueue to SQS, return 202 immediately |
| `worker` | `lambdas/worker/index.js` | Consume SQS messages, normalize webhook, POST to client callback URL with retry |

### Key Shared Utilities (`shared/`)

- `utils/circuit-breaker.js` — Monitors gateway failure counts (5-min windows in DynamoDB). Opens circuit at 5 failures, routes to fallback gateway (Stripe), 1h TTL for recovery.
- `utils/errors.js` — Custom error hierarchy: `PaymentError`, `ValidationError`, `IdempotencyError`, `GatewayError`, `TimeoutError`, `CircuitBreakerError`.
- `utils/logger.js` — Structured JSON logging for CloudWatch.
- `utils/validators.js` / `utils/pix-validators.js` — Input validation helpers.
- `constants/payment-gateways.js` — Gateway configs and metadata (names, credentials env vars, supported methods).

### Gateway Handlers (`lambdas/proxy/handlers/`)

- `gateway-handler.js` — Base handler with EFI and Stripe implementations.
- `efi-pix-handler.js` — Specialized handler for Efí Pix send operations.
- `response-normalizer.js` — Converts gateway-specific responses to a unified format.

### AWS Infrastructure

- **DynamoDB** — Two tables: idempotency cache (24h TTL) and circuit breaker metrics (1h TTL).
- **SQS** — Webhook message queue providing durability and automatic retry for the worker Lambda.
- **API Gateway** — Exposes `/payments` and `/webhooks/{gateway}` endpoints.

## Environment Variables

Required variables (see `.env` for local development; use Lambda environment in AWS):

```
EFI_CLIENT_ID           # Efí gateway credentials
EFI_CLIENT_SECRET
EFI_SANDBOX             # true for sandbox, false for production
EFI_CERTIFICATE         # Path to .p12 certificate file
EFI_API_BASE_URL        # https://pix.api.efipay.com.br

IDEMPOTENCY_TABLE       # DynamoDB table name for idempotency
METRICS_TABLE           # DynamoDB table name for circuit breaker metrics
WEBHOOK_QUEUE_URL       # SQS queue URL for webhook delivery

SKIP_IDEMPOTENCY        # Set to true for local testing
```

## Code Conventions

From `STANDARDS.md`:

- Use `const` exclusively — never `var` or `let` unless reassignment is truly required.
- Max file length: 200 lines. Max function length: 20 lines (prefer 3–5 lines).
- Descriptive names: `tenantId` not `id`, `idempotencyKey` not `key`.
- Each file has a single responsibility — handlers, validators, and services are separate.
- Throw custom error classes (from `shared/utils/errors.js`), never plain `new Error()`.
- Log via the shared `logger.js` — never use `console.log` directly.
- Use JSDoc for all public functions.

## API Reference

The full OpenAPI 3.0 specification is at `docs/openapi.yaml`. Key endpoints:

- `POST /payments` — Create a payment (requires `X-Idempotency-Key` header).
- `POST /webhooks/{gateway}` — Receive webhook from a payment gateway.

Pix send reference and examples are in `docs/PIX_SEND_REFERENCE.md` and `docs/PIX_SEND_EXAMPLES.js`.
