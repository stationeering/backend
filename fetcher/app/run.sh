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

value=`aws ssm get-parameter --name "/steam/username" --with-decryption --query Parameter.Value`
abort $? "Failed to get /steam/username"
STEAM_USERNAME=`echo $value | sed -e 's/^"//' -e 's/"$//'`

value=`aws ssm get-parameter --name "/steam/password" --with-decryption --query Parameter.Value`
abort $? "Failed to get /steam/password"
STEAM_PASSWORD=`echo $value | sed -e 's/^"//' -e 's/"$//'`

log "Loaded credentials for steam user '$STEAM_USERNAME'."

log "Find steam depot info for Stationeers..."
/opt/steamcmd/steamcmd.sh "+login anonymous" "+app_info_print 544550" "+quit" > /tmp/stationeers.vdf

do_branch() {
  branch=$1

  value=`aws ssm get-parameter --name "/steam/depot/$branch" --with-decryption --query Parameter.Value`
  abort $? "Failed to get /steam/depot/$branch"
  LAST_DEPOT_ID=`echo $value | sed -e 's/^"//' -e 's/"$//'`

  CURRENT_DEPOT_ID=`python3 /opt/fetcher/process.py /tmp/stationeers.vdf $branch buildid`
  abort $? "Failed to read VDF data from Steam"

  echo "Branch $branch: Current Depot ID: $CURRENT_DEPOT_ID Last Seen Depot ID: $LAST_DEPOT_ID"

  if [ $CURRENT_DEPOT_ID -le $LAST_DEPOT_ID ]; then
    log "No update for $branch, last depot id $LAST_DEPOT_ID and current depot id $CURRENT_DEPOT_ID."
    return
  fi

  CURRENT_DEPOT_LAST_UPDATED=`python3 /opt/fetcher/process.py /tmp/stationeers.vdf $branch timeupdated`
  download_dir=/tmp/download/$branch

  log "Making download directory..."
  mkdir -p $download_dir

  log "Copying existing data into it..."
  cd $download_dir
  aws s3 sync s3://stationeering-gamedata/$branch .
  
  log "Downloading $branch from steam..."
  mono /opt/depotdownloader/DepotDownloader.exe -app 544550 -beta $branch -username $STEAM_USERNAME -password $STEAM_PASSWORD -all-platforms -filelist /opt/fetcher/filelist.txt -dir $download_dir
  abort $? "Failed to download public branch!"

  log "Identifying versions..."
  VERSION=`cat $download_dir/rocketstation_Data/StreamingAssets/version.ini | grep UPDATEVERSION | awk -F\  '{ printf $2 }' | sed -r 's/\r//g'`
  log "Branch: $branch Version: $VERSION"

  log "Annotating version.ini..."
  mv $download_dir/rocketstation_Data/StreamingAssets/version.ini $download_dir/rocketstation_Data/StreamingAssets/version.ini.orig
  echo "STEAM_BUILDID=$CURRENT_DEPOT_ID" >> $download_dir/rocketstation_Data/StreamingAssets/version.ini
  echo "STEAM_TIMEUPDATED=$CURRENT_DEPOT_LAST_UPDATED" >> $download_dir/rocketstation_Data/StreamingAssets/version.ini
  cat $download_dir/rocketstation_Data/StreamingAssets/version.ini.orig >> $download_dir/rocketstation_Data/StreamingAssets/version.ini

  log "Syncronising $branch download to S3."
  aws s3 sync $download_dir s3://stationeering-gamedata/$branch/ --delete --metadata Branch=$branch,Version=$VERSION
  abort $? "Failed to public beta branch!"

  aws ssm put-parameter --name "/steam/depot/$branch" --value $CURRENT_DEPOT_ID --type String --overwrite
  abort $? "Failed to update build id in SSM!"
}

do_branch beta
do_branch public

log "All done!"