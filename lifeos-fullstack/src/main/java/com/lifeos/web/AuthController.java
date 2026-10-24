package com.lifeos.web;

import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lifeos.security.JwtService;

/** Register, login, profile, password and account deletion. Passwords are stored as BCrypt hashes. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final JdbcTemplate jdbc;
    private final JwtService jwt;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(JdbcTemplate jdbc, JwtService jwt) {
        this.jdbc = jdbc;
        this.jwt = jwt;
    }

    /* ---------- validation helpers ---------- */

    private static String text(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String name(Object o) {
        String v = text(o);
        if (v.isEmpty() || v.length() > 80) throw ApiException.bad("Name must be 1 to 80 characters.");
        return v;
    }

    private static String email(Object o) {
        String v = text(o).toLowerCase();
        if (v.length() > 254 || !EMAIL.matcher(v).matches()) throw ApiException.bad("Please enter a valid email.");
        return v;
    }

    /** Passwords are NOT trimmed. BCrypt only uses the first 72 bytes, so longer ones are refused. */
    private static String password(Object o, String label) {
        String v = o == null ? "" : String.valueOf(o);
        if (v.length() < 8) throw ApiException.bad(label + " needs at least 8 characters.");
        if (v.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.bad(label + " is too long (max 72 bytes).");
        return v;
    }

    private Map<String, Object> session(long id, String name, String email) {
        return Map.of("token", jwt.create(id),
                      "user", Map.of("id", String.valueOf(id), "name", name, "email", email));
    }

    private Map<String, Object> user(long id) {
        List<Map<String, Object>> rows = jdbc.query("SELECT id, name, email FROM users WHERE id = ?",
                (rs, i) -> Map.<String, Object>of("id", rs.getString("id"),
                        "name", rs.getString("name"), "email", rs.getString("email")), id);
        if (rows.isEmpty()) throw new ApiException(401, "Please log in again.");
        return rows.get(0);
    }

    /* ---------- endpoints ---------- */

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> b) {
        String name = name(b.get("name"));
        String email = email(b.get("email"));
        String hash = encoder.encode(password(b.get("password"), "Password"));

        KeyHolder keys = new GeneratedKeyHolder();
        try {
            jdbc.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS);
                ps.setString(1, name);
                ps.setString(2, email);
                ps.setString(3, hash);
                return ps;
            }, keys);
        } catch (DuplicateKeyException e) {
            throw new ApiException(409, "An account with this email already exists.");
        }
        long id = keys.getKey().longValue();
        return ResponseEntity.status(201).body(session(id, name, email));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> b) {
        String email = text(b.get("email")).toLowerCase();
        String pw = b.get("password") == null ? "" : String.valueOf(b.get("password"));

        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?",
                (rs, i) -> Map.<String, Object>of("id", rs.getLong("id"), "name", rs.getString("name"),
                        "email", rs.getString("email"), "hash", rs.getString("password_hash")), email);

        if (rows.isEmpty() || !encoder.matches(pw, (String) rows.get(0).get("hash"))) {
            throw new ApiException(401, "Wrong email or password.");
        }
        Map<String, Object> u = rows.get(0);
        return session((Long) u.get("id"), (String) u.get("name"), (String) u.get("email"));
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestAttribute("userId") long userId) {
        return user(userId);
    }

    @PutMapping("/profile")
    public Map<String, Object> profile(@RequestAttribute("userId") long userId, @RequestBody Map<String, Object> b) {
        String name = name(b.get("name"));
        String email = email(b.get("email"));
        try {
            jdbc.update("UPDATE users SET name = ?, email = ? WHERE id = ?", name, email, userId);
        } catch (DuplicateKeyException e) {
            throw new ApiException(409, "That email is used by another account.");
        }
        return user(userId);
    }

    @PutMapping("/password")
    public ResponseEntity<Void> changePassword(@RequestAttribute("userId") long userId, @RequestBody Map<String, Object> b) {
        String current = b.get("current") == null ? "" : String.valueOf(b.get("current"));
        String next = password(b.get("next"), "New password");
        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, userId);
        if (hash == null || !encoder.matches(current, hash)) throw ApiException.bad("Current password is wrong.");
        jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", encoder.encode(next), userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/account")
    public ResponseEntity<Void> deleteAccount(@RequestAttribute("userId") long userId) {
        jdbc.update("DELETE FROM users WHERE id = ?", userId); // ON DELETE CASCADE removes all their data
        return ResponseEntity.noContent().build();
    }
}
