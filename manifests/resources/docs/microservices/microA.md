# MicroService A - Order Processing Service

Spring Boot microservice handling order creation and validation. Exposes REST API on port 8080 with PostgreSQL database.
Main endpoints: POST /api/orders, GET /api/orders/{id}. Uses Kafka for event publishing.