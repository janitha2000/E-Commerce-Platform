const bcrypt = require("bcryptjs");
const { MongoStore } = require("connect-mongo");
const express = require("express");
const rateLimit = require("express-rate-limit");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const mongoose = require("mongoose");
const User = require("./models/User");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username || "",
    email: user.email
  };
}

function configureAuth(app) {
  const production = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;

  if (production && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error("Production requires a SESSION_SECRET of at least 32 characters.");
  }

  if (!production && !sessionSecret) {
    console.warn("Using a development-only session secret. Set SESSION_SECRET before deployment.");
  }

  const session = require("express-session");
  const mongoClient = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000
  });
  app.set("trust proxy", production ? 1 : false);
  app.use(session({
    name: "stylora.sid",
    secret: sessionSecret || "stylora-development-only-session-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      client: mongoClient,
      collectionName: "sessions",
      ttl: SESSION_MAX_AGE / 1000,
      autoRemove: "disabled"
    }),
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, await User.findById(id));
    } catch (error) {
      done(error);
    }
  });

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  if (googleEnabled) {
    const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`)
      .replace(/\/+$/, "");

    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${baseUrl}/api/auth/google/callback`,
      state: true
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = String(profile.emails?.[0]?.value || "").trim().toLowerCase();
        const emailVerified = profile._json?.email_verified === true;

        if (!email || !EMAIL_PATTERN.test(email) || !emailVerified) {
          return done(null, false, { message: "Google did not provide a verified email address." });
        }

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          const existing = await User.findOne({ email });
          if (existing) {
            return done(null, false, { message: "This email already has an account. Sign in with your password instead." });
          }

          user = await User.create({
            googleId: profile.id,
            email,
            name: String(profile.displayName || email.split("@")[0]).slice(0, 100)
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));
  }

  const router = express.Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many sign-in attempts. Please try again later." }
  });

  router.get("/config", (req, res) => {
    res.json({ googleEnabled });
  });

  router.get("/me", (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  router.post("/register", authLimiter, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const username = typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
      const email = typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!name || name.length > 100 ||
          !/^[a-z0-9._-]{3,30}$/.test(username) ||
          !email || email.length > 150 || !EMAIL_PATTERN.test(email) ||
          Buffer.byteLength(password, "utf8") > 72 || password.length < 12) {
        return res.status(400).json({
          message: "Enter your name, a username (3–30 letters, numbers, dots, underscores or hyphens), a valid email, and a password of at least 12 characters."
        });
      }

      if (await User.exists({ $or: [{ email }, { username }] })) {
        return res.status(409).json({ message: "That email or username is already in use." });
      }

      const user = await User.create({
        name,
        username,
        email,
        passwordHash: await bcrypt.hash(password, 12)
      });

      req.logIn(user, (error) => {
        if (error) return next(error);
        return res.status(201).json({ user: publicUser(user) });
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "That email or username is already in use." });
      }
      return next(error);
    }
  });

  router.post("/login", authLimiter, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const identifier = typeof body.identifier === "string"
        ? body.identifier.trim().toLowerCase()
        : typeof body.email === "string"
          ? body.email.trim().toLowerCase()
        : "";
      const password = typeof body.password === "string" ? body.password : "";

      const validIdentifier = EMAIL_PATTERN.test(identifier) ||
        /^[a-z0-9._-]{3,30}$/.test(identifier);
      if (!validIdentifier || !password ||
          Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ message: "Enter a valid username or email and password." });
      }

      const user = await User.findOne({
        $or: [{ email: identifier }, { username: identifier }]
      }).select("+passwordHash");
      const passwordMatches = user?.passwordHash
        ? await bcrypt.compare(password, user.passwordHash)
        : false;

      if (!passwordMatches) {
        return res.status(401).json({ message: "Username/email or password is incorrect." });
      }

      req.logIn(user, (error) => {
        if (error) return next(error);
        return res.json({ user: publicUser(user) });
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/google", (req, res, next) => {
    if (!googleEnabled) {
      return res.status(503).json({ message: "Google sign-in is not configured yet." });
    }
    return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  router.get("/google/callback", (req, res, next) => {
    if (!googleEnabled) {
      return res.redirect("/?auth=google-unavailable");
    }
    return passport.authenticate("google", {
      failureRedirect: "/?auth=google-error"
    })(req, res, next);
  }, (req, res) => {
    res.redirect("/?auth=success");
  });

  router.post("/logout", (req, res, next) => {
    req.logout((logoutError) => {
      if (logoutError) return next(logoutError);
      req.session.destroy((sessionError) => {
        if (sessionError) return next(sessionError);
        res.clearCookie("stylora.sid", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax"
        });
        return res.json({ message: "Signed out successfully." });
      });
    });
  });

  app.use("/api/auth", router);

  return {
    mongoClient,
    requireAuth(req, res, next) {
      if (req.isAuthenticated()) return next();
      return res.status(401).json({ message: "Please sign in to continue." });
    }
  };
}

module.exports = { configureAuth, publicUser };
