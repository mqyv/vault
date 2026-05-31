@echo off
title Vault Installer
echo.
echo   Telechargement de l'installeur Vault...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.ps1 | iex"
echo.
echo   Tu peux fermer cette fenetre.
pause >nul
