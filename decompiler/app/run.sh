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

log "Starting sync process..."

value=`aws ssm get-parameter --name "/decompiler/git/username" --with-decryption --query Parameter.Value`
abort $? "Failed to get /decompiler/git/username"
DECOMPILER_USERNAME=`echo $value | sed -e 's/^"//' -e 's/"$//'`

value=`aws ssm get-parameter --name "/decompiler/git/password" --with-decryption --query Parameter.Value`
abort $? "Failed to get /decompiler/git/password"
DECOMPILER_PASSWORD=`echo $value | sed -e 's/^"//' -e 's/"$//'`

log "Loaded credentials for git user '$DECOMPILER_USERNAME'."

mkdir -p /tmp/work/git

log "Downloading Assembly-CSharp.dll..."
aws s3 cp s3://stationeering-gamedata/beta/rocketstation_Data/Managed/Assembly-CSharp.dll /tmp/work
log "Downloading version.ini..."
aws s3 cp s3://stationeering-gamedata/beta/rocketstation_Data/StreamingAssets/version.ini /tmp/work

log "Clone src..."
git clone https://$DECOMPILER_USERNAME:$DECOMPILER_PASSWORD@git.ilus.io/Stationeering/Assembly-CSharp.git /tmp/work/git

log "Decompiling..."
/root/.dotnet/tools/ilspycmd /tmp/work/Assembly-CSharp.dll -p -o /tmp/work/git/src

cd /tmp/work/git

git config --global user.name "Stationeering Decompiler"
git config --global user.email "decompiler@stationeering.com"

log "Pushing back into git..."
VERSION=`cat /tmp/work/version.ini | grep UPDATEVERSION | awk -F\  '{ printf $2 }' | sed -r 's/\r//g'`
git add .
git commit -am "$VERSION"
git push

log "All done!"