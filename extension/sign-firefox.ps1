# Build and sign the Firefox XPI.
#
# One-time setup:
#   1. Create a free account at https://addons.mozilla.org/developers/
#   2. Open Tools -> Manage API Keys and create a key/secret.
#   3. Run this script from the extension folder:
#        .\sign-firefox.ps1
#
# The signed XPI is written to dist/signed/. Install it on Firefox Android via
# Settings -> About Firefox (tap the logo 5x) -> Install extension from file.

param(
  [string]$ApiKey = $env:AMO_API_KEY,
  [string]$ApiSecret = $env:AMO_API_SECRET
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not $ApiKey) { $ApiKey = Read-Host 'AMO API key' }
if (-not $ApiSecret) { $ApiSecret = Read-Host 'AMO API secret' }

node build-firefox.mjs

npx --yes web-ext sign `
  --source-dir=dist/firefox `
  --artifacts-dir=dist/signed `
  --channel=unlisted `
  "--api-key=$ApiKey" `
  "--api-secret=$ApiSecret"

Get-ChildItem dist\signed\*.xpi | Select-Object FullName, Length
