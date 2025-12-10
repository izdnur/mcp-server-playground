# MicroService B - Payment Gateway Service

Spring Boot service managing payment processing and transactions. Runs on port 8081 with MongoDB storage.
Key endpoints: POST /api/payments/process, GET /api/payments/status/{transactionId}. Integrates with Stripe API.