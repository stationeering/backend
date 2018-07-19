var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();

function log(message) {
    console.log("DynamoDBSync: " + message);
}

exports.importHistory = async function importHistory(versionHistory) {
    log("Ingest version history...");

    var sortedHistory = Object.keys(versionHistory).sort().reverse();

    var successCount = 0;

    for (let version of sortedHistory) {
        if (!await ingestVersion(versionHistory[version])) {
            log("Found that " + version + " was already present with notes. Abandoning.");
            break;
        } else {
            successCount++;
        }
    }

    return successCount > 0;
}

async function ingestVersion(versionData) {
    log("Ingest: " + versionData.version);

    var key = {
        "game": {
            S: "stationeers"
        },
        "version": {
            N: versionAsNumber(versionData.version)
        },
    };

    var date = Date.now().toString();
    var params;

    if (!versionData.notes) {
        params = {
            Key: key,
            ExpressionAttributeNames: {
                "#L": "updated_date",
                "#V": "version",
                "#VT": "version_text"
            },
            ExpressionAttributeValues: {
                ":l": { N: date },
                ":vt": { S: versionData.version }
            },
            UpdateExpression: "SET #L = :l, #VT = :vt",
            ConditionExpression: "attribute_not_exists(#V)",
            ReturnValues: "NONE",
            TableName: "Versions"
        };
    } else {
        var notes = versionData.notes.map((note) => {
            return { S: note };
        });

        params = {
            Key: key,
            ExpressionAttributeNames: {
                "#N": "notes",
                "#L": "updated_date",
                "#VT": "version_text"
            },
            ExpressionAttributeValues: {
                ":n": { L: notes },
                ":l": { N: date },
                ":vt": { S: versionData.version }
            },
            UpdateExpression: "SET #N = :n, #L = :l, #VT = :vt",
            ConditionExpression: "attribute_not_exists(#N)",
            ReturnValues: "NONE",
            TableName: "Versions",
        };
    }

    if (versionData.built) {
        params.ExpressionAttributeNames["#B"] = "built_date";
        params.ExpressionAttributeValues[":b"] = { N: versionData.built.toString() };
        params.UpdateExpression = params.UpdateExpression + ", #B = :b";
    }

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Updated DynamoDB record.");
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return false;
    }

    return true;
}

exports.updateBranchState = async function updateBranchState(branch, version) {
    log("Modifying branch state...");
    log("Updating versions as old as or older than " + version + " to be current for " + branch + "...");

    var branchDateField = branch + "_date";

    var params = {
        ExpressionAttributeNames: {
            "#G": "game",
            "#V": "version",
            "#VT": "version_text",
            "#B": branchDateField
        },
        ExpressionAttributeValues: {
            ":game": {
                S: "stationeers"
            },
            ":version": {
                N: versionAsNumber(version)
            }
        },
        ProjectionExpression: "#VT",
        KeyConditionExpression: "#G = :game AND #V <= :version",
        FilterExpression: "attribute_not_exists(#B)",
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

    var versionsToUpdate = dynamoResponse.Items.map((res) => res.version_text.S)
    var date = Date.now().toString();

    for (let version of versionsToUpdate) {
        await updateBranchStateOnVersion(version, branch, date);
    }

    log("Finished version annotation.");

    return versionsToUpdate.length > 0;
}

async function updateBranchStateOnVersion(version, branch, date) {
    log("Updating branch state '" + branch + "' for version " + version + "...");

    var branchDateField = branch + "_date";

    var params = {
        Key: {
            "game": {
                S: "stationeers"
            },
            "version": {
                N: versionAsNumber(version)
            }
        },
        ExpressionAttributeNames: {
            "#B": branchDateField
        },
        ExpressionAttributeValues: {
            ":b": { N: date }
        },
        UpdateExpression: "SET #B = :b",
        ConditionExpression: "attribute_not_exists(#B)",
        ReturnValues: "NONE",
        TableName: "Versions"
    };

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Updated DynamoDB record.");
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return false;
    }
}

function versionAsNumber(version) {
    return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}