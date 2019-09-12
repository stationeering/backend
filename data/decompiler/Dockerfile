# Start from Microsoft dotnet base, really Debian stretch under the hood.
FROM microsoft/dotnet:latest

# Install awscli.
RUN apt-get update && apt-get install -y python python-pip && \
    pip install awscli

# Install Git.
RUN apt-get install -y git

# Instal ilspycmd.
RUN dotnet tool install ilspycmd -g

# Copy application.
COPY app /opt/decompiler

# Start Up Script
CMD /opt/decompiler/run.sh

# Clean Up.
RUN rm -rf /tmp/* /var/tmp/*
