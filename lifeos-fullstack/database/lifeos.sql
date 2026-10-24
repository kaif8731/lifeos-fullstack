CREATE DATABASE IF NOT EXISTS lifeos
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
 
USE lifeos;
 
CREATE TABLE users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(80)     NOT NULL,
    email         VARCHAR(254)    NOT NULL,
    password_hash VARCHAR(255)    NOT NULL,
    created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;
 
CREATE TABLE projects (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(120)    NOT NULL,
    description VARCHAR(300)    NULL,
    status      ENUM('active','on-hold','completed') NOT NULL DEFAULT 'active',
    deadline    DATE            NULL,
    created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_projects_user_status (user_id, status),
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
 
CREATE TABLE tasks (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    title      VARCHAR(120)    NOT NULL,
    priority   ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    due_date   DATE            NULL,
    done       BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_tasks_user_done_due (user_id, done, due_date),
    KEY idx_tasks_project (project_id),
    CONSTRAINT fk_tasks_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE events (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    title      VARCHAR(120)    NOT NULL,
    event_date DATE            NOT NULL,
    event_time TIME            NULL,
    note       VARCHAR(300)    NULL,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_events_user_date (user_id, event_date, event_time),
    KEY idx_events_project (project_id),
    CONSTRAINT fk_events_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_events_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE notes (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    title      VARCHAR(120)    NOT NULL,
    content    VARCHAR(2000)   NOT NULL,
    tag        VARCHAR(120)    NULL,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_notes_user_created (user_id, created_at),
    KEY idx_notes_project (project_id),
    CONSTRAINT fk_notes_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_notes_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE expenses (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id      BIGINT UNSIGNED NOT NULL,
    project_id   BIGINT UNSIGNED NULL,
    title        VARCHAR(120)    NOT NULL,
    amount       DECIMAL(12,2)   NOT NULL,
    category     ENUM('Food','Transport','Shopping','Bills','Health','Education','Entertainment','Other') NOT NULL DEFAULT 'Other',
    expense_date DATE            NOT NULL,
    created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_expenses_user_date (user_id, expense_date),
    KEY idx_expenses_project (project_id),
    CONSTRAINT chk_expenses_amount CHECK (amount >= 0),
    CONSTRAINT fk_expenses_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_expenses_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE goals (
    id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED  NOT NULL,
    project_id  BIGINT UNSIGNED  NULL,
    title       VARCHAR(120)     NOT NULL,
    description VARCHAR(300)     NULL,
    target_date DATE             NULL,
    progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at  DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_goals_user_progress (user_id, progress),
    KEY idx_goals_project (project_id),
    CONSTRAINT chk_goals_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT fk_goals_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_goals_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE habits (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    name       VARCHAR(120)    NOT NULL,
    goal       VARCHAR(120)    NULL,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_habits_user_created (user_id, created_at),
    CONSTRAINT fk_habits_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
 
CREATE TABLE habit_logs (
    habit_id BIGINT UNSIGNED NOT NULL,
    log_date DATE            NOT NULL,
    PRIMARY KEY (habit_id, log_date),
    CONSTRAINT fk_habit_logs_habit FOREIGN KEY (habit_id) REFERENCES habits (id) ON DELETE CASCADE
) ENGINE=InnoDB;
 
CREATE TABLE documents (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    title      VARCHAR(120)    NOT NULL,
    category   ENUM('ID','Education','Finance','Medical','Work','Other') NOT NULL DEFAULT 'ID',
    link       VARCHAR(500)    NULL,
    note       VARCHAR(300)    NULL,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_documents_user_category (user_id, category),
    KEY idx_documents_project (project_id),
    CONSTRAINT fk_documents_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_documents_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB;
 
CREATE TABLE hints (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    site       VARCHAR(120)    NOT NULL,
    username   VARCHAR(120)    NULL,
    hint       VARCHAR(300)    NOT NULL,
    created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_hints_user_site (user_id, site),
    CONSTRAINT fk_hints_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;