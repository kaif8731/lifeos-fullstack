package com.lifeos.crud;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.lifeos.crud.Col.Type;
import com.lifeos.web.ApiException;

/**
 * THE registry of all collections (matches database/lifeos.sql).
 * To add a new module: 1) create its table  2) add one add(...) line here  3) build the page in the front end.
 */
public final class Specs {
    private static final Map<String, Spec> ALL = new LinkedHashMap<>();

    private static void add(Spec s) { ALL.put(s.path(), s); }

    static {
        add(new Spec("projects", "projects", false, false, List.of(
            Col.str("name", "name", 120, true),
            Col.str("description", "description", 300, false),
            Col.str("status", "status", 20, true).withDefault("active").oneOf("active", "on-hold", "completed"),
            Col.of("deadline", "deadline", Type.DATE, false, null))));

        add(new Spec("tasks", "tasks", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.str("priority", "priority", 10, true).withDefault("medium").oneOf("low", "medium", "high"),
            Col.of("due", "due_date", Type.DATE, false, null),
            Col.of("done", "done", Type.BOOL, false, false))));

        add(new Spec("events", "events", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.of("date", "event_date", Type.DATE, true, null),
            Col.of("time", "event_time", Type.TIME, false, null),
            Col.str("note", "note", 300, false))));

        add(new Spec("notes", "notes", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.str("content", "content", 2000, true),
            Col.str("tag", "tag", 120, false))));

        add(new Spec("expenses", "expenses", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.of("amount", "amount", Type.NUM, true, 0),
            Col.str("category", "category", 20, true).withDefault("Other")
                .oneOf("Food", "Transport", "Shopping", "Bills", "Health", "Education", "Entertainment", "Other"),
            Col.of("date", "expense_date", Type.DATE, true, null))));

        add(new Spec("goals", "goals", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.str("description", "description", 300, false),
            Col.of("target", "target_date", Type.DATE, false, null),
            Col.of("progress", "progress", Type.INT, false, 0))));

        // "log" (list of yyyy-MM-dd) is stored in the habit_logs table, see CrudService
        add(new Spec("habits", "habits", false, true, List.of(
            Col.str("name", "name", 120, true),
            Col.str("goal", "goal", 120, false))));

        add(new Spec("documents", "documents", true, false, List.of(
            Col.str("title", "title", 120, true),
            Col.str("category", "category", 20, true).withDefault("ID")
                .oneOf("ID", "Education", "Finance", "Medical", "Work", "Other"),
            Col.str("link", "link", 500, false),
            Col.str("note", "note", 300, false))));

        add(new Spec("hints", "hints", false, false, List.of(
            Col.str("site", "site", 120, true),
            Col.str("username", "username", 120, false),
            Col.str("hint", "hint", 300, true))));
    }

    private Specs() { }

    public static Spec get(String path) {
        Spec s = ALL.get(path);
        if (s == null) throw new ApiException(404, "Unknown collection: " + path);
        return s;
    }

    public static Iterable<Spec> all() { return ALL.values(); }
}
