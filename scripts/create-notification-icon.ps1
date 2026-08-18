param(
    [string]$Source = "public/Logo_DKPM.png"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$workspace = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $workspace $Source
if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Logo tidak ditemukan: $sourcePath"
}

$sizes = [ordered]@{
    'drawable-mdpi' = 24
    'drawable-hdpi' = 36
    'drawable-xhdpi' = 48
    'drawable-xxhdpi' = 72
    'drawable-xxxhdpi' = 96
}

$sourceBitmap = [System.Drawing.Bitmap]::new($sourcePath)
try {
    $silhouette = [System.Drawing.Bitmap]::new($sourceBitmap.Width, $sourceBitmap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        for ($y = 0; $y -lt $sourceBitmap.Height; $y++) {
            for ($x = 0; $x -lt $sourceBitmap.Width; $x++) {
                $pixel = $sourceBitmap.GetPixel($x, $y)
                $alpha = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
                $silhouette.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            }
        }

        foreach ($entry in $sizes.GetEnumerator()) {
            $targetDirectory = Join-Path $workspace "android/app/src/main/res/$($entry.Key)"
            New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

            $size = [int]$entry.Value
            $canvas = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($canvas)
                try {
                    $graphics.Clear([System.Drawing.Color]::Transparent)
                    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

                    $padding = [Math]::Max(2, [Math]::Round($size * 0.10))
                    $available = $size - (2 * $padding)
                    $scale = [Math]::Min($available / $silhouette.Width, $available / $silhouette.Height)
                    $width = [Math]::Round($silhouette.Width * $scale)
                    $height = [Math]::Round($silhouette.Height * $scale)
                    $left = [Math]::Round(($size - $width) / 2)
                    $top = [Math]::Round(($size - $height) / 2)
                    $graphics.DrawImage($silhouette, $left, $top, $width, $height)
                }
                finally {
                    $graphics.Dispose()
                }

                $outputPath = Join-Path $targetDirectory 'ic_stat_dkpm.png'
                $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
                Write-Host "Dibuat: $outputPath"
            }
            finally {
                $canvas.Dispose()
            }
        }
    }
    finally {
        $silhouette.Dispose()
    }
}
finally {
    $sourceBitmap.Dispose()
}
