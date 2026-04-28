param(
    [ValidateSet("all", "daily", "plan4")]
    [string]$RunMode = "all"
)

$RunMode = $RunMode.ToLower()

$ORACLE_USER = "zhartanovav"
$ORACLE_PASS = "vV_zZ1141"
$ORACLE_DSN  = "172.31.33.17:1521/gcvp"
$SERVER_URL  = "http://172.16.125.21:3000"
$PUSH_SECRET = "oracle_push_secret_2026"

function Remove-TempFiles {
    param(
        [string[]]$Paths
    )

    foreach ($path in $Paths) {
        if (-not $path) { continue }
        try {
            if ([System.IO.File]::Exists($path)) {
                [System.IO.File]::Delete($path)
            }
        } catch {
            # Ignore temp cleanup failures.
        }
    }
}

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
            Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
            return
        }
    } catch {
        Write-Host "sqlplus not found. Make sure Oracle Client is in PATH."
        Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
        return
    }

    $lines = Get-Content $tmpOut -Encoding Default `
        | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "^SP2" -and $_ -notmatch "^ORA-" }

    Write-Host "  Rows received: $($lines.Count)"

    if ($lines.Count -eq 0) {
        Write-Host "  No data returned. Check connection or query."
        Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
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

    Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
}

# Для плана 5:
#   view_omk_2         -> берём T_1PRIZN_INV (знаменатель)
#   v_omk_inspect_2    -> берём INSPECT (числитель)
# Процент = INSPECT / T_1PRIZN_INV * 100
function Run-OracleSyncPlan5 {
    $PlanId = 5
    $Sql = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 120`nSELECT TRIM(v1.REGION) || ':' || TRIM(TO_CHAR(ROUND((NVL(v2.INSPECT, 0) / NULLIF(v1.T_1PRIZN_INV, 0)) * 100, 2))) FROM cbdiapp.view_omk_2 v1 LEFT JOIN (SELECT TRIM(ID) AS ID, SUM(NVL(INSPECT,0)) AS INSPECT FROM cbdiapp.v_omk_inspect_2 GROUP BY TRIM(ID)) v2 ON TRIM(v1.REG_ID) = v2.ID WHERE NVL(v1.T_1PRIZN_INV, 0) > 0 ORDER BY v1.REG_ID;`nEXIT;"

    $tmpSql = "$env:TEMP\ora_5_$PID.sql"
    $tmpOut = "$env:TEMP\ora_5_$PID.txt"
    $tmpErr = "$env:TEMP\ora_5_$PID.err"

    [System.IO.File]::WriteAllText($tmpSql, $Sql.Replace("`n", [System.Environment]::NewLine), [System.Text.Encoding]::ASCII)

    Write-Host "--- Plan 5: connecting to Oracle $ORACLE_DSN ..."

    try {
        $p = Start-Process "sqlplus" `
            -ArgumentList "-S `"$ORACLE_USER/$ORACLE_PASS@$ORACLE_DSN`" @`"$tmpSql`"" `
            -RedirectStandardOutput $tmpOut `
            -RedirectStandardError  $tmpErr `
            -Wait -PassThru -NoNewWindow

        if ($p.ExitCode -ne 0) {
            Write-Host "sqlplus error (exit $($p.ExitCode)):"
            Get-Content $tmpErr | Write-Host
            Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
            return
        }
    } catch {
        Write-Host "sqlplus not found."
        Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
        return
    }

    $lines = Get-Content $tmpOut -Encoding Default `
        | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "^SP2" -and $_ -notmatch "^ORA-" }

    Write-Host "  Rows received: $($lines.Count)"

    if ($lines.Count -eq 0) {
        Write-Host "  No data returned."
        Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
        return
    }

    $oracleRows = @()
    foreach ($line in $lines) {
        # Формат строки: "НазваниеРегиона:ПроцентноеЗначение"
        $colonIdx = $line.LastIndexOf(":")
        if ($colonIdx -le 0) {
            Write-Host "  Skipping (no separator): '$line'"
            continue
        }

        $regName = $line.Substring(0, $colonIdx).Trim()
        $procStr = $line.Substring($colonIdx + 1).Trim().Replace(",", ".")

        if ($regName -eq "") {
            Write-Host "  Skipping (empty region name)"
            continue
        }

        $proc   = 0.0
        $okProc = [double]::TryParse($procStr, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$proc)
        if (-not $okProc) {
            Write-Host "  Skipping '$regName' (bad proc): '$procStr'"
            continue
        }

        $oracleRows += @{ regName = $regName; proc = $proc }
    }

    Write-Host "  Parsed rows: $($oracleRows.Count)"

    $rowJsonParts = $oracleRows | ForEach-Object {
        $pStr    = $_.proc.ToString("F2", [System.Globalization.CultureInfo]::InvariantCulture)
        $escaped = $_.regName.Replace('"', '\"')
        "{`"regName`":`"$escaped`",`"proc`":$pStr}"
    }
    $rowsJson  = "[" + ($rowJsonParts -join ",") + "]"
    $fetchedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $bodyStr   = "{`"secret`":`"$PUSH_SECRET`",`"planId`":5,`"oracleRows`":$rowsJson,`"fetchedAt`":`"$fetchedAt`"}"
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

    Remove-TempFiles -Paths @($tmpSql, $tmpOut, $tmpErr)
}

# Plan 2: column PROC, order by REGION (alphabetical)
$sqlPlan2 = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 50`nSELECT TRIM(TO_CHAR(PROC)) FROM cbdiapp.view_es_vipoln_ipr_qlik ORDER BY REGION;`nEXIT;"

# Plan 4: column PROC_PRO, order by ID
$sqlPlan4 = "SET PAGESIZE 0`nSET FEEDBACK OFF`nSET HEADING OFF`nSET LINESIZE 50`nSELECT TRIM(TO_CHAR(PROC_PRO)) FROM cbdiapp.view_45p_mse_16 ORDER BY ID;`nEXIT;"

switch ($RunMode) {
    "all" {
        Write-Host "Run mode: all (plans 2, 4, 5)"
        Run-OracleSync -PlanId 2 -Sql $sqlPlan2
        Run-OracleSync -PlanId 4 -Sql $sqlPlan4
        Run-OracleSyncPlan5
    }
    "daily" {
        Write-Host "Run mode: daily (plans 2, 5)"
        Run-OracleSync -PlanId 2 -Sql $sqlPlan2
        Run-OracleSyncPlan5
    }
    "plan4" {
        Write-Host "Run mode: plan4 only"
        Run-OracleSync -PlanId 4 -Sql $sqlPlan4
    }
    default {
        Write-Host "Unknown mode '$RunMode'. Allowed: all, daily, plan4"
        exit 1
    }
}

Write-Host "Done. Mode=$RunMode"
