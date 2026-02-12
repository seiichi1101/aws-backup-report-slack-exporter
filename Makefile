include .env

test:
	SLACK_TOKEN=${SLACK_TOKEN} SLACK_CHANNEL=${SLACK_CHANNEL} node test.js

build:
	@node build.js

deploy:
	@aws s3 cp ./out/template.yaml s3://aws-backup-report-slack-exporter-bucket
