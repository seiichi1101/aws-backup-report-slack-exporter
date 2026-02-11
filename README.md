# AWS Backup Report to Slack Exporter

Automated AWS Backup job reporting to Slack via Lambda function. Generates comprehensive backup statistics and uploads them as CSV files to your Slack channel.

## Features

- 📊 **CSV Export**: Detailed backup job data exported as CSV files
- 🎯 **Resource Tracking**: Complete backup job information by resource type
- 🔔 **Slack Integration**: Automatic file upload to Slack channels with summary
- ⏰ **Scheduled Execution**: Configurable EventBridge schedule (default: monthly)
- 🚀 **One-Click Deployment**: Deploy via CloudFormation
- 🔒 **Secure**: Slack Bot Token stored securely in AWS Systems Manager Parameter Store
- ⚡ **Serverless**: Fully managed solution using AWS Lambda and EventBridge

## Architecture

```
EventBridge Rule (Scheduled)
    ↓
Lambda Function (Node.js)
    ↓
AWS Backup API → List backup jobs
    ↓
Generate CSV Report
    ↓
Slack API (files.uploadV2) → Upload CSV file
```

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Slack Bot Token** with the following scopes:
   - `files:write` - Upload CSV files
   - `chat:write` - Post messages with files
3. **Slack Channel ID** where reports will be posted

### Creating a Slack Bot Token

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app and select your workspace
4. Navigate to "OAuth & Permissions"
5. Add Bot Token Scopes:
   - `files:write`
   - `chat:write`
6. Click "Install to Workspace"
7. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
8. Invite the bot to your channel: `/invite @your-bot-name`
9. Get your Channel ID from Slack (right-click channel → View channel details)

## Quick Deploy

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-orange?logo=amazon-aws&style=for-the-badge)](https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks/quickcreate?templateURL=https://aws-backup-report-slack-exporter-bucket.s3.ap-northeast-1.amazonaws.com/template.yaml&stackName=aws-backup-report-slack-exporter)

**Deployment Steps:**

1. Click the "Deploy to AWS" button above
2. Fill in the parameters:
   - **SlackBotToken**: Your Slack Bot User OAuth Token (`xoxb-...`)
   - **SlackChannelId**: Your Slack Channel ID (e.g., `C05R4FH9UCE`)
   - **ReportPeriodDays**: Number of days to look back (default: 30)
   - **ScheduleExpression**: EventBridge cron expression (default: `cron(0 0 1 * ? *)`)
3. Check "I acknowledge that AWS CloudFormation might create IAM resources"
4. Click "Create stack"

## Manual Deployment

### Build and Deploy

```bash
# 1. Build the CloudFormation template
make build

# 2. Deploy to AWS
make deploy SLACK_BOT_TOKEN=xoxb-your-token SLACK_CHANNEL_ID=C05R4FH9UCE

# Optional: Test locally before deploying
make test-local SLACK_BOT_TOKEN=xoxb-your-token SLACK_CHANNEL_ID=C05R4FH9UCE
```

## Configuration

### Parameters

| Parameter            | Description                                 | Default             | Required |
| -------------------- | ------------------------------------------- | ------------------- | -------- |
| `SlackBotToken`      | Slack Bot User OAuth Token                  | -                   | Yes      |
| `SlackChannelId`     | Slack Channel ID for file uploads           | -                   | Yes      |
| `ReportPeriodDays`   | Number of days to look back for backup jobs | 30                  | No       |
| `ScheduleExpression` | EventBridge schedule expression             | `cron(0 0 1 * ? *)` | No       |

### Schedule Expression Examples

- **Monthly (1st at 00:00 UTC)**: `cron(0 0 1 * ? *)`
- **Weekly (Monday at 09:00 UTC)**: `cron(0 9 ? * MON *)`
- **Daily (00:00 UTC)**: `cron(0 0 * * ? *)`

## Management

### View Logs

```bash
make logs
```

### Invoke Function Manually

```bash
make invoke-remote
```

### Delete Stack

```bash
make destroy
```

## CSV Report Format

The uploaded CSV file contains the following columns:

- BackupJobId
- ResourceType (EC2, RDS, DynamoDB, etc.)
- ResourceArn
- State (COMPLETED, FAILED, RUNNING, etc.)
- CreationDate
- CompletionDate
- BackupSizeInBytes
- BackupVaultName
- RecoveryPointArn
- IamRoleArn
- StatusMessage

## Slack Message Format

The file upload includes a summary message:

```
📊 AWS Backup Report - 2026-02-10
Total: 150 jobs (✅ 145 completed, ❌ 5 failed)
```

## Troubleshooting

### No Backup Jobs Found

- Verify AWS Backup is configured and has run jobs in the specified period
- Check the `ReportPeriodDays` parameter value
- Ensure the Lambda execution role has `backup:ListBackupJobs` permission

### Slack Upload Fails

- Verify the Slack bot token is valid and has required scopes
- Ensure the bot is invited to the target channel
- Check Lambda function logs: `make logs`
- Verify Channel ID is correct (starts with C, G, or D)

### Permission Denied

Ensure your AWS credentials have permission to:

- Create CloudFormation stacks
- Create IAM roles and policies
- Create Lambda functions
- Create EventBridge rules
- Create SSM parameters

## Cost Considerations

- **Lambda**: Free tier includes 1M requests/month. Monthly execution ≈ $0.00
- **EventBridge**: Free tier includes 1M events/month. Monthly execution ≈ $0.00
- **Parameter Store**: Standard parameters are free
- **Total estimated cost**: ~$0.00/month for typical usage

## References

- [AWS Backup Documentation](https://docs.aws.amazon.com/aws-backup/)
- [Slack Bot Tokens](https://api.slack.com/authentication/token-types#bot)
- [Slack files.uploadV2 API](https://api.slack.com/messaging/files)
- [EventBridge Schedule Expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
