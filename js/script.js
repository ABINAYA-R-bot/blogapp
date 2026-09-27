/* ==========================================================================
   INKWELL — app logic
   Everything runs client-side against localStorage, so the whole app
   works with zero backend. Swap the storage calls for real fetch()
   requests to your API later — the shape (users, posts) is designed
   to map directly onto typical REST endpoints.
   ========================================================================== */

const DB_KEYS = {
  users: "inkwell_users",
  session: "inkwell_session",
  posts: "inkwell_posts",
};

/* ---------- seed data, only written once ---------- */

function seedIfEmpty() {
  if (!localStorage.getItem(DB_KEYS.users)) {
    const demoUser = {
      id: "u_demo",
      name: "Alex Rivera",
      email: "alex@inkwell.dev",
      password: "password123",
    };
    localStorage.setItem(DB_KEYS.users, JSON.stringify([demoUser]));
  }

  if (!localStorage.getItem(DB_KEYS.posts)) {
    const now = Date.now();
    const seedPosts = [
      {
        id: "p1",
        authorId: "u_demo",
        authorName: "Alex Rivera",
        title: "Why slow writing makes better blogs",
        category: "Craft",
        excerpt:
          "Most advice about blogging is about speed. Here's an argument for the opposite — and what changes when you let a draft sit.",
        body:
          "Most advice about blogging is about speed: publish more, publish faster, never miss a week. But some of the posts people remember longest were the ones that sat unfinished for a month.\n\nWhen a draft sits, you stop defending your first idea and start noticing the better one underneath it. The extra week rarely costs you an audience. It usually costs you the version of the post you'd have been embarrassed by in a year.\n\nTry it on your next draft: write it, then don't publish for 72 hours. Read it once more before it goes out. You'll cut a third of it, and the third you cut is never the part anyone missed.",
        status: "published",
        createdAt: now - 1000 * 60 * 60 * 24 * 6,
      },
      {
        id: "p2",
        authorId: "u_demo",
        authorName: "Alex Rivera",
        title: "A field guide to writer's block that actually works",
        category: "Process",
        excerpt:
          "Not another motivational pep talk — a short, practical list of what to do in the first five minutes you're stuck.",
        body:
          "Writer's block isn't usually a lack of ideas. It's a lack of a small enough next step. Here's what helps in the first five minutes:\n\n1. Lower the bar to one true sentence, not a finished paragraph.\n2. Write the ending first if the beginning won't come.\n3. Read the last three sentences out loud — you'll usually hear the next one.\n\nNone of this is profound. It works because it's small enough to actually do.",
        status: "published",
        createdAt: now - 1000 * 60 * 60 * 24 * 3,
      },
      {
        id: "p3",
        authorId: "u_demo",
        authorName: "Alex Rivera",
        title: "Notes on building this blog's front end",
        category: "Behind the scenes",
        excerpt:
          "A short log of the decisions behind Inkwell's interface, from the type pairing to why the grid isn't made of rounded cards.",
        body:
          "A short log of the decisions behind this interface: the grid deliberately avoids the identical-rounded-card look most blogging tools default to. Posts share hairline borders instead, like a printed page.\n\nMore notes coming as the project grows.",
        status: "draft",
        createdAt: now - 1000 * 60 * 60 * 5,
      },
    ];
    localStorage.setItem(DB_KEYS.posts, JSON.stringify(seedPosts));
  }
}

/* ---------- tiny data helpers ---------- */

function getUsers() {
  return JSON.parse(localStorage.getItem(DB_KEYS.users) || "[]");
}
function saveUsers(users) {
  localStorage.setItem(DB_KEYS.users, JSON.stringify(users));
}
function getPosts() {
  return JSON.parse(localStorage.getItem(DB_KEYS.posts) || "[]");
}
function savePosts(posts) {
  localStorage.setItem(DB_KEYS.posts, JSON.stringify(posts));
}
function getSession() {
  return JSON.parse(localStorage.getItem(DB_KEYS.session) || "null");
}
function setSession(user) {
  localStorage.setItem(
    DB_KEYS.session,
    JSON.stringify({ id: user.id, name: user.name, email: user.email })
  );
}
function clearSession() {
  localStorage.removeItem(DB_KEYS.session);
}

/* ---------- nav (mobile toggle + auth-aware links) ---------- */

function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const row = document.querySelector(".masthead-row");
  if (toggle && row) {
    toggle.addEventListener("click", () => {
      row.classList.toggle("open");
      const expanded = row.classList.contains("open");
      toggle.setAttribute("aria-expanded", String(expanded));
    });
  }

  // Swap "Login / Register" for "Dashboard / Log out" when a session exists
  const session = getSession();
  const authArea = document.querySelector("[data-nav-auth]");
  if (authArea) {
    if (session) {
      authArea.innerHTML = `
        <a href="dashboard.html" class="btn btn-outline">Dashboard</a>
        <button type="button" class="btn btn-primary" id="navLogout">Log out</button>
      `;
      const logoutBtn = document.getElementById("navLogout");
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "index.html";
      });
    } else {
      authArea.innerHTML = `
        <a href="login.html" class="btn btn-outline">Log in</a>
        <a href="register.html" class="btn btn-primary">Register</a>
      `;
    }
  }
}

/* ---------- route guard for protected pages ---------- */

function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

/* ---------- form helpers ---------- */

function showFieldError(fieldEl, message) {
  fieldEl.classList.add("invalid");
  const err = fieldEl.querySelector(".error");
  if (err) err.textContent = message;
}
function clearFieldError(fieldEl) {
  fieldEl.classList.remove("invalid");
}
function showAlert(el, message, type) {
  el.textContent = message;
  el.className = `form-alert show ${type}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* ---------- LOGIN page ---------- */

function initLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const emailField = form.querySelector("[data-field='email']");
    const passField = form.querySelector("[data-field='password']");
    const alertEl = document.getElementById("loginAlert");
    [emailField, passField].forEach(clearFieldError);

    const email = form.email.value.trim();
    const password = form.password.value;

    let valid = true;
    if (!isValidEmail(email)) {
      showFieldError(emailField, "Enter a valid email address.");
      valid = false;
    }
    if (password.length < 6) {
      showFieldError(passField, "Password must be at least 6 characters.");
      valid = false;
    }
    if (!valid) return;

    const user = getUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (!user) {
      showAlert(alertEl, "That email and password don't match any account.", "error");
      return;
    }

    setSession(user);
    showAlert(alertEl, "Welcome back — redirecting to your dashboard…", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 600);
  });
}

/* ---------- REGISTER page ---------- */

function initRegisterForm() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameField = form.querySelector("[data-field='name']");
    const emailField = form.querySelector("[data-field='email']");
    const passField = form.querySelector("[data-field='password']");
    const confirmField = form.querySelector("[data-field='confirm']");
    const alertEl = document.getElementById("registerAlert");
    [nameField, emailField, passField, confirmField].forEach(clearFieldError);

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;

    let valid = true;
    if (name.length < 2) {
      showFieldError(nameField, "Enter your full name.");
      valid = false;
    }
    if (!isValidEmail(email)) {
      showFieldError(emailField, "Enter a valid email address.");
      valid = false;
    }
    if (password.length < 6) {
      showFieldError(passField, "Password must be at least 6 characters.");
      valid = false;
    }
    if (confirm !== password) {
      showFieldError(confirmField, "Passwords don't match.");
      valid = false;
    }
    if (!valid) return;

    const users = getUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      showAlert(alertEl, "An account with that email already exists.", "error");
      return;
    }

    const newUser = { id: "u_" + Date.now(), name, email, password };
    users.push(newUser);
    saveUsers(users);
    setSession(newUser);

    showAlert(alertEl, "Account created — taking you to your dashboard…", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 600);
  });
}

/* ---------- DASHBOARD page ---------- */

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const day = 1000 * 60 * 60 * 24;
  const days = Math.floor(diff / day);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}

function initDashboard() {
  const root = document.getElementById("dashboardRoot");
  if (!root) return;
  const session = requireAuth();
  if (!session) return;

  document.getElementById("dashUserName").textContent = session.name;
  document.getElementById("dashUserEmail").textContent = session.email;
  document.getElementById("dashAvatar").textContent = session.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  document.getElementById("dashGreetName").textContent = session.name.split(" ")[0];

  renderDashboard(session.id);

  root.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-delete-id]");
    if (delBtn) {
      const id = delBtn.getAttribute("data-delete-id");
      if (confirm("Delete this post? This can't be undone.")) {
        const remaining = getPosts().filter((p) => p.id !== id);
        savePosts(remaining);
        renderDashboard(session.id);
      }
    }
  });
}

function renderDashboard(userId) {
  const posts = getPosts()
    .filter((p) => p.authorId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const published = posts.filter((p) => p.status === "published").length;
  const drafts = posts.filter((p) => p.status === "draft").length;

  document.getElementById("statTotal").textContent = posts.length;
  document.getElementById("statPublished").textContent = published;
  document.getElementById("statDrafts").textContent = drafts;

  const tbody = document.getElementById("postsTableBody");
  const emptyState = document.getElementById("postsEmptyState");
  const tableWrap = document.getElementById("postsTableWrap");

  if (posts.length === 0) {
    tableWrap.style.display = "none";
    emptyState.style.display = "block";
    return;
  }
  tableWrap.style.display = "block";
  emptyState.style.display = "none";

  tbody.innerHTML = posts
    .map(
      (p) => `
      <tr>
        <td class="title-cell">
          <strong>${escapeHtml(p.title)}</strong>
          <span>${escapeHtml(p.excerpt || "").slice(0, 70)}${
        (p.excerpt || "").length > 70 ? "…" : ""
      }</span>
        </td>
        <td>${escapeHtml(p.category)}</td>
        <td><span class="status-pill ${p.status}">${
        p.status === "published" ? "Published" : "Draft"
      }</span></td>
        <td>${timeAgo(p.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" data-delete-id="${p.id}">Delete</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- CREATE BLOG page ---------- */

function initEditor() {
  const form = document.getElementById("editorForm");
  if (!form) return;
  const session = requireAuth();
  if (!session) return;

  const bodyInput = document.getElementById("editorBody");
  const wordCount = document.getElementById("wordCount");

  function updateCount() {
    const words = bodyInput.value.trim().split(/\s+/).filter(Boolean).length;
    wordCount.textContent = `${words} word${words === 1 ? "" : "s"}`;
  }
  bodyInput.addEventListener("input", updateCount);
  updateCount();

  function collectPost(status) {
    return {
      id: "p_" + Date.now(),
      authorId: session.id,
      authorName: session.name,
      title: form.title.value.trim() || "Untitled post",
      category: form.category.value || "General",
      excerpt: bodyInput.value.trim().slice(0, 140),
      body: bodyInput.value.trim(),
      status,
      createdAt: Date.now(),
    };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.title.value.trim()) {
      const titleInput = document.getElementById("editorTitle");
      titleInput.focus();
      titleInput.classList.add("invalid");
      return;
    }
    const posts = getPosts();
    posts.push(collectPost("published"));
    savePosts(posts);
    window.location.href = "dashboard.html";
  });

  document.getElementById("saveDraftBtn").addEventListener("click", () => {
    if (!form.title.value.trim()) {
      const titleInput = document.getElementById("editorTitle");
      titleInput.focus();
      return;
    }
    const posts = getPosts();
    posts.push(collectPost("draft"));
    savePosts(posts);
    window.location.href = "dashboard.html";
  });
}

/* ---------- HOME page post grid ---------- */

function initHomeGrid() {
  const grid = document.getElementById("homePostGrid");
  if (!grid) return;
  const posts = getPosts()
    .filter((p) => p.status === "published")
    .sort((a, b) => b.createdAt - a.createdAt);

  document.getElementById("homePostCount").textContent = `${posts.length} published`;

  grid.innerHTML = posts
    .map(
      (p, i) => `
      <article class="post-card ${i === 0 ? "featured" : ""}">
        <div class="cat">${escapeHtml(p.category)}</div>
        <h3><a href="#" tabindex="-1">${escapeHtml(p.title)}</a></h3>
        <p>${escapeHtml(p.excerpt)}</p>
        <div class="byline">
          <span>${escapeHtml(p.authorName)}</span>
          <span>${timeAgo(p.createdAt)}</span>
        </div>
      </article>`
    )
    .join("");
}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", () => {
  seedIfEmpty();
  initNav();
  initLoginForm();
  initRegisterForm();
  initDashboard();
  initEditor();
  initHomeGrid();
});
