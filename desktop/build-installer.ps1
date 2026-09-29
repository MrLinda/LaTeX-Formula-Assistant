# 构建桌面版并使用 Inno Setup 生成单文件安装包。
#
# 用法（仓库根目录）：
#     .\desktop\build-installer.ps1
#
# 已经运行过 build.ps1、只想重新编译安装包时：
#     .\desktop\build-installer.ps1 -SkipAppBuild

param(
    [switch]$SkipAppBuild
)

$ErrorActionPreference = "Stop"
$desktopDir = $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopDir

if (-not $SkipAppBuild) {
    & (Join-Path $desktopDir "build.ps1")
    if ($LASTEXITCODE -ne 0) { throw "桌面版构建失败" }
}

$appExe = Join-Path $desktopDir "dist\LaTeX-Formula-Assistant\LaTeX-Formula-Assistant.exe"
if (-not (Test-Path -LiteralPath $appExe)) {
    throw "未找到桌面版产物：$appExe。请先运行 desktop\build.ps1。"
}

$isccCandidates = @(
    $env:INNO_ISCC,
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 7\ISCC.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 7\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 7\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$iscc = $isccCandidates | Select-Object -First 1
if (-not $iscc) {
    throw "未找到 Inno Setup 编译器。请安装 Inno Setup 7，或通过 INNO_ISCC 指定 ISCC.exe。"
}

$pyproject = Get-Content -LiteralPath (Join-Path $desktopDir "pyproject.toml")
$versionMatch = $pyproject | Select-String -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
if (-not $versionMatch) { throw "无法从 desktop\pyproject.toml 读取版本号" }
$appVersion = $versionMatch.Matches[0].Groups[1].Value

Write-Host "==> Inno Setup 构建安装包（版本 $appVersion）"
Push-Location $desktopDir
try {
    & $iscc "/DAppVersion=$appVersion" "installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup 构建失败" }
} finally {
    Pop-Location
}

$setupExe = Join-Path $desktopDir "dist\installer\LaTeX-Formula-Assistant-Setup-$appVersion.exe"
if (-not (Test-Path -LiteralPath $setupExe)) { throw "未找到安装包：$setupExe" }

$sizeMB = [math]::Round((Get-Item -LiteralPath $setupExe).Length / 1MB, 1)
Write-Host ""
Write-Host "安装包构建完成"
Write-Host "  $setupExe  ($sizeMB MB)"
