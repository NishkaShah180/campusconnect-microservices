require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Basic Gateway Logging
app.use(morgan((tokens, req, res) => {
    return [
        '[Gateway]',
        tokens.method(req, res),
        tokens.url(req, res),
        '→',
        req.proxyTarget || 'unknown-service',
        '→',
        tokens.status(req, res)
    ].join(' ');
}));

const services = {
    user: process.env.USER_SERVICE_URL,
    product: process.env.PRODUCT_SERVICE_URL,
    order: process.env.ORDER_SERVICE_URL
};

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

const onProxyError = (serviceName) => (err, req, res) => {
    console.error(`[Gateway] Proxy Error connecting to ${serviceName}:`, err.message);
    res.status(503).json({ error: `${serviceName} unavailable` });
};

const setProxyTarget = (name) => (req, res, next) => {
    req.proxyTarget = name;
    next();
};

if (services.user) {
    app.use('/users', setProxyTarget('user-service'), createProxyMiddleware({
        target: services.user,
        changeOrigin: true,
        onError: onProxyError('User Service')
    }));
}

if (services.product) {
    app.use('/products', setProxyTarget('product-service'), createProxyMiddleware({
        target: services.product,
        changeOrigin: true,
        onError: onProxyError('Product Service')
    }));
}

if (services.order) {
    app.use('/orders', setProxyTarget('order-service'), createProxyMiddleware({
        target: services.order,
        changeOrigin: true,
        onError: onProxyError('Order Service')
    }));
}

app.use((req, res) => {
    res.status(404).json({ error: 'Gateway route not found or service not configured' });
});

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
    console.log(`User Target: ${services.user}`);
    console.log(`Product Target: ${services.product}`);
    console.log(`Order Target: ${services.order}`);
});
