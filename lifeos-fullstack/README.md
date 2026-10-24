# LifeOS - full stack (HTML/CSS/JS + Spring Boot + MySQL)

```
Browser (HTML, CSS, script.js)
   |  JSON over HTTP  (fetch -> /api/...)
Spring Boot REST API  (Spring MVC on embedded Tomcat = Java servlets, JWT login, BCrypt)
   |  JDBC (HikariCP + prepared statements)
MySQL database "lifeos"   <- your lifeos.sql (users, projects, tasks, events, notes,
                              expenses, goals, habits, habit_logs, documents, hints)
```

Spring Boot also serves the web pages (`src/main/resources/static`), so you start ONE program and open
`http://localhost:8080`.

**React and Node.js are not used.** The front end you designed is plain HTML/CSS/JS and already complete;
React would mean rewriting every page (you asked for no design changes) and Node would be a second server
doing nothing the Spring Boot app doesn't already do. Nothing else is required to make the site work.

## 1. Run it on your own PC (your data stays on your device)

You need: **JDK 17+**, **Maven 3.9+**, **MySQL 8** running on `localhost:3306`.
(Check: `java -version`, `mvn -v`.)

1. **Database.** Nothing to do - on first start the app creates the tables from `db/lifeos.sql`
   (your script) if they don't exist. You can also run `database/lifeos.sql` yourself in MySQL Workbench.
   > If you earlier created a `users` table with the old `CHAR(36)` id, the app stops with a message.
   > Run `DROP DATABASE lifeos;` in MySQL and start again (it recreates everything).
2. **Start.** In this folder:
   - Windows: double-click `run-local.bat` (or `mvn spring-boot:run`)
   - Mac/Linux: `./run-local.sh`
   - or in IntelliJ / VS Code: run `LifeosApplication`.
   Wait for `Started LifeosApplication`, then open `http://localhost:8080/api/health` - it must show
   `{"status":"ok","database":"connected"}`. See `START-HERE.txt` for the full checklist.
3. Open **http://localhost:8080**, click *Get started*, register, use the site.
4. Check the data really is in MySQL:
   ```sql
   USE lifeos;
   SELECT id, name, email, LEFT(password_hash, 7) AS hash FROM users;   -- hash starts with $2a$ (BCrypt)
   SELECT * FROM tasks;
   ```

`application-local.properties` (git-ignored, loaded automatically) holds your MySQL login
(`root` / your password / `localhost:3306/lifeos`). **Never upload that file.**

Build one runnable file: `mvn clean package` then
`java -jar target/lifeos-1.0.0.jar`.

Open it from your phone on the same Wi-Fi: `http://<your-PC-IP>:8080` (allow port 8080 in the firewall).

## 2. Put it online

**A. Online, but data still stored on your PC.** Keep step 1 running and expose it:
`ngrok http 8080` (or `cloudflared tunnel --url http://localhost:8080`). You get a public https link.
It works only while your PC, MySQL and the app are on.

**B. Fully online (24/7).** The database then lives on the host, not on your PC.
1. Create a **MySQL 8** database at a provider (Railway, Aiven, PlanetScale-compatible hosts, a VPS ...).
2. Deploy this folder (it contains a `Dockerfile`; Railway/Render/Fly can build it from your Git repo).
   Do NOT commit `application-local.properties`.
3. Set these **environment variables** on the host:

   | Variable | Value |
   |---|---|
   | `DB_URL` | `jdbc:mysql://HOST:PORT/DBNAME?sslMode=REQUIRED&serverTimezone=UTC` (use the host/port/name from the provider; if SSL is not offered use `useSSL=false`) |
   | `DB_USERNAME` | the provider's DB user |
   | `DB_PASSWORD` | the provider's DB password |
   | `JWT_SECRET` | any random string of 32+ characters (e.g. `openssl rand -base64 48`) |
   | `PORT` | usually set by the host automatically |

4. First start creates the tables in that database (the DB user needs CREATE permission).
   If it doesn't, run `database/lifeos.sql` once in the provider's SQL console.
5. Use HTTPS (every host above gives it). Optional: create a limited DB user with
   `database/create_app_user.sql` instead of using root.

**VPS (Ubuntu) outline:** install `openjdk-17-jre` + `mysql-server`, run `database/lifeos.sql`,
create a MySQL user, copy `lifeos-1.0.0.jar`, run it as a systemd service with the environment variables
above, put Nginx + Let's Encrypt (certbot) in front for HTTPS.

## 3. Adding more tables later
1. Write `CREATE TABLE ...` (add `user_id ... REFERENCES users(id) ON DELETE CASCADE`, `created_at`) and run
   it in MySQL (also paste it into `database/lifeos.sql` and `src/main/resources/db/lifeos.sql`).
2. Add one `add(new Spec(...))` block in `crud/Specs.java` - the REST endpoints
   `GET/POST /api/<name>` and `PUT/DELETE /api/<name>/{id}` appear automatically.
3. Add a page: copy a similar page (e.g. `notes.html`), add a config in `MODULES` in `script.js`,
   and the names in `ALL_COLLECTIONS`, `PAGE_OF`, `LABEL_OF`, `NAV`.
Changing an existing table: use `ALTER TABLE` in MySQL and update `Specs.java`.

## 4. API (JSON)
All `/api/**` calls except login/register need the header `Authorization: Bearer <token>`.

| Method | URL | Purpose |
|---|---|---|
| POST | `/api/auth/register` `{name,email,password}` | create account -> `{token,user}` |
| POST | `/api/auth/login` `{email,password}` | log in -> `{token,user}` |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/profile` `{name,email}` | update profile |
| PUT | `/api/auth/password` `{current,next}` | change password |
| DELETE | `/api/auth/account` | delete account and all data |
| GET/POST | `/api/{collection}` | list / create |
| PUT/DELETE | `/api/{collection}/{id}` | update (only sent fields) / delete |
| DELETE | `/api/data` | delete all my data |

`collection` = `projects, tasks, events, notes, expenses, goals, habits, documents, hints`.
Errors come back as `{"error":"message"}` with status 400/401/404/409.

## 5. Troubleshooting
- **Access denied for user 'root'** - wrong password in `application-local.properties` (or env var).
- **Communications link failure / Connection refused** - MySQL isn't running on port 3306.
- **Port 8080 already in use** - set `PORT=9090` (then open `http://localhost:9090`).
- **JWT secret is missing** - `application-local.properties` was deleted; restore it (locally) or set `JWT_SECRET` (online).
- **Login page says "Cannot reach the server"** - the Spring Boot app isn't running. Open the site through
  `http://localhost:8080`, not by double-clicking the .html files.
- Using VS Code *Live Server* (port 5500) also works while Spring Boot runs on 8080.

## 6. Security notes
- Passwords are hashed with BCrypt; login uses a signed JWT (72 h, change with `JWT_EXPIRY_HOURS`).
- Every query is filtered by the logged-in user and uses prepared statements.
- You pasted your MySQL root password into a chat: **change it** (`ALTER USER 'root'@'localhost' IDENTIFIED BY '...'`)
  and update `application-local.properties`.
- Not included yet: login rate-limiting, email verification, password reset by email.
- Back up your data: `mysqldump -u root -p lifeos > lifeos-backup.sql`.
