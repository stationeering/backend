var AWS = require('aws-sdk');

var VALID_BRANCHES = ["public", "beta"];

var LINEBREAK_REGEX = /[\r]?\n/;
var PREPENDED_NOISE_REGEX = /\s?[-]?\s?/;
var REMOVE_HTML_LIKE_REGEX = /<.*>(.*)<.*>/g;
var NOTE_HEADER_REGEX = /(.*Version \d+.\d+.\d+.\d+.*)/;
var VERSION_EXTRACT_REGEX = /(Version|Update) (\d+.\d+.\d+.\d+)/;

const S3 = new AWS.S3();
const DynamoDB = new AWS.DynamoDB();

function log(message) {
    console.log("Stationeering: " + message);
}

function parseFile(contents) {
    log("Parsing version file...");
    var [header, versions] = contents.split("UPDATENOTES=", 2);
    return { current: parseHeader(header), history: parseVersions(versions) };
}

function parseHeader(header) {
    log("Parsing version headers...");
    var headerLines = header.split(LINEBREAK_REGEX).filter(line => line.length !== 0);

    var parsed = headerLines.reduce((map, line) => {
        var [key, value] = line.split("=");
        map[key] = value;
        return map;
    }, {});

    return { version: parseHeaderVersion(parsed["UPDATEVERSION"]), date: parseHeaderDate(parsed["UPDATEDATE"]) };
}

function parseHeaderVersion(version) {
    return version.split(" ", 2)[1];
}

function parseHeaderDate(date) {
    var justDate = date.split(" ", 2)[1];
    var [day, month, year] = justDate.split("/", 3);

    var dayNumber = Number.parseInt(day, 10);
    var monthNumber = Number.parseInt(month, 10) - 1;
    var yearNumber = Number.parseInt(year, 10);

    return new Date(Date.UTC(yearNumber, monthNumber, dayNumber, 0, 0, 0)).valueOf();
}

function parseVersions(raw) {
    log("Parsing version history...");

    var split_notes = raw.split(NOTE_HEADER_REGEX);

    if (split_notes[0].length === 0) {
        split_notes.shift();
    }

    if (split_notes.length % 2 !== 0) {
        log("Notes did not successfully split.");
        return [];
    }

    var versions = [];

    for (var i = 0; i < split_notes.length; i += 2) {
        var version = extractVersion(split_notes[i]);
        var notes = extractNotes(split_notes[i + 1]);

        versions.push({ version: version, notes: notes });
    }

    return versions;
}

function extractNotes(notes) {
    return notes.split(LINEBREAK_REGEX).map(line => line.replace(PREPENDED_NOISE_REGEX, "")).map(line => line.replace(REMOVE_HTML_LIKE_REGEX, "$1")).map(line => line.trim()).filter(line => line.length !== 0);
}

function extractVersion(versionRaw) {
    var version = versionRaw.match(VERSION_EXTRACT_REGEX);

    if (version) {
        return version[2];
    } else {
        return undefined;
    }
}

exports.handler = async function (event, context, callback) {
    if (event.Records[0].EventSource === "aws:sns") {
        event = JSON.parse(event.Records[0].Sns.Message);
    }

    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;
    var versionId = event.Records[0].s3.object.versionId;
    var operation = event.Records[0].eventName;

    if (!operation.startsWith("ObjectCreated")) {
        callback(null, "Not a object create operation, no action.");
        return;
    }

    if (!key.endsWith("version.ini")) {
        callback(null, "Not an update of version information, no action.");
        return;
    }

    var branch = key.split("/", 1)[0];

    if (!VALID_BRANCHES.includes(branch)) {
        callback("Update received for an unknown branch. Branch: " + branch);
        return;
    }

    log("Recieved notification for version update of " + branch + " branch...");

    log("Fetching " + key + "@" + versionId + " from S3 bucket " + bucket + "...");

    var s3Response;

    try {
        s3Response = await S3.getObject({ Bucket: bucket, Key: key, VersionId: versionId }).promise();
    } catch (err) {
        log("Error from S3: " + err);
        callback(null, "Failed to get object from S3 bucket.");
        return;
    }

    log("Fetch complete.");

    var versionData = parseFile(s3Response.Body.toString());

    log("Parse complete.");

    var currentVersion = versionData.current.version;

    var versionHistory = versionData.history.reduce((map, version) => {
        map[version.version] = { version: version.version, notes: version.notes };
        return map;
    }, {});

    if (!versionHistory.hasOwnProperty(currentVersion)) {
        versionHistory[currentVersion] = { version: currentVersion };
    }

    versionHistory[currentVersion]["built"] = versionData.current.date;

    await importHistory(versionHistory);
    await updateBranchState(branch, currentVersion);

    callback(null, "Job done!");
};

async function importHistory(versionHistory) {
    log("Ingest version history...");

    var sortedHistory = Object.keys(versionHistory).sort().reverse();

    for (let version of sortedHistory) {
        if (!await ingestVersion(versionHistory[version])) {
            log("Found that " + version + " was already present with notes. Abandoning.");
            break;
        }
    }
}

async function updateBranchState(branch, version) {
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

function versionAsNumber(version) {
    return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}