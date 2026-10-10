
const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 150
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: ["New", "In Progress", "Resolved"],
      default: "New"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
