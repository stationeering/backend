#!/bin/ash

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

log "Making download directory..."
mkdir -p /tmp/download

log "Copying existing data into it..."
aws s3 sync s3://stationeering-gamedata/ /tmp/download/

log "Downloading public branch..."
mono /opt/depotdownloader/DepotDownloader.exe -app 544550 -beta public -username $STEAM_USERNAME -password $STEAM_PASSWORD -all-platforms -filelist /opt/fetcher/filelist.txt -dir /tmp/download/public/
abort $? "Failed to download public branch!"

log "Downloading beta branch..."
mono /opt/depotdownloader/DepotDownloader.exe -app 544550 -beta beta -username $STEAM_USERNAME -password $STEAM_PASSWORD -all-platforms -filelist /opt/fetcher/filelist.txt -dir /tmp/download/beta/
abort $? "Failed to download beta branch!"

log "Identifying versions..."
PUBLIC_VERSION=`cat /tmp/download/public/rocketstation_Data/StreamingAssets/version.ini | grep UPDATEVERSION | awk -F\  '{ printf $2 }' | sed -r 's/\r//g'`
BETA_VERSION=`cat /tmp/download/beta/rocketstation_Data/StreamingAssets/version.ini | grep UPDATEVERSION | awk -F\  '{ printf $2 }' | sed -r 's/\r//g'`

log "Public: $PUBLIC_VERSION Beta: $BETA_VERSION"

log "Syncronising public download to S3."
aws s3 sync /tmp/download/public s3://stationeering-gamedata/public/ --delete --metadata Branch=public,Version=$PUBLIC_VERSION
abort $? "Failed to public beta branch!"

log "Syncronising beta download to S3."
aws s3 sync /tmp/download/beta s3://stationeering-gamedata/beta/ --delete --metadata Branch=beta,Version=$BETA_VERSION
abort $? "Failed to sync beta branch!"

log "All done!"