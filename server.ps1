param(
  [int]$Port = 4173,
  [string]$SheetUrl = $env:SHEET_CSV_URL
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Any, $Port)
$listener.Server.DualMode = $true
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds(8)
$httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("RealtimeQuestionDrill/1.0")

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".csv"  = "text/csv; charset=utf-8"
  ".svg"  = "image/svg+xml"
}

function Send-Response {
  param($Stream, [int]$Status, [byte[]]$Body, [string]$ContentType)
  $reason = switch ($Status) { 200 { "OK" } 403 { "Forbidden" } 404 { "Not Found" } default { "Bad Gateway" } }
  $headers = "HTTP/1.1 $Status $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
  $Stream.Flush()
}

function Send-Text {
  param($Stream, [int]$Status, [string]$Text, [string]$ContentType = "application/json; charset=utf-8")
  Send-Response $Stream $Status ([Text.Encoding]::UTF8.GetBytes($Text)) $ContentType
}

function Get-QueryValue {
  param([Uri]$Uri, [string]$Name)
  foreach ($pair in $Uri.Query.TrimStart("?").Split("&", [StringSplitOptions]::RemoveEmptyEntries)) {
    $parts = $pair.Split("=", 2)
    if ([Uri]::UnescapeDataString($parts[0]) -eq $Name) {
      return [Uri]::UnescapeDataString($parts[1].Replace("+", " "))
    }
  }
  return $null
}

function Get-NormalizedSheetUrl {
  param([string]$InputUrl)
  $uri = [Uri]$InputUrl
  if ($uri.Scheme -ne "https" -or $uri.Host -notin @("docs.google.com", "script.google.com")) {
    throw "Provide a Google Sheets or Apps Script HTTPS URL."
  }
  if ($uri.Host -eq "script.google.com" -or $uri.Query -match "(output|format)=csv") {
    return $uri.AbsoluteUri
  }
  $match = [regex]::Match($uri.AbsolutePath, "/spreadsheets/d/([^/]+)")
  if (-not $match.Success) { throw "The Google Sheets URL is invalid." }
  $gidMatch = [regex]::Match($uri.Query + $uri.Fragment, "(?:[?&#])gid=([^&#]+)")
  $gid = if ($gidMatch.Success) { [Uri]::UnescapeDataString($gidMatch.Groups[1].Value) } else { "0" }
  return "https://docs.google.com/spreadsheets/d/$($match.Groups[1].Value)/export?format=csv&gid=$([Uri]::EscapeDataString($gid))"
}

function Get-QuestionsPayload {
  param([string]$Source)
  if ([string]::IsNullOrWhiteSpace($Source)) {
    $csv = [IO.File]::ReadAllText((Join-Path $root "data/questions.csv"), [Text.Encoding]::UTF8)
    return @{ type = "csv"; source = "Local demo data"; data = $csv; fetchedAt = [DateTime]::UtcNow.ToString("o") }
  }
  if ($Source.Length -gt 2048) { throw "The URL is too long." }
  $target = Get-NormalizedSheetUrl $Source
  $response = $httpClient.GetAsync($target).GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) { throw "Could not fetch the spreadsheet ($([int]$response.StatusCode))." }
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $mediaType = $response.Content.Headers.ContentType.MediaType
  $type = if ($mediaType -match "json") { "json" } else { "csv" }
  $data = if ($type -eq "json") { $content | ConvertFrom-Json } else { $content }
  return @{ type = $type; source = "Connected spreadsheet"; data = $data; fetchedAt = [DateTime]::UtcNow.ToString("o") }
}

$listener.Start()
Write-Host "Question Drill is running at http://localhost:$Port"

$clients = [Collections.Generic.List[Net.Sockets.TcpClient]]::new()
$acceptedAt = @{}

try {
  while ($true) {
    while ($listener.Pending()) {
      $newClient = $listener.AcceptTcpClient()
      $newClient.NoDelay = $true
      $clients.Add($newClient)
      $acceptedAt[$newClient.GetHashCode()] = [DateTime]::UtcNow
    }

    foreach ($client in @($clients)) {
      $stream = $null
      $reader = $null
      $clientKey = $client.GetHashCode()
      try {
        $stream = $client.GetStream()
        if (-not $stream.DataAvailable) {
          if ([DateTime]::UtcNow - $acceptedAt[$clientKey] -gt [TimeSpan]::FromSeconds(15)) {
            $client.Close()
            $null = $clients.Remove($client)
            $acceptedAt.Remove($clientKey)
          }
          continue
        }

        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
        while (-not [string]::IsNullOrEmpty($reader.ReadLine())) { }
        $target = $requestLine.Split(" ")[1]
        $requestUri = [Uri]("http://localhost" + $target)

        if ($requestUri.AbsolutePath -eq "/api/questions") {
          $querySource = Get-QueryValue $requestUri "source"
          $source = if ($querySource) { $querySource } else { $SheetUrl }
          $payload = Get-QuestionsPayload $source
          Send-Text $stream 200 ($payload | ConvertTo-Json -Depth 8 -Compress)
          continue
        }
        if ($requestUri.AbsolutePath -eq "/api/health") {
          Send-Text $stream 200 '{"ok":true}'
          continue
        }

        $relative = if ($requestUri.AbsolutePath -eq "/") { "index.html" } else { [Uri]::UnescapeDataString($requestUri.AbsolutePath.TrimStart("/")) }
        $filePath = [IO.Path]::GetFullPath((Join-Path $root $relative))
        if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($filePath)) {
          Send-Text $stream 404 "Not found" "text/plain; charset=utf-8"
          continue
        }
        $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
        Send-Response $stream 200 ([IO.File]::ReadAllBytes($filePath)) $contentType
      } catch {
        $message = @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
        try { Send-Text $stream 502 $message } catch { }
      } finally {
        if ($reader) { $reader.Dispose() }
        if ($stream -and $stream.DataAvailable) { $stream.Dispose() }
        if ($client.Client -eq $null -or -not $client.Connected -or $reader) {
          $client.Close()
          $null = $clients.Remove($client)
          $acceptedAt.Remove($clientKey)
        }
      }
    }

    Start-Sleep -Milliseconds 10
  }
} finally {
  $listener.Stop()
  $listener.Close()
  $httpClient.Dispose()
}
