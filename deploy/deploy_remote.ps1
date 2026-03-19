param(
  [string]$HostName = "172.29.7.88",
  [string]$Username = "root",
  [string]$PasswordFile,
  [string]$WorkspaceRoot = "E:\\code\\devops\\k8s",
  [string]$ProjectName = "k8sAgent",
  [string]$RemoteBasePath = "/home/soft/k8s",
  [string]$AppPort = "80",
  [string]$ClusterConsoleEnabled = "false",
  [string]$ClusterConsoleSessionTimeoutSeconds = "1800",
  [string]$ClusterConsoleShellPath = "/bin/sh",
  [string]$ClusterConsoleKubectlPath = "kubectl",
  [string]$HostShellEnabled = "false",
  [string]$HostShellSessionTimeoutSeconds = "1800",
  [string]$HostShellNamespace = "k8s-agent-system",
  [string]$HostShellDaemonSetName = "k8s-agent-host-shell",
  [string]$HostShellPodLabelSelector = "app.kubernetes.io/name=k8s-agent-host-shell",
  [string]$HostShellContainerName = "host-shell",
  [string]$HostShellShellPath = "/bin/sh",
  [string]$HostShellEnterCommand = "nsenter -t 1 -m -u -i -n -p -- chroot /proc/1/root /bin/sh -l"
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
env_file=$RemoteBasePath/$ProjectName/.env
touch "\$env_file"
update_env() {
  key="\$1"
  value="\$2"
  if grep -q "^\${key}=" "\$env_file"; then
    sed -i "s|^\${key}=.*|\${key}=\${value}|" "\$env_file"
  else
    printf '%s=%s\n' "\$key" "\$value" >> "\$env_file"
  fi
}
update_env APP_PORT "$AppPort"
update_env CLUSTER_CONSOLE_ENABLED "$ClusterConsoleEnabled"
update_env CLUSTER_CONSOLE_SESSION_TIMEOUT_SECONDS "$ClusterConsoleSessionTimeoutSeconds"
update_env CLUSTER_CONSOLE_SHELL_PATH "$ClusterConsoleShellPath"
update_env CLUSTER_CONSOLE_KUBECTL_PATH "$ClusterConsoleKubectlPath"
update_env HOST_SHELL_ENABLED "$HostShellEnabled"
update_env HOST_SHELL_SESSION_TIMEOUT_SECONDS "$HostShellSessionTimeoutSeconds"
update_env HOST_SHELL_NAMESPACE "$HostShellNamespace"
update_env HOST_SHELL_DAEMONSET_NAME "$HostShellDaemonSetName"
update_env HOST_SHELL_POD_LABEL_SELECTOR "$HostShellPodLabelSelector"
update_env HOST_SHELL_CONTAINER_NAME "$HostShellContainerName"
update_env HOST_SHELL_SHELL_PATH "$HostShellShellPath"
update_env HOST_SHELL_ENTER_COMMAND "$HostShellEnterCommand"
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
