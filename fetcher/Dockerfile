# Start from alpine.
FROM alpine:latest

# Install Mono
RUN apk add --no-cache mono --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing && \
    apk add --no-cache --virtual=.build-dependencies ca-certificates && \
    cert-sync /etc/ssl/certs/ca-certificates.crt && \
    apk del .build-dependencies

# Install awscli.
RUN apk add --no-cache aws-cli --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing

# Download and install Depot Downloader.
RUN apk add --no-cache curl unzip \
  && curl -L https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_2.2.2/depotdownloader-2.2.2.zip -o /tmp/DepotDownloader.zip \
  && mkdir -p /opt/depotdownloader \
  && unzip /tmp/DepotDownloader.zip -d /opt/depotdownloader

# Copy application.
COPY app /opt/fetcher

# Start Up Script
CMD /opt/fetcher/run.sh

# Clean Up.
RUN rm -rf /tmp/* /var/tmp/*
