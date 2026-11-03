@echo off
setlocal
title Ammamas Billing - Package and Push

REM ============================================================
REM  Package the project into copy.zip (secrets excluded) and
REM  push the source to GitHub. Double-click to run.
REM  Change REPO below only if the GitHub repo ever moves.
REM ============================================================
set "REPO=https://github.com/CodeName-R4M/ammamas-billing.git"
set "ZIPNAME=copy.zip"
REM ============================================================

cd /d "%~dp0"

echo ============================================================
echo   Ammamas Billing - Package and Push
echo   Folder: %CD%
echo ============================================================
echo.

REM ---------- 1. Build the zip ----------
echo [1/3] Creating %ZIPNAME% ...
if exist "%ZIPNAME%" del /f /q "%ZIPNAME%"

tar -a -c -f "%ZIPNAME%" ^
 --exclude=.env ^
 --exclude=./.env ^
 --exclude=./.env.local ^
 --exclude=./.env.*.local ^
 --exclude=./node_modules ^
 --exclude=./.git ^
 --exclude=./dist ^
 --exclude=./dist-ssr ^
 --exclude=./backup ^
 --exclude=./.firebase ^
 --exclude=./.gradle ^
 --exclude=./android/.gradle ^
 --exclude=./android/.idea ^
 --exclude=./android/build ^
 --exclude=./android/app/build ^
 --exclude=./android/capacitor-cordova-android-plugins/build ^
 --exclude=./supabase/.temp ^
 --exclude=./%ZIPNAME% ^
 --exclude=*.log ^
 .

if errorlevel 1 (
  echo       [ERROR] Could not create %ZIPNAME%.
  goto :fail
)

REM ---------- 1b. Make sure no secret slipped into the archive ----------
powershell -NoProfile -Command "if ((& tar -tf '%ZIPNAME%') -contains './.env') { exit 1 }"
if errorlevel 1 (
  echo       [ERROR] .env found inside %ZIPNAME% - aborting.
  goto :fail
)

for %%A in ("%ZIPNAME%") do echo       OK - %%~nxA, %%~zA bytes

REM ---------- 2. Commit to git ----------
echo.
echo [2/3] Committing ...

if not exist ".git" (
  echo       No git repo here - initialising ...
  git init
)

git ls-files --error-unmatch .env >nul 2>&1
if not errorlevel 1 (
  echo       [ERROR] .env is tracked by git and would be pushed. Fix once with:
  echo               git rm --cached .env
  goto :fail
)

git add -A
if errorlevel 1 (
  echo       [ERROR] git add failed.
  goto :fail
)

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "snapshot %DATE% %TIME%"
) else (
  echo       Nothing new to commit.
)

REM ---------- 3. Push to GitHub ----------
echo.
echo [3/3] Pushing to GitHub ...

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo       Adding remote origin %REPO%
  git remote add origin %REPO%
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"

git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo       [ERROR] Push failed. Check the messages above. Common causes:
  echo         - The GitHub repo does not exist yet - create it empty first:
  echo               %REPO%
  echo         - The repo already has commits - run:
  echo               git pull --rebase origin %BRANCH%
  echo           then run this script again.
  goto :fail
)

echo.
echo ============================================================
echo   Done. %ZIPNAME% created and %BRANCH% pushed to GitHub.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo *** Stopped. See the messages above. ***
echo.
pause
exit /b 1
