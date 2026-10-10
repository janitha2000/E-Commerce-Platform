"use strict";

const CART_STORAGE_KEY = "stylora-cart";
const ORDER_STORAGE_KEY = "stylora-local-orders";
const SUPPORT_STORAGE_KEY = "stylora-local-support-messages";

const PRODUCT_IMAGES = {
  "classic white t-shirt":
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
  "elegant black handbag":
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85",
  "casual sneakers":
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
  "classic wrist watch":
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85",
  "blue denim jeans":
    "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85",
  "everyday backpack":
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85"
};

const FALLBACK_IMAGES = {
  clothing: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85",
  accessories: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=900&q=85",
  footwear: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
  bags: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
  default: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=85"
};

const state = {
  products: [],
  filteredProducts: [],
  category: "All",
  search: "",
  sort: "featured",
  cart: new Map(),
  busy: false,
  supportBusy: false,
  accountBusy: false,
  accountMode: "login",
  user: null,
  checkoutAfterSignIn: false
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  productGrid: $("#productGrid"),
  productCount: $("#productCount"),
  productMessage: $("#productMessage"),
  searchInput: $("#searchInput"),
  sortFilter: $("#sortFilter"),
  categoryPills: $("#categoryPills"),
  cartCount: $("#cartCount"),
  drawerCount: $("#drawerCount"),
  cartOverlay: $("#cartOverlay"),
  cartDrawer: $("#cartDrawer"),
  cartItems: $("#cartItems"),
  cartTotal: $("#cartTotal"),
  checkoutOverlay: $("#checkoutOverlay"),
  checkoutForm: $("#checkoutForm"),
  checkoutTotal: $("#checkoutTotal"),
  checkoutMessage: $("#checkoutMessage"),
  placeOrderButton: $("#placeOrderButton"),
  paymentNoticeTitle: $("#paymentNoticeTitle"),
  paymentNoticeText: $("#paymentNoticeText"),
  checkoutSteps: $("#checkoutForm .checkout-steps"),
  paymentStep: $("#paymentStep"),
  confirmationStep: $("#confirmationStep"),
  checkoutProcessing: $("#checkoutProcessing"),
  processingMessage: $("#processingMessage"),
  checkoutReceipt: $("#checkoutReceipt"),
  receiptEyebrow: $("#receiptEyebrow"),
  receiptTitle: $("#receiptTitle"),
  receiptDescription: $("#receiptDescription"),
  receiptOrderId: $("#receiptOrderId"),
  receiptPayment: $("#receiptPayment"),
  receiptTotal: $("#receiptTotal"),
  receiptDemoNote: $("#receiptDemoNote"),
  accountOverlay: $("#accountOverlay"),
  accountForm: $("#accountForm"),
  accountNameField: $("#accountNameField"),
  accountUsernameField: $("#accountUsernameField"),
  accountIdentifierField: $("#accountIdentifierField"),
  accountEmailField: $("#accountEmailField"),
  accountFeedback: $("#accountFeedback"),
  accountSubmit: $("#accountSubmit"),
  accountModeToggle: $("#accountModeToggle"),
  accountForms: $("#accountForms"),
  accountSignedIn: $("#accountSignedIn"),
  accountWelcome: $("#accountWelcome"),
  accountEmail: $("#accountEmail"),
  accountAvatar: $("#accountAvatar"),
  supportForm: $("#supportForm"),
  supportFeedback: $("#supportFeedback"),
  supportSubmitButton: $("#supportSubmitButton"),
  supportAgentPanel: $("#supportAgentPanel"),
  supportAgentToggle: $("#supportAgentToggle"),
  supportAgentClose: $("#supportAgentClose"),
  supportAgentMessages: $("#supportAgentMessages"),
  supportAgentForm: $("#supportAgentForm"),
  supportAgentInput: $("#supportAgentInput"),
  toast: $("#toast")
};

let toastTimer;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatPrice(value) {
  return "Rs. " + Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getProductId(product) {
  return String(product._id ?? product.id ?? product.name);
}

function getProductImage(product) {
  const image = String(product.image ?? "").trim();
  const name = String(product.name ?? "").trim().toLowerCase();

  if (image.includes("placehold.co") && PRODUCT_IMAGES[name]) {
    return PRODUCT_IMAGES[name];
  }

  // Support locally uploaded images and valid HTTP(S) image URLs.
  if (image.startsWith("/uploads/") || image.startsWith("/images/")) {
    return image;
  }

  if (/^https?:\/\/\S+$/i.test(image)) {
    return image;
  }

  if (PRODUCT_IMAGES[name]) {
    return PRODUCT_IMAGES[name];
  }

  const category = String(product.category ?? "").toLowerCase();
  return FALLBACK_IMAGES[category] || FALLBACK_IMAGES.default;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function restoreCart() {
  try {
    const savedItems = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");

    if (!Array.isArray(savedItems)) {
      throw new Error("Saved cart has an invalid format.");
    }

    for (const savedItem of savedItems) {
      if (!savedItem || typeof savedItem.id !== "string") continue;

      const product = state.products.find(
        (item) => getProductId(item) === savedItem.id
      );
      const quantity = Number(savedItem.quantity);

      if (!product || !Number.isInteger(quantity) || quantity < 1) continue;

      const stock = Math.max(0, Number(product.stock) || 0);
      const restoredQuantity = Math.min(quantity, stock);

      if (restoredQuantity > 0) {
        state.cart.set(savedItem.id, { product, quantity: restoredQuantity });
      }
    }
  } catch (error) {
    console.error("Could not restore saved cart:", error);
    showToast("Your saved Shopping Cart could not be restored.");
  }
}

function persistCart() {
  try {
    const savedItems = Array.from(state.cart.entries()).map(([id, item]) => ({
      id,
      quantity: item.quantity
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(savedItems));
  } catch (error) {
    console.error("Could not save cart:", error);
    showToast("Your Shopping Cart could not be saved on this device.");
  }
}

function appendLocalRecord(storageKey, record) {
  let records = [];
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    records = JSON.parse(stored);
    if (!Array.isArray(records)) {
      throw new Error("Saved store data is invalid. Clear this site's local storage and try again.");
    }
  }

  records.push(record);
  localStorage.setItem(storageKey, JSON.stringify(records));
}

function loadProducts() {
  if (!Array.isArray(window.STYLORA_PRODUCTS)) {
    console.error("Could not load the local product list. Check that products.js is included.");
    elements.productMessage.textContent =
      "The collection could not be loaded. Check that products.js is included.";
    return;
  }

  state.products = window.STYLORA_PRODUCTS.map((product) => ({
    ...product,
    price: Number(product.price) || 0,
    stock: Math.max(0, Number(product.stock) || 0)
  }));

  restoreCart();
  renderCart();
  elements.productMessage.textContent = "";
  filterAndRenderProducts();
}

function filterAndRenderProducts() {
  const search = state.search.trim().toLowerCase();

  let products = state.products.filter((product) => {
    const categoryMatches = state.category === "All" ||
      String(product.category || "").toLowerCase() === state.category.toLowerCase();

    const searchableText = [
      product.name,
      product.category,
      product.description
    ].join(" ").toLowerCase();

    return categoryMatches && searchableText.includes(search);
  });

  switch (state.sort) {
    case "price-low":
      products.sort((a, b) => a.price - b.price);
      break;
    case "price-high":
      products.sort((a, b) => b.price - a.price);
      break;
    case "name":
      products.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      break;
    default:
      break;
  }

  state.filteredProducts = products;
  renderProducts();
}

function renderProducts() {
  const totalProducts = state.products.length;
  const visibleProducts = state.filteredProducts.length;
  if (totalProducts) {
    const noun = totalProducts === 1 ? "piece" : "pieces";
    elements.productCount.textContent =
      "Showing " + visibleProducts + " of " + totalProducts + " " + noun;
  } else {
    elements.productCount.textContent = "";
  }

  if (!state.filteredProducts.length) {
    elements.productGrid.innerHTML = "";
    elements.productMessage.textContent = state.products.length
      ? "No products match your search. Try another category or keyword."
      : "Your collection is currently empty.";
    return;
  }

  elements.productMessage.textContent = "";

  elements.productGrid.innerHTML = state.filteredProducts.map((product) => {
    const id = escapeHTML(getProductId(product));
    const name = escapeHTML(product.name || "Untitled product");
    const category = escapeHTML(product.category || "Collection");
    const description = escapeHTML(product.description || "A thoughtful pick for your everyday style.");
    const image = escapeHTML(getProductImage(product));
    const price = formatPrice(product.price);
    const stock = Math.max(0, Number(product.stock) || 0);
    const unavailable = stock < 1;

    return `
      <article class="product-card">
        <div class="product-image-wrap">
          <img
            class="product-image"
            src="${image}"
            alt="${name}"
            loading="lazy"
            data-product-image
          >
          <span class="product-category">${category}</span>
        </div>
        <div class="product-info">
          <div class="product-info-top">
            <h3 class="product-name">${name}</h3>
            <span class="product-price">${price}</span>
          </div>
          <p class="product-description">${description}</p>
          <div class="product-card-bottom">
            <span class="stock-label">${unavailable ? "Currently unavailable" : "Ready for your wardrobe"}</span>
            <button
              class="add-to-cart"
              type="button"
              data-add="${id}"
              ${unavailable ? "disabled" : ""}
            >${unavailable ? "Out of stock" : "Add to cart +"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  elements.productGrid.querySelectorAll(".product-card").forEach(addTiltEffect);

  // Use a category fallback if an external image fails.
  elements.productGrid.querySelectorAll("[data-product-image]").forEach((image, index) => {
    image.addEventListener("error", () => {
      const product = state.filteredProducts[index];
      if (!product) return;

      const category = String(product.category || "").toLowerCase();
      const fallback = FALLBACK_IMAGES[category] || FALLBACK_IMAGES.default;

      if (image.src !== fallback) {
        image.src = fallback;
      }
    }, { once: true });
  });
}

function setCategory(category) {
  state.category = category;

  elements.categoryPills.querySelectorAll("[data-category]").forEach((button) => {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  filterAndRenderProducts();
}

function addToCart(id) {
  const product = state.products.find((item) => getProductId(item) === id);

  if (!product) {
    showToast("This product could not be found.");
    return;
  }

  const current = state.cart.get(id);
  const quantity = current ? current.quantity : 0;
  const stock = Math.max(0, Number(product.stock) || 0);

  if (quantity >= stock) {
    showToast("Sorry, there is not enough stock available.");
    return;
  }

  state.cart.set(id, {
    product,
    quantity: quantity + 1
  });

  persistCart();
  renderCart();
  showToast(`${product.name} added to your Shopping Cart.`);
}

function changeQuantity(id, change) {
  const item = state.cart.get(id);
  if (!item) return;

  const nextQuantity = item.quantity + change;
  const stock = Math.max(0, Number(item.product.stock) || 0);

  if (nextQuantity <= 0) {
    state.cart.delete(id);
  } else if (nextQuantity <= stock) {
    state.cart.set(id, { ...item, quantity: nextQuantity });
  } else {
    showToast("You have reached the available stock limit.");
  }

  persistCart();
  renderCart();
}

function removeFromCart(id) {
  state.cart.delete(id);
  persistCart();
  renderCart();
}

function getCartTotals() {
  let quantity = 0;
  let total = 0;

  for (const item of state.cart.values()) {
    quantity += item.quantity;
    total += item.quantity * item.product.price;
  }

  return { quantity, total };
}

function renderCart() {
  const { quantity, total } = getCartTotals();

  elements.cartCount.textContent = quantity;
  elements.drawerCount.textContent = `(${quantity})`;
  elements.cartTotal.textContent = formatPrice(total);
  elements.checkoutTotal.textContent = formatPrice(total);

  if (state.cart.size === 0) {
    elements.cartItems.innerHTML = `
      <div class="empty-cart">
        <p>Your Shopping Cart is waiting for something lovely.</p>
        <p>Explore the collection and add your favourites.</p>
      </div>
    `;
    return;
  }

  elements.cartItems.innerHTML = Array.from(state.cart.entries()).map(([id, item]) => {
    const product = item.product;

    return `
      <article class="cart-item">
        <img
          src="${escapeHTML(getProductImage(product))}"
          alt="${escapeHTML(product.name)}"
          loading="lazy"
        >
        <div>
          <h3>${escapeHTML(product.name)}</h3>
          <div class="cart-item-price">${formatPrice(product.price)}</div>
          <div class="quantity-controls">
            <button type="button" data-quantity="${escapeHTML(id)}" data-change="-1" aria-label="Decrease quantity">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-quantity="${escapeHTML(id)}" data-change="1" aria-label="Increase quantity" ${item.quantity >= Number(product.stock) ? "disabled" : ""}>+</button>
          </div>
        </div>
        <button type="button" class="remove-item" data-remove="${escapeHTML(id)}" aria-label="Remove item">×</button>
      </article>
    `;
  }).join("");
}

function openCart() {
  elements.cartOverlay.classList.add("visible");
  elements.cartDrawer.classList.add("open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}

function closeCart() {
  elements.cartOverlay.classList.remove("visible");
  elements.cartDrawer.classList.remove("open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");

  if (!elements.checkoutOverlay.classList.contains("visible")) {
    document.body.classList.remove("no-scroll");
  }
}

function openCheckout() {
  if (state.cart.size === 0) {
    showToast("Your Shopping Cart is empty. Add a product first.");
    return;
  }

  if (!state.user) {
    state.checkoutAfterSignIn = true;
    closeCart();
    openAccount();
    elements.accountFeedback.textContent = "Sign in or create an account before checking out.";
    return;
  }

  closeCart();
  elements.checkoutForm.elements.customerName.value = state.user.name;
  elements.checkoutMessage.textContent = "";
  elements.checkoutForm.hidden = false;
  elements.checkoutProcessing.hidden = true;
  elements.checkoutReceipt.hidden = true;
  elements.checkoutSteps.hidden = false;
  elements.confirmationStep.classList.remove("is-active");
  $("#checkoutTitle").textContent = "Checkout";
  updateCheckoutPaymentUI();
  elements.checkoutOverlay.classList.add("visible");
  document.body.classList.add("no-scroll");
}

function closeCheckout() {
  elements.checkoutOverlay.classList.remove("visible");
  document.body.classList.remove("no-scroll");
}

async function submitOrder(event) {
  event.preventDefault();

  if (state.busy) return;

  if (state.cart.size === 0) {
    elements.checkoutMessage.textContent = "Your Shopping Cart is empty.";
    return;
  }

  const formData = new FormData(elements.checkoutForm);
  const customer = {
    name: String(formData.get("customerName") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    city: String(formData.get("city") || "").trim()
  };

  const items = Array.from(state.cart.values()).map(({ product, quantity }) => ({
    productId: getProductId(product),
    name: product.name,
    unitPrice: product.price,
    quantity,
    lineTotal: Number((product.price * quantity).toFixed(2))
  }));
  const total = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const paymentMethod = elements.checkoutForm.elements.paymentMethod.value;

  state.busy = true;
  elements.placeOrderButton.disabled = true;
  elements.placeOrderButton.textContent = paymentMethod === "cod"
    ? "Preparing your COD order..."
    : "Opening secure checkout preview...";
  elements.checkoutForm.hidden = true;
  elements.checkoutProcessing.hidden = false;
  elements.checkoutSteps.hidden = true;
  elements.processingMessage.textContent = paymentMethod === "cod"
    ? "Confirming your delivery details..."
    : "Simulating a secure card payment. No card information is needed.";

  try {
    if (paymentMethod === "card") {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    const orderId = `ST-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const isCardDemo = paymentMethod === "card";
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      customer,
      items,
      total,
      paymentMethod: isCardDemo ? "Card checkout preview" : "Cash on delivery",
      paymentStatus: isCardDemo ? "Demo successful — not charged" : "Pay on delivery",
      status: "Saved on this device"
    };
    appendLocalRecord(ORDER_STORAGE_KEY, {
      ...order
    });

    state.cart.clear();
    persistCart();
    renderCart();
    elements.checkoutProcessing.hidden = true;
    elements.checkoutReceipt.hidden = false;
    elements.confirmationStep.classList.add("is-active");
    $("#checkoutTitle").textContent = "Order confirmation";
    elements.receiptEyebrow.textContent = isCardDemo
      ? "PAYMENT PREVIEW COMPLETE"
      : "COD ORDER PREVIEW SAVED";
    elements.receiptTitle.textContent = isCardDemo
      ? "Your demo checkout is complete."
      : "Your delivery preview is ready.";
    elements.receiptDescription.textContent = isCardDemo
      ? "The card checkout was simulated successfully."
      : "Your cash-on-delivery order preview has been saved.";
    elements.receiptOrderId.textContent = orderId;
    elements.receiptPayment.textContent = order.paymentMethod;
    elements.receiptTotal.textContent = formatPrice(total);
    elements.receiptDemoNote.textContent = isCardDemo
      ? "Demo only — no card was charged. This order was saved in this browser and was not sent to the shop."
      : "Local preview only — the shop was not notified, and delivery has not been arranged.";
  } catch (error) {
    console.error("Could not save local order:", error);
    elements.checkoutProcessing.hidden = true;
    elements.checkoutForm.hidden = false;
    elements.checkoutMessage.textContent =
      error.message || "Could not save your order on this device.";
  } finally {
    state.busy = false;
    updateCheckoutPaymentUI();
  }
}

function addTiltEffect(element) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  let animationFrame = 0;
  element.addEventListener("pointermove", (event) => {
    const bounds = element.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    const relativeY = (event.clientY - bounds.top) / bounds.height;

    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      element.style.setProperty("--tilt-x", `${(0.5 - relativeY) * 5}deg`);
      element.style.setProperty("--tilt-y", `${(relativeX - 0.5) * 7}deg`);
    });
  });

  element.addEventListener("pointerleave", () => {
    cancelAnimationFrame(animationFrame);
    element.style.setProperty("--tilt-x", "0deg");
    element.style.setProperty("--tilt-y", "0deg");
  });
}

function openAccount() {
  renderAccountState();
  elements.accountOverlay.classList.add("visible");
  document.body.classList.add("no-scroll");
  setTimeout(() => {
    const firstInput = elements.accountForm.querySelector(
      state.accountMode === "register" ? '[name="name"]' : '[name="email"]'
    );
    if (elements.accountSignedIn.hidden && firstInput) firstInput.focus();
  }, 100);
}

function closeAccount() {
  elements.accountOverlay.classList.remove("visible");
  if (!elements.checkoutOverlay.classList.contains("visible") &&
      !elements.cartDrawer.classList.contains("open")) {
    document.body.classList.remove("no-scroll");
  }
}

function renderAccountState() {
  const signedIn = Boolean(state.user);
  elements.accountForms.hidden = signedIn;
  elements.accountSignedIn.hidden = !signedIn;
  $("#accountTitle").textContent = signedIn
    ? "Your account"
    : state.accountMode === "register"
      ? "Join the edit"
      : "Welcome back";
  $("#accountOpen").textContent = signedIn
    ? state.user.name.split(" ")[0]
    : "Sign in";
  $("#accountOpen").setAttribute(
    "aria-label",
    signedIn ? `Open account for ${state.user.name}` : "Sign in or create an account"
  );
  elements.accountNameField.hidden = state.accountMode !== "register";
  elements.accountUsernameField.hidden = state.accountMode !== "register";
  elements.accountIdentifierField.hidden = state.accountMode === "register";
  elements.accountEmailField.hidden = state.accountMode !== "register";
  elements.accountForm.querySelector('[name="username"]').required =
    state.accountMode === "register";
  elements.accountForm.querySelector('[name="identifier"]').required =
    state.accountMode !== "register";
  elements.accountForm.querySelector('[name="email"]').required =
    state.accountMode === "register";
  elements.accountForm.querySelector('[name="name"]').required =
    state.accountMode === "register";
  elements.accountForm.querySelector('[name="password"]').autocomplete = state.accountMode === "register"
    ? "new-password"
    : "current-password";
  elements.accountForm.querySelector('[name="password"]').minLength =
    state.accountMode === "register" ? 12 : 1;
  elements.accountSubmit.innerHTML = state.accountMode === "register"
    ? "Create account <span>↗</span>"
    : "Sign in <span>↗</span>";
  elements.accountModeToggle.textContent = state.accountMode === "register"
    ? "Already have an account? Sign in"
    : "Create an account";

  if (signedIn) {
    elements.accountWelcome.textContent = `Welcome, ${state.user.name}`;
    elements.accountEmail.textContent = state.user.email;
    elements.accountAvatar.textContent = state.user.name.trim().charAt(0).toUpperCase();
  }
}

function loadAccount() {
  try {
    state.user = window.StyloraLocalAccounts.getCurrentUser();
    renderAccountState();
  } catch (error) {
    console.error("Could not load local account status:", error);
    elements.accountFeedback.textContent =
      "Local account storage is unavailable. Enable site storage in your browser.";
    renderAccountState();
  }
}

function updateCheckoutPaymentUI() {
  const codOption = elements.checkoutForm.querySelector('[value="cod"]');
  const cardOption = elements.checkoutForm.querySelector('[value="card"]');
  codOption.disabled = false;
  cardOption.disabled = false;
  const codSelected = codOption.checked;
  elements.placeOrderButton.disabled = state.cart.size === 0 || state.busy;
  elements.placeOrderButton.textContent = codSelected
    ? "Save COD order on this device"
    : "Save demo card order";
  elements.paymentNoticeTitle.textContent = codSelected
    ? "Cash on delivery — local demo"
    : "Card checkout — local demo only";
  elements.paymentNoticeText.textContent = codSelected
    ? "This order is saved in your browser only. The shop will not receive it until you contact them."
    : "No card details are collected and no payment is taken. Real card checkout requires a payment provider.";
}

async function submitAccount(event) {
  event.preventDefault();
  if (state.accountBusy) return;

  const values = new FormData(elements.accountForm);
  const password = String(values.get("password") || "");
  const payload = {};

  if (state.accountMode === "register") {
    payload.email = String(values.get("email") || "").trim();
    payload.username = String(values.get("username") || "").trim();
    payload.name = String(values.get("name") || "").trim();
  } else {
    payload.identifier = String(values.get("identifier") || "").trim();
  }

  state.accountBusy = true;
  elements.accountSubmit.disabled = true;
  elements.accountFeedback.textContent = "";
  elements.accountSubmit.textContent = state.accountMode === "register"
    ? "Creating account..."
    : "Signing in...";

  try {
    state.user = state.accountMode === "register"
      ? await window.StyloraLocalAccounts.register({ ...payload, password })
      : await window.StyloraLocalAccounts.login(payload.identifier, password);
    elements.accountForm.reset();
    renderAccountState();
    showToast(`Welcome to Stylora, ${state.user.name.split(" ")[0]}.`);

    if (state.checkoutAfterSignIn) {
      state.checkoutAfterSignIn = false;
      closeAccount();
      openCheckout();
    } else {
      closeAccount();
    }
  } catch (error) {
    console.error("Local account request failed:", error);
    elements.accountFeedback.textContent =
      error.message || "We could not complete that account request.";
  } finally {
    state.accountBusy = false;
    elements.accountSubmit.disabled = false;
    renderAccountState();
  }
}

async function signOut() {
  try {
    window.StyloraLocalAccounts.logout();
    state.user = null;
    state.checkoutAfterSignIn = false;
    renderAccountState();
    closeAccount();
    showToast("You have signed out.");
  } catch (error) {
    console.error("Sign-out failed:", error);
    elements.accountFeedback.textContent = "Could not sign out of this browser account.";
  }
}

function submitSupportMessage(event) {
  event.preventDefault();

  if (state.supportBusy) return;

  const button = elements.supportSubmitButton;
  const formData = new FormData(elements.supportForm);

  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    subject: String(formData.get("subject") || "").trim(),
    message: String(formData.get("message") || "").trim()
  };

  if (!payload.name || !payload.email || !payload.subject || !payload.message) {
    elements.supportFeedback.textContent = "Please complete every field.";
    return;
  }

  state.supportBusy = true;
  button.disabled = true;
  button.textContent = "Saving...";
  elements.supportFeedback.textContent = "";

  try {
    appendLocalRecord(SUPPORT_STORAGE_KEY, {
      id: `MSG-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      ...payload
    });
    elements.supportForm.reset();
    elements.supportFeedback.textContent =
      "Message saved in this browser only; Stylora has not received it.";
  } catch (error) {
    console.error("Could not save the local support message:", error);
    elements.supportFeedback.textContent =
      error.message || "Could not save your message on this device.";
  } finally {
    state.supportBusy = false;
    button.disabled = false;
    button.innerHTML = 'Save message <span>↗</span>';
  }
}

function supportAgentReply(question) {
  const text = question.toLowerCase();
  const products = state.products;

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) {
    return "Hello! I can help you browse the collection, explain COD and demo card checkout, or describe what this browser can tell you about a saved order.";
  }
  if (/\b(payment|pay|card|cash|cod|checkout)\b/.test(text)) {
    return "Cash on delivery saves a COD order preview in this browser, but it does not notify the shop. Card is a demo only: no card details are collected and no payment is taken. Real orders and payments need a connected shop/payment service.";
  }
  if (/\b(order|delivery|deliver|tracking|track|status)\b/.test(text)) {
    let orderCount = 0;
    try {
      const savedOrders = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "[]");
      orderCount = Array.isArray(savedOrders) ? savedOrders.length : 0;
    } catch (error) {
      console.error("Could not read local order previews:", error);
      return "I couldn’t read the order previews saved in this browser. They aren’t delivery records, and I can’t track a parcel.";
    }
    return orderCount
      ? `There ${orderCount === 1 ? "is 1 order preview" : `are ${orderCount} order previews`} saved in this browser. They are not sent to the shop, so I can’t confirm fulfillment or delivery.`
      : "There are no local order previews saved in this browser yet. I can’t look up real deliveries because this support assistant doesn’t connect to an order system.";
  }
  if (/\b(return|refund|exchange|cancel)\b/.test(text)) {
    return "I don’t have access to an official returns or refund policy here. Please check the shop’s published policy before placing an order. The Contact form can save a message on your device, but it won’t send it to the shop.";
  }
  if (/\b(account|login|log in|sign in|password|username)\b/.test(text)) {
    return "Stylora accounts are stored only in this browser. They don’t sync to other devices. You can use the Sign in button in the header to manage this local account.";
  }
  if (/\b(product|collection|clothing|accessor|footwear|shoe|bag|price|stock|available)\b/.test(text)) {
    const requestedCategory = /\b(shoe|shoes|sneaker|sneakers|footwear)\b/.test(text)
      ? "Footwear"
      : /\b(bag|bags|backpack|handbag)\b/.test(text)
        ? null
        : /\b(accessor|watch|jewelry)\b/.test(text)
          ? "Accessories"
          : /\b(clothing|shirt|jeans|clothes)\b/.test(text)
            ? "Clothing"
            : null;
    const terms = text.split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2 && ![
        "product", "products", "collection", "show", "have", "what",
        "which", "price", "stock", "available", "please"
      ].includes(term));
    let matches = products.filter((product) => {
      const productText = `${product.name} ${product.category} ${product.description}`.toLowerCase();
      const categoryMatch = requestedCategory
        ? product.category === requestedCategory
        : false;
      return categoryMatch || terms.some((term) => productText.includes(term));
    });
    if (!matches.length && requestedCategory) {
      matches = products.filter((product) => product.category === requestedCategory);
    }
    if (!matches.length) matches = products;
    const result = matches.length
      ? matches.slice(0, 4).map((product) =>
        `${product.name} (${formatPrice(product.price)})`
      ).join(", ")
      : "There are no matching pieces in this sample collection";
    return `The local collection has ${products.length} sample pieces. Here are some picks: ${result}. Use the Collection section to filter by category or search by name.`;
  }
  if (/\b(human|person|agent|contact|support|message|help)\b/.test(text)) {
    return "I’m the local automated helper, not a live human agent. You can use the Contact form below to save a support message in this browser; Stylora won’t receive it unless you send it through a separate channel.";
  }

  return "I can help with products, payment options, local order previews, accounts, and returns information. Try one of the suggested questions. For a human response, the Contact form only saves a draft locally and does not send it.";
}

function addSupportAgentMessage(message, sender) {
  const bubble = document.createElement("p");
  bubble.className = `support-agent-bubble ${sender === "customer" ? "support-agent-question" : "support-agent-reply"}`;
  bubble.textContent = message;
  elements.supportAgentMessages.appendChild(bubble);
  elements.supportAgentMessages.scrollTop = elements.supportAgentMessages.scrollHeight;
}

function submitSupportAgentQuestion(question) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) return;

  addSupportAgentMessage(cleanQuestion, "customer");
  elements.supportAgentInput.value = "";
  addSupportAgentMessage(supportAgentReply(cleanQuestion), "agent");
}

function setupEventListeners() {
  document.querySelectorAll("[data-tilt]").forEach(addTiltEffect);

  $(".collection-grid").addEventListener("click", (event) => {
    const collection = event.target.closest("[data-collection-category]");
    if (!collection) return;

    setCategory(collection.dataset.collectionCategory);
    $("#collection").scrollIntoView({ behavior: "smooth" });
  });

  $("#menuToggle").addEventListener("click", () => {
    const nav = $("#mainNav");
    nav.classList.toggle("open");
    $("#menuToggle").textContent = nav.classList.contains("open") ? "×" : "☰";
  });

  $("#mainNav").querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      $("#mainNav").classList.remove("open");
      $("#menuToggle").textContent = "☰";
    });
  });

  $("#searchToggle").addEventListener("click", () => {
    $("#collection").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => elements.searchInput.focus(), 350);
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    filterAndRenderProducts();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sort = event.target.value;
    filterAndRenderProducts();
  });

  elements.categoryPills.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (button) setCategory(button.dataset.category);
  });

  elements.productGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (button) addToCart(button.dataset.add);
  });

  elements.cartItems.addEventListener("click", (event) => {
    const quantityButton = event.target.closest("[data-quantity]");
    const removeButton = event.target.closest("[data-remove]");

    if (quantityButton) {
      changeQuantity(
        quantityButton.dataset.quantity,
        Number(quantityButton.dataset.change)
      );
    }

    if (removeButton) removeFromCart(removeButton.dataset.remove);
  });

  $("#cartOpen").addEventListener("click", openCart);
  $("#accountOpen").addEventListener("click", () => {
    if (state.user) {
      openAccount();
      return;
    }

    const isLiveServerPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
      window.location.port === "5500";
    const returnTo = isLiveServerPreview ? "index.html" : "/";
    window.location.assign(`login.html?returnTo=${encodeURIComponent(returnTo)}`);
  });
  $("#accountClose").addEventListener("click", closeAccount);
  elements.accountOverlay.addEventListener("click", (event) => {
    if (event.target === elements.accountOverlay) closeAccount();
  });
  elements.accountForm.addEventListener("submit", submitAccount);
  elements.accountModeToggle.addEventListener("click", () => {
    state.accountMode = state.accountMode === "login" ? "register" : "login";
    elements.accountFeedback.textContent = "";
    elements.accountForm.reset();
    renderAccountState();
  });
  $("#accountLogout").addEventListener("click", signOut);
  $("#cartClose").addEventListener("click", closeCart);
  $("#continueShopping").addEventListener("click", closeCart);
  elements.cartOverlay.addEventListener("click", closeCart);
  $("#checkoutOpen").addEventListener("click", openCheckout);
  $("#checkoutClose").addEventListener("click", closeCheckout);
  $("#receiptDone").addEventListener("click", closeCheckout);
  elements.checkoutForm.addEventListener("submit", submitOrder);
  elements.checkoutForm.querySelectorAll('[name="paymentMethod"]').forEach((option) => {
    option.addEventListener("change", updateCheckoutPaymentUI);
  });
  elements.supportForm.addEventListener("submit", submitSupportMessage);
  elements.supportAgentToggle.addEventListener("click", () => {
    const isOpen = !elements.supportAgentPanel.hidden;
    elements.supportAgentPanel.hidden = isOpen;
    elements.supportAgentToggle.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) elements.supportAgentInput.focus();
  });
  elements.supportAgentClose.addEventListener("click", () => {
    elements.supportAgentPanel.hidden = true;
    elements.supportAgentToggle.setAttribute("aria-expanded", "false");
    elements.supportAgentToggle.focus();
  });
  elements.supportAgentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSupportAgentQuestion(elements.supportAgentInput.value);
  });
  elements.supportAgentPanel.addEventListener("click", (event) => {
    const prompt = event.target.closest("[data-support-prompt]");
    if (prompt) submitSupportAgentQuestion(prompt.dataset.supportPrompt);
  });

  elements.checkoutOverlay.addEventListener("click", (event) => {
    if (event.target === elements.checkoutOverlay) closeCheckout();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
      closeCheckout();
      closeAccount();
      $("#mainNav").classList.remove("open");
      $("#menuToggle").textContent = "☰";
    }
  });
}

function initialize() {
  $("#currentYear").textContent = new Date().getFullYear();
  setupEventListeners();
  renderCart();

  loadProducts();
  loadAccount();
  updateCheckoutPaymentUI();
}

document.addEventListener("DOMContentLoaded", initialize);