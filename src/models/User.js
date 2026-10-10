const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      unique: true,
      sparse: true,
      match: /^[a-z0-9._-]+$/
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 150,
      unique: true
    },
    passwordHash: {
      type: String,
      select: false
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
