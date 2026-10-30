param([Parameter(Mandatory=$true)][string]$Executable, [string]$ReportPrefix = "smoke")
$ErrorActionPreference = 'Stop'
$speaker = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
$audioPath = Join-Path $PWD "$ReportPrefix-speech.wav"
$voices = $speaker.GetVoices()
for ($i = 0; $i -lt $voices.Count; $i++) {
  if ($voices.Item($i).GetAttribute('Language') -match '409') { $speaker.Voice = $voices.Item($i); break }
}
$stream.Open($audioPath, 3, $false)
$speaker.AudioOutputStream = $stream
$null = $speaker.Speak('Remember the appointment tomorrow morning at ten. This is a test of offline transcription.')
$stream.Close()
$report = Join-Path $PWD "$ReportPrefix.json"
$process = Start-Process -FilePath $Executable -ArgumentList @('--self-test', '--report', ('"' + $report + '"'), '--audio', ('"' + $audioPath + '"')) -PassThru
if (-not $process.WaitForExit(180000)) { $process.Kill(); throw 'Self-test timeout' }
if (Test-Path $report) { Get-Content $report }
if ($process.ExitCode -ne 0) { throw "Self-test failed: $($process.ExitCode)" }
if (-not (Test-Path $report)) { throw 'Missing self-test report' }
$result = Get-Content $report -Raw | ConvertFrom-Json
if (-not $result.success) { throw 'Self-test report did not pass' }
