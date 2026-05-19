# Requires: npm install -g prettier
# Requires: uv tool install ruff
# Requires: uv tool install pyclean

Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "Working directory: $PWD" -ForegroundColor Cyan

.\.venv\Scripts\activate

Write-Host "Formatting JS/TS with Prettier..." -ForegroundColor Cyan
prettier --write "edge/*.{ts,js}"
if ($LASTEXITCODE -ne 0) { throw "prettier format failed" }
Write-Host "Prettier format completed!" -ForegroundColor Green

Write-Host "Formatting Python with Ruff..." -ForegroundColor Cyan
ruff format
if ($LASTEXITCODE -ne 0) { throw "ruff format failed" }
Write-Host "Ruff format completed!" -ForegroundColor Green

Write-Host "Checking Python with Ruff..." -ForegroundColor Cyan
ruff check
if ($LASTEXITCODE -ne 0) { throw "ruff check failed" }
Write-Host "Ruff check completed!" -ForegroundColor Green

Write-Host "Cleaning caches..." -ForegroundColor Cyan
ruff clean
pyclean --debris pytest -v .
if ($LASTEXITCODE -ne 0) { throw "cache cleaning failed" }
Write-Host "Cache cleaning completed!" -ForegroundColor Green

Write-Host "All checks passed!" -ForegroundColor Green
