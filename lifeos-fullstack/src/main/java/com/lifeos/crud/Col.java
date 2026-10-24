package com.lifeos.crud;

import java.util.Set;

/**
 * One field of a collection: JSON name (used by the front end) <-> SQL column.
 * max = max length for STR. allowed = optional whitelist for STR (used for the MySQL ENUM columns).
 */
public record Col(String json, String column, Type type, int max, boolean required,
                  Object defaultValue, Set<String> allowed) {

    public enum Type { STR, DATE, TIME, NUM, INT, BOOL }

    public static Col str(String json, String column, int max, boolean required) {
        return new Col(json, column, Type.STR, max, required, "", null);
    }

    public static Col of(String json, String column, Type type, boolean required, Object defaultValue) {
        return new Col(json, column, type, 0, required, defaultValue, null);
    }

    public Col withDefault(Object value) {
        return new Col(json, column, type, max, required, value, allowed);
    }

    public Col oneOf(String... values) {
        return new Col(json, column, type, max, required, defaultValue, Set.of(values));
    }
}
