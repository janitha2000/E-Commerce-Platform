"use strict";

(() => {
  const USERS_KEY = "stylora-local-users-v1";
  const SESSION_KEY = "stylora-local-session-v1";
  const HASH_ITERATIONS = 310000;
  const encoder = new TextEncoder();

  function readUsers() {
    const stored = localStorage.getItem(USERS_KEY);
    if (!stored) return [];

    const users = JSON.parse(stored);
    if (!Array.isArray(users)) {
      throw new Error("Saved accounts could not be read. Clear this site's local storage and try again.");
    }
    return users;
  }

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email
    };
  }

  function encodeBytes(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decodeBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  async function passwordHash(password, salt) {
    if (!window.crypto?.subtle || !window.crypto.getRandomValues) {
      throw new Error("This browser does not support local account security. Please use a current browser over localhost or HTTPS.");
    }

    const key = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await window.crypto.subtle.deriveBits({
      name: "PBKDF2",
      salt,
      iterations: HASH_ITERATIONS,
      hash: "SHA-256"
    }, key, 256);
    return new Uint8Array(bits);
  }

  function constantTimeEquals(left, right) {
    if (left.length !== right.length) return false;

    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference === 0;
  }

  async function register({ name, username, email, password }) {
    const cleanName = String(name || "").trim();
    const cleanUsername = normalizeUsername(username);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (cleanName.length < 2 || cleanName.length > 100) {
      throw new Error("Enter your name (2–100 characters).");
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) {
      throw new Error("Username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 150) {
      throw new Error("Enter a valid email address.");
    }
    if (cleanPassword.length < 12 || cleanPassword.length > 72) {
      throw new Error("Password must be between 12 and 72 characters.");
    }

    const users = readUsers();
    if (users.some((user) => user.username === cleanUsername)) {
      throw new Error("That username is already in use on this browser.");
    }
    if (users.some((user) => user.email === cleanEmail)) {
      throw new Error("An account with that email already exists on this browser.");
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(cleanPassword, salt);
    const user = {
      id: window.crypto.randomUUID(),
      name: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      salt: encodeBytes(salt),
      passwordHash: encodeBytes(hash),
      hashIterations: HASH_ITERATIONS
    };

    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    localStorage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  }

  async function login(identifier, password) {
    const cleanIdentifier = String(identifier || "").trim().toLowerCase();
    const users = readUsers();
    const user = users.find((item) =>
      item.username === cleanIdentifier || item.email === cleanIdentifier
    );

    if (!user || !user.salt || !user.passwordHash ||
        !Number.isInteger(user.hashIterations)) {
      throw new Error("We could not find that account on this browser.");
    }

    const actualHash = await passwordHash(String(password || ""), decodeBytes(user.salt));
    if (!constantTimeEquals(actualHash, decodeBytes(user.passwordHash))) {
      throw new Error("The password is incorrect.");
    }

    localStorage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  }

  function getCurrentUser() {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;

    const user = readUsers().find((item) => item.id === userId);
    return user ? publicUser(user) : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  window.StyloraLocalAccounts = Object.freeze({
    getCurrentUser,
    login,
    logout,
    register
  });
})();
