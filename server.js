
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const { configureAuth } = require("./src/auth");
const Product = require("./src/models/product");
const Order = require("./src/models/order");
const SupportMessage = require("./src/models/SupportMessage");
const { createCheckoutHash, formatAmount, verifyNotification } = require("./src/payhere");

const app = express();
const PORT = process.env.PORT || 5000;

function isPayHereConfigured() {
  return Boolean(
    process.env.PAYHERE_MERCHANT_ID &&
    process.env.PAYHERE_MERCHANT_SECRET &&
    process.env.APP_BASE_URL
  );
}

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (!origin) return next();

  let allowedOrigin = false;
  if (process.env.NODE_ENV === "production") {
    try {
      allowedOrigin = origin === new URL(process.env.APP_BASE_URL).origin;
    } catch {
      allowedOrigin = false;
    }
  } else {
    try {
      const parsedOrigin = new URL(origin);
      allowedOrigin = parsedOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) &&
        parsedOrigin.port === "5500";
    } catch {
      allowedOrigin = false;
    }
  }

  if (!allowedOrigin) return next();

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.vary("Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }

  return next();
});

app.get("/api/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.json({
    status: databaseConnected ? "OK" : "DEGRADED",
    message: "Stylora API is running",
    database: databaseConnected ? "Connected" : "Disconnected",
    paymentConfigured: isPayHereConfigured()
  });
});

app.use("/api", (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  return res.status(503).json({
    message: "The store database is unavailable. Please try again shortly."
  });
});
const { requireAuth, mongoClient } = configureAuth(app);

const CHECKOUT_RESERVATION_MS = 30 * 60 * 1000;

async function releaseReservedStock(items) {
  for (const item of items) {
    await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: item.quantity } }
    );
  }
}

function checkoutError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function buildOrderDetails(body) {
  const payload = body && typeof body === "object" ? body : {};
  const customerInput = payload.customer && typeof payload.customer === "object"
    ? payload.customer
    : {};
  const customer = {
    name: typeof customerInput.name === "string" ? customerInput.name.trim() : "",
    phone: typeof customerInput.phone === "string" ? customerInput.phone.trim() : "",
    address: typeof customerInput.address === "string" ? customerInput.address.trim() : "",
    city: typeof customerInput.city === "string" ? customerInput.city.trim() : ""
  };

  if (!customer.name || !customer.phone || !customer.address || !customer.city ||
      customer.name.length > 100 || customer.phone.length > 30 ||
      customer.address.length > 500 || customer.city.length > 100) {
    throw checkoutError(400, "Complete your name, phone, delivery address, and city.");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 50) {
    throw checkoutError(400, "Your bag is empty or invalid.");
  }

  const quantities = new Map();
  for (const item of payload.items) {
    if (!item || !mongoose.isValidObjectId(item.product)) {
      throw checkoutError(400, "Your bag contains an invalid product.");
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw checkoutError(400, "A product quantity is invalid.");
    }

    const id = String(item.product);
    quantities.set(id, (quantities.get(id) || 0) + quantity);
    if (quantities.get(id) > 100) {
      throw checkoutError(400, "A product quantity is too high.");
    }
  }

  const productIds = [...quantities.keys()];
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  if (products.length !== productIds.length) {
    throw checkoutError(400, "A product in your bag is no longer available.");
  }

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const items = [];
  let total = 0;

  for (const [id, quantity] of quantities.entries()) {
    const product = productMap.get(id);
    if (!product) {
      throw checkoutError(400, "A product in your bag is no longer available.");
    }
    if (product.stock < quantity) {
      throw checkoutError(400, `Only ${product.stock} of ${product.name} are available.`);
    }

    const price = Number(product.price);
    total += price * quantity;
    items.push({ product: product._id, name: product.name, price, quantity });
  }

  total = Number(total.toFixed(2));
  formatAmount(total);
  return { customer, items, total };
}

async function expirePaymentReservations() {
  const expiredOrders = await Order.find({
    paymentStatus: "Pending",
    stockReserved: true,
    reservationExpiresAt: { $lte: new Date() }
  }).select("_id items");

  for (const order of expiredOrders) {
    const expired = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: "Pending" },
      {
        $set: {
          status: "Cancelled",
          paymentStatus: "Failed",
          stockReserved: false
        }
      }
    );

    if (expired) {
      await releaseReservedStock(expired.items);
    }
  }
}

// ---------------- PRODUCTS ----------------

// Get all products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Products error:", error);
    res.status(500).json({ message: "Unable to load products." });
  }
});

// Get one product
app.get("/api/products/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.json(product);
  } catch (error) {
    console.error("Product details error:", error);
    res.status(500).json({ message: "Unable to load product details." });
  }
});

// ---------------- PAYHERE NOTIFICATIONS ----------------

app.post(
  "/api/payments/payhere/notify",
  express.urlencoded({ extended: false, limit: "20kb" }),
  async (req, res) => {
    if (!isPayHereConfigured()) {
      return res.status(503).send("Payment notifications are not configured.");
    }

    try {
      const notification = req.body;
      const validSignature = verifyNotification(notification, {
        merchantId: process.env.PAYHERE_MERCHANT_ID,
        merchantSecret: process.env.PAYHERE_MERCHANT_SECRET
      });

      if (!validSignature || !mongoose.isValidObjectId(notification.order_id)) {
        return res.status(400).send("Invalid payment notification.");
      }

      const order = await Order.findById(notification.order_id);

      if (!order ||
          order.paymentMethod !== "PayHere" ||
          notification.payhere_currency !== "LKR" ||
          formatAmount(notification.payhere_amount) !== formatAmount(order.total)) {
        return res.status(400).send("Payment details do not match the order.");
      }

      const statusCode = String(notification.status_code);

      if (statusCode === "2") {
        if (order.paymentStatus === "Pending") {
          const paid = await Order.findOneAndUpdate(
            { _id: order._id, paymentStatus: "Pending" },
            {
              $set: {
                status: "Processing",
                paymentStatus: "Paid",
                paymentId: String(notification.payment_id || ""),
                stockReserved: false,
                reservationExpiresAt: null
              }
            },
            { new: true }
          );

          if (!paid) {
            const currentOrder = await Order.findById(order._id);
            if (currentOrder?.paymentStatus !== "Paid") {
              await Order.updateOne(
                { _id: order._id, paymentStatus: "Failed" },
                {
                  $set: {
                    paymentStatus: "Refund Required",
                    paymentId: String(notification.payment_id || "")
                  }
                }
              );
              console.error("PayHere payment arrived after the stock reservation expired:", String(order._id));
            }
          }
        } else if (order.paymentStatus === "Failed") {
          await Order.updateOne(
            { _id: order._id, paymentStatus: "Failed" },
            {
              $set: {
                paymentStatus: "Refund Required",
                paymentId: String(notification.payment_id || "")
              }
            }
          );
          console.error("PayHere payment requires a refund because its reservation expired:", String(order._id));
        }
      } else if (statusCode === "-1" || statusCode === "-2") {
        const failed = await Order.findOneAndUpdate(
          { _id: order._id, paymentStatus: "Pending" },
          {
            $set: {
              status: "Cancelled",
              paymentStatus: "Failed",
              stockReserved: false
            }
          }
        );

        if (failed?.stockReserved) {
          await releaseReservedStock(failed.items);
        }
      } else if (statusCode === "-3") {
        const chargedBack = await Order.findOneAndUpdate(
          { _id: order._id, paymentStatus: { $in: ["Pending", "Paid"] } },
          {
            $set: {
              status: "Cancelled",
              paymentStatus: "Charged Back",
              stockReserved: false
            }
          }
        );

        if (chargedBack?.paymentStatus === "Pending" && chargedBack.stockReserved) {
          await releaseReservedStock(chargedBack.items);
        }
      } else if (statusCode !== "0") {
        return res.status(400).send("Unsupported payment status.");
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("PayHere notification error:", error);
      return res.status(500).send("Unable to process payment notification.");
    }
  }
);

// ---------------- PAYHERE CHECKOUT ----------------

app.post("/api/payments/payhere/start", requireAuth, async (req, res) => {
  try {
    if (!isPayHereConfigured()) {
      return res.status(503).json({
        message: "PayHere is not configured yet. Add its merchant credentials and public app URL to the server environment."
      });
    }

    const mode = process.env.PAYHERE_MODE || "sandbox";
    if (!["sandbox", "live"].includes(mode)) {
      return res.status(500).json({ message: "PAYHERE_MODE must be sandbox or live." });
    }

    if (process.env.NODE_ENV === "production" &&
        (mode !== "live" || !process.env.APP_BASE_URL.startsWith("https://"))) {
      return res.status(503).json({
        message: "Production checkout requires PayHere live mode and an HTTPS APP_BASE_URL."
      });
    }

    if (mode === "live" && !process.env.APP_BASE_URL.startsWith("https://")) {
      return res.status(503).json({
        message: "Live PayHere checkout requires an HTTPS APP_BASE_URL."
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { customer, items: orderItems, total } = await buildOrderDetails(body);
    const { name, phone, address, city } = customer;

    const baseUrl = process.env.APP_BASE_URL.replace(/\/+$/, "");
    const customerNameParts = name.split(/\s+/);
    const firstName = customerNameParts.shift();
    const lastName = customerNameParts.join(" ") || firstName;
    const orderId = new mongoose.Types.ObjectId();
    const order = new Order({
      _id: orderId,
      user: req.user._id,
      customer: {
        name,
        email: req.user.email,
        phone,
        address,
        city
      },
      items: orderItems,
      total,
      status: "Pending",
      paymentMethod: "PayHere",
      paymentStatus: "Pending",
      reservationExpiresAt: new Date(Date.now() + CHECKOUT_RESERVATION_MS),
      stockReserved: false
    });

    await order.save();

    const reservedItems = [];
    try {
      for (const item of orderItems) {
        const reserved = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true }
        );

        if (!reserved) {
          await releaseReservedStock(reservedItems);
          await Order.updateOne(
            { _id: order._id, paymentStatus: "Pending" },
            {
              $set: {
                status: "Cancelled",
                paymentStatus: "Failed",
                stockReserved: false
              }
            }
          );
          return res.status(409).json({
            message: "Stock changed while checking out. Refresh the collection and try again."
          });
        }

        reservedItems.push(item);
      }

      const reservation = await Order.updateOne(
        { _id: order._id, paymentStatus: "Pending" },
        { $set: { stockReserved: true } }
      );
      if (reservation.modifiedCount !== 1) {
        throw new Error("Unable to mark order inventory as reserved.");
      }

      const currency = "LKR";
      const amount = formatAmount(order.total);
      const merchantId = process.env.PAYHERE_MERCHANT_ID;
      const checkoutUrl = mode === "live"
        ? "https://www.payhere.lk/pay/checkout"
        : "https://sandbox.payhere.lk/pay/checkout";
      const parameters = {
        merchant_id: merchantId,
        return_url: `${baseUrl}/?payment=returned&orderId=${order._id}`,
        cancel_url: `${baseUrl}/?payment=cancelled&orderId=${order._id}`,
        notify_url: `${baseUrl}/api/payments/payhere/notify`,
        first_name: firstName,
        last_name: lastName,
        email: req.user.email,
        phone,
        address,
        city,
        country: "Sri Lanka",
        order_id: String(order._id),
        items: `Stylora order ${String(order._id).slice(-8)}`,
        currency,
        amount,
        hash: createCheckoutHash({
          merchantId,
          merchantSecret: process.env.PAYHERE_MERCHANT_SECRET,
          orderId: String(order._id),
          amount,
          currency
        })
      };

      return res.status(201).json({
        checkoutUrl,
        parameters,
        orderId: String(order._id),
        expiresAt: order.reservationExpiresAt
      });
    } catch (error) {
      await releaseReservedStock(reservedItems);
      await Order.updateOne(
        { _id: order._id, paymentStatus: "Pending" },
        {
          $set: {
            status: "Cancelled",
            paymentStatus: "Failed",
            stockReserved: false
          }
        }
      );
      throw error;
    }
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("PayHere checkout creation error:", error);
    return res.status(500).json({ message: "Unable to start secure checkout. Please try again." });
  }
});

app.post("/api/orders/cod", requireAuth, async (req, res) => {
  let order;
  const reservedItems = [];

  try {
    const { customer, items, total } = await buildOrderDetails(req.body);
    order = new Order({
      user: req.user._id,
      customer: {
        ...customer,
        email: req.user.email
      },
      items,
      total,
      status: "Processing",
      paymentMethod: "Cash on Delivery",
      paymentStatus: "Pending",
      stockReserved: false
    });
    await order.save();

    for (const item of items) {
      const reserved = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );

      if (!reserved) {
        throw checkoutError(
          409,
          "Stock changed while checking out. Refresh the collection and try again."
        );
      }
      reservedItems.push(item);
    }

    return res.status(201).json({
      orderId: String(order._id),
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    });
  } catch (error) {
    if (reservedItems.length) {
      await releaseReservedStock(reservedItems);
    }
    if (order) {
      await Order.updateOne(
        { _id: order._id, paymentStatus: "Pending" },
        { $set: { status: "Cancelled", paymentStatus: "Failed" } }
      );
    }
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Cash-on-delivery order error:", error);
    return res.status(500).json({ message: "Unable to place your order. Please try again." });
  }
});

app.get("/api/orders/:id/payment", requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    }).select("status paymentStatus total createdAt");

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({
      orderId: String(order._id),
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      createdAt: order.createdAt
    });
  } catch (error) {
    console.error("Order status error:", error);
    return res.status(500).json({ message: "Unable to check payment status." });
  }
});

// ---------------- CUSTOMER SUPPORT ----------------

app.post("/api/support", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { name, email, subject, message } = body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof subject !== "string" ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        message: "Please complete all support form fields."
      });
    }

    const inquiry = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim()
    };

    if (
      !inquiry.name ||
      !inquiry.email ||
      !inquiry.subject ||
      !inquiry.message
    ) {
      return res.status(400).json({
        message: "All support fields are required."
      });
    }

    if (
      inquiry.name.length > 100 ||
      inquiry.email.length > 150 ||
      inquiry.subject.length > 150 ||
      inquiry.message.length > 2000
    ) {
      return res.status(400).json({ message: "One or more fields are too long." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) {
      return res.status(400).json({ message: "Please enter a valid email." });
    }

    const savedInquiry = await SupportMessage.create(inquiry);

    res.status(201).json({
      message: "Your support inquiry has been saved.",
      inquiryId: savedInquiry._id,
      status: savedInquiry.status
    });
  } catch (error) {
    console.error("Support inquiry error:", error);
    res.status(500).json({ message: "Unable to save your inquiry." });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error("Unhandled request error:", error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const message = status === 413
    ? "Request body is too large."
    : status < 500
      ? "Invalid request."
      : "Unable to complete the request.";

  return res.status(status).json({ message });
});

// ---------------- START SERVER ----------------

async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI in .env file.");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Stylora running at http://localhost:${PORT}`);
  });

  let connectionAttemptInProgress = false;
  let reconnectTimer;

  const scheduleReconnect = () => {
    if (reconnectTimer || server.listening === false) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connectDatabase();
    }, 15_000);
    reconnectTimer.unref();
  };

  const connectDatabase = async () => {
    if (connectionAttemptInProgress || mongoose.connection.readyState === 1) return;
    connectionAttemptInProgress = true;

    try {
      await mongoClient.connect();
      mongoose.connection.setClient(mongoClient);
      await mongoClient.db().collection("sessions").createIndex(
        { expires: 1 },
        { expireAfterSeconds: 0 }
      );
      console.log("MongoDB connected successfully.");
      expirePaymentReservations().catch((error) => {
        console.error("Could not expire checkout reservations:", error.message);
      });
    } catch (error) {
      console.error(
        `MongoDB is unavailable (${error.name}). Check Atlas cluster status, Network Access, and the database connection settings.`
      );
      scheduleReconnect();
    } finally {
      connectionAttemptInProgress = false;
    }
  };

  mongoose.connection.on("disconnected", scheduleReconnect);
  await connectDatabase();

  const reservationTimer = setInterval(() => {
    if (mongoose.connection.readyState !== 1) return;
    expirePaymentReservations().catch((error) => {
      console.error("Could not expire checkout reservations:", error.message);
    });
  }, 60_000);
  reservationTimer.unref();
}

startServer();
