package main

import (
	"context"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/external"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/s3manager"
	"github.com/kelseyhightower/envconfig"
	"log"
	"net"
	"net/http"
	"time"
)

type Config struct {
	Endpoint string
	Branch   string
	Bucket   string
	Timeout  time.Duration
}

func main() {
	var c Config
	envconfig.MustProcess("agent", &c)

	time.AfterFunc(c.Timeout, func() {
		panic("timeout exceeded waiting for agent work")
	})

	hc := &http.Client{
		Transport: &http.Transport{
			ResponseHeaderTimeout: 2 * time.Second,
			DialContext: (&net.Dialer{
				KeepAlive: 0,
				Timeout:   2 * time.Second,
			}).DialContext,
			MaxIdleConns:        0,
			IdleConnTimeout:     2 * time.Second,
			TLSHandshakeTimeout: 3 * time.Second,
			MaxIdleConnsPerHost: 0,
		},
	}

	awsCfg, err := external.LoadDefaultAWSConfig()
	if err != nil {
		panic(fmt.Errorf("unable to load SDK config %v", err))
	}

	awsCfg.HTTPClient = hc

	s3c := s3.New(awsCfg)
	s3Manager := s3manager.NewUploaderWithClient(s3c)

	fetchAndUpload("/api/stationpedia/ic/instructions", "ic/instructions/%s.json", c, s3Manager, hc)
	fetchAndUpload("/api/stationpedia/ic/enums", "ic/enums/%s.json", c, s3Manager, hc)
	fetchAndUpload("/api/stationpedia/logic/slottypes", "logic/slottypes/%s.json", c, s3Manager, hc)
	fetchAndUpload("/api/stationpedia/logic/types", "logic/types/%s.json", c, s3Manager, hc)
	fetchAndUpload("/api/stationpedia/things", "things/%s.json", c, s3Manager, hc)
}

func fetchAndUpload(apiPath string, objectKey string, config Config, s3m *s3manager.Uploader, hc *http.Client) {
	log.Printf("beginning fetch and upload of %s", apiPath)

	for {
		log.Printf("sleeping before attempt")
		time.Sleep(2 * time.Second)

		apiURL := fmt.Sprintf("%s%s", config.Endpoint, apiPath)
		log.Printf("querying url: %s", apiURL)

		resp, err := hc.Get(apiURL)
		if err != nil {
			log.Printf("failed to query url: %s", err)
			continue
		}

		if resp.StatusCode != 200 {
			log.Printf("failed to query url: status code not 200, was %d", resp.StatusCode)
			continue
		}

		key := fmt.Sprintf(objectKey, config.Branch)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, err = s3m.UploadWithContext(ctx, &s3manager.UploadInput{
			Body:   resp.Body,
			Bucket: aws.String(config.Bucket),
			Key:    aws.String(key),
		})

		cancel()

		if err != nil {
			log.Printf("failed to upload data to %s: %s", key, err)
			continue
		}

		log.Printf("upload compelted")

		return
	}
}
