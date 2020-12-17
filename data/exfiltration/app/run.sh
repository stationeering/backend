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
aws s3 sync s3://stationeering-exfiltration-agent/ $dir

log "Running server with stationeers-webapi..."
cd $dir
chmod a+x run_bepinex.sh
./run_bepinex.sh | tee serverlog &

SERVER_PID=$!
log "Server pid is: $SERVER_PID"

log "Running exfiltation agent..."
chmod a+x agent
AGENT_ENDPOINT=http://localhost:4444 AGENT_BRANCH=$BRANCH AGENT_BUCKET=stationeering-exfiltration-data AGENT_TIMEOUT=10m ./agent

log "Killing server!"
kill -9 $SERVER_PID

log "All done!"
