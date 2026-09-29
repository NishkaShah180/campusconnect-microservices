"use strict";

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PRODUCT_SERVICE_PORT || process.env.PORT || 3002;

// Enable CORS and JSON parser middleware
app.use(cors());
app.use(express.json());

// In-Memory Data Store (Used when MongoDB is not connected)
let inMemoryProducts = [
  {
    id: "prd_501",
    name: "Wireless Mouse",
    price: 29.99,
    description: "Ergonomic optical wireless mouse",
    stock: 50
  },
  {
    id: "prd_502",
    name: "Mechanical Keyboard",
    price: 89.99,
    description: "RGB mechanical gaming keyboard",
    stock: 25
  }
];
let nextIdCounter = 503;

let isMongoConnected = false;
let mongoose;
let Product;

// Optional MongoDB Connection (Lab 4 / Lab 5 Pattern)
if (process.env.MONGO_URI && process.env.MONGO_URI.trim() !== '') {
  try {
    mongoose = require('mongoose');
    const productSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      price: { type: Number, required: true, min: 0 },
      description: { type: String, trim: true, default: "" },
      stock: { type: Number, default: 0, min: 0 }
    });

    productSchema.set('toJSON', {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      }
    });

    Product = mongoose.model('Product', productSchema);

    mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 })
      .then(() => {
        isMongoConnected = true;
        console.log(`[Product Service] Connected to MongoDB at ${process.env.MONGO_URI}`);
      })
      .catch(err => {
        console.warn(`[Product Service] MongoDB connection warning: ${err.message}. Operating in in-memory mode.`);
      });
  } catch (err) {
    console.warn(`[Product Service] Mongoose initialization warning: ${err.message}. Operating in in-memory mode.`);
  }
}

// Request Validation Middleware (Lab 4/5 Pattern)
function validateProduct(req, res, next) {
  const { name, price, stock } = req.body;
  const details = [];

  // Validate name
  if (name === undefined || name === null || (typeof name === 'string' && name.trim() === '')) {
    details.push("Product name is required");
  } else if (typeof name !== 'string') {
    details.push("Product name must be a text string");
  }

  // Validate price
  if (price === undefined || price === null) {
    details.push("Price is required");
  } else {
    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      details.push("Price must be a positive number");
    }
  }

  // Validate stock
  if (stock !== undefined && stock !== null) {
    const stockNum = Number(stock);
    if (isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
      details.push("Stock must be a non-negative integer");
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

// 1. GET /products - Retrieve all products
app.get('/products', async (req, res) => {
  if (isMongoConnected && Product) {
    try {
      const products = await Product.find();
      return res.status(200).json(products);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  res.status(200).json(inMemoryProducts);
});

// 2. GET /products/:id - Retrieve product by ID
app.get('/products/:id', async (req, res) => {
  const productId = req.params.id;

  if (isMongoConnected && Product) {
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID format" });
    }
    try {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(200).json(product);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const product = inMemoryProducts.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }
  res.status(200).json(product);
});

// 3. POST /products - Create new product
app.post('/products', validateProduct, async (req, res) => {
  const { name, price, description, stock } = req.body;

  if (isMongoConnected && Product) {
    try {
      const newProduct = new Product({
        name: name.trim(),
        price: parseFloat(Number(price).toFixed(2)),
        description: description ? description.trim() : "",
        stock: stock !== undefined ? parseInt(stock, 10) : 0
      });
      await newProduct.save();
      return res.status(201).json(newProduct);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const newProduct = {
    id: `prd_${nextIdCounter++}`,
    name: name.trim(),
    price: parseFloat(Number(price).toFixed(2)),
    description: description ? description.trim() : "",
    stock: stock !== undefined ? parseInt(stock, 10) : 0
  };
  inMemoryProducts.push(newProduct);
  res.status(201).json(newProduct);
});

// 4. PUT /products/:id - Update existing product
app.put('/products/:id', validateProduct, async (req, res) => {
  const productId = req.params.id;
  const { name, price, description, stock } = req.body;

  if (isMongoConnected && Product) {
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID format" });
    }
    try {
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        {
          name: name.trim(),
          price: parseFloat(Number(price).toFixed(2)),
          description: description ? description.trim() : "",
          stock: stock !== undefined ? parseInt(stock, 10) : 0
        },
        { new: true, runValidators: true }
      );
      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(200).json(updatedProduct);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const productIndex = inMemoryProducts.findIndex(p => p.id === productId);
  if (productIndex === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  const updatedProduct = {
    id: productId,
    name: name.trim(),
    price: parseFloat(Number(price).toFixed(2)),
    description: description ? description.trim() : inMemoryProducts[productIndex].description,
    stock: stock !== undefined ? parseInt(stock, 10) : inMemoryProducts[productIndex].stock
  };
  inMemoryProducts[productIndex] = updatedProduct;
  res.status(200).json(updatedProduct);
});

// 5. DELETE /products/:id - Delete product by ID
app.delete('/products/:id', async (req, res) => {
  const productId = req.params.id;

  if (isMongoConnected && Product) {
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid product ID format" });
    }
    try {
      const deletedProduct = await Product.findByIdAndDelete(productId);
      if (!deletedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(204).end();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const productIndex = inMemoryProducts.findIndex(p => p.id === productId);
  if (productIndex === -1) {
    return res.status(404).json({ error: "Product not found" });
  }
  inMemoryProducts.splice(productIndex, 1);
  res.status(204).end();
});

// Start Server
app.listen(PORT, () => {
  console.log(`Product Service running on port ${PORT}`);
});
