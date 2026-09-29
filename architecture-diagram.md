# CampusConnect — Lab 7 Architecture Diagram (API Gateway & Microservices)

The diagram below reflects the Lab 7 microservices architecture featuring the **API Gateway** as the single public entry point, configuration-based service discovery, isolated container networking, and optional MongoDB Atlas persistence.

```mermaid
flowchart TD
    subgraph External ["External / Postman / Client"]
        Client["Client / Postman"]
    end

    subgraph GatewayLayer ["Gateway Layer (Host Port 3000 Exposed)"]
        Gateway["API Gateway<br/>Port: 3000<br/>Routes: /health, /users, /products, /orders"]
        Config["Environment Config<br/>USER_SERVICE_URL<br/>PRODUCT_SERVICE_URL<br/>ORDER_SERVICE_URL"]
    end

    subgraph DockerNetwork ["Internal Docker Network: campus-network (Ports Hidden)"]
        US["user-service<br/>Internal Port: 3001<br/>Resource: /users"]
        PS["product-service<br/>Internal Port: 3002<br/>Resource: /products"]
        OS["order-service<br/>Internal Port: 3003<br/>Resource: /orders"]
    end

    subgraph StorageLayer ["Data Storage Layer"]
        DB["In-Memory Data Store / MongoDB Atlas<br/>(via MONGO_URI)"]
    end

    %% External Entry Point
    Client -->|"http://localhost:3000"| Gateway
    Config -.->|"Injects service URLs"| Gateway

    %% Gateway Reverse Proxy Routes
    Gateway -->|"/users/* → http://user-service:3001"| US
    Gateway -->|"/products/* → http://product-service:3002"| PS
    Gateway -->|"/orders/* → http://order-service:3003"| OS

    %% Internal Service-to-Service REST Communication
    OS -->|"GET http://user-service:3001/users/:userId"| US
    OS -->|"GET http://product-service:3002/products/:productId"| PS

    US --> DB
    PS --> DB
    OS --> DB
```

### Architecture Summary

1. **Single Entry Point**:
   * **API Gateway**: Exposed on host port `3000:3000`.
   * Backend microservices (`user-service`, `product-service`, `order-service`) have NO host port mappings and are completely hidden from external access.

2. **Configuration-Based Service Discovery**:
   * Target locations are specified via environment variables (`USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`).
   * Service locations can be changed dynamically in configuration without modifying gateway code.

3. **Internal Container-to-Container Communication**:
   * Order service continues to communicate directly with User and Product services using Docker DNS (`http://user-service:3001`, `http://product-service:3002`).

4. **Data Persistence**:
   * Microservices operate in in-memory mode by default, or seamlessly connect to MongoDB Atlas when `MONGO_URI` is provided.
