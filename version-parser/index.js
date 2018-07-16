var AWS = require('aws-sdk');

var VALID_BRANCHES = [ "public", "beta" ];

function parseFile(contents) {
    var [ header, versions ] = contents.split("UPDATENOTES=", 2);    
    return { header: parseHeader(header), versions: parseVersions(versions)}
}

function parseHeader(header) {

}

function praseVersions(versions) {
    
}

exports.handler = function (event, context, callback) {
    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;
    var operation = event.Records[0].eventName;

    if (!operation.startsWith("ObjectCreated")) {
        callback(null, "Not a object create operation, no action.");
        return;
    }

    if (!key.endsWith("version.ini")) {
        callback(null, "Not an update of version information, no action.");
        return;
    }

    var branch = key.split("/", 1);

    if (!VALID_BRANCHES.includes(branch)) {
        callback("Update received for an unknown branch. Branch: " + branch);
        return;  
    }

    console.log("Stationeering: Recieved notification for version update of " + branch + " branch...");
}