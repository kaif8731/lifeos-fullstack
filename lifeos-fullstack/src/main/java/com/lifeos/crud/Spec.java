package com.lifeos.crud;

import java.util.List;

/**
 * Describes one REST collection: URL name, SQL table, whether rows can link to a project,
 * whether it has dated check-ins in the habit_logs table, and its fields.
 */
public record Spec(String path, String table, boolean project, boolean logs, List<Col> cols) { }
