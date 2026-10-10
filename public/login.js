"use strict";

const form = document.querySelector("#loginForm");
const nameField = document.querySelector("#loginNameField");
const usernameField = document.querySelector("#loginUsernameField");
const identifierField = document.querySelector("#loginIdentifierField");
const emailField = document.querySelector("#loginEmailField");
const passwordField = document.querySelector("#loginPassword");
const submitButton = document.querySelector("#loginSubmit");
const modeToggle = document.querySelector("#loginModeToggle");
const feedback = document.querySelector("#loginFeedback");
const connectionNote = document.querySelector("#loginConnectionNote");

let mode = new URLSearchParams(window.location.search).get("mode") === "register"
  ? "register"
  : "login";
let busy = false;

function getStoreReturnUrl() {
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  if (requested && requested.startsWith("/") && !requested.startsWith("//")) {
    return requested;
  }
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) &&
    window.location.port === "5500"
    ? "index.html"
    : "/";
}

function renderMode({ clearFeedback = true } = {}) {
  const registering = mode === "register";
  document.querySelector("#loginTitle").innerHTML = registering
    ? 'Join the edit<span class="heading-dot">.</span>'
    : 'Welcome back<span class="heading-dot">.</span>';
  nameField.hidden = !registering;
  nameField.querySelector("input").required = registering;
  usernameField.hidden = !registering;
  usernameField.querySelector("input").required = registering;
  emailField.hidden = !registering;
  emailField.querySelector("input").required = registering;
  identifierField.hidden = registering;
  identifierField.querySelector("input").required = !registering;
  identifierField.querySelector("input").autocomplete = registering ? "off" : "username";
  passwordField.autocomplete = registering ? "new-password" : "current-password";
  passwordField.minLength = registering ? 12 : 1;
  passwordField.placeholder = registering ? "At least 12 characters" : "Your password";
  submitButton.innerHTML = registering
    ? "Create account <span>↗</span>"
    : "Sign in <span>↗</span>";
  modeToggle.textContent = registering
    ? "Already have an account? Sign in"
    : "New to Stylora? Create an account";
  if (clearFeedback) feedback.textContent = "";
}

function redirectIfSignedIn() {
  try {
    if (window.StyloraLocalAccounts.getCurrentUser()) {
      window.location.replace(getStoreReturnUrl());
      return;
    }
    connectionNote.textContent = "Create an account on this browser, then sign in with its username or email.";
  } catch (error) {
    console.error("Could not load the local account:", error);
    connectionNote.textContent =
      "Local account storage is unavailable. Enable site storage in your browser and try again.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;

  const values = new FormData(form);
  const password = String(values.get("password") || "");
  const payload = mode === "register"
    ? {
      name: String(values.get("name") || "").trim(),
      username: String(values.get("username") || "").trim(),
      email: String(values.get("email") || "").trim(),
      password
    }
    : {
      identifier: String(values.get("identifier") || "").trim(),
      password
    };

  busy = true;
  submitButton.disabled = true;
  submitButton.textContent = mode === "register" ? "Creating account..." : "Signing in...";
  feedback.textContent = "";

  try {
    if (mode === "register") {
      await window.StyloraLocalAccounts.register(payload);
    } else {
      await window.StyloraLocalAccounts.login(payload.identifier, payload.password);
    }
    window.location.assign(getStoreReturnUrl());
  } catch (error) {
    console.error("Local account request failed:", error);
    feedback.textContent = error.message || "We could not complete that account request.";
  } finally {
    busy = false;
    submitButton.disabled = false;
    renderMode({ clearFeedback: false });
  }
});

modeToggle.addEventListener("click", () => {
  mode = mode === "register" ? "login" : "register";
  renderMode();
});

renderMode();
redirectIfSignedIn();
