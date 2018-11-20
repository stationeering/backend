# Start from ubuntu.
FROM ubuntu:16.04

# Install Mono.
RUN apt-get update && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF && \
    apt-get install -y apt-transport-https && \
    echo "deb https://download.mono-project.com/repo/ubuntu stable-xenial main" | tee /etc/apt/sources.list.d/mono-official-stable.list && \
    apt update && \
    apt-get install -y mono-runtime libmono-system-core4.0-cil

# Install awscli.
RUN apt-get install -y python3 python3-setuptools && \
    easy_install3 pip && \
    pip install awscli

# Download and install SteamCMD.
RUN apt-get install -y curl lib32gcc1 \
    && mkdir -p /opt/steamcmd \
    && curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf - -C /opt/steamcmd \
    && /opt/steamcmd/steamcmd.sh "+login anonymous" +quit

# Copy application.
COPY app /opt/exfiltration

# Start Up Script
CMD /opt/exfiltration/run.sh

# Clean Up.
RUN rm -rf /tmp/* /var/tmp/*
