const AWS = require('aws-sdk');
const S3 = new AWS.S3();

function log(message) {
    console.log("S3Fetcher: " + message);
}

exports.S3Fetcher = async function (event, callback, process, selectCriteria = []) {
    log("Starting...");

    if (event.Records[0].EventSource === "aws:sns") {
        log("Notification in an SNS envelope, removing and parsing JSON.");
        event = JSON.parse(event.Records[0].Sns.Message);
    }

    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;
    var versionId = event.Records[0].s3.object.versionId;
    var operation = event.Records[0].eventName;

    log("Notification for " + operation + " on " + bucket + "/" + key + "@" + (versionId ? versionId : "LATEST"));

    var selected = selectCriteria.every((selectFunc) => selectFunc(bucket, key, operation));

    if (!selected) {
        log("Selectors reject notification.");
        callback(null, "Selection criteria chose not to process S3 message.");
        return;
    }

    var s3Response;

    log("Fetching body from S3...");

    try {
        var request = {
            Bucket: bucket,
            Key: key
        };

        if (versionId) {
            request["VersionId"] = versionId;
        }

        s3Response = await S3.getObject(request).promise();
    } catch (err) {
        callback("Failed to get object from S3 bucket.");
        return;
    }

    var body = s3Response.Body.toString();

    log("Body fetched, " + body.length + " bytes.");

    try {
        log("Passing body to application...");
        await process(key, s3Response.Body.toString());
        log("Application completed work, finished.");
        callback(null, "Application complete work.");
    } catch (err) {
        log("Application threw error, aborting.");
        callback(err);
    }
}
