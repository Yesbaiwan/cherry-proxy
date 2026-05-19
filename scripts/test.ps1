Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "Working directory: $PWD" -ForegroundColor Cyan

Write-Host "Activating virtual environment..." -ForegroundColor Cyan
.\.venv\Scripts\activate
if (-not $?) { throw "Failed to activate virtual environment" }
Write-Host "Virtual environment activated!" -ForegroundColor Green

Write-Host "`nRunning all tests..." -ForegroundColor Cyan
python -m pytest tests/ -v
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
Write-Host "`nAll tests passed!" -ForegroundColor Green