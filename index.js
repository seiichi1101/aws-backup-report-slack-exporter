const https = require("https");
const {
  BackupClient,
  ListBackupJobsCommand,
} = require("@aws-sdk/client-backup");
const SLACK_PATH = process.env.SLACK_PATH;
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
const REPORT_PERIOD_DAYS = parseInt(process.env.REPORT_PERIOD_DAYS || "31");

/**
 * Lambda handler function for AWS Backup Report to Slack
 */
exports.handler = async (event) => {
  console.log("Starting AWS Backup report generation...");

  try {
    // Get all backup jobs with full details
    const allJobs = await listAllBackupJobs(REPORT_PERIOD_DAYS);
    console.log(`Retrieved ${allJobs.length} backup jobs`);

    // Generate CSV content
    const csvContent = generateCSV(allJobs);
    console.log(`Generated CSV with ${csvContent.split("\n").length - 1} rows`);

    // Calculate statistics
    const stats = calculateStats(allJobs);

    // Upload CSV file to Slack
    await uploadFileToSlack(csvContent, stats);

    console.log(
      `Successfully sent backup report to Slack. Total jobs: ${allJobs.length}`
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Report sent successfully",
        totalJobs: allJobs.length,
      }),
    };
  } catch (error) {
    console.error("Error generating backup report:", error);
    throw error;
  }
};

/**
 * List all backup jobs from AWS Backup with full details
 */
async function listAllBackupJobs(periodDays) {
  const client = new BackupClient({});
  const allJobs = [];

  // Calculate time range
  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - periodDays);

  let nextToken;
  do {
    const command = new ListBackupJobsCommand({
      ByCreatedAfter: startTime,
      ByCreatedBefore: endTime,
      NextToken: nextToken,
    });

    const result = await client.send(command);
    allJobs.push(...result.BackupJobs);

    nextToken = result.NextToken;
  } while (nextToken);

  return allJobs;
}

/**
 * Calculate statistics from backup jobs
 */
function calculateStats(allJobs) {
  const stats = {
    completed: 0,
    failed: 0,
    running: 0,
    aborted: 0,
    expired: 0,
    total: allJobs.length,
  };

  const jobsByResource = {};

  for (const job of allJobs) {
    switch (job.State) {
      case "COMPLETED":
        stats.completed++;
        break;
      case "FAILED":
        stats.failed++;
        break;
      case "RUNNING":
      case "CREATED":
      case "PENDING":
        stats.running++;
        break;
      case "ABORTED":
        stats.aborted++;
        break;
      case "EXPIRED":
        stats.expired++;
        break;
    }

    // Group by resource type
    if (job.ResourceType) {
      if (!jobsByResource[job.ResourceType]) {
        jobsByResource[job.ResourceType] = [];
      }
      jobsByResource[job.ResourceType].push(job);
    }
  }

  stats.jobsByResource = jobsByResource;
  return stats;
}

/**
 * Generate CSV content from backup jobs
 */
function generateCSV(allJobs) {
  // CSV header
  const headers = [
    "BackupJobId",
    "ResourceType",
    "ResourceArn",
    "State",
    "CreationDate",
    "CompletionDate",
    "BackupSizeInBytes",
    "BackupVaultName",
    "RecoveryPointArn",
    "IamRoleArn",
    "StatusMessage",
  ];

  const rows = [headers.join(",")];

  // CSV data rows
  for (const job of allJobs) {
    const row = [
      escapeCSV(job.BackupJobId || ""),
      escapeCSV(job.ResourceType || ""),
      escapeCSV(job.ResourceArn || ""),
      escapeCSV(job.State || ""),
      job.CreationDate ? new Date(job.CreationDate).toISOString() : "",
      job.CompletionDate ? new Date(job.CompletionDate).toISOString() : "",
      job.BackupSizeInBytes || "",
      escapeCSV(job.BackupVaultName || ""),
      escapeCSV(job.RecoveryPointArn || ""),
      escapeCSV(job.IamRoleArn || ""),
      escapeCSV(job.StatusMessage || ""),
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
}

/**
 * Escape CSV field
 */
function escapeCSV(field) {
  if (typeof field !== "string") {
    return field;
  }
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Upload CSV file to Slack using the new files.uploadV2 API workflow
 * This replaces the deprecated files.upload method
 */
async function uploadFileToSlack(csvContent, stats) {
  const now = new Date();
  const dateStr = now.toISOString().substring(0, 10);
  const filename = `aws-backup-report-${dateStr}.csv`;
  const filesize = Buffer.byteLength(csvContent);

  // Calculate date range
  const endDateStr = now.toISOString().substring(0, 10);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - REPORT_PERIOD_DAYS);
  const startDateStr = startDate.toISOString().substring(0, 10);

  // Step 1: Request upload URL from Slack
  const { upload_url, file_id } = await getUploadURL(filename, filesize);

  // Step 2: Upload file content to the provided URL
  await uploadFileToURL(upload_url, csvContent);

  // Step 3: Complete the upload and share to channel
  const comment = `📊 AWS Backup Report\nPeriod: ${startDateStr} to ${endDateStr} (${REPORT_PERIOD_DAYS} days)\nTotal: ${stats.total} jobs (✅ ${stats.completed} completed, ❌ ${stats.failed} failed)`;
  await completeUpload(file_id, filename, comment);

  console.log("File uploaded to Slack successfully");
}

/**
 * Step 1: Request upload URL from Slack API
 * Uses files.getUploadURLExternal to get a presigned URL for file upload
 */
function getUploadURL(filename, filesize) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      filename: filename,
      length: filesize.toString(),
    }).toString();

    const options = {
      hostname: "slack.com",
      port: 443,
      path: "/api/files.getUploadURLExternal",
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(`Slack API error: ${response.error}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Slack response: ${err.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Step 2: Upload file content to the presigned URL
 * This URL was obtained from files.getUploadURLExternal
 */
function uploadFileToURL(uploadUrl, content) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
        "Content-Length": Buffer.byteLength(content),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`File upload failed with status ${res.statusCode}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(content);
    req.end();
  });
}

/**
 * Step 3: Complete the file upload and share to Slack channel
 * Uses files.completeUploadExternal to finalize the upload
 */
function completeUpload(fileId, title, initialComment) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      files: [
        {
          id: fileId,
          title: title,
        },
      ],
      channel_id: SLACK_CHANNEL,
      initial_comment: initialComment,
    });

    const options = {
      hostname: "slack.com",
      port: 443,
      path: "/api/files.completeUploadExternal",
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(`Slack API error: ${response.error}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Slack response: ${err.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
