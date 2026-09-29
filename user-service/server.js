"use strict";

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.USER_SERVICE_PORT || process.env.PORT || 3001;

// Enable CORS and JSON parser middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => { console.log("Received:", req.method, req.originalUrl); next(); });

// In-Memory Data Store (Used when MongoDB is not connected)
let inMemoryUsers = [
  {
    id: "usr_101",
    name: "Alice Smith",
    email: "alice@example.com",
    role: "student",
    course: "Computer Science",
    semester: 5
  },
  {
    id: "usr_102",
    name: "Bob Jones",
    email: "bob@example.com",
    role: "admin",
    course: "Software Engineering",
    semester: 6
  }
];
let nextIdCounter = 103;

let isMongoConnected = false;
let mongoose;
let User;

// Optional MongoDB Connection (Lab 4 / Lab 5 Pattern)
if (process.env.MONGO_URI && process.env.MONGO_URI.trim() !== '') {
  try {
    mongoose = require('mongoose');
    const userSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, trim: true, lowercase: true },
      role: { type: String, trim: true, default: "user" },
      course: { type: String, trim: true, default: "General" },
      semester: { type: Number, default: 1 }
    });

    userSchema.set('toJSON', {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      }
    });

    User = mongoose.model('User', userSchema);

    mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 })
      .then(() => {
        isMongoConnected = true;
        console.log(`[User Service] Connected to MongoDB at ${process.env.MONGO_URI}`);
      })
      .catch(err => {
        console.warn(`[User Service] MongoDB connection warning: ${err.message}. Operating in in-memory mode.`);
      });
  } catch (err) {
    console.warn(`[User Service] Mongoose initialization warning: ${err.message}. Operating in in-memory mode.`);
  }
}

// Request Validation Middleware (Lab 4/5 Pattern)
function validateUser(req, res, next) {
  const { name, email, role, course, semester } = req.body;
  const details = [];

  // Validate name
  if (name === undefined || name === null || (typeof name === 'string' && name.trim() === '')) {
    details.push("Name is required");
  } else if (typeof name !== 'string') {
    details.push("Name must be a text string");
  }

  // Validate email
  if (email === undefined || email === null || (typeof email === 'string' && email.trim() === '')) {
    details.push("Email is required");
  } else if (typeof email !== 'string') {
    details.push("Email must be a text string");
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      details.push("Invalid email");
    }
  }

  // Validate role
  if (role !== undefined && role !== null && typeof role !== 'string') {
    details.push("Role must be a text string");
  }

  // Validate course
  if (course !== undefined && course !== null && typeof course !== 'string') {
    details.push("Course must be a text string");
  }

  // Validate semester
  if (semester !== undefined && semester !== null) {
    const semNum = Number(semester);
    if (isNaN(semNum) || semNum <= 0 || !Number.isInteger(semNum)) {
      details.push("Semester must be positive");
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

// 1. GET /users - Retrieve all users
app.get('/users', async (req, res) => {
  if (isMongoConnected && User) {
    try {
      const users = await User.find();
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  res.status(200).json(inMemoryUsers);
});

// 2. GET /users/:id - Retrieve user by ID
app.get('/users/:id', async (req, res) => {
  const userId = req.params.id;

  if (isMongoConnected && User) {
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json(user);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const user = inMemoryUsers.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.status(200).json(user);
});

// 3. POST /users - Create new user
app.post('/users', validateUser, async (req, res) => {
  const { name, email, role, course, semester } = req.body;

  if (isMongoConnected && User) {
    try {
      const newUser = new User({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: role ? role.trim() : "user",
        course: course ? course.trim() : "General",
        semester: semester ? parseInt(semester, 10) : 1
      });
      await newUser.save();
      return res.status(201).json(newUser);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          error: "Validation failed",
          details: ["Email must be unique"]
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const duplicateUser = inMemoryUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (duplicateUser) {
    return res.status(400).json({
      error: "Validation failed",
      details: ["Email must be unique"]
    });
  }

  const newUser = {
    id: `usr_${nextIdCounter++}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role ? role.trim() : "user",
    course: course ? course.trim() : "General",
    semester: semester ? parseInt(semester, 10) : 1
  };
  inMemoryUsers.push(newUser);
  res.status(201).json(newUser);
});

// 4. PUT /users/:id - Update existing user
app.put('/users/:id', validateUser, async (req, res) => {
  const userId = req.params.id;
  const { name, email, role, course, semester } = req.body;

  if (isMongoConnected && User) {
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }
    try {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: role ? role.trim() : "user",
          course: course ? course.trim() : "General",
          semester: semester ? parseInt(semester, 10) : 1
        },
        { new: true, runValidators: true }
      );
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json(updatedUser);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          error: "Validation failed",
          details: ["Email must be unique"]
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const userIndex = inMemoryUsers.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const duplicateUser = inMemoryUsers.find(u => u.id !== userId && u.email.toLowerCase() === email.trim().toLowerCase());
  if (duplicateUser) {
    return res.status(400).json({
      error: "Validation failed",
      details: ["Email must be unique"]
    });
  }

  const updatedUser = {
    id: userId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role ? role.trim() : (inMemoryUsers[userIndex].role || "user"),
    course: course ? course.trim() : inMemoryUsers[userIndex].course,
    semester: semester ? parseInt(semester, 10) : inMemoryUsers[userIndex].semester
  };
  inMemoryUsers[userIndex] = updatedUser;
  res.status(200).json(updatedUser);
});

// 5. DELETE /users/:id - Delete user by ID
app.delete('/users/:id', async (req, res) => {
  const userId = req.params.id;

  if (isMongoConnected && User) {
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }
    try {
      const deletedUser = await User.findByIdAndDelete(userId);
      if (!deletedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(204).end();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  const userIndex = inMemoryUsers.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  inMemoryUsers.splice(userIndex, 1);
  res.status(204).end();
});

// Start Server
app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
