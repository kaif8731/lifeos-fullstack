package com.lifeos.security;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/** Creates and verifies the login token (JWT). The token subject is the numeric user id. */
@Service
public class JwtService {
    private final SecretKey key;
    private final long expiryMs;

    public JwtService(@Value("${lifeos.jwt.secret}") String secret,
                      @Value("${lifeos.jwt.expiry-hours}") long hours) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                "JWT secret is missing or too short. Set the JWT_SECRET environment variable "
                + "(32+ characters) or run with the 'local' profile.");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiryMs = hours * 3_600_000L;
    }

    public String create(long userId) {
        Date now = new Date();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expiryMs))
                .signWith(key)
                .compact();
    }

    /** Returns the user id. Throws io.jsonwebtoken.JwtException (or NumberFormatException) if the token is bad. */
    public long verify(String token) {
        String sub = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload().getSubject();
        return Long.parseLong(sub);
    }
}
