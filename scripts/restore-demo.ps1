$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $projectRoot 'data/runs'
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
foreach ($name in @('latest.json', 'chain.json')) {
    $target = Join-Path $runRoot $name
    if (!(Test-Path -LiteralPath $target)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "data/demo/$name") -Destination $target
    }
}
Write-Output 'Saved reference run restored without replacing existing runs. Verify its Devnet receipts independently.'
