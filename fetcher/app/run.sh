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
/opt/steamcmd/steamcmd.sh "+login $STEAM_USERNAME $STEAM_PASSWORD" "+app_info_print 544550" "+quit" > /tmp/stationeers.vdf

log "Find steam depot info for Stationeers Dedicated Server..."
/opt/steamcmd/steamcmd.sh "+login anonymous" "+app_info_print 600760" "+quit" > /tmp/stationeers_server.vdf

do_branch() {
  branch=$1
  appid=$2
  vdf=$3
  server=$4
  filelist=$5

  if [ $server = "true" ]; then
    prefix="server-$branch"
  else
    prefix=$branch
  fi

  log "Fetching last depot processed."
  value=`aws ssm get-parameter --name "/steam/depot/$prefix" --with-decryption --query Parameter.Value`
  abort $? "Failed to get /steam/depot/$prefix"
  LAST_DEPOT_ID=`echo $value | sed -e 's/^"//' -e 's/"$//'`

  CURRENT_DEPOT_ID=`python3 /opt/fetcher/process.py $vdf $branch buildid $appid`
  abort $? "Failed to read VDF data from Steam"

  echo "Branch $branch: Current Depot ID: $CURRENT_DEPOT_ID Last Seen Depot ID: $LAST_DEPOT_ID"

  if [ $CURRENT_DEPOT_ID -le $LAST_DEPOT_ID ]; then
    log "No update for $branch, last depot id $LAST_DEPOT_ID and current depot id $CURRENT_DEPOT_ID."
    return
  fi

  CURRENT_DEPOT_LAST_UPDATED=`python3 /opt/fetcher/process.py $vdf $branch timeupdated $appid`
  download_dir=/tmp/download/$branch

  log "Making download directory..."
  mkdir -p $download_dir

  log "Copying existing data into it..."
  aws s3 sync s3://stationeering-gamedata/$prefix $download_dir
  
  log "Downloading $branch from steam..."
  if [ $server = "true" ]; then
    mono /opt/depotdownloader/DepotDownloader.exe -app $appid -beta $branch -filelist $filelist -dir $download_dir
  else
    mono /opt/depotdownloader/DepotDownloader.exe -app $appid -beta $branch -username $STEAM_USERNAME -password $STEAM_PASSWORD -all-platforms -filelist $filelist -dir $download_dir
  fi

  log "Downloading manifest to allow removal of files..."
  if [ $server = "true" ]; then
    mono /opt/depotdownloader/DepotDownloader.exe -app $appid -beta $branch -filelist $filelist -dir $download_dir -manifest-only
  else
    mono /opt/depotdownloader/DepotDownloader.exe -app $appid -beta $branch -username $STEAM_USERNAME -password $STEAM_PASSWORD -all-platforms -filelist $filelist -dir $download_dir -manifest-only
  fi
  manifest_file=$download_dir/manifest_*.txt

  abort $? "Failed to download branch!"

  log "Remove files which are no longer present."
  cd $download_dir
  find . -type f -print | cut -sd / -f 2- | grep -Fxvf $manifest_file | xargs -d'\n' rm  
  cd /

  if [ $server = "true" ]; then
    log "Server Path"

    VERSION=`strings $download_dir/rocketstation_DedicatedServer_Data/Managed/Assembly-CSharp.dll | egrep '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | tail -n 1`
    log "Branch: $branch Version: $VERSION"

    log "Constructing fake version.ini..."
    mkdir -p $download_dir/rocketstation_DedicatedServer_Data/StreamingAssets
    echo "STEAM_BUILDID=$CURRENT_DEPOT_ID" > $download_dir/rocketstation_DedicatedServer_Data/StreamingAssets/version.ini
    echo "STEAM_TIMEUPDATED=$CURRENT_DEPOT_LAST_UPDATED" >> $download_dir/rocketstation_DedicatedServer_Data/StreamingAssets/version.ini
    echo "UPDATEVERSION=Update $VERSION" >> $download_dir/rocketstation_DedicatedServer_Data/StreamingAssets/version.ini
  else
    log "Client Path"

    log "Identifying versions..."
    VERSION=`cat $download_dir/rocketstation_Data/StreamingAssets/version.ini | grep UPDATEVERSION | awk -F\  '{ printf $2 }' | sed -r 's/\r//g'`
    log "Branch: $branch Version: $VERSION"

    log "Annotating version.ini..."
    mv $download_dir/rocketstation_Data/StreamingAssets/version.ini $download_dir/rocketstation_Data/StreamingAssets/version.ini.orig
    echo "STEAM_BUILDID=$CURRENT_DEPOT_ID" > $download_dir/rocketstation_Data/StreamingAssets/version.ini
    echo "STEAM_TIMEUPDATED=$CURRENT_DEPOT_LAST_UPDATED" >> $download_dir/rocketstation_Data/StreamingAssets/version.ini
    cat $download_dir/rocketstation_Data/StreamingAssets/version.ini.orig >> $download_dir/rocketstation_Data/StreamingAssets/version.ini
  fi

  log "Syncronising $branch download to S3."
  aws s3 sync $download_dir s3://stationeering-gamedata/$prefix/ --delete --metadata Branch=$branch,Version=$VERSION
  abort $? "Failed to public beta branch!"

  aws ssm put-parameter --name "/steam/depot/$prefix" --value $CURRENT_DEPOT_ID --type String --overwrite
  abort $? "Failed to update build id in SSM!"

  log "Clear up temporary download directory."
  rm -Rf $download_dir
}

do_branch beta 544550 /tmp/stationeers.vdf false /opt/fetcher/filelist.txt
do_branch public 544550 /tmp/stationeers.vdf false /opt/fetcher/filelist.txt

do_branch beta 600760 /tmp/stationeers_server.vdf true /opt/fetcher/filelist.server.txt
do_branch public 600760 /tmp/stationeers_server.vdf true /opt/fetcher/filelist.server.txt

log "All done!"