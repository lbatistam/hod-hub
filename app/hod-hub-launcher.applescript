use scripting additions

property hodURL : "http://localhost:8787/production/inicio.html"
property healthURL : "http://127.0.0.1:8787/api/health"
property projectFolder : "/Users/leandro/Documents/HOD Workspace/apps/hod-hub"
property nodeExecutable : "/Users/leandro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

on serverIsReady()
  try
    do shell script "/usr/bin/curl --silent --fail --max-time 1 " & quoted form of healthURL
    return true
  on error
    return false
  end try
end serverIsReady

on openHodHub()
  if serverIsReady() is false then
    try
      set launcherScript to projectFolder & "/scripts/start-server.mjs"
      do shell script quoted form of nodeExecutable & " " & quoted form of launcherScript
    on error errorMessage
      display alert "Não foi possível iniciar o HOD Hub" message errorMessage as critical
      tell me to quit
    end try
    repeat 40 times
      delay 0.25
      if serverIsReady() then exit repeat
    end repeat
  end if
  if serverIsReady() then
    open location hodURL
  else
    display alert "HOD Hub não respondeu" message "Abra o terminal e verifique o servidor do HOD Hub." as warning
  end if
  tell me to quit
end openHodHub

on run
  my openHodHub()
end run

on reopen
  my openHodHub()
end reopen
