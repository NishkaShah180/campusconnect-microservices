const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          if (body) parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING LAB 6 PHASE 1 VERIFICATION TESTS ---\n');
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  try {
    // === USER SERVICE (Port 3001) ===
    console.log('--- Testing User Service (Port 3001) ---');
    
    // 1. GET /users
    let res = await makeRequest({ hostname: '127.0.0.1', port: 3001, path: '/users', method: 'GET' });
    assert(res.statusCode === 200 && Array.isArray(res.body), 'GET /users returns 200 OK with User array');

    // 2. GET /users/:id (Existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3001, path: '/users/usr_101', method: 'GET' });
    assert(res.statusCode === 200 && res.body.id === 'usr_101', 'GET /users/usr_101 returns 200 OK with correct User');

    // 3. GET /users/:id (Non-existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3001, path: '/users/usr_999', method: 'GET' });
    assert(res.statusCode === 404, 'GET /users/usr_999 returns 404 Not Found');

    // 4. POST /users (Validation failure)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3001, path: '/users', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {});
    assert(res.statusCode === 400, 'POST /users with empty body returns 400 Bad Request');

    // 5. POST /users (Valid creation)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3001, path: '/users', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'Charlie Brown', email: 'charlie@example.com', role: 'student' });
    assert(res.statusCode === 201 && res.body.name === 'Charlie Brown', 'POST /users returns 201 Created');
    const createdUserId = res.body.id;

    // 6. PUT /users/:id (Valid update)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3001, path: `/users/${createdUserId}`, method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'Charlie B. Updated', email: 'charlie@example.com', role: 'admin' });
    assert(res.statusCode === 200 && res.body.role === 'admin', 'PUT /users/:id returns 200 OK with updated role');

    // 7. DELETE /users/:id
    res = await makeRequest({ hostname: '127.0.0.1', port: 3001, path: `/users/${createdUserId}`, method: 'DELETE' });
    assert(res.statusCode === 204, 'DELETE /users/:id returns 204 No Content');

    // Verify deleted user
    res = await makeRequest({ hostname: '127.0.0.1', port: 3001, path: `/users/${createdUserId}`, method: 'GET' });
    assert(res.statusCode === 404, 'GET /users/:id after deletion returns 404 Not Found');


    // === PRODUCT SERVICE (Port 3002) ===
    console.log('\n--- Testing Product Service (Port 3002) ---');

    // 1. GET /products
    res = await makeRequest({ hostname: '127.0.0.1', port: 3002, path: '/products', method: 'GET' });
    assert(res.statusCode === 200 && Array.isArray(res.body), 'GET /products returns 200 OK with Product array');

    // 2. GET /products/:id (Existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3002, path: '/products/prd_501', method: 'GET' });
    assert(res.statusCode === 200 && res.body.id === 'prd_501', 'GET /products/prd_501 returns 200 OK with correct Product');

    // 3. GET /products/:id (Non-existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3002, path: '/products/prd_999', method: 'GET' });
    assert(res.statusCode === 404, 'GET /products/prd_999 returns 404 Not Found');

    // 4. POST /products (Validation failure)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3002, path: '/products', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'Faulty Item', price: -10 });
    assert(res.statusCode === 400, 'POST /products with negative price returns 400 Bad Request');

    // 5. POST /products (Valid creation)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3002, path: '/products', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'USB-C Hub', price: 45.50, stock: 15 });
    assert(res.statusCode === 201 && res.body.name === 'USB-C Hub', 'POST /products returns 201 Created');
    const createdProductId = res.body.id;

    // 6. PUT /products/:id (Valid update)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3002, path: `/products/${createdProductId}`, method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'USB-C Pro Hub', price: 49.99, stock: 20 });
    assert(res.statusCode === 200 && res.body.price === 49.99, 'PUT /products/:id returns 200 OK with updated price');

    // 7. DELETE /products/:id
    res = await makeRequest({ hostname: '127.0.0.1', port: 3002, path: `/products/${createdProductId}`, method: 'DELETE' });
    assert(res.statusCode === 204, 'DELETE /products/:id returns 204 No Content');

    // Verify deleted product
    res = await makeRequest({ hostname: '127.0.0.1', port: 3002, path: `/products/${createdProductId}`, method: 'GET' });
    assert(res.statusCode === 404, 'GET /products/:id after deletion returns 404 Not Found');


    // === ORDER SERVICE (Port 3003) ===
    console.log('\n--- Testing Order Service (Port 3003) ---');

    // 1. GET /orders
    res = await makeRequest({ hostname: '127.0.0.1', port: 3003, path: '/orders', method: 'GET' });
    assert(res.statusCode === 200 && Array.isArray(res.body), 'GET /orders returns 200 OK with Order array');

    // 2. GET /orders/:id (Existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3003, path: '/orders/ord_901', method: 'GET' });
    assert(res.statusCode === 200 && res.body.id === 'ord_901', 'GET /orders/ord_901 returns 200 OK with correct Order');

    // 3. GET /orders/:id (Non-existing)
    res = await makeRequest({ hostname: '127.0.0.1', port: 3003, path: '/orders/ord_999', method: 'GET' });
    assert(res.statusCode === 404, 'GET /orders/ord_999 returns 404 Not Found');

    // 4. POST /orders (Validation failure)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3003, path: '/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { productId: 'prd_501', quantity: 2 });
    assert(res.statusCode === 400, 'POST /orders without userId returns 400 Bad Request');

    // 5. POST /orders (Valid creation)
    res = await makeRequest({
      hostname: '127.0.0.1', port: 3003, path: '/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { userId: 'usr_101', productId: 'prd_501', quantity: 3, total: 89.97 });
    assert(res.statusCode === 201 && res.body.userId === 'usr_101' && res.body.quantity === 3, 'POST /orders returns 201 Created');

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
    console.log(`========================================`);

    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

// Give servers a brief moment before starting tests
setTimeout(runTests, 1000);
