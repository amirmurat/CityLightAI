$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
$assets = @(
    @{Name='yolox_s.onnx'; Url='https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx'; Hash='c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063'},
    @{Name='intersection.mp4'; Url='https://videos.pexels.com/video-files/3052883/3052883-uhd_3840_2160_30fps.mp4'; Hash='696e2ef56c16038ff4c94c84a046bf3fff2605d0bf049cbef7f1b5e1a81ad55e'}
)
foreach ($asset in $assets) {
    $target = Join-Path $assetRoot $asset.Name
    if (!(Test-Path -LiteralPath $target)) { Invoke-WebRequest -Uri $asset.Url -OutFile $target }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $asset.Hash) { throw "Unexpected bytes for $($asset.Name). Do not use this asset until its provenance is reviewed." }
    Write-Output "Verified $($asset.Name)"
}
