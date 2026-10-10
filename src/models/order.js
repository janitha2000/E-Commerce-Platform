
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    customer: {
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
      phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 30
      },
      address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
      },
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
      }
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true
        },
        name: {
          type: String,
          required: true
        },
        price: {
          type: Number,
          required: true,
          min: 0
        },
        quantity: {
          type: Number,
          required: true,
          min: 1
        }
      }
    ],

    total: {
      type: Number,
      required: true,
      min: 0
    },

    status: {
      type: String,
      enum: ["Pending", "Processing", "Completed", "Cancelled"],
      default: "Pending"
    },

    paymentMethod: {
      type: String,
      enum: ["Demo", "PayHere", "Cash on Delivery"],
      default: "PayHere"
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refund Required", "Charged Back", "Demo Successful"],
      default: "Pending"
    },
    paymentId: {
      type: String,
      default: ""
    },
    reservationExpiresAt: {
      type: Date
    },
    stockReserved: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Order", orderSchema);
