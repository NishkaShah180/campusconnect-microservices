"use strict";

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const formatUrl = (url) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    return `http://${trimmed}`;
};

const PORT = process.env.ORDER_SERVICE_PORT || process.env.PORT || 3003;
const USER_SERVICE_URL = formatUrl(process.env.USER_SERVICE_URL) || 'http://user-service:3001';
const PRODUCT_SERVICE_URL = formatUrl(process.env.PRODUCT_SERVICE_URL) || 'http://product-service:3002';

// Enable CORS and JSON parser middleware
app.use(cors());
app.use(express.json());

// In-Memory Data Store (Used when MongoDB is not connected)
let inMemoryOrders = [
  {
    id: "ord_901",
    userId: "usr_101",
    productId: "prd_501",
    quantity: 2,
    total: 59.98,
    status: "CREATED",
    createdAt: new Date().toISOString()
  }
];
let nextIdCounter = 902;

let isMongoConnected = false;
let mongoose;
let Order;

// Optional MongoDB Connection (Lab 4 / Lab 5 Pattern)
if (process.env.MONGO_URI && process.env.MONGO_URI.trim() !== '') {
  try {
    mongoose = require('mongoose');
    const orderSchema = new mongoose.Schema({
      userId: { type: String, required: true, trim: true },
      productId: { type: String, required: true, trim: true },
      quantity: { type: Number, required: true, min: 1 },
      total: { type: Number, default: null },
      status: { type: String, default: "CREATED" },
      createdAt: { type: Date, default: Date.now }
    });

    orderSchema.set('toJSON', {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      }
    });

    Order = mongoose.model('Order', orderSchema);

    mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 })
      .then(() => {
        isMongoConnected = true;
        console.log(`[Order Service] Connected to MongoDB at ${process.env.MONGO_URI}`);
      })
      .catch(err => {
        console.warn(`[Order Service] MongoDB connection warning: ${err.message}. Operating in in-memory mode.`);
      });
  } catch (err) {
    console.warn(`[Order Service] Mongoose initialization warning: ${err.message}. Operating in in-memory mode.`);
  }
}

// Request Validation Middleware (Lab 4/5 Pattern)
function validateOrder(req, res, next) {
  const { userId, productId, quantity } = req.body;
  const details = [];

  if (userId === undefined || userId === null || (typeof userId === 'string' && userId.trim() === '')) {
    details.push("User ID (userId) is required");
  }

  if (productId === undefined || productId === null || (typeof productId === 'string' && productId.trim() === '')) {
    details.push("Product ID (productId) is required");
  }

  if (quantity === undefined || quantity === null) {
    details.push("Quantity is required");
  } else {
    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      details.push("Quantity must be a positive integer");
    }
  }

  if (details.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: details
    });
  }

  next();
}

// 1. POST /orders - Create new order
app.post('/orders', validateOrder, async (req, res) => {
  const { userId, productId, quantity, total } = req.body;
  const cleanUserId = String(userId).trim();
  const cleanProductId = String(productId).trim();
  const qty = parseInt(quantity, 10);

  // 1. Verify User from User Service
  let user;
  try {
    const userRes = await fetch(`${USER_SERVICE_URL}/users/${cleanUserId}`);
    if (userRes.status === 404) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!userRes.ok) {
      return res.status(503).json({ error: "User Service unavailable" });
    }
    user = await userRes.json();
  } catch (err) {
    return res.status(503).json({ error: "User Service unavailable" });
  }

  // 2. Verify Product from Product Service
  let product;
  try {
    const productRes = await fetch(`${PRODUCT_SERVICE_URL}/products/${cleanProductId}`);
    if (productRes.status === 404) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (!productRes.ok) {
      return res.status(503).json({ error: "Product Service unavailable" });
    }
    product = await productRes.json();
  } catch (err) {
    return res.status(503).json({ error: "Product Service unavailable" });
  }

  // 3. Calculate total = product.price * quantity
  const calculatedTotal = (product && typeof product.price === 'number')
    ? parseFloat((product.price * qty).toFixed(2))
    : (total !== undefined && total !== null ? parseFloat(Number(total).toFixed(2)) : null);

  if (isMongoConnected && Order) {
    try {
      const newOrder = new Order({
        userId: cleanUserId,
        productId: cleanProductId,
        quantity: qty,
        total: calculatedTotal,
        status: "CREATED"
      });
      await newOrder.save();
      return res.status(201).json(newOrder);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const newOrder = {
    id: `ord_${nextIdCounter++}`,
    userId: cleanUserId,
    productId: cleanProductId,
    quantity: qty,
    total: calculatedTotal,
    status: "CREATED",
    createdAt: new Date().toISOString()
  };
  inMemoryOrders.push(newOrder);
  res.status(201).json(newOrder);
});

// 2. GET /orders - Retrieve all orders
app.get('/orders', async (req, res) => {
  if (isMongoConnected && Order) {
    try {
      const orders = await Order.find();
      return res.status(200).json(orders);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  res.status(200).json(inMemoryOrders);
});

// 3. GET /orders/:id - Retrieve order by ID
app.get('/orders/:id', async (req, res) => {
  const orderId = req.params.id;

  if (isMongoConnected && Order) {
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ error: "Invalid order ID format" });
    }
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      return res.status(200).json(order);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const order = inMemoryOrders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  res.status(200).json(order);
});

// Start Server
app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
