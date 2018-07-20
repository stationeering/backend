var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var DynamoDB = new AWS.DynamoDB();

function log(message) {
    console.log("PublishRecent: " + message);
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
        var output = { version: item.version_text.S };

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
    });

    var recentVersionsOutput = JSON.stringify(outputItems);

    try {
        var s3Response = await S3.putObject({ Bucket: "stationeering-data", Key: "versions/recent.json", Body: recentVersionsOutput, CacheControl: "max-age=900,no-cache,no-store,must-revalidate" }).promise()
    } catch (err) {
        log("Failed to push new recent json. " + err);
    }
}
