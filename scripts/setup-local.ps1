$ErrorActionPreference = "Stop"

Write-Host "Installing root dependencies..."
npm install

Write-Host "Installing Azure Function dependencies..."
npm install --prefix functions

Write-Host "Generating Prisma client..."
npm run prisma:generate

Write-Host "Setup finished. Copy .env.example to .env and configure values."
