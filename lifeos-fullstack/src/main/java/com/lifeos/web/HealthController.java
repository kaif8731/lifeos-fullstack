package com.lifeos.web;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/health - open http://localhost:8080/api/health to check the app AND the MySQL connection. */
@RestController
@RequestMapping("/api")
public class HealthController {
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "ok", "database", "connected"));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("error",
                    "The server is running but MySQL is not reachable. Check that MySQL is started and the password in application-local.properties is correct."));
        }
    }
}
