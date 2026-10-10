const crypto = require("crypto");

function formatAmount(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0 || value > 999999999) {
    throw new Error("Payment amount must be a positive amount.");
  }

  return value.toFixed(2);
}

function md5Upper(value) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
}

function createCheckoutHash({ merchantId, merchantSecret, orderId, amount, currency }) {
  const formattedAmount = formatAmount(amount);
  const secretHash = md5Upper(merchantSecret);

  return md5Upper(
    String(merchantId) + String(orderId) + formattedAmount + String(currency) + secretHash
  );
}

function verifyNotification(notification, { merchantId, merchantSecret }) {
  if (!notification || String(notification.merchant_id) !== String(merchantId)) {
    return false;
  }

  const receivedSignature = String(notification.md5sig || "").toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(receivedSignature)) return false;

  const expectedSignature = md5Upper(
    String(notification.merchant_id) +
    String(notification.order_id) +
    String(notification.payhere_amount) +
    String(notification.payhere_currency) +
    String(notification.status_code) +
    md5Upper(merchantSecret)
  );

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "ascii"),
    Buffer.from(receivedSignature, "ascii")
  );
}

module.exports = { createCheckoutHash, formatAmount, verifyNotification };
