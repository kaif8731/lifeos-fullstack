package com.lifeos.crud;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lifeos.web.ApiException;

/**
 * One service that does GET / POST / PUT / DELETE for every collection in Specs.
 * - every query is filtered by user_id, so users can never see each other's data
 * - every value is validated and sent to MySQL as a prepared-statement parameter (no SQL injection)
 * - ids are returned to the browser as strings ("12")
 */
@Service
public class CrudService {
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999.99");

    private final JdbcTemplate jdbc;

    public CrudService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /* ------------------------------ read ------------------------------ */

    public List<Map<String, Object>> list(Spec s, long userId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT * FROM " + s.table() + " WHERE user_id = ? ORDER BY created_at, id",
                (rs, i) -> row(s, rs), userId);
        if (s.logs()) attachLogs(rows);
        return rows;
    }

    public Map<String, Object> get(Spec s, long userId, long id) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT * FROM " + s.table() + " WHERE id = ? AND user_id = ?",
                (rs, i) -> row(s, rs), id, userId);
        if (rows.isEmpty()) throw ApiException.notFound();
        if (s.logs()) attachLogs(rows);
        return rows.get(0);
    }

    private Map<String, Object> row(Spec s, ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        Timestamp ts = rs.getTimestamp("created_at");
        m.put("createdAt", ts == null ? "" : ts.toLocalDateTime().toString());
        if (s.project()) {
            String p = rs.getString("project_id");
            m.put("projectId", p == null ? "" : p);
        }
        for (Col c : s.cols()) {
            m.put(c.json(), readCol(c, rs));
        }
        return m;
    }

    private Object readCol(Col c, ResultSet rs) throws SQLException {
        switch (c.type()) {
            case NUM: {
                BigDecimal v = rs.getBigDecimal(c.column());
                return v == null ? BigDecimal.ZERO : v;
            }
            case INT:
                return rs.getInt(c.column());
            case BOOL:
                return rs.getBoolean(c.column());
            case TIME: {
                String v = rs.getString(c.column());
                return v == null ? "" : (v.length() >= 5 ? v.substring(0, 5) : v);
            }
            default: { // STR, DATE (MySQL returns DATE as yyyy-MM-dd)
                String v = rs.getString(c.column());
                return v == null ? "" : v;
            }
        }
    }

    /** Habits: add "log": ["2026-10-21", ...] from the habit_logs table. */
    private void attachLogs(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) return;
        Map<String, List<String>> byHabit = new HashMap<>();
        StringBuilder in = new StringBuilder();
        Object[] ids = new Object[rows.size()];
        for (int i = 0; i < rows.size(); i++) {
            in.append(i == 0 ? "?" : ",?");
            ids[i] = Long.valueOf((String) rows.get(i).get("id"));
        }
        jdbc.query("SELECT habit_id, log_date FROM habit_logs WHERE habit_id IN (" + in + ") ORDER BY log_date",
                (RowCallbackHandler) rs -> byHabit
                        .computeIfAbsent(rs.getString("habit_id"), k -> new ArrayList<>())
                        .add(rs.getString("log_date")),
                ids);
        for (Map<String, Object> r : rows) {
            r.put("log", byHabit.getOrDefault((String) r.get("id"), List.of()));
        }
    }

    /* ------------------------------ write ------------------------------ */

    @Transactional
    public Map<String, Object> create(Spec s, long userId, Map<String, Object> body) {
        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        cols.add("user_id");
        vals.add(userId);
        if (s.project()) {
            cols.add("project_id");
            vals.add(projectParam(userId, body.get("projectId")));
        }
        for (Col c : s.cols()) {
            Object raw = body.containsKey(c.json()) ? body.get(c.json()) : c.defaultValue();
            cols.add(c.column());
            vals.add(toParam(c, raw));
        }
        String sql = "INSERT INTO " + s.table() + " (" + String.join(",", cols) + ") VALUES ("
                + "?,".repeat(cols.size() - 1) + "?)";

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            bind(ps, vals);
            return ps;
        }, keys);
        long id = keys.getKey().longValue();

        if (s.logs() && body.containsKey("log")) writeLogs(id, body.get("log"));
        return get(s, userId, id);
    }

    @Transactional
    public Map<String, Object> update(Spec s, long userId, long id, Map<String, Object> body) {
        get(s, userId, id); // 404 if it does not exist or belongs to someone else

        List<String> sets = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        if (s.project() && body.containsKey("projectId")) {
            sets.add("project_id = ?");
            vals.add(projectParam(userId, body.get("projectId")));
        }
        for (Col c : s.cols()) {
            if (body.containsKey(c.json())) {
                sets.add(c.column() + " = ?");
                vals.add(toParam(c, body.get(c.json())));
            }
        }
        if (!sets.isEmpty()) {
            vals.add(id);
            vals.add(userId);
            run("UPDATE " + s.table() + " SET " + String.join(", ", sets) + " WHERE id = ? AND user_id = ?", vals);
        }
        if (s.logs() && body.containsKey("log")) writeLogs(id, body.get("log"));
        return get(s, userId, id);
    }

    public void delete(Spec s, long userId, long id) {
        int n = run("DELETE FROM " + s.table() + " WHERE id = ? AND user_id = ?", List.of(id, userId));
        if (n == 0) throw ApiException.notFound();
    }

    /** Removes every row of this user from every collection (the account stays). */
    @Transactional
    public void deleteAll(long userId) {
        for (Spec s : Specs.all()) {
            run("DELETE FROM " + s.table() + " WHERE user_id = ?", List.of(userId));
        }
    }

    public long parseId(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw ApiException.notFound();
        }
    }

    /* ------------------------------ helpers ------------------------------ */

    private int run(String sql, List<Object> vals) {
        return jdbc.update(sql, ps -> bind(ps, vals));
    }

    private void bind(PreparedStatement ps, List<Object> vals) throws SQLException {
        for (int i = 0; i < vals.size(); i++) {
            ps.setObject(i + 1, vals.get(i));
        }
    }

    private static String text(Object raw) {
        return raw == null ? "" : String.valueOf(raw).trim();
    }

    /** "" -> NULL. Otherwise the project must exist AND belong to this user. */
    private Object projectParam(long userId, Object raw) {
        String v = text(raw);
        if (v.isEmpty()) return null;
        long pid;
        try {
            pid = Long.parseLong(v);
        } catch (NumberFormatException e) {
            throw ApiException.bad("Unknown project.");
        }
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id = ? AND user_id = ?",
                Integer.class, pid, userId);
        if (n == null || n == 0) throw ApiException.bad("Unknown project.");
        return pid;
    }

    /** Validates one value and converts it to the type MySQL needs. */
    private Object toParam(Col c, Object raw) {
        String v = text(raw);
        switch (c.type()) {
            case STR: {
                if (v.isEmpty()) {
                    if (c.required()) throw ApiException.bad(c.json() + " is required.");
                    return null;
                }
                if (v.length() > c.max()) throw ApiException.bad(c.json() + " is too long (max " + c.max() + ").");
                if (c.allowed() != null && !c.allowed().contains(v)) {
                    throw ApiException.bad(c.json() + " has an invalid value.");
                }
                return v;
            }
            case DATE: {
                if (v.isEmpty()) {
                    if (c.required()) throw ApiException.bad(c.json() + " is required.");
                    return null;
                }
                try {
                    return LocalDate.parse(v);
                } catch (DateTimeParseException e) {
                    throw ApiException.bad(c.json() + " must look like 2026-12-31.");
                }
            }
            case TIME: {
                if (v.isEmpty()) return null;
                try {
                    return LocalTime.parse(v);
                } catch (DateTimeParseException e) {
                    throw ApiException.bad(c.json() + " must look like 14:30.");
                }
            }
            case NUM: {
                if (v.isEmpty()) v = "0";
                try {
                    BigDecimal n = new BigDecimal(v);
                    if (n.signum() < 0 || n.compareTo(MAX_AMOUNT) > 0) throw ApiException.bad(c.json() + " is out of range.");
                    return n.setScale(2, RoundingMode.HALF_UP);
                } catch (NumberFormatException e) {
                    throw ApiException.bad(c.json() + " must be a number.");
                }
            }
            case INT: {
                if (v.isEmpty()) v = "0";
                try {
                    int n = new BigDecimal(v).intValue();
                    return Math.max(0, Math.min(100, n)); // the only INT field is "progress" (0-100)
                } catch (NumberFormatException e) {
                    throw ApiException.bad(c.json() + " must be a number.");
                }
            }
            case BOOL:
                return raw instanceof Boolean b ? b : Boolean.parseBoolean(v);
            default:
                throw ApiException.bad("Unsupported field type.");
        }
    }

    /** Replaces all check-in dates of one habit (habit_logs table). */
    private void writeLogs(long habitId, Object raw) {
        if (!(raw instanceof List<?> list)) throw ApiException.bad("log must be a list of dates.");
        if (list.size() > 4000) throw ApiException.bad("log is too long.");
        TreeSet<LocalDate> dates = new TreeSet<>();
        for (Object o : list) {
            try {
                dates.add(LocalDate.parse(String.valueOf(o)));
            } catch (DateTimeParseException e) {
                throw ApiException.bad("log dates must look like 2026-12-31.");
            }
        }
        jdbc.update("DELETE FROM habit_logs WHERE habit_id = ?", habitId);
        if (!dates.isEmpty()) {
            List<Object[]> batch = new ArrayList<>();
            for (LocalDate d : dates) batch.add(new Object[] { habitId, d });
            jdbc.batchUpdate("INSERT INTO habit_logs (habit_id, log_date) VALUES (?, ?)", batch);
        }
    }
}
