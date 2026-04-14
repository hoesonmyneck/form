$ORACLE_USER = "zhartanovav"
$ORACLE_PASS = "vV_zZ1141"
$ORACLE_DSN  = "172.31.33.17:1521/gcvp"
$SERVER_URL  = "http://172.16.125.21:3000"
$PUSH_SECRET = "oracle_push_secret_2026"

$sql = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 50`nSELECT TRIM(TO_CHAR(PROC)) FROM cbdiapp.view_es_vipoln_ipr_qlik ORDER BY REGION;`nEXIT;"

$tmpSql = "$env:TEMP\ora_$PID.sql"
$tmpOut = "$env:TEMP\ora_$PID.txt"
$tmpErr = "$env:TEMP\ora_$PID.err"

[System.IO.File]::WriteAllText($tmpSql, $sql.Replace("`n", [System.Environment]::NewLine), [System.Text.Encoding]::ASCII)

Write-Host "Connecting to Oracle $ORACLE_DSN ..."

try {
    $p = Start-Process "sqlplus" `
        -ArgumentList "-S `"$ORACLE_USER/$ORACLE_PASS@$ORACLE_DSN`" @`"$tmpSql`"" `
        -RedirectStandardOutput $tmpOut `
        -RedirectStandardError  $tmpErr `
        -Wait -PassThru -NoNewWindow

    if ($p.ExitCode -ne 0) {
        Write-Host "sqlplus error (exit $($p.ExitCode)):"
        Get-Content $tmpErr | Write-Host
        exit 1
    }
} catch {
    Write-Host "sqlplus not found. Make sure Oracle Client is in PATH."
    exit 1
}

$lines = Get-Content $tmpOut -Encoding Default `
    | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "^SP2" -and $_ -notmatch "^ORA-" }

Write-Host "Rows received: $($lines.Count)"

if ($lines.Count -eq 0) {
    Write-Host "No data returned. Check connection or query."
    exit 1
}

$oracleRows = @()
$rowNum = 1
foreach ($line in $lines) {
    $procStr = $line.Trim().Replace(",", ".")
    $proc = 0.0
    $ok = [double]::TryParse(
        $procStr,
        [System.Globalization.NumberStyles]::Any,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$proc
    )
    if ($ok) {
        $oracleRows += @{ row = $rowNum; proc = $proc }
    } else {
        Write-Host "  Skipping row $rowNum (not a number): '$line'"
    }
    $rowNum++
}

Write-Host "Parsed rows: $($oracleRows.Count)"

$rowJsonParts = $oracleRows | ForEach-Object {
    $pStr = $_.proc.ToString("F2", [System.Globalization.CultureInfo]::InvariantCulture)
    "{`"row`":$($_.row),`"proc`":$pStr}"
}
$rowsJson   = "[" + ($rowJsonParts -join ",") + "]"
$fetchedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$bodyStr    = "{`"secret`":`"$PUSH_SECRET`",`"oracleRows`":$rowsJson,`"fetchedAt`":`"$fetchedAt`"}"
$bodyBytes  = [System.Text.Encoding]::UTF8.GetBytes($bodyStr)

$url = "$SERVER_URL/api/plans/oracle-push"
Write-Host "Sending to $url ..."

try {
    $resp = Invoke-RestMethod -Uri $url -Method Post `
        -ContentType "application/json" `
        -Body $bodyBytes
    Write-Host "SUCCESS: regions=$($resp.regions)"
} catch {
    Write-Host "Server error: $_"
    exit 1
}

Remove-Item $tmpSql, $tmpOut, $tmpErr -ErrorAction SilentlyContinue

Write-Host "Done."
