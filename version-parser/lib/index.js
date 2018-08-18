const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

var { S3Fetcher } = require('./s3-fetcher');
var { VersionParser } = require('./version-parser');
var { importHistory, updateBranchState } = require('./dynamodb-sync');
var { publishRecent } = require('./publish-recent');
var { publishAtom } = require('./publish-atom');

var VALID_BRANCHES = ["public", "beta"];

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
    await S3Fetcher(event, callback, processBody, [
        function (bucket, key, operation) {
            return operation.startsWith("ObjectCreated");
        },
        function (bucket, key, operation) {
            return key.endsWith("version.ini");
        },
        function (bucket, key, operation) {
            return VALID_BRANCHES.includes(key.split("/", 1)[0]);
        }
    ]);
}

async function processBody(key, body) {
    var branch = key.split("/", 1)[0];
    var versionData = VersionParser(body);

    if (branch === "beta") {
        versionData.history[versionData.current.version]["built"] = versionData.current.date;
        versionData.history[versionData.current.version]["build_id"] = versionData.current.build_id;
    }

    var importChanges = await importHistory(branch, versionData.history, versionData.current.date.toString());
    var updateChanges = await updateBranchState(branch, versionData.current.version, versionData.current.date.toString());

    log("Import Changes: " + importChanges + " Update Changes: " + updateChanges);

    if (importChanges || updateChanges) {
        log("Change made, regenerating recent changes output file.");
        await publishRecent();
        await publishAtom();

        await invokeNextFunctions();
    }
}

async function invokeNextFunctions() {
    try {
        log("Invoking Version Publish Pagination...")
        await lambda.invoke({ FunctionName: "backend-version-publish-p-VersionPublishPaginatedL-JAW55VEV2MA5", InvocationType: "Event", Payload: {} }).promise();
    } catch (err) {
        log("Failed to invoke Lambda: " + err);
    }
}