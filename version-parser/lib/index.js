var { S3Fetcher } = require('./s3-fetcher');
var { VersionParser } = require('./version-parser');
var { importHistory, updateBranchState } = require('./dynamodb-sync');
var { publishRecent } = require('./publish-recent');

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

    var importChanges = await importHistory(versionData.history);
    var updateChanges = await updateBranchState(branch, versionData.current.version);

    log("Import Changes: " + importChanges + " Update Changes: " + updateChanges);

    if (importChanges || updateChanges) {
        log("Change made, regenerating recent changes output file.");
        await publishRecent();
    }
}
