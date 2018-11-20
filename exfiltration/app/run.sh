#!/bin/bash

log() {
  echo "Stationeering: $1"
}

abort() {
  if [ $1 -gt 0 ]; then
    log "FAILURE: $2!"
    exit 1
  fi
}

log "Starting exfiltration process..."

dir="/opt/server"

mkdir $dir

log "Downloading beta dedicated server..."
/opt/steamcmd/steamcmd.sh "+login anonymous" "+force_install_dir $dir" "+app_update 600760 -beta beta validate" "+quit"

log "Downloading agent..."
cd $dir/rocketstation_DedicatedServer_Data/Managed/
aws s3 sync s3://stationeering-agent/ .

log "Injecting agent..."
mv Assembly-CSharp.dll Assembly-CSharp.dll.orig




cd $dir
./rocketstation_DedicatedServer.x86_64  -autostart -nographics -batchmode


log "All done!"