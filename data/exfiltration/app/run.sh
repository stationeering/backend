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

log "Starting exfiltration process for branch $BRANCH..."

dir="/opt/server"

mkdir $dir

log "Downloading dedicated server..."

if [ "$BRANCH" == "beta" ]; then
  /opt/steamcmd/steamcmd.sh "+login anonymous" "+force_install_dir $dir" "+app_update 600760 -beta beta validate" "+quit"
else
  BRANCH="public"
  /opt/steamcmd/steamcmd.sh "+login anonymous" "+force_install_dir $dir" "+app_update 600760 validate" "+quit"
fi

log "Downloading agent..."
cd /tmp/
aws s3 sync s3://stationeering-exfiltration-agent/ .
cp /tmp/Agent.dll $dir/rocketstation_DedicatedServer_Data/Managed/

log "Injecting agent..."
cd $dir/rocketstation_DedicatedServer_Data/Managed/
mv Assembly-CSharp.dll Assembly-CSharp.dll-original
mono /tmp/AgentInjector.exe Agent.dll Assembly-CSharp.dll-original Assembly-CSharp.dll Assets.Scripts.GameManager set_GameState

log "Running server with agent..."
cd $dir
./rocketstation_DedicatedServer.x86_64 -autostart -nographics -batchmode

log "Done, copying exfiltrated files to S3..."

mkdir exfiltrated
cd exfiltrated
cp /tmp/*.xml .

aws s3 sync . s3://stationeering-exfiltration-data/$BRANCH/

log "All done!"