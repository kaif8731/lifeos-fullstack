package com.lifeos.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

/**
 * On start-up: if the "users" table does not exist yet, run db/lifeos.sql (your schema file, not edited).
 * The CREATE DATABASE / USE lines are skipped in memory, so the tables are created in the database the
 * app is connected to (works for "lifeos" locally and for any database name at a cloud provider).
 * If the tables already exist, nothing is touched - your data is never modified or dropped.
 */
@Component
public class DatabaseInitializer implements InitializingBean {
    private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;

    public DatabaseInitializer(DataSource dataSource, JdbcTemplate jdbc) {
        this.dataSource = dataSource;
        this.jdbc = jdbc;
    }

    @Override
    public void afterPropertiesSet() {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'",
                Integer.class);
        if (n == null || n == 0) {
            log.info("No tables found - creating them from db/lifeos.sql");
            try {
                String script = new String(new ClassPathResource("db/lifeos.sql").getInputStream().readAllBytes(),
                        StandardCharsets.UTF_8);
                script = script.replaceAll("(?ims)^\\s*CREATE\\s+DATABASE[^;]*;", "")
                               .replaceAll("(?im)^\\s*USE\\s+\\w+\\s*;", "");
                ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
                populator.addScript(new ByteArrayResource(script.getBytes(StandardCharsets.UTF_8)));
                populator.setSqlScriptEncoding("UTF-8");
                populator.execute(dataSource);
            } catch (IOException e) {
                throw new IllegalStateException("Cannot read db/lifeos.sql", e);
            }
            log.info("Database tables created.");
            return;
        }
        String type = jdbc.queryForObject(
                "SELECT DATA_TYPE FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'id'", String.class);
        if (type != null && !type.equalsIgnoreCase("bigint")) {
            throw new IllegalStateException(
                "An OLD 'users' table (id type: " + type + ") exists in the 'lifeos' database. "
                + "Run  DROP DATABASE lifeos;  in MySQL and start the app again (it recreates everything).");
        }
    }
}
