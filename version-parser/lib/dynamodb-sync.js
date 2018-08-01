var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var { publicSpecific } = require('./publish-recent');

function log(message) {
    console.log("DynamoDBSync: " + message);
}

exports.importHistory = async function importHistory(branch, versionHistory, latestDate) {
    log("Ingest version history...");

    var sortedHistory = Object.keys(versionHistory).sort().reverse();

    var successCount = 0;

    for (let version of sortedHistory) {
        if (await ingestVersion(branch, versionHistory[version], latestDate)) {
            log("Found that " + version + " was already present with notes. Abandoning.");
            break;
        } else {
            successCount++;
        }
    }

    return successCount > 0;
}

async function ingestVersion(branch, versionData, latestDate) {
    log("Ingest: " + versionData.version + " onto " + branch);

    if (branch === "public") {
        await updatePublicDate(versionData, latestDate);
    }

    return (await insertVersionIfDoesntExist(branch, versionData, latestDate) && await updateVersionNotesIfNotPresent(branch, versionData, latestDate));
}

async function updatePublicDate(versionData, latestDate) {
    log("Performing: " + versionData.version + ": Update public date.")

    var params = {
        Key: generateDynamoDBKey(versionData),
        ReturnValues: "NONE",
        TableName: "Versions",
        ConditionExpression: "attribute_exists(#V)",
        ExpressionAttributeNames: {
            "#V": "version",
            "#P": "public_date",
            "#L": "updated_date"
        },
        ExpressionAttributeValues: {
            ":p": { N: latestDate },
            ":l": { N: Date.now().toString() }
        },
        UpdateExpression: "SET #P = :p, #L = :l"
    }

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Completed insert.");

        await publicSpecific(versionData.version, true);
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return false;
    }

    return true;
}

async function insertVersionIfDoesntExist(branch, versionData, latestDate) {
    log("Performing: " + versionData.version + ": Insert new version if it doesn't exist.")

    var params = {
        Key: generateDynamoDBKey(versionData),
        ReturnValues: "NONE",
        TableName: "Versions",
        ConditionExpression: "attribute_not_exists(#V)",
        ExpressionAttributeNames: {
            "#V": "version",
        }
    }

    params = convertVersionDataToParams(params, branch, versionData, latestDate);

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Completed insert.");
        await publicSpecific(versionData.version, false);
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return true;
    }

    return false;
}

async function updateVersionNotesIfNotPresent(branch, versionData) {
    log("Performing: " + versionData.version + ": Update version with notes if not present.")

    if (!versionData.notes) {
        log(versionData.version + " does not have notes block to update.")
        return false;
    }

    var params = {
        Key: generateDynamoDBKey(versionData),
        ReturnValues: "NONE",
        TableName: "Versions",
        ConditionExpression: "attribute_exists(#V) AND attribute_not_exists(#N)",
        ExpressionAttributeNames: {
            "#V": "version",
            "#N": "notes",
            "#L": "last_updated"
        },
        ExpressionAttributeValues: {
            ":n": {
                L: versionData.notes.map((note) => {
                    return { S: note };
                })
            },
            ":l": { N: Date.now().toString() }
        },
        UpdateExpression: "SET #N = :n, #L = :l"
    }

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Completed insert.");
        await publicSpecific(versionData.version, true);
    } catch (err) {
        log("DynamoDB Failed! " + err);
        return true;
    }

    return false;
}

function convertVersionDataToParams(params, branch, versionData, latestDate) {
    var names = params.ExpressionAttributeNames;
    var values = {};
    var updateExpressions = [];

    names["#version_text"] = "version_text";
    values[":version_text"] = { S: versionData.version };
    updateExpressions.push("#version_text = :version_text");

    if (versionData.notes) {
        names["#notes"] = "notes";
        values[":notes"] = {
            L: versionData.notes.map((note) => {
                return { S: note };
            })
        };

        updateExpressions.push("#notes = :notes");
    }

    if (versionData.build_id) {
        names["#build_id"] = "build_id";
        values[":build_id"] = { N: versionData.build_id };
        updateExpressions.push("#build_id = :build_id");
    }

    if (versionData.built) {
        names["#built_date"] = "built_date";
        values[":built_date"] = { N: versionData.built.toString() };
        updateExpressions.push("#built_date = :built_date");
    }

    names["#beta_date"] = "beta_date";
    values[":beta_date"] = { N: latestDate };
    updateExpressions.push("#beta_date = :beta_date");

    if (branch === "public") {
        names["#public_date"] = "public_date";
        values[":public_date"] = { N: latestDate };
        updateExpressions.push("#public_date = :public_date");
    }

    names["#updated_date"] = "updated_date";
    values[":updated_date"] = { N: Date.now().toString() };
    updateExpressions.push("#updated_date = :updated_date");

    var expression = "SET " + updateExpressions.join(", ");    
    return { ...params, ExpressionAttributeNames: names, ExpressionAttributeValues: values, UpdateExpression: expression };
}

function generateDynamoDBKey(versionData) {
    return {
        "game": {
            S: "stationeers"
        },
        "version": {
            N: exports.versionAsNumber(versionData.version)
        },
    };
}

exports.updateBranchState = async function updateBranchState(branch, version, latestDate) {
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
                N: exports.versionAsNumber(version)
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

    for (let version of versionsToUpdate) {
        await updateBranchStateOnVersion(version, branch, latestDate);
        await publicSpecific(version, true);
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
                N: exports.versionAsNumber(version)
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

exports.versionAsNumber = function versionAsNumber(version) {
    return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}