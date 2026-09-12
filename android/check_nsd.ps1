$path = 'C:\Users\Ammar\AppData\Local\Android\Sdk\platforms\android-35\android.jar'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
$found = $false
foreach($entry in $zip.Entries) {
    if($entry.FullName -like '*NsdManager*') {
        Write-Host "Found: $($entry.FullName)"
        $found = $true
        break
    }
}
if(!$found) {
    Write-Host "Not found"
}
$zip.Dispose()
