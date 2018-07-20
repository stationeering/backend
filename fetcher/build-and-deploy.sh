#!/bin/bash

# Log into ECR
`AWS_PROFILE=deploy aws ecr get-login --no-include-email`

# Build
docker build -t 432708775807.dkr.ecr.eu-west-1.amazonaws.com/backend/fetcher:latest .

# Push
docker push 432708775807.dkr.ecr.eu-west-1.amazonaws.com/backend/fetcher:latest
