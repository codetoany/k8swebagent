param(
  [string]$HostName = "172.29.7.88",
  [string]$Username = "root",
  [string]$PasswordFile,
  [string]$WorkspaceRoot = "E:\\code\\devops\\k8s",
  [string]$ProjectName = "k8sAgent",
  [string]$RemoteBasePath = "/home/soft/k8s",
  [string]$AppPort = "80"
)

$ErrorActionPreference = "Stop"
Import-Module Posh-SSH

if (-not $PasswordFile -or -not (Test-Path $PasswordFile)) {
  throw "PasswordFile is required."
}

$archivePath = Join-Path $env:TEMP "$ProjectName-sync.tar"
if (Test-Path $archivePath) {
  Remove-Item $archivePath -Force
}

tar.exe --exclude=.git --exclude=node_modules --exclude=dist --exclude=backend/bin --exclude=.env -cf $archivePath -C $WorkspaceRoot $ProjectName

$password = Get-Content -Path $PasswordFile -Raw
$password = $password.Trim()
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($Username, $securePassword)

$session = New-SSHSession -ComputerName $HostName -Credential $credential -AcceptKey
try {
  $remoteArchive = "$RemoteBasePath/$ProjectName-sync.tar"
  Invoke-SSHCommand -SessionId $session.SessionId -Command "mkdir -p $RemoteBasePath" -TimeOut 60000 | Out-Null
  Set-SCPItem -ComputerName $HostName -Credential $credential -AcceptKey -Path $archivePath -Destination $RemoteBasePath -NewName "$ProjectName-sync.tar"

  $remoteScript = @"
set -e
mkdir -p $RemoteBasePath
rm -rf $RemoteBasePath/$ProjectName
tar -xf $remoteArchive -C $RemoteBasePath
printf 'APP_PORT=$AppPort\n' > $RemoteBasePath/$ProjectName/.env
cd $RemoteBasePath/$ProjectName
docker-compose up -d --build k8s-agent-api k8s-agent-frontend
"@

  $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $remoteScript -TimeOut 1800000
  $result.Output | ForEach-Object { $_ }

  if ($result.ExitStatus -ne 0) {
    throw "Remote deploy failed with status $($result.ExitStatus)"
  }
}
finally {
  if ($session) {
    Remove-SSHSession -SessionId $session.SessionId | Out-Null
  }
}
