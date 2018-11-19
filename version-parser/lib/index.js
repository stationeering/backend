const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

var { S3Fetcher } = require('./s3-fetcher');
var { VersionParser } = require('./version-parser');
var { importHistory, updateBranchState, updateServerBuildId } = require('./dynamodb-sync');
var { publishRecent } = require('./publish-recent');
var { publishAtom } = require('./publish-atom');

var VALID_BRANCHES = ["public", "beta"];

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
    await S3Fetcher(event, callback, routeBody, [
        function (bucket, key, operation) {
            return operation.startsWith("ObjectCreated");
        },
        function (bucket, key, operation) {
            return key.endsWith("version.ini");
        }
    ]);
}

async function routeBody(key, body) {
    var branch = key.split("/", 1)[0];
    var splitBranch = branch.split("-");
    var server = false;

    if (splitBranch.length === 2) {
        server = (splitBranch[0] === "server");
        branch = splitBranch[1];    
    } 
    
    if (!VALID_BRANCHES.includes(branch)) {
        log("Didn't recognise branch for key '" + key + "'.");
        return;
    }

    if (server) {
        await processServerVersion(branch, body);
    } else {
        await processClientVersion(branch, body);
    }
}

async function processServerVersion(branch, body) {
    var versionData = body.split("\n").reduce((acc, curr) => {
        var parts = curr.split("=");
        acc[parts[0]] = parts[1];
        return acc;
    }, {})

    var buildId = versionData["STEAM_BUILDID"];
    var buildTimeUpdated = Number.parseInt(versionData["STEAM_TIMEUPDATED"], 10) * 1000;
    var version = versionData["UPDATEVERSION"].split(" ")[1];
    var branchName = "server_" + branch;

    await updateServerBuildId(version, buildId);

    var updateChanges = await updateBranchState(branchName, version, buildTimeUpdated.toString());

    if (updateChanges) {
        await publishAll();
    }
}

async function processClientVersion(branch, body) {
    var versionData = VersionParser(body);

    if (branch === "beta") {
        versionData.history[versionData.current.version]["built"] = versionData.current.date;
        versionData.history[versionData.current.version]["build_id"] = versionData.current.build_id;
    }

    var importChanges = await importHistory(branch, versionData.history, versionData.current.date.toString());
    var updateChanges = await updateBranchState(branch, versionData.current.version, versionData.current.date.toString());

    log("Import Changes: " + importChanges + " Update Changes: " + updateChanges);

    if (importChanges || updateChanges) {
        await publishAll();
    }
}

async function publishAll() {
    log("Change made, regenerating recent changes output file.");
    await publishRecent();
    await publishAtom();

    await invokeNextFunctions();
}

async function invokeNextFunctions() {
    try {
        log("Invoking Version Publish Pagination...")
        await lambda.invoke({ FunctionName: "backend-version-publish-p-VersionPublishPaginatedL-JAW55VEV2MA5", InvocationType: "Event", Payload: {} }).promise();
    } catch (err) {
        log("Failed to invoke Lambda: " + err);
    }
}