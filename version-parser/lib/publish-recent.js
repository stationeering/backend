var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var DynamoDB = new AWS.DynamoDB();
var SNS = new AWS.SNS();

function log(message) {
    console.log("PublishRecent: " + message);
}

function versionAsNumber(version) {
    return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}

exports.publicSpecific = async function publicSpecific(version, update) {
    log("Publishing notification for " + version + " (update? " + update + ")...");

    var params = {
        Key: {
            "game": {
                S: "stationeers"
            },
            "version": {
                N: versionAsNumber(version)
            }
        },
	TableName: "Versions"
    };

    var dynamodb;

    try {
        dynamodb = await DynamoDB.getItem(params).promise();
    } catch (err) {
        log("Couldn't find version to publish! " + err);
        return;
    }

    var message = JSON.stringify({
        operation: (update ? "update" : "create"),
        type: "version",
        version: dynamoDBToPlainObject(dynamodb.Items[0])
    });

    var topic = process.env.ExternalNotificationTopicArn;

    try {
        await SNS.publish({ Message: message, TopicArn: topic }).promise();
        log("Published external notification.")
    } catch (err) {
        log("Failed to notify! " + err)
    }
}

exports.publishRecent = async function publishRecentVersions() {
    log("Retrieving beta version history...");

    var params = {
        ExpressionAttributeNames: {
            "#G": "game",
            "#P": "public_date"
        },
        ExpressionAttributeValues: {
            ":game": {
                S: "stationeers"
            }
        },
        KeyConditionExpression: "#G = :game",
        FilterExpression: "attribute_not_exists(#P)",
        ScanIndexForward: false,
        TableName: "Versions"
    };

    var dynamoResponse;

    try {
        log("Finding unannotated versions via query....");
        dynamoResponse = await DynamoDB.query(params).promise();
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return false;
    }

    var betaItems = dynamoResponse.Items;

    var publicCount = Math.max(5, (15 - betaItems.length));

    log("Retrieving public version history...");

    var params = {
        ExpressionAttributeNames: {
            "#G": "game",
            "#P": "public_date"
        },
        ExpressionAttributeValues: {
            ":game": {
                S: "stationeers"
            }
        },
        KeyConditionExpression: "#G = :game",
        FilterExpression: "attribute_exists(#P)",
        ScanIndexForward: false,
        Limit: publicCount,
        TableName: "Versions"
    };

    try {
        log("Finding unannotated versions via query....");
        dynamoResponse = await DynamoDB.query(params).promise();
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return false;
    }

    var publicItems = dynamoResponse.Items;
    var mergedItems = betaItems.concat(publicItems);

    var outputItems = mergedItems.map((item) => {
        return dynamoDBToPlainObject(item);
    });

    var recentVersionsOutput = JSON.stringify(outputItems);

    try {
        var s3Response = await S3.putObject({ Bucket: "stationeering-data", Key: "versions/recent.json", Body: recentVersionsOutput, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/json" }).promise();
        log("New version file written.");
    } catch (err) {
        log("Failed to push new recent json. " + err);
    }
}

function dynamoDBToPlainObject(item) {
    var output = { version: item.version_text.S, version_number: item.version.N };

    if (item.hasOwnProperty("build_id")) {
        output["build_id"] = item.build_id.N;
    }

    if (item.hasOwnProperty("built_date")) {
        output["built_date"] = item.built_date.N;
    }

    if (item.hasOwnProperty("beta_date")) {
        output["beta_date"] = item.beta_date.N;
    }

    if (item.hasOwnProperty("public_date")) {
        output["public_date"] = item.public_date.N;
    }

    if (item.hasOwnProperty("updated_date")) {
        output["updated_date"] = item.updated_date.N;
    }

    if (item.hasOwnProperty("notes")) {
        output["notes"] = item.notes.L.map((entry) => entry.S);
    }

    return output;
}
