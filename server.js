const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const express = require("express");

const scrypt = promisify(crypto.scrypt);
const app = express();
const dataFile = process.env.INKWELL_DATA_FILE || path.join(__dirname, "data", "store.json");
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_HASH_BYTES = 64;

let store;
let writes = Promise.resolve();

function initialStore() {
  const now = Date.now();
  return {
    users: [],
    posts: [
      {
        id: "p1",
        authorId: "u_demo",
        authorName: "Alex Rivera",
        title: "Why slow writing makes better blogs",
        category: "Craft",
        excerpt: "Most advice about blogging is about speed. Here's an argument for the opposite — and what changes when you let a draft sit.",
        body: "Most advice about blogging is about speed: publish more, publish faster, never miss a week. But some of the posts people remember longest were the ones that sat unfinished for a month.\n\nWhen a draft sits, you stop defending your first idea and start noticing the better one underneath it. The extra week rarely costs you an audience. It usually costs you the version of the post you'd have been embarrassed by in a year.\n\nTry it on your next draft: write it, then don't publish for 72 hours. Read it once more before it goes out. You'll cut a third of it, and the third you cut is never the part anyone missed.",
        status: "published",
        createdAt: now - 6 * 24 * 60 * 60 * 1000,
      },
      {
        id: "p2",
        authorId: "u_demo",
        authorName: "Alex Rivera",
        title: "A field guide to writer's block that actually works",
        category: "Process",
        excerpt: "Not another motivational pep talk — a short, practical list of what to do in the first five minutes you're stuck.",
        body: "Writer's block isn't usually a lack of ideas. It's a lack of a small enough next step. Here's what helps in the first five minutes:\n\n1. Lower the bar to one true sentence, not a finished paragraph.\n2. Write the ending first if the beginning won't come.\n3. Read the last three sentences out loud — you'll usually hear the next one.\n\nNone of this is profound. It works because it's small enough to actually do.",
        status: "published",
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
      },
    ],
  };
}

async function initializeStore() {
  try {
    store = JSON.parse(await fs.readFile(dataFile, "utf8"));
    if (!Array.isArray(store.users) || !Array.isArray(store.posts)) {
      throw new Error("The Inkwell data file has an invalid format.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    store = initialStore();
    await persistStore();
  }
}

async function persistStore(data = store) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryFile, dataFile);
}

function updateStore(update) {
  const result = writes.then(async () => {
    const updatedStore = structuredClone(store);
    const value = update(updatedStore);
    await persistStore(updatedStore);
    store = updatedStore;
    return value;
  });
  writes = result.then(() => undefined, () => undefined);
  return result;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = await scrypt(password, salt, PASSWORD_HASH_BYTES);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex || !/^[a-f\d]+$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== PASSWORD_HASH_BYTES) return false;
  const actual = await scrypt(password, salt, PASSWORD_HASH_BYTES);
  return crypto.timingSafeEqual(actual, expected);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer ([a-f\d]{64})$/i);
  const session = match && sessions.get(match[1]);
  if (!session || session.expiresAt <= Date.now()) {
    if (match) sessions.delete(match[1]);
    return res.status(401).json({ error: "Please log in to continue." });
  }
  const user = store.users.find((item) => item.id === session.userId);
  if (!user) {
    sessions.delete(match[1]);
    return res.status(401).json({ error: "Please log in to continue." });
  }
  req.user = user;
  req.token = match[1];
  next();
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "Name must be between 2 and 80 characters." });
  }
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 6 and 128 characters." });
  }

  const passwordHash = await hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    createdAt: Date.now(),
  };
  const created = await updateStore((data) => {
    if (data.users.some((item) => item.email === email)) return false;
    data.users.push(user);
    return true;
  });
  if (!created) return res.status(409).json({ error: "An account with that email already exists." });

  res.status(201).json({ user: publicUser(user), token: createSession(user) });
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  const user = store.users.find((item) => item.email === email);
  const valid = user && typeof password === "string" && await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "That email and password don't match any account." });
  res.json({ user: publicUser(user), token: createSession(user) });
}));

app.post("/api/auth/logout", authenticate, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Logged out." });
});

app.get("/api/blogs", (req, res) => {
  const posts = store.posts
    .filter((post) => post.status === "published")
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(posts);
});

app.get("/api/blogs/mine", authenticate, (req, res) => {
  const posts = store.posts.filter((post) => post.authorId === req.user.id);
  res.json(posts);
});

app.post("/api/blogs", authenticate, asyncHandler(async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
  const category = typeof req.body.category === "string" ? req.body.category.trim() : "";
  const status = req.body.status;
  if (!title || title.length > 120) {
    return res.status(400).json({ error: "Title is required and must be 120 characters or fewer." });
  }
  if (body.length > 30000) return res.status(400).json({ error: "Post body must be 30,000 characters or fewer." });
  if (status !== "draft" && status !== "published") {
    return res.status(400).json({ error: "Post status must be draft or published." });
  }
  if (status === "published" && !body) {
    return res.status(400).json({ error: "Add some writing before publishing your post." });
  }

  const post = {
    id: crypto.randomUUID(),
    authorId: req.user.id,
    authorName: req.user.name,
    title,
    category: category.slice(0, 60) || "General",
    excerpt: body.slice(0, 140),
    body,
    status,
    createdAt: Date.now(),
  };
  await updateStore((data) => data.posts.push(post));
  res.status(201).json(post);
}));

app.delete("/api/blogs/:id", authenticate, asyncHandler(async (req, res) => {
  const removed = await updateStore((data) => {
    const index = data.posts.findIndex(
      (post) => post.id === req.params.id && post.authorId === req.user.id
    );
    if (index === -1) return false;
    data.posts.splice(index, 1);
    return true;
  });
  if (!removed) return res.status(404).json({ error: "Post not found." });
  res.json({ message: "Post deleted." });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use("/css", express.static(path.join(__dirname, "css"), { fallthrough: false }));
app.use("/js", express.static(path.join(__dirname, "js"), { fallthrough: false }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/:page", (req, res, next) => {
  const pages = new Set(["index.html", "login.html", "register.html", "dashboard.html", "create-blog.html"]);
  if (!pages.has(req.params.page)) return next();
  res.sendFile(path.join(__dirname, req.params.page));
});

app.use((req, res) => res.status(404).send("Page not found."));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  console.error(error);
  res.status(error.status || 500).json({ error: "Something went wrong. Please try again." });
});

if (require.main === module) {
  initializeStore()
    .then(() => {
      const port = Number(process.env.PORT) || 3000;
      app.listen(port, "127.0.0.1", () => {
        console.log(`Inkwell is running at http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error("Could not initialize the Inkwell data store:", error);
      process.exitCode = 1;
    });
}

module.exports = { app, initializeStore };
