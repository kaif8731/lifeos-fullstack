#!/usr/bin/env sh
echo "===== LifeOS ====="
command -v java >/dev/null || { echo "[ERROR] Java is not installed. Install JDK 17+."; exit 1; }
command -v mvn  >/dev/null || { echo "[ERROR] Maven is not installed."; exit 1; }
echo 'Starting... when you see "Started LifeosApplication" open http://localhost:8080'
mvn spring-boot:run
