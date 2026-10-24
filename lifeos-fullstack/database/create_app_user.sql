-- Recommended for production: do NOT run the website as MySQL "root".
-- Run as root/admin once, then use lifeos_app in DB_USERNAME / DB_PASSWORD.
CREATE USER IF NOT EXISTS 'lifeos_app'@'%' IDENTIFIED BY 'CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON lifeos.* TO 'lifeos_app'@'%';
FLUSH PRIVILEGES;
