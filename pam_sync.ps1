$ORACLE_USER = "zhartanovav"
$ORACLE_PASS = "vV_zZ1141"
$ORACLE_DSN  = "172.31.33.17:1521/gcvp"
$SERVER_URL  = "http://172.16.125.21:3000"
$PUSH_SECRET = "oracle_push_secret_2026"

function Run-OracleSync {
    param(
        [string]$PlanId,
        [string]$Sql
    )

    $tmpSql = "$env:TEMP\ora_${PlanId}_$PID.sql"
    $tmpOut = "$env:TEMP\ora_${PlanId}_$PID.txt"
    $tmpErr = "$env:TEMP\ora_${PlanId}_$PID.err"

    [System.IO.File]::WriteAllText($tmpSql, $Sql.Replace("`n", [System.Environment]::NewLine), [System.Text.Encoding]::ASCII)

    Write-Host "--- Plan ${PlanId}: connecting to Oracle $ORACLE_DSN ..."

    try {
        $p = Start-Process "sqlplus" `
            -ArgumentList "-S `"$ORACLE_USER/$ORACLE_PASS@$ORACLE_DSN`" @`"$tmpSql`"" `
            -RedirectStandardOutput $tmpOut `
            -RedirectStandardError  $tmpErr `
            -Wait -PassThru -NoNewWindow

        if ($p.ExitCode -ne 0) {
            Write-Host "sqlplus error (exit $($p.ExitCode)):"
            Get-Content $tmpErr | Write-Host
            Remove-Item $tmpSql, $tmpOut, $tmpErr -ErrorAction SilentlyContinue
            return
        }
    } catch {
        Write-Host "sqlplus not found. Make sure Oracle Client is in PATH."
        Remove-Item $tmpSql, $tmpOut, $tmpErr -ErrorAction SilentlyContinue
        return
    }

    $lines = Get-Content $tmpOut -Encoding Default `
        | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "^SP2" -and $_ -notmatch "^ORA-" }

    Write-Host "  Rows received: $($lines.Count)"

    if ($lines.Count -eq 0) {
        Write-Host "  No data returned. Check connection or query."
        Remove-Item $tmpSql, $tmpOut, $tmpErr -ErrorAction SilentlyContinue
        return
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

    Write-Host "  Parsed rows: $($oracleRows.Count)"

    $rowJsonParts = $oracleRows | ForEach-Object {
        $pStr = $_.proc.ToString("F2", [System.Globalization.CultureInfo]::InvariantCulture)
        "{`"row`":$($_.row),`"proc`":$pStr}"
    }
    $rowsJson  = "[" + ($rowJsonParts -join ",") + "]"
    $fetchedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $bodyStr   = "{`"secret`":`"$PUSH_SECRET`",`"planId`":$PlanId,`"oracleRows`":$rowsJson,`"fetchedAt`":`"$fetchedAt`"}"
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyStr)

    $url = "$SERVER_URL/api/plans/oracle-push"
    Write-Host "  Sending to $url ..."

    try {
        $resp = Invoke-RestMethod -Uri $url -Method Post `
            -ContentType "application/json" `
            -Body $bodyBytes
        Write-Host "  SUCCESS: regions=$($resp.regions)"
    } catch {
        Write-Host "  Server error: $_"
    }

    Remove-Item $tmpSql, $tmpOut, $tmpErr -ErrorAction SilentlyContinue
}

# Plan 2: column PROC, order by REGION (alphabetical)
$sqlPlan2 = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 50`nSELECT TRIM(TO_CHAR(PROC)) FROM cbdiapp.view_es_vipoln_ipr_qlik ORDER BY REGION;`nEXIT;"

# Plan 4: column PROC_PRO, order by ID
$sqlPlan4 = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 50`nSELECT TRIM(TO_CHAR(PROC_PRO)) FROM cbdiapp.view_45p_mse_16 ORDER BY ID;`nEXIT;"

Run-OracleSync -PlanId 2 -Sql $sqlPlan2
Run-OracleSync -PlanId 4 -Sql $sqlPlan4

Write-Host "Done."
