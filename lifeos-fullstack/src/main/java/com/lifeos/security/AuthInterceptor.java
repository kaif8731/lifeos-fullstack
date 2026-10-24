package com.lifeos.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Runs before every /api request (except login/register).
 * Reads "Authorization: Bearer <token>", checks it, and stores the user id
 * in the request attribute "userId" for the controllers.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {
    private final JwtService jwt;
    private final JdbcTemplate jdbc;

    public AuthInterceptor(JwtService jwt, JdbcTemplate jdbc) {
        this.jwt = jwt;
        this.jdbc = jdbc;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            return true; // CORS pre-flight
        }
        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return unauthorized(res);
        }
        try {
            long userId = jwt.verify(header.substring(7));
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, userId);
            if (n == null || n == 0) {
                return unauthorized(res);
            }
            req.setAttribute("userId", userId);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return unauthorized(res);
        }
    }

    private boolean unauthorized(HttpServletResponse res) throws Exception {
        res.setStatus(401);
        res.setContentType("application/json");
        res.setCharacterEncoding("UTF-8");
        res.getWriter().write("{\"error\":\"Please log in again.\"}");
        return false;
    }
}
