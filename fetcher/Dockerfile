# Start from ubuntu.
FROM ubuntu:16.04

# Install Mono.
RUN apt-get update && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    apt-get install -y apt-transport-https && \
    echo "deb https://download.mono-project.com/repo/ubuntu stable-xenial main" | tee /etc/apt/sources.list.d/mono-official-stable.list && \
    apt update && \
    apt-get install -y mono-runtime

# Install awscli.
RUN apt-get install -y python3 python3-setuptools && \
    easy_install3 pip && \
    pip install awscli

# Download and install Depot Downloader.
RUN apt-get install -y curl unzip \
  && curl -L https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_2.2.2/depotdownloader-2.2.2.zip -o /tmp/DepotDownloader.zip \
  && mkdir -p /opt/depotdownloader \
  && unzip /tmp/DepotDownloader.zip -d /opt/depotdownloader

# Download and install SteamCMD.
RUN apt-get install -y lib32gcc1 \
    && mkdir -p /opt/steamcmd \
    && curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf - -C /opt/steamcmd \
    && /opt/steamcmd/steamcmd.sh "+login anonymous" +quit

# Install VDF Library
RUN pip install vdf

# Copy application.
COPY app /opt/fetcher

# Start Up Script
CMD /opt/fetcher/run.sh

# Clean Up.
RUN rm -rf /tmp/* /var/tmp/*
