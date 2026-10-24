/* =====================================================================
   LifeOS - script.js  (ONE file for ALL pages)

   Sections
   1. Config + helpers
   2. Auth      (register / login / logout)      -> later: /api/auth/*
   3. DB layer  (async CRUD)                     -> later: /api/<collection>
   4. Shell     (sidebar, topbar, page guard)
   5. Generic CRUD page engine
   6. Module configs (tasks, calendar, notes, expenses, goals,
                      habits, documents, projects, hints)
   7. Dashboard, Search, Profile pages
   8. Boot

   Every page sets its name with <body data-page="...">.
   All data is saved by the Spring Boot API in MySQL (nothing is kept in the browser
   except the login token).
   ===================================================================== */
"use strict";

/* ---------- 1. Config + helpers ---------- */
const CONFIG = {
    // Same origin "/api" when Spring Boot serves these pages (http://localhost:8080).
    // If you open the pages with VS Code Live Server (port 5500/5501) they talk to Spring Boot on 8080.
    API_BASE: ["5500", "5501"].includes(location.port) ? "http://localhost:8080/api" : "/api"
};

// collections that can be linked to a project through "projectId"
const LINKED = ["tasks", "events", "notes", "expenses", "goals", "documents"];
const ALL_COLLECTIONS = [...LINKED, "habits", "projects", "hints"];
const PAGE_OF = {
    tasks: "tasks.html", events: "calendar.html", notes: "notes.html",
    expenses: "expenses.html", goals: "goals.html", habits: "habits.html",
    documents: "documents.html", projects: "projects.html", hints: "passwords.html"
};
const LABEL_OF = {
    tasks: "Tasks", events: "Events", notes: "Notes", expenses: "Expenses",
    goals: "Goals", habits: "Habits", documents: "Documents",
    projects: "Projects", hints: "Password hints"
};
const PUBLIC_PAGES = ["", "index.html", "login.html", "register.html"];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const fmtDate = s => s ? new Date(s + "T00:00:00")
    .toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const isUrl = s => /^https?:\/\//i.test(s || "");

function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

/** wraps an async handler so server/validation errors show as a message instead of failing silently */
const safe = fn => async (...args) => { try { return await fn(...args); } catch (e) { toast(e.message || "Something went wrong."); } };

function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- 2. API helper + Auth ---------- */
const offlineMessage = () => location.protocol === "file:"
    ? "You opened this page as a file. Start the Spring Boot app, then open http://localhost:8080 in your browser."
    : "Cannot reach the server. Start the Spring Boot app (run-local.bat) and open http://localhost:8080.";

async function api(method, path, body) {
    const s = Auth.session();
    let res;
    try {
        res = await fetch(CONFIG.API_BASE + path, {
            method,
            headers: { "Content-Type": "application/json", ...(s ? { Authorization: "Bearer " + s.token } : {}) },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch {
        throw new Error(offlineMessage());
    }
    if (res.status === 401 && s) {                      // token expired or account removed
        localStorage.removeItem("lifeos_session");
        location.href = "login.html";
        throw new Error("Please log in again.");
    }
    if (!res.ok) {
        let msg = "Request failed (" + res.status + ")";
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* keep default */ }
        throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
}

/* The server hashes passwords (BCrypt) and returns a JWT token. The token is the only thing kept in the browser. */
const Auth = {
    session() {
        const s = read("lifeos_session", null);
        return s && s.token ? s : null;
    },
    _start(u) {
        write("lifeos_session", { id: u.id, name: u.name, email: u.email, token: u.token });
    },
    async _remote(path, payload) {
        try {
            const r = await api("POST", path, payload);
            this._start({ ...r.user, token: r.token });
            return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
    },
    register(name, email, password) { return this._remote("/auth/register", { name, email, password }); },
    login(email, password) { return this._remote("/auth/login", { email, password }); },
    logout() { localStorage.removeItem("lifeos_session"); location.href = "login.html"; },

    async updateProfile(name, email) {
        try {
            const u = await api("PUT", "/auth/profile", { name, email });
            this._start({ ...u, token: this.session().token });
            return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
    },
    async changePassword(current, next) {
        try { await api("PUT", "/auth/password", { current, next }); return { ok: true }; }
        catch (e) { return { ok: false, error: e.message }; }
    },
    clearData() { return api("DELETE", "/data"); },
    async deleteAccount() {
        await api("DELETE", "/auth/account");
        localStorage.removeItem("lifeos_session");
    }
};

/* ---------- 3. DB layer: every call is a REST request to Spring Boot -> MySQL ---------- */
const DB = {
    getAll: c => api("GET", "/" + c),                       // GET    /api/{c}
    create: (c, data) => api("POST", "/" + c, data),        // POST   /api/{c}
    update: (c, id, patch) => api("PUT", `/${c}/${id}`, patch),   // PUT    /api/{c}/{id}
    remove: (c, id) => api("DELETE", `/${c}/${id}`)         // DELETE /api/{c}/{id}
};

/* ---------- 4. Shell: guard, sidebar, topbar ---------- */
const NAV = [
    ["WORKSPACE", [
        ["dashboard.html", "▦", "Dashboard"],
        ["tasks.html", "✓", "Tasks"],
        ["calendar.html", "▤", "Calendar"],
        ["notes.html", "✎", "Notes"],
        ["expenses.html", "₹", "Expenses"],
        ["goals.html", "◎", "Goals"],
        ["habits.html", "↻", "Habits"],
        ["documents.html", "▢", "Documents"],
        ["projects.html", "▣", "Projects"]
    ]],
    ["TOOLS", [
        ["passwords.html", "🔑", "Password Hints"],
        ["search.html", "🔍", "Search"]
    ]],
    ["CREATORS", [
        ["creators.html", "👥", "Creators & Design"]
    ]],
    ["ACCOUNT", [
        ["profile.html", "👤", "Profile & Settings"]
    ]]
];


function currentFile() { return location.pathname.split("/").pop() || "index.html"; }

function initShell() {
    const file = currentFile();
    const nav = $("#sidebarNav");
    if (nav) {
        nav.innerHTML = NAV.map(([heading, links]) =>
            `<p class="menu-heading">${heading}</p>` +
            links.map(([href, icon, text]) =>
                `<a href="${href}" class="nav-link ${href === file ? "active" : ""}">${icon} ${text}</a>`).join("")
        ).join("");
    }
    const s = Auth.session();
    if (s) {
        if ($("#profileName")) $("#profileName").textContent = s.name;
        if ($("#profileAvatar")) $("#profileAvatar").textContent = s.name.charAt(0).toUpperCase();
    } else {
        if ($("#profileName")) $("#profileName").textContent = "LifeOS Explorer";
        if ($("#profileAvatar")) $("#profileAvatar").textContent = "★";
        if ($("#logoutLink")) {
            $("#logoutLink").textContent = "🔑";
            $("#logoutLink").title = "Log in";
            $("#logoutLink").href = "login.html";
        }
    }
    if ($("#todayDate")) $("#todayDate").textContent =
        new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const logout = $("#logoutLink");
    if (logout && !logout.dataset.bound) {
        logout.dataset.bound = "1";
        logout.addEventListener("click", e => { e.preventDefault(); Auth.logout(); });
    }

    const sidebar = $("#sidebar"), toggle = $("#menuToggle");
    if (sidebar && toggle && !toggle.dataset.bound) {
        toggle.dataset.bound = "1";
        toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
        document.addEventListener("click", e => {
            if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !toggle.contains(e.target))
                sidebar.classList.remove("open");
        });
    }
}

/* ---------- Shared render helpers ---------- */
const actionButtons = (id, extra = "") =>
    `<div class="item-actions">${extra}
        <button type="button" class="icon-btn" data-action="edit" data-id="${id}">Edit</button>
        <button type="button" class="icon-btn danger" data-action="delete" data-id="${id}">Delete</button>
     </div>`;

function projectChip(id, ctx) {
    const p = ctx.projects.find(x => x.id === id);
    return p ? `<a class="chip chip-project" href="projects.html">▣ ${esc(p.name)}</a>` : "";
}
const chip = (text, cls = "") => `<span class="chip ${cls}">${esc(text)}</span>`;

function fillProjectSelects(projects) {
    $$("[data-project-select]").forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">No project</option>' +
            projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
        sel.value = cur;
    });
}

/* ---------- 5. Generic CRUD page engine ---------- */
async function initModule(cfg) {
    const form = $("#itemForm"), list = $("#itemList"), statsEl = $("#stats");
    const filterInput = $("#filterInput"), filterSelect = $("#filterSelect");
    const params = new URLSearchParams(location.search);
    const projectFilter = cfg.linked ? params.get("project") : null;
    if (filterInput && params.get("q")) filterInput.value = params.get("q");

    const ctx = { projects: [], items: [], extra: null, editId: null };
    ctx.projects = await DB.getAll("projects");
    fillProjectSelects(ctx.projects);

    if (projectFilter) {
        const p = ctx.projects.find(x => x.id === projectFilter);
        const note = document.createElement("div");
        note.className = "notice notice-info";
        note.innerHTML = `Showing items linked to <strong>${esc(p ? p.name : "a project")}</strong>. <a href="${currentFile()}">Show all</a>`;
        list.parentNode.insertBefore(note, list);
    }

    function visible() {
        let view = ctx.items.slice();
        if (projectFilter) view = view.filter(i => i.projectId === projectFilter);
        if (cfg.view) view = cfg.view(view, ctx);
        const term = ((filterInput && filterInput.value) || "").trim().toLowerCase();
        if (term) view = view.filter(i => Object.entries(i)
            .filter(([k]) => !["id", "projectId", "createdAt", "log"].includes(k))
            .map(([, v]) => v).join(" ").toLowerCase().includes(term));
        if (filterSelect && filterSelect.value && cfg.filter) view = view.filter(i => cfg.filter(i, filterSelect.value));
        if (cfg.sort) view.sort(cfg.sort);
        return view;
    }

    function draw() {
        if (statsEl && cfg.stats) {
            statsEl.innerHTML = cfg.stats(ctx.items, ctx)
                .map(([label, value]) => `<div class="mini-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
        }
        const view = visible();
        list.innerHTML = view.length ? view.map(i => cfg.render(i, ctx)).join("")
            : `<div class="empty-state">${cfg.empty}</div>`;
        const badge = $("#countBadge");
        if (badge) badge.textContent = `${view.length} ${cfg.noun}${view.length === 1 ? "" : "s"}`;
        if (cfg.onDraw) cfg.onDraw(ctx.items, ctx);
    }
    ctx.redraw = draw;

    async function load() {
        ctx.items = await DB.getAll(cfg.collection);
        if (cfg.loadExtra) ctx.extra = await cfg.loadExtra();
        draw();
    }
    ctx.reload = load;

    function readForm() {
        const data = {};
        [...form.elements].forEach(el => {
            if (!el.name) return;
            data[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
        });
        return data;
    }
    function resetForm() {
        ctx.editId = null;
        form.reset();
        $("#formTitle").textContent = cfg.addTitle;
        $("#submitBtn").textContent = cfg.addLabel;
        $("#cancelEdit").classList.add("hidden");
        if (cfg.afterReset) cfg.afterReset(form, ctx);
    }
    function startEdit(item) {
        ctx.editId = item.id;
        [...form.elements].forEach(el => { if (el.name && el.type !== "checkbox") el.value = item[el.name] ?? ""; });
        $("#formTitle").textContent = "Edit " + cfg.noun;
        $("#submitBtn").textContent = "Save changes";
        $("#cancelEdit").classList.remove("hidden");
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        const first = form.querySelector("input:not([type=hidden]),textarea");
        if (first) first.focus();
    }
    const Noun = cfg.noun[0].toUpperCase() + cfg.noun.slice(1);

    form.addEventListener("submit", safe(async e => {
        e.preventDefault();
        const data = readForm();
        if (cfg.prepare) cfg.prepare(data);
        if (ctx.editId) {
            await DB.update(cfg.collection, ctx.editId, data);
            toast(`${Noun} updated`);
        } else {
            await DB.create(cfg.collection, { ...(cfg.defaults || {}), ...data });
            toast(`${Noun} added`);
        }
        resetForm();
        await load();
    }));
    $("#cancelEdit").addEventListener("click", resetForm);
    if (filterInput) filterInput.addEventListener("input", draw);
    if (filterSelect) filterSelect.addEventListener("change", draw);

    // inputs (checkbox / range) react on "change"; buttons react on "click"
    const handle = safe(async (e, isChange) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;
        if (el.matches("input") !== isChange) return;
        const item = ctx.items.find(i => i.id === el.dataset.id);
        const action = el.dataset.action;
        if (action === "edit" && item) return startEdit(item);
        if (action === "delete" && item) {
            if (!confirm(`Delete this ${cfg.noun}?`)) return;
            await DB.remove(cfg.collection, item.id);
            if (cfg.afterDelete) await cfg.afterDelete(item);
            if (ctx.editId === item.id) resetForm();
            toast(`${Noun} deleted`);
            return load();
        }
        const custom = cfg.actions && cfg.actions[action];
        if (custom && item) {
            await custom(item, el, {
                ctx,
                update: async patch => { await DB.update(cfg.collection, item.id, patch); await load(); }
            });
        }
    });
    list.addEventListener("click", e => handle(e, false));
    list.addEventListener("change", e => handle(e, true));

    if (cfg.setup) cfg.setup(ctx, form);
    resetForm();
    await safe(load)();
}

/* ---------- 6. Module configs ---------- */
const priorityClass = p => ({ high: "chip-red", medium: "chip-amber", low: "chip-green" }[p] || "");
const byNewest = (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");

const MODULES = {

    tasks: {
        collection: "tasks", noun: "task", linked: true, addTitle: "Add a task", addLabel: "Add task",
        empty: "No tasks yet. Add your first task using the form.",
        defaults: { done: false },
        sort: (a, b) => (a.done - b.done) || String(a.due || "9999").localeCompare(String(b.due || "9999")),
        filter: (t, v) => v === "pending" ? !t.done : v === "done" ? t.done : t.priority === v,
        stats: items => [
            ["Total", items.length], ["Completed", items.filter(t => t.done).length],
            ["Pending", items.filter(t => !t.done).length],
            ["Overdue", items.filter(t => !t.done && t.due && t.due < today()).length]],
        render: (t, ctx) => {
            const overdue = !t.done && t.due && t.due < today();
            return `<div class="item ${t.done ? "completed" : ""}">
                <input type="checkbox" class="task-check" data-action="toggle" data-id="${t.id}" ${t.done ? "checked" : ""} aria-label="Mark complete">
                <div class="item-body"><strong>${esc(t.title)}</strong>
                  <small>${chip(t.priority, priorityClass(t.priority))}
                  ${t.due ? chip("Due " + fmtDate(t.due), overdue ? "chip-red" : "") : ""}${projectChip(t.projectId, ctx)}</small></div>
                ${actionButtons(t.id)}</div>`;
        },
        actions: { toggle: (t, el, h) => h.update({ done: el.checked }) }
    },

    calendar: (() => {
        const cal = { month: new Date(), sel: null };
        cal.month.setDate(1);
        return {
            collection: "events", noun: "event", linked: true, addTitle: "Add an event", addLabel: "Add event",
            empty: "No events here. Pick a day on the calendar and add one.",
            sort: (a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
            view: items => cal.sel ? items.filter(e => e.date === cal.sel) : items,
            stats: items => [
                ["Total events", items.length], ["Upcoming", items.filter(e => e.date >= today()).length],
                ["Today", items.filter(e => e.date === today()).length],
                ["This month", items.filter(e => e.date.slice(0, 7) === today().slice(0, 7)).length]],
            afterReset: form => { form.elements.date.value = cal.sel || today(); },
            render: (e, ctx) => {
                const d = new Date(e.date + "T00:00:00");
                return `<div class="item">
                  <div class="date-box"><b>${d.getDate()}</b><span>${d.toLocaleDateString("en-IN", { month: "short" })}</span></div>
                  <div class="item-body"><strong>${esc(e.title)}</strong>
                    <small>${e.time ? chip(e.time) : ""}${e.date < today() ? chip("Past", "chip-grey") : ""}${projectChip(e.projectId, ctx)}</small>
                    ${e.note ? `<p class="item-note">${esc(e.note)}</p>` : ""}</div>
                  ${actionButtons(e.id)}</div>`;
            },
            onDraw: items => {
                $("#monthLabel").textContent = cal.month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                const y = cal.month.getFullYear(), m = cal.month.getMonth();
                const offset = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
                let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("");
                for (let i = 0; i < offset; i++) html += `<div class="cal-cell empty"></div>`;
                for (let d = 1; d <= days; d++) {
                    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
                    const evs = items.filter(e => e.date === key);
                    html += `<button type="button" class="cal-cell ${key === today() ? "today" : ""} ${key === cal.sel ? "selected" : ""}" data-date="${key}">
                        <span class="cal-num">${d}</span>
                        ${evs.slice(0, 2).map(e => `<span class="cal-ev">${esc(e.title)}</span>`).join("")}
                        ${evs.length > 2 ? `<span class="cal-more">+${evs.length - 2} more</span>` : ""}</button>`;
                }
                $("#calendarGrid").innerHTML = html;
                $("#listTitle").textContent = cal.sel ? "Events on " + fmtDate(cal.sel) : "All events";
                $("#showAll").classList.toggle("hidden", !cal.sel);
            },
            setup: (ctx, form) => {
                const shift = n => { cal.month.setMonth(cal.month.getMonth() + n); ctx.redraw(); };
                $("#prevMonth").addEventListener("click", () => shift(-1));
                $("#nextMonth").addEventListener("click", () => shift(1));
                $("#todayBtn").addEventListener("click", () => {
                    cal.month = new Date(); cal.month.setDate(1); cal.sel = today();
                    if (!ctx.editId) form.elements.date.value = cal.sel;
                    ctx.redraw();
                });
                $("#showAll").addEventListener("click", () => { cal.sel = null; ctx.redraw(); });
                $("#calendarGrid").addEventListener("click", e => {
                    const cell = e.target.closest("[data-date]");
                    if (!cell) return;
                    cal.sel = cell.dataset.date;
                    if (!ctx.editId) form.elements.date.value = cal.sel;
                    ctx.redraw();
                });
            }
        };
    })(),

    notes: {
        collection: "notes", noun: "note", linked: true, addTitle: "Add a note", addLabel: "Save note",
        empty: "No notes yet. Write down your first idea.",
        sort: byNewest, listClass: "cards",
        stats: items => [
            ["Total notes", items.length],
            ["Tags used", new Set(items.map(n => n.tag).filter(Boolean)).size],
            ["Linked to projects", items.filter(n => n.projectId).length]],
        render: (n, ctx) => `<div class="item note-card">
            <div class="item-body"><strong>${esc(n.title)}</strong>
              <p class="note-text">${esc(n.content)}</p>
              <small>${n.tag ? chip("#" + n.tag) : ""}${projectChip(n.projectId, ctx)}</small></div>
            ${actionButtons(n.id)}</div>`
    },

    expenses: {
        collection: "expenses", noun: "expense", linked: true, addTitle: "Add an expense", addLabel: "Add expense",
        empty: "No expenses recorded. Add your first one.",
        sort: (a, b) => b.date.localeCompare(a.date),
        filter: (x, v) => x.category === v,
        prepare: d => { d.amount = Math.max(0, Number(d.amount) || 0); },
        stats: items => {
            const month = items.filter(x => x.date.slice(0, 7) === today().slice(0, 7));
            const byCat = {};
            items.forEach(x => byCat[x.category] = (byCat[x.category] || 0) + x.amount);
            const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
            return [["Total spent", money(items.reduce((s, x) => s + x.amount, 0))],
                    ["This month", money(month.reduce((s, x) => s + x.amount, 0))],
                    ["Entries", items.length], ["Top category", top ? top[0] : "-"]];
        },
        render: (x, ctx) => `<div class="item">
            <div class="amount-box">${money(x.amount)}</div>
            <div class="item-body"><strong>${esc(x.title)}</strong>
              <small>${chip(x.category)}${chip(fmtDate(x.date), "chip-grey")}${projectChip(x.projectId, ctx)}</small></div>
            ${actionButtons(x.id)}</div>`,
        afterReset: form => { form.elements.date.value = today(); },
        onDraw: items => {
            const byCat = {};
            items.forEach(x => byCat[x.category] = (byCat[x.category] || 0) + x.amount);
            const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
            const max = rows.length ? rows[0][1] || 1 : 1;
            $("#breakdown").innerHTML = rows.length ? rows.map(([c, v]) =>
                `<div class="bar-row"><span>${esc(c)}</span>
                 <div class="bar-track"><div class="bar-fill" style="width:${Math.round(v / max * 100)}%"></div></div>
                 <b>${money(v)}</b></div>`).join("") : `<div class="empty-state">Spending by category will show here.</div>`;
        }
    },

    goals: {
        collection: "goals", noun: "goal", linked: true, addTitle: "Add a goal", addLabel: "Add goal",
        empty: "No goals yet. Set something you want to achieve.",
        defaults: { progress: 0 },
        sort: (a, b) => ((a.progress >= 100) - (b.progress >= 100)) || String(a.target || "9999").localeCompare(String(b.target || "9999")),
        filter: (g, v) => v === "done" ? g.progress >= 100 : g.progress < 100,
        prepare: d => { d.progress = Math.min(100, Math.max(0, Number(d.progress) || 0)); },
        stats: items => [
            ["Total goals", items.length], ["Achieved", items.filter(g => g.progress >= 100).length],
            ["In progress", items.filter(g => g.progress < 100).length],
            ["Average progress", (items.length ? Math.round(items.reduce((s, g) => s + g.progress, 0) / items.length) : 0) + "%"]],
        render: (g, ctx) => `<div class="item goal-item">
            <div class="item-body"><strong>${esc(g.title)}</strong>
              <small>${g.progress >= 100 ? chip("Achieved", "chip-green") : chip(g.progress + "% done")}
              ${g.target ? chip("Target " + fmtDate(g.target), g.target < today() && g.progress < 100 ? "chip-red" : "") : ""}${projectChip(g.projectId, ctx)}</small>
              ${g.description ? `<p class="item-note">${esc(g.description)}</p>` : ""}
              <div class="large-progress-track"><div class="large-progress-fill" style="width:${g.progress}%"></div></div>
              <input type="range" class="goal-range" min="0" max="100" step="5" value="${g.progress}" data-action="progress" data-id="${g.id}" aria-label="Goal progress">
            </div>
            ${actionButtons(g.id)}</div>`,
        actions: { progress: (g, el, h) => h.update({ progress: Number(el.value) }) }
    },

    habits: (() => {
        const streak = log => {
            const set = new Set(log || []);
            const d = new Date();
            if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
            let n = 0;
            while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
            return n;
        };
        const last7 = () => [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
        return {
            collection: "habits", noun: "habit", addTitle: "Add a habit", addLabel: "Add habit",
            empty: "No habits yet. Start with one small daily habit.",
            defaults: { log: [] },
            sort: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
            stats: items => [
                ["Habits", items.length],
                ["Done today", items.filter(h => (h.log || []).includes(today())).length],
                ["Best streak", (items.length ? Math.max(...items.map(h => streak(h.log))) : 0) + " days"]],
            render: h => `<div class="item habit-item">
                <div class="item-body"><strong>${esc(h.name)}</strong>
                  <small>${chip("🔥 " + streak(h.log) + " day streak", streak(h.log) ? "chip-amber" : "chip-grey")}${h.goal ? chip(h.goal) : ""}</small>
                  <div class="week-dots">${last7().map(d => {
                      const key = ymd(d), on = (h.log || []).includes(key);
                      return `<button type="button" class="dot ${on ? "on" : ""}" data-action="day" data-id="${h.id}" data-date="${key}"
                          title="${fmtDate(key)}" aria-pressed="${on}">${d.toLocaleDateString("en-IN", { weekday: "narrow" })}</button>`;
                  }).join("")}</div></div>
                ${actionButtons(h.id)}</div>`,
            actions: {
                day: (h, el, helpers) => {
                    const log = new Set(h.log || []);
                    log.has(el.dataset.date) ? log.delete(el.dataset.date) : log.add(el.dataset.date);
                    return helpers.update({ log: [...log].sort() });
                }
            }
        };
    })(),

    documents: {
        collection: "documents", noun: "document", linked: true, addTitle: "Add a document", addLabel: "Add document",
        empty: "No documents yet. Save a link or details of an important document.",
        sort: byNewest,
        filter: (d, v) => d.category === v,
        stats: items => [
            ["Documents", items.length], ["With a link", items.filter(d => isUrl(d.link)).length],
            ["Categories", new Set(items.map(d => d.category)).size],
            ["Linked to projects", items.filter(d => d.projectId).length]],
        render: (d, ctx) => `<div class="item">
            <div class="doc-icon">▢</div>
            <div class="item-body"><strong>${esc(d.title)}</strong>
              <small>${chip(d.category)}${projectChip(d.projectId, ctx)}</small>
              ${d.note ? `<p class="item-note">${esc(d.note)}</p>` : ""}</div>
            ${actionButtons(d.id, isUrl(d.link) ? `<a class="icon-btn" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">Open</a>` : "")}</div>`
    },

    projects: {
        collection: "projects", noun: "project", addTitle: "Add a project", addLabel: "Add project",
        empty: "No projects yet. Create one, then link tasks, notes and more to it.",
        sort: byNewest,
        filter: (p, v) => p.status === v,
        loadExtra: async () => { const all = {}; for (const c of LINKED) all[c] = await DB.getAll(c); return all; },
        stats: (items, ctx) => {
            const x = ctx.extra || {};
            const linked = LINKED.reduce((n, c) => n + (x[c] || []).filter(i => i.projectId).length, 0);
            return [["Projects", items.length], ["Active", items.filter(p => p.status === "active").length],
                    ["Completed", items.filter(p => p.status === "completed").length], ["Linked items", linked]];
        },
        render: (p, ctx) => {
            const x = ctx.extra || {};
            const groups = LINKED.map(c => ({ c, rows: (x[c] || []).filter(i => i.projectId === p.id) })).filter(g => g.rows.length);
            const tasks = (x.tasks || []).filter(t => t.projectId === p.id);
            const pct = tasks.length ? Math.round(tasks.filter(t => t.done).length / tasks.length * 100) : 0;
            return `<div class="item project-item">
              <div class="item-body"><strong>${esc(p.name)}</strong>
                <small>${chip(p.status, p.status === "completed" ? "chip-green" : p.status === "on-hold" ? "chip-amber" : "")}
                ${p.deadline ? chip("Deadline " + fmtDate(p.deadline), "chip-grey") : ""}
                ${chip(groups.reduce((n, g) => n + g.rows.length, 0) + " linked items", "chip-grey")}</small>
                ${p.description ? `<p class="item-note">${esc(p.description)}</p>` : ""}
                <div class="large-progress-track"><div class="large-progress-fill" style="width:${pct}%"></div></div>
                <small class="muted">${tasks.length ? `${pct}% of ${tasks.length} task${tasks.length > 1 ? "s" : ""} complete` : "No tasks linked yet"}</small>
                <div class="linked-box hidden">${groups.length ? groups.map(g =>
                    `<div class="linked-group"><a href="${PAGE_OF[g.c]}?project=${p.id}">${LABEL_OF[g.c]} (${g.rows.length})</a>
                     <ul>${g.rows.slice(0, 5).map(r => `<li>${esc(r.title || r.name)}</li>`).join("")}</ul></div>`).join("")
                    : `<p class="muted">Nothing linked yet. Choose this project when adding tasks, notes, events, expenses, goals or documents.</p>`}</div>
              </div>
              ${actionButtons(p.id, `<button type="button" class="icon-btn" data-action="open" data-id="${p.id}">Linked items</button>`)}</div>`;
        },
        actions: { open: (p, el) => el.closest(".item").querySelector(".linked-box").classList.toggle("hidden") }
    },

    passwords: {
        collection: "hints", noun: "hint", addTitle: "Add a hint", addLabel: "Save hint",
        empty: "No hints yet. Save a reminder - never the password itself.",
        sort: (a, b) => a.site.localeCompare(b.site),
        stats: items => [["Saved hints", items.length]],
        render: h => `<div class="item">
            <div class="doc-icon">🔑</div>
            <div class="item-body"><strong>${esc(h.site)}</strong>
              <small>${h.username ? chip(h.username, "chip-grey") : ""}</small>
              <p class="item-note hint-text hidden">${esc(h.hint)}</p></div>
            ${actionButtons(h.id, `<button type="button" class="icon-btn" data-action="reveal" data-id="${h.id}">Show hint</button>`)}</div>`,
        actions: {
            reveal: (h, el) => {
                const box = el.closest(".item").querySelector(".hint-text");
                box.classList.toggle("hidden");
                el.textContent = box.classList.contains("hidden") ? "Show hint" : "Hide hint";
            }
        }
    }
};

/* ---------- 7. Dashboard, Search, Profile ---------- */
async function initDashboard() {
    const s = Auth.session();
    $("#welcomeTitle").textContent = `Welcome back, ${s.name.split(" ")[0]}!`;
    const list = $("#taskList"), form = $("#taskForm"), input = $("#taskInput");

    async function render() {
        const [tasks, events, projects] = await Promise.all([DB.getAll("tasks"), DB.getAll("events"), DB.getAll("projects")]);
        const done = tasks.filter(x => x.done).length;
        const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        const upcoming = events.filter(e => e.date >= today())
            .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

        $("#totalTasks").textContent = tasks.length;
        $("#completedTasks").textContent = done;
        $("#eventCount").textContent = upcoming.length;
        $("#progressText").textContent = pct + "%";
        $("#progressFill").style.width = pct + "%";
        $("#activityFill").style.width = pct + "%";
        $("#taskCount").textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
        $("#activitySummary").textContent = tasks.length
            ? `You completed ${done} of ${tasks.length} tasks (${pct}%). ${tasks.length - done} still to go.`
            : "Add tasks to start tracking your progress.";

        const shown = tasks.slice().sort((a, b) => (a.done - b.done) || String(a.due || "9999").localeCompare(String(b.due || "9999"))).slice(0, 8);
        list.innerHTML = shown.length ? shown.map(x => `
            <div class="task-item ${x.done ? "completed" : ""}">
                <input type="checkbox" class="task-check" data-action="toggle" data-id="${x.id}" ${x.done ? "checked" : ""} aria-label="Mark complete">
                <div class="task-details"><strong>${esc(x.title)}</strong>
                    <small>${esc(x.priority || "medium")} priority${x.due ? " · due " + fmtDate(x.due) : ""}</small></div>
                <button type="button" class="delete-task" data-action="delete" data-id="${x.id}">Delete</button>
            </div>`).join("") + (tasks.length > 8 ? `<p class="view-all"><a href="tasks.html">View all ${tasks.length} tasks</a></p>` : "")
            : `<div class="empty-state">No tasks yet. Add your first one above.</div>`;

        const ev = $("#eventList");
        ev.className = upcoming.length ? "event-list" : "empty-state";
        ev.innerHTML = upcoming.length ? upcoming.slice(0, 5).map(e => `
            <a class="event-row" href="calendar.html"><span class="event-date">${fmtDate(e.date)}</span>
            <span class="event-title">${esc(e.title)}</span><span class="event-time">${esc(e.time || "")}</span></a>`).join("")
            : 'No upcoming events. <a href="calendar.html">Add one in Calendar</a>.';

        const pj = $("#projectList");
        pj.className = projects.length ? "project-list" : "empty-state";
        pj.innerHTML = projects.length ? projects.slice(0, 4).map(p => {
            const pt = tasks.filter(x => x.projectId === p.id);
            const pp = pt.length ? Math.round(pt.filter(x => x.done).length / pt.length * 100) : 0;
            return `<a class="project-row" href="projects.html"><div><strong>${esc(p.name)}</strong><small>${esc(p.status)} · ${pt.length} task${pt.length === 1 ? "" : "s"}</small></div>
                <div class="progress-track"><div class="progress-fill" style="width:${pp}%"></div></div></a>`;
        }).join("") : 'No projects yet. <a href="projects.html">Create a project</a>.';
    }

    form.addEventListener("submit", safe(async e => {
        e.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        await DB.create("tasks", { title, priority: "medium", due: "", projectId: "", done: false });
        form.reset();
        render();
    }));
    list.addEventListener("change", safe(async e => {
        const el = e.target.closest('input[data-action="toggle"]');
        if (el) { await DB.update("tasks", el.dataset.id, { done: el.checked }); render(); }
    }));
    list.addEventListener("click", safe(async e => {
        const el = e.target.closest('button[data-action="delete"]');
        if (el && confirm("Delete this task?")) { await DB.remove("tasks", el.dataset.id); render(); }
    }));
    const addBtn = $(".primary-btn");
    if (addBtn) addBtn.addEventListener("click", e => { e.preventDefault(); input.scrollIntoView({ behavior: "smooth", block: "center" }); input.focus(); });
    await safe(render)();
}

async function initSearch() {
    const input = $("#globalSearch"), out = $("#searchResults");
    const data = {};
    for (const c of ALL_COLLECTIONS) data[c] = await DB.getAll(c);
    const titleOf = i => i.title || i.name || i.site || "(untitled)";
    const textOf = i => Object.entries(i)
        .filter(([k]) => !["id", "projectId", "createdAt", "log", "done"].includes(k))
        .map(([, v]) => v).join(" ").toLowerCase();

    function run() {
        const raw = input.value.trim(), term = raw.toLowerCase();
        if (term.length < 2) {
            out.innerHTML = `<div class="empty-state">Type at least 2 letters to search your tasks, events, notes, expenses, goals, habits, documents, projects and hints.</div>`;
            return;
        }
        let total = 0;
        const html = ALL_COLLECTIONS.map(c => {
            const rows = data[c].filter(i => textOf(i).includes(term));
            total += rows.length;
            if (!rows.length) return "";
            return `<div class="result-group"><h4>${LABEL_OF[c]} <span>${rows.length}</span></h4>` +
                rows.slice(0, 6).map(i => `<a class="result-row" href="${PAGE_OF[c]}?q=${encodeURIComponent(raw)}">
                    <strong>${esc(titleOf(i))}</strong>
                    <small>${esc(i.date ? fmtDate(i.date) : i.category || i.tag || i.status || "")}</small></a>`).join("") + `</div>`;
        }).join("");
        out.innerHTML = total
            ? `<p class="muted">${total} result${total > 1 ? "s" : ""} for "${esc(raw)}"</p>${html}`
            : `<div class="empty-state">No results for "${esc(raw)}".</div>`;
    }
    input.addEventListener("input", run);
    const q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    run();
    input.focus();
}

async function initProfile() {
    const s = Auth.session();
    const pf = $("#profileForm"), pw = $("#passwordForm");
    pf.elements.name.value = s.name;
    pf.elements.email.value = s.email;

    async function summary() {
        const rows = [];
        try {
            for (const c of ALL_COLLECTIONS) rows.push(`<li><span>${LABEL_OF[c]}</span><b>${(await DB.getAll(c)).length}</b></li>`);
        } catch (e) { toast(e.message); }
        $("#dataSummary").innerHTML = rows.join("");
    }

    pf.addEventListener("submit", async e => {
        e.preventDefault();
        const r = await Auth.updateProfile(pf.elements.name.value.trim(), pf.elements.email.value.trim());
        if (!r.ok) return toast(r.error);
        initShell();
        toast("Profile updated");
    });

    pw.addEventListener("submit", async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(pw));
        if (f.next.length < 8) return toast("New password needs at least 8 characters.");
        if (f.next !== f.again) return toast("New passwords do not match.");
        const r = await Auth.changePassword(f.current, f.next);
        if (!r.ok) return toast(r.error);
        pw.reset();
        toast("Password changed");
    });

    $("#exportBtn").addEventListener("click", async () => {
        try {
            const me = Auth.session();
            const out = { exportedAt: new Date().toISOString(), user: { name: me.name, email: me.email } };
            for (const c of ALL_COLLECTIONS) out[c] = await DB.getAll(c);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
            a.download = "lifeos-backup.json";
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) { toast(e.message); }
    });

    $("#clearBtn").addEventListener("click", async () => {
        if (!confirm("Delete ALL your tasks, notes, events and other data? Your account stays.")) return;
        try { await Auth.clearData(); await summary(); toast("All data cleared"); } catch (e) { toast(e.message); }
    });
    $("#deleteBtn").addEventListener("click", async () => {
        if (!confirm("Delete your account and all its data permanently?")) return;
        try { await Auth.deleteAccount(); location.href = "index.html"; } catch (e) { toast(e.message); }
    });
    summary();
}


/* ---------- Creators & Design Hub ---------- */
function initCreators() {
    const defaultSuggestions = [
        {
            id: "sug-1",
            title: "Dark Mode & High Contrast OLED Theme",
            area: "UI/UX & Themes",
            priority: "High",
            desc: "Add a theme switch in the dashboard topbar with deep obsidian backgrounds, smooth gradient borders, and crisp high-contrast typography.",
            author: "LifeOS Community",
            date: "20 Oct 2026",
            status: "In Progress",
            upvotes: 28
        },
        {
            id: "sug-2",
            title: "Drag-and-Drop Kanban View for Tasks & Projects",
            area: "Layout & Widgets",
            priority: "Medium",
            desc: "Allow users to toggle between list view and Kanban board with To Do, In Progress, and Completed columns for visual task tracking.",
            author: "Mohammad Kaif",
            date: "21 Oct 2026",
            status: "Planned",
            upvotes: 21
        },
        {
            id: "sug-3",
            title: "Monthly Expense Analytics & Category Breakdown Chart",
            area: "Feature & Visualization",
            priority: "Medium",
            desc: "Visual donut/bar chart showing expense distribution across categories (Food, Rent, Tech, Travel) with monthly budgets.",
            author: "Abdul Razzak Khan",
            date: "22 Oct 2026",
            status: "Planned",
            upvotes: 19
        },
        {
            id: "sug-4",
            title: "Micro-Animations & Streak Confetti on Habit Completion",
            area: "Micro-Interactions",
            priority: "Low",
            desc: "Subtle celebratory micro-animation when marking all daily habits or hitting a 7-day milestone.",
            author: "Design Team",
            date: "23 Oct 2026",
            status: "Under Review",
            upvotes: 15
        }
    ];

    function getSuggestions() {
        try {
            const data = JSON.parse(localStorage.getItem("lifeos_design_improvements"));
            if (Array.isArray(data) && data.length > 0) return data;
        } catch (e) {}
        localStorage.setItem("lifeos_design_improvements", JSON.stringify(defaultSuggestions));
        return defaultSuggestions;
    }

    function saveSuggestions(list) {
        localStorage.setItem("lifeos_design_improvements", JSON.stringify(list));
    }

    function getUpvotedIds() {
        try {
            return JSON.parse(localStorage.getItem("lifeos_design_upvotes")) || [];
        } catch (e) { return []; }
    }

    function saveUpvotedIds(ids) {
        localStorage.setItem("lifeos_design_upvotes", JSON.stringify(ids));
    }

    let filterArea = "all";
    const listEl = $("#suggestionsList");
    const countEl = $("#suggestionsCount");

    function render() {
        if (!listEl) return;
        const list = getSuggestions();
        const upvoted = getUpvotedIds();
        const filtered = filterArea === "all" ? list : list.filter(item => item.area === filterArea);

        if (countEl) countEl.textContent = `${filtered.length} idea${filtered.length === 1 ? "" : "s"}`;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="empty-state">No design suggestions found in this category. Be the first to suggest one!</div>`;
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            const hasUpvoted = upvoted.includes(item.id);
            const statusClass = item.status === "In Progress" ? "badge-progress"
                : item.status === "Planned" ? "badge-planned"
                : item.status === "Under Review" ? "badge-review" : "badge-done";

            return `
            <div class="suggestion-card" data-id="${item.id}">
                <div class="suggestion-header">
                    <div class="suggestion-tags">
                        <span class="suggestion-area">${esc(item.area)}</span>
                        <span class="status-badge ${statusClass}">${esc(item.status)}</span>
                        ${item.priority === "High" ? '<span class="priority-high">★ High Priority</span>' : ''}
                    </div>
                    <button class="upvote-btn ${hasUpvoted ? 'upvoted' : ''}" data-id="${item.id}" title="${hasUpvoted ? 'Remove upvote' : 'Upvote this design'}">
                        ▲ <span class="vote-count">${item.upvotes || 0}</span>
                    </button>
                </div>
                <h4 class="suggestion-title">${esc(item.title)}</h4>
                <p class="suggestion-desc">${esc(item.desc)}</p>
                <div class="suggestion-footer">
                    <span>Proposed by <strong>${esc(item.author || "User")}</strong> · ${esc(item.date)}</span>
                    ${item.isCustom ? `<button class="delete-sug-btn" data-id="${item.id}">Remove</button>` : ''}
                </div>
            </div>`;
        }).join("");
    }

    // Upvoting & Deleting delegation
    if (listEl && !listEl.dataset.bound) {
        listEl.dataset.bound = "1";
        listEl.addEventListener("click", e => {
            const upvoteBtn = e.target.closest(".upvote-btn");
            if (upvoteBtn) {
                const id = upvoteBtn.dataset.id;
                let list = getSuggestions();
                let upvoted = getUpvotedIds();
                const item = list.find(s => s.id === id);
                if (!item) return;

                if (upvoted.includes(id)) {
                    item.upvotes = Math.max(0, (item.upvotes || 1) - 1);
                    upvoted = upvoted.filter(x => x !== id);
                    toast("Upvote removed");
                } else {
                    item.upvotes = (item.upvotes || 0) + 1;
                    upvoted.push(id);
                    toast("Thank you for supporting this design improvement!");
                }
                saveSuggestions(list);
                saveUpvotedIds(upvoted);
                render();
                return;
            }

            const delBtn = e.target.closest(".delete-sug-btn");
            if (delBtn) {
                const id = delBtn.dataset.id;
                let list = getSuggestions().filter(s => s.id !== id);
                saveSuggestions(list);
                toast("Suggestion removed");
                render();
            }
        });
    }

    // Submission form
    const form = $("#suggestionForm");
    if (form && !form.dataset.bound) {
        form.dataset.bound = "1";
        form.addEventListener("submit", e => {
            e.preventDefault();
            const titleInput = $("#sugTitle");
            const areaSelect = $("#sugArea");
            const prioritySelect = $("#sugPriority");
            const descInput = $("#sugDesc");

            const title = titleInput.value.trim();
            const area = areaSelect.value;
            const priority = prioritySelect.value;
            const desc = descInput.value.trim();
            const s = Auth.session();
            const author = s ? s.name : "Community Contributor";

            if (!title || !desc) {
                toast("Please provide both a title and description.");
                return;
            }

            const newItem = {
                id: "sug-" + Date.now(),
                title,
                area,
                priority,
                desc,
                author,
                date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                status: "Under Review",
                upvotes: 1,
                isCustom: true
            };

            const list = getSuggestions();
            list.unshift(newItem);
            saveSuggestions(list);

            const upvoted = getUpvotedIds();
            upvoted.push(newItem.id);
            saveUpvotedIds(upvoted);

            titleInput.value = "";
            descInput.value = "";
            toast("Design improvement proposed! Kaif & Razzak will review it.");
            render();
        });
    }

    // Filter pills
    const filters = $$(".filter-pill");
    filters.forEach(btn => {
        if (!btn.dataset.bound) {
            btn.dataset.bound = "1";
            btn.addEventListener("click", () => {
                filters.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                filterArea = btn.dataset.area;
                render();
            });
        }
    });

    render();
}

/* ---------- Login + Register pages ---------- */
function initAuthPages() {
    const isRegister = !!$("#register-form");
    const form = $(isRegister ? "#register-form form" : "#login-form form");
    if (!form) return;
    if (Auth.session()) { location.replace("dashboard.html"); return; }

    const err = document.createElement("p");
    err.setAttribute("role", "alert");
    err.style.cssText = "color:#dc2626;font-size:13.5px;margin:-8px 0 14px;display:none;text-align:center";
    form.querySelector("button").before(err);

    // tell the user right away if the server / database is not reachable
    (async () => {
        const show = msg => { err.textContent = msg; err.style.display = "block"; };
        if (location.protocol === "file:") return show(offlineMessage());
        try {
            const r = await fetch(CONFIG.API_BASE + "/health");
            if (!r.ok) {
                let j = {}; try { j = await r.json(); } catch { /* ignore */ }
                show(j.error || "The server answered with an error (" + r.status + ").");
            }
        } catch { show(offlineMessage()); }
    })();

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const f = new FormData(form);
        err.style.display = "none";
        const res = isRegister
            ? await Auth.register(f.get("name"), f.get("email"), f.get("password"))
            : await Auth.login(f.get("email"), f.get("password"));
        if (!res.ok) { err.textContent = res.error; err.style.display = "block"; return; }
        location.href = "dashboard.html";
    });
}

/* ---------- 8. Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
    // delete any old browser-only demo data (keep session and user design feedback)
    Object.keys(localStorage).filter(k => k.startsWith("lifeos_") && !["lifeos_session", "lifeos_design_improvements", "lifeos_design_upvotes"].includes(k))
        .forEach(k => localStorage.removeItem(k));
    // any failed server call (validation error, server down...) shows a message instead of failing silently
    window.addEventListener("unhandledrejection", e => {
        toast((e.reason && e.reason.message) || "Something went wrong.");
    });
    const file = currentFile();
    if (file === "creators.html") {
        initShell();
        initCreators();
        return;
    }
    if (PUBLIC_PAGES.includes(file)) { initAuthPages(); return; }
    if (!Auth.session()) { location.replace("login.html"); return; }

    initShell();
    const page = document.body.dataset.page;
    if (page === "dashboard") return initDashboard();
    if (page === "search") return initSearch();
    if (page === "profile") return initProfile();
    if (page === "creators") return initCreators();
    if (MODULES[page]) {
        const cfg = MODULES[page];
        if (cfg.listClass) $("#itemList").classList.add(cfg.listClass);
        return initModule(cfg);
    }
});
