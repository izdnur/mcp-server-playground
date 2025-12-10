# MicroService C - Inventory Management Service

Spring Boot microservice for stock tracking and warehouse operations. Listens on port 8082 with MySQL backend.
Core endpoints: PUT /api/inventory/update, GET /api/inventory/stock/{productId}. Publishes to RabbitMQ for notifications.