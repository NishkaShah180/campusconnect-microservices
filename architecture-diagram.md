# CampusConnect — Lab 7 Architecture Diagrams

## 1. Target Production Architecture (Isolated Private Services)

The diagram below reflects the primary microservices architecture featuring the **API Gateway** as the single public entry point, configuration-based service discovery, isolated container networking (`campus-network`), and MongoDB Atlas persistence.

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
        DB["MongoDB Atlas / In-Memory Store<br/>(via MONGO_URI)"]
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

---

## 2. Cloud Free-Tier Fallback Architecture (Render Web Services)

Because Render does not offer Private Services (`pserv`) on its free plan tier, the cloud deployment adapts by running backend services as **Render Web Services** while maintaining configuration-based discovery and environment variable routing.

```mermaid
flowchart TD
    subgraph External ["Internet / Public Access"]
        Client["Client / Postman"]
    end

    subgraph RenderPublic ["Render Cloud (Free-Tier Web Services)"]
        GW["Public API Gateway<br/>https://campusconnect-api-gateway.onrender.com"]

        US["User Service<br/>https://campusconnect-user-service.onrender.com"]
        PS["Product Service<br/>https://campusconnect-product-service.onrender.com"]
        OS["Order Service<br/>https://campusconnect-order-service.onrender.com"]
    end

    subgraph StorageLayer ["Cloud Database"]
        Atlas["MongoDB Atlas Cluster<br/>(user_db, product_db, order_db)"]
    end

    %% Gateway Entry Point
    Client -->|"HTTP Requests"| GW

    %% Proxy via Environment Variables
    GW -->|"USER_SERVICE_URL"| US
    GW -->|"PRODUCT_SERVICE_URL"| PS
    GW -->|"ORDER_SERVICE_URL"| OS

    %% Service-to-Service via Environment Variables
    OS -->|"USER_SERVICE_URL"| US
    OS -->|"PRODUCT_SERVICE_URL"| PS

    %% Database Connections
    US -->|"MONGO_URI"| Atlas
    PS -->|"MONGO_URI"| Atlas
    OS -->|"MONGO_URI"| Atlas
```

### Architecture Summary

1. **Target Local Architecture**:
   * **API Gateway**: Exposed on host port `3000:3000`.
   * Microservices isolated inside `campus-network` without host port exposure.
2. **Cloud Free-Tier Fallback**:
   * All 4 services deployed as **Render Web Services** (`type: web`).
   * Service locations dynamically linked using Render environment variables (`fromService: host`).
   * No hardcoded URLs in source code.
