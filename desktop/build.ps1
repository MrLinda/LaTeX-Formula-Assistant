# 构建 onedir 绿色版，并压成 zip。
#
# 用法（仓库根目录）：
#     .\desktop\build.ps1
#
# 成功后 desktop\dist\ 下会得到：
#     LaTeX-Formula-Assistant\       可双击运行的自包含目录
#     LaTeX-Formula-Assistant.zip    可直接分发的压缩包
#
# 排查打包期问题时加控制台：
#     $env:LFA_DEBUG_CONSOLE = "1"; .\desktop\build.ps1

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot   # desktop/，spec 与产物都在这

# 虚拟环境在仓库根目录（desktop 的上一级）
$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "未找到 .venv（$repoRoot\.venv）。请先在仓库根创建虚拟环境并安装依赖。"
}

& $python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "未安装 PyInstaller。请执行：uv pip install --python `"$python`" pyinstaller"
}

Write-Host "==> 清理旧产物"
Remove-Item -Recurse -Force "build", "dist" -ErrorAction SilentlyContinue

Write-Host "==> PyInstaller 构建（onedir）"
& $python -m PyInstaller --noconfirm LaTeXFormulaAssistant.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 构建失败" }

$distDir = Join-Path $PSScriptRoot "dist\LaTeX-Formula-Assistant"
if (-not (Test-Path -LiteralPath $distDir)) { throw "未找到构建产物：$distDir" }

$zipPath = Join-Path $PSScriptRoot "dist\LaTeX-Formula-Assistant.zip"
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
Write-Host "==> 压缩"
Compress-Archive -Path $distDir -DestinationPath $zipPath -CompressionLevel Optimal

$zipMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
$dirMB = [math]::Round((Get-ChildItem $distDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)

Write-Host ""
Write-Host "构建完成"
Write-Host "  目录    $distDir  ($dirMB MB)"
Write-Host "  压缩包  $zipPath  ($zipMB MB)"
