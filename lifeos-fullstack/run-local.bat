@echo off
setlocal
echo ===== LifeOS =====
where java >nul 2>nul || (echo [ERROR] Java is not installed or not in PATH. Install JDK 17 or newer: https://adoptium.net & pause & exit /b 1)
where mvn  >nul 2>nul || (echo [ERROR] Maven is not installed or not in PATH. Install it: https://maven.apache.org/download.cgi  ^(or open this folder in IntelliJ IDEA and run LifeosApplication^) & pause & exit /b 1)
echo Starting... when you see "Started LifeosApplication", open  http://localhost:8080  in your browser.
echo Keep this window open while you use the website.
mvn spring-boot:run
pause
