param([Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$hashStream = [System.IO.File]::OpenRead([System.IO.Path]::GetFullPath($ArchivePath))
$hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
try {
    $digest = [BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream)).Replace('-', '')
    [pscustomobject]@{ Algorithm = 'SHA256'; Hash = $digest; Path = [System.IO.Path]::GetFullPath($ArchivePath) }
}
finally { $hashStream.Dispose(); $hashAlgorithm.Dispose() }
