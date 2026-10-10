const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  createCheckoutHash,
  formatAmount,
  verifyNotification
} = require("../src/payhere");

function md5Upper(value) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
}

function makeNotification(overrides = {}) {
  const notification = {
    merchant_id: "123456",
    order_id: "507f1f77bcf86cd799439011",
    payhere_amount: "2500.00",
    payhere_currency: "LKR",
    status_code: "2",
    ...overrides
  };
  const hashedSecret = md5Upper("test-merchant-secret");

  notification.md5sig = md5Upper(
    notification.merchant_id +
    notification.order_id +
    notification.payhere_amount +
    notification.payhere_currency +
    notification.status_code +
    hashedSecret
  );

  return notification;
}

test("formats payment amounts with exactly two decimal places", () => {
  assert.equal(formatAmount(2500), "2500.00");
  assert.equal(formatAmount(2500.5), "2500.50");
});

test("rejects invalid payment amounts", () => {
  assert.throws(() => formatAmount(0), /positive amount/);
  assert.throws(() => formatAmount(-1), /positive amount/);
  assert.throws(() => formatAmount(Number.NaN), /positive amount/);
});

test("creates the PayHere checkout hash from the formatted amount", () => {
  const secretHash = md5Upper("test-merchant-secret");
  const expected = md5Upper(`123456507f1f77bcf86cd7994390112500.00LKR${secretHash}`);

  assert.equal(createCheckoutHash({
    merchantId: "123456",
    merchantSecret: "test-merchant-secret",
    orderId: "507f1f77bcf86cd799439011",
    amount: 2500,
    currency: "LKR"
  }), expected);
});

test("accepts a correctly signed PayHere notification", () => {
  assert.equal(verifyNotification(makeNotification(), {
    merchantId: "123456",
    merchantSecret: "test-merchant-secret"
  }), true);
});

test("rejects notifications with changed amounts, signatures, or merchant IDs", () => {
  const notification = makeNotification();

  assert.equal(verifyNotification({ ...notification, payhere_amount: "1.00" }, {
    merchantId: "123456",
    merchantSecret: "test-merchant-secret"
  }), false);
  assert.equal(verifyNotification(notification, {
    merchantId: "different-merchant",
    merchantSecret: "test-merchant-secret"
  }), false);
  assert.equal(verifyNotification({ ...notification, md5sig: "invalid" }, {
    merchantId: "123456",
    merchantSecret: "test-merchant-secret"
  }), false);
});
