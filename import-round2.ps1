$functionUrl = "https://gqk793zi.function2.insforge.app"
$jsonPath = "C:\Users\madhv\Downloads\coderelay_round2_questions.json"

if (-not $importSecret) {
    throw "The `$importSecret variable is not set. Generate the secret in this PowerShell window first."
}

if (-not (Test-Path $jsonPath)) {
    throw "Dataset file not found: $jsonPath"
}

$dataset = Get-Content $jsonPath -Raw | ConvertFrom-Json

$dataset | Add-Member `
    -NotePropertyName "import_secret" `
    -NotePropertyValue $importSecret `
    -Force

$body = $dataset | ConvertTo-Json -Depth 100 -Compress

Write-Host "Sending CodeRelay Round 2 dataset..."
Write-Host "Questions: $($dataset.questions.Count)"

$response = Invoke-WebRequest `
    -Uri $functionUrl `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

Write-Host ""
Write-Host "Function response:"
Write-Host $response.Content