@echo off
rem Starts the BennieTech site on http://localhost:8080  (requires Node.js)
cd /d "%~dp0"
start "" http://localhost:8080
node server.js
