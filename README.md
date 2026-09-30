# CampusConnect — Lab 6 & Lab 7: Microservices, API Gateway, Service Discovery & Cloud Deployment

## 1. Project Overview

Lab 6 and Lab 7 represent the complete evolution of the **CampusConnect** backend architecture from a monolithic application into a production-grade, microservice-based architecture.

* **Lab 6**: Decomposed the monolith into three isolated microservices:
  * **User Service** (`user-service`)
  * **Product Service** (`product-service`)
  * **Order Service** (`order-service`)
* **Lab 7**: Introduced a centralized **API Gateway** (`api-gateway`) as the single public entry point, implemented configuration-based service discovery, and prepared cloud deployment configurations.

---

## 2. Relationship Across Labs

| Lab Stage | Architectural Pattern | Entry Point | Communication Mechanism | Exposed Ports |
| :--- | :--- | :--- | :--- | :--- |
| **Lab 4** | Monolithic REST API | Direct Express App | Local module calls | `3000` |
| **Lab 5** | Containerized Monolith | Containerized App | Host-to-container port mapping | `3000` |
| **Lab 6** | Microservices Architecture | Direct Service Ports | REST over HTTP using Docker DNS | `3001`, `3002`, `3003` |
| **Lab 7** | **API Gateway Microservices** | **API Gateway Only** | **Proxied Gateway Routes + Internal Service DNS** | **Port `3000` ONLY** |

---

## 3. Architecture Overview

### Local / Target Architecture (API Gateway + Isolated Network)
```
Client / Postman ────> API Gateway (:3000) ────> user-service:3001 (campus-network)
                                            ────> product-service:3002 (campus-network)
                                            ────> order-service:3003 (campus-network)
```

### Cloud Free-Tier Fallback Architecture (Render Web Services + MongoDB Atlas)
```
Client / Postman ────> Public API Gateway ────> Render Web User Service ────> MongoDB Atlas
                                          ────> Render Web Product Service ──> MongoDB Atlas
                                          ────> Render Web Order Service ────> MongoDB Atlas
```

---

## 4. API Gateway Responsibilities

The `api-gateway` is built with **Node.js**, **Express**, and **`http-proxy-middleware`**.

It handles:
1. **Single Public Entry Point**: Acts as the sole exposed port (`3000:3000`). Internal microservice ports (`3001`, `3002`, `3003`) are hidden and only reachable within `campus-network`.
2. **Reverse Proxy & Routing**: Automatically routes `/users/*`, `/products/*`, and `/orders/*` to their configured backend microservices.
3. **Request Logging**: Logs every proxied request method, path, target service, and HTTP status code (e.g. `[Gateway] GET /users → user-service → 200`).
4. **Centralized Error Handling**: Intercepts service unavailability (connection refused/timeout) and returns an HTTP `503 Service Unavailable` status with a clear error payload (`{"error": "User Service unavailable"}`).
5. **Gateway Health Endpoint**: Exposes `GET /health` (`{"status": "ok", "service": "api-gateway"}`) directly handled by the gateway without forwarding.

---

## 5. Gateway Routes Mapping

| Public Gateway Endpoint | Target Internal Service | Proxy Target URL | Method Supported |
| :--- | :--- | :--- | :--- |
| `GET /health` | *Handled locally by Gateway* | N/A | `GET` |
| `/users/*` | `user-service` | `${USER_SERVICE_URL}/users/*` | `GET`, `POST`, `PUT`, `DELETE` |
| `/products/*` | `product-service` | `${PRODUCT_SERVICE_URL}/products/*` | `GET`, `POST`, `PUT`, `DELETE` |
| `/orders/*` | `order-service` | `${ORDER_SERVICE_URL}/orders/*` | `GET`, `POST` |

---

## 6. Service Discovery (Configuration-Based)

The API Gateway avoids hard-coded backend URLs. At startup, it reads service locations directly from environment configuration:

```javascript
const services = {
    user: process.env.USER_SERVICE_URL,
    product: process.env.PRODUCT_SERVICE_URL,
    order: process.env.ORDER_SERVICE_URL
};
```

### Local Docker Environment Values (`.env` / `compose.yaml`):
```env
USER_SERVICE_URL=http://user-service:3001
PRODUCT_SERVICE_URL=http://product-service:3002
ORDER_SERVICE_URL=http://order-service:3003
```

---

## 7. Configuration-Based Service Discovery Proof

To prove that changing a service location requires **ZERO changes to the gateway source code**:
1. Added a secondary container `user-service-alt` running on `campus-network`.
2. Updated `compose.yaml` environment variable:
   `USER_SERVICE_URL=http://user-service-alt:3001`
3. Restarted `api-gateway` via `docker compose up -d`.
4. Issued `GET http://localhost:3000/users` through the gateway.
5. Verification logs confirmed gateway routed traffic to `http://user-service-alt:3001` without modifying a single line of gateway code in `server.js`.

---

## 8. Static vs. Dynamic Service Discovery Comparison

| Feature | Static / Configuration-Based (Lab 7) | Dynamic Service Discovery (Consul / Eureka / K8s DNS) |
| :--- | :--- | :--- |
| **Registration** | Manually configured via env vars / config files | Auto-registration on container startup |
| **Instance Detection**| Hard-coded target hostnames | Continuous health checking & active node polling |
| **Load Balancing** | Handled at container level or single instance | Round-robin / least-connections across N instances |
| **Complexity** | Extremely simple, zero external dependencies | Requires dedicated registry server (Consul cluster/Eureka) |
| **Best Use Case** | Small microservice systems, predictable environments | Large auto-scaling cloud microservices |

---

## 9. Docker Networking & Port Exposure

In `compose.yaml`, all services (`api-gateway`, `user-service`, `product-service`, `order-service`) are attached to `campus-network`.

### Strict Exposure Rule:
* **ONLY `api-gateway`** has host port mapping:
  ```yaml
  ports:
    - "3000:3000"
  ```
* **`user-service`**, **`product-service`**, and **`order-service`** do **NOT** have `ports:` mappings. They are isolated inside `campus-network` and accessible only via internal container DNS (`http://user-service:3001`).

---

## 10. Local Docker Compose Commands & Validation

### Commands:
```bash
# 1. Validate docker compose syntax
docker compose config

# 2. Build and start containers in detached mode
docker compose up -d --build

# 3. Verify running containers and port bindings
docker compose ps

# 4. View real-time logs across services
docker compose logs -f

# 5. Stop containers
docker compose down
```

### Local Validation Results:
1. **`GET /health`**: `200 OK` (`{"status": "ok", "service": "api-gateway"}`)
2. **`GET /users`**: `200 OK` (Array of users proxied from `user-service`)
3. **`GET /products`**: `200 OK` (Array of products proxied from `product-service`)
4. **`GET /orders`**: `200 OK` (Array of orders proxied from `order-service`)
5. **`POST /orders`**: `201 Created` (Order created with inter-service verification)
6. **Service Outage Test**: `docker compose stop user-service` -> `GET /users` returns `503 Service Unavailable` (`{"error": "User Service unavailable"}`)
7. **Recovery Test**: `docker compose start user-service` -> `GET /users` returns `200 OK`

---

## 11. Cloud Deployment & Free-Tier Fallback Strategy

### Free-Tier Platform Limitation:
Render does not offer free-tier instances for Private Services (`pserv`). When attempting to deploy private isolated services on Render's free plan, Render rejects `pserv` declarations.

### Free-Tier Adaptation Strategy:
To deploy all four microservices on the Render free tier without upgrading plans or providing payment cards:
1. **Service Type Adjustment**: All four services (`api-gateway`, `user-service`, `product-service`, `order-service`) are declared as **Render Web Services** (`type: web`) in `render.yaml`.
2. **Environment Variable Service Linking**: Render dynamically links web service locations via `fromService: host`.
3. **Public Gateway Client Entry**: Client/Postman traffic interacts exclusively with the public API Gateway (`https://campusconnect-api-gateway-fv37.onrender.com`).
4. **Zero Code Changes**: The node microservices read target URLs directly from `USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, and `ORDER_SERVICE_URL` environment variables, preserving exact local Docker Compose parity.

---

## 12. MongoDB Atlas Implementation Status

* **Status**: Microservices natively support MongoDB Atlas via `MONGO_URI`.
* **Behavior**: If `MONGO_URI` is supplied in environment variables, services connect to Atlas Mongoose schemas. If `MONGO_URI` is omitted, services automatically operate in robust **in-memory data store mode** without crashing.
* **Credentials**: Production Atlas connection strings are injected via Render environment variables and never committed to source code or `render.yaml`.

---

## 13. Discussion Questions & Answers

### Question 1: Why introduce an API Gateway instead of letting clients call each service directly?
**Answer**:
Direct client-to-service communication exposes internal network topology, forces clients to manage multiple ports/domains, complicates security/CORS, and requires client updates whenever service locations change. An API Gateway provides a single stable entry point, hides internal service architecture, centralizes logging, CORS, and error handling, and prepares the system for centralized authentication, rate limiting, and SSL termination.

### Question 2: What does dynamic service discovery provide that static configuration cannot?
**Answer**:
Dynamic service discovery enables automatic self-registration, real-time health monitoring, dynamic IP resolution, and multi-instance load balancing. In auto-scaling environments where instances scale up or down dynamically, static configuration requires manual updates and restarts, whereas dynamic registries (like Consul or Kubernetes DNS) automatically track active instances without downtime.

---

## 14. Troubleshooting & Operational Notes

1. **Path Stripping / Routing Failures**:
   * *Issue*: Early gateway attempts stripped path prefixes when forwarding to backend routes expecting full paths.
   * *Resolution*: Configured `http-proxy-middleware` v2 with clean path rewrites ensuring target routes match backend expectations (`/users`, `/products`, `/orders`).
2. **503 Service Unavailable Handling**:
   * Intercepted connection errors in proxy middleware `onError` handler to ensure client receives clean JSON `503` rather than connection hanging or proxy crashing.

---

## 15. Short Reflection

Moving from Lab 6 to Lab 7 transformed our microservice architecture into a secure, entry-controlled system. By creating the API Gateway, client requests no longer need to know individual service ports (`3001`, `3002`, `3003`). Enforcing network isolation by unexposing backend ports guaranteed that clients cannot bypass gateway validation or logging. Furthermore, implementing configuration-based service discovery proved how easy it is to re-route services across environments without changing backend source code.

---

## 16. Evidence & Screenshot Capture Checklist for User

Since screenshots are captured manually, use this checklist to capture evidence:

- [ ] **1. Project Structure**: Expand `api-gateway`, `user-service`, `product-service`, `order-service`, `compose.yaml`, `.env.example`.
- [ ] **2. `api-gateway/server.js`**: Showing routing table reading from `process.env.USER_SERVICE_URL`, etc.
- [ ] **3. `api-gateway/.env.example`**: Showing example environment variables.
- [ ] **4. Dockerfiles**: `api-gateway/Dockerfile`, `user-service/Dockerfile`, etc.
- [ ] **5. Updated `compose.yaml`**: Showing ONLY `api-gateway` has host port `3000:3000` exposed, and services on `campus-network`.
- [ ] **6. `docker compose ps`**: Terminal output showing only `api-gateway` exposing port 3000.
- [ ] **7. Gateway Health Endpoint**: Postman GET `http://localhost:3000/health` returning 200 OK.
- [ ] **8. Gateway -> User Request**: Postman GET `http://localhost:3000/users` returning 200 OK.
- [ ] **9. Gateway -> Product Request**: Postman GET `http://localhost:3000/products` returning 200 OK.
- [ ] **10. Gateway -> Order Request**: Postman GET `http://localhost:3000/orders` returning 200 OK.
- [ ] **11. Gateway -> POST Order Request**: Postman POST `http://localhost:3000/orders` returning 201 Created.
- [ ] **12. Unreachable Service 503**: Postman GET `http://localhost:3000/users` returning 503 when `user-service` is stopped.
- [ ] **13. Service Discovery Proof**: Logs showing gateway routing to `user-service-alt` when `USER_SERVICE_URL` environment variable was updated.
- [ ] **14. Postman Collection**: Postman UI showing `Microservices – Lab 7` collection structure.

<!-- CI Test Change -->
