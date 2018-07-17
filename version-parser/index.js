var AWS = require('aws-sdk');

var VALID_BRANCHES = [ "public", "beta" ];

var LINEBREAK_REGEX = "[\r]?\n";
var PREPENDED_NOISE_REGEX = "\s?[-]?\s?";
var REMOVE_HTML_LIKE_REGEX = "<.*>(.*)<.*>";
var NOTE_HEADER_REGEX = "^(.*Version \d+.\d+.\d+.\d+.*)$";

function parseFile(contents) {
    var [ header, versions ] = contents.split("UPDATENOTES=", 2);    
    return { header: parseHeader(header), versions: parseVersions(versions)}
}

function parseHeader(header) {
    var headerLines = header.split(LINEBREAK_REGEX);

    var parsed = headerLines.map((map, line) => {
        var [ key, value ] = line.split("=");
        map[key] = value;
        return map;
    }, {});

    return { version: parseHeaderVersion(parsed["UPDATEVERSION"]), date: parseHeaderDate(parsed["UPDATEDATE"]) }
}

function parseHeaderVersion(version) {
    return version.split(" ", 2)[1];
}

function parseHeaderDate(date) {
    var justDate = date.split(" ", 2)[1];
    var [ day, month, year ] = justDate.split("/", 3);

    var dayNumber = Number.parseInt(day, 10);
    var monthNumber = Number.parseInt(month, 10) - 1;
    var yearNumber = Number.parseInt(year, 10);

    return new Date(Date.UTC(yearNumber, monthNumber, dayNumber, 0, 0, 0)).toISOString();
}

function parseVersions(raw) {
    var split_notes = raw.split(NOTE_HEADER_REGEX);

    if (split_notes[0].length === 0) {
        split_notes.shift();
    }

    if (split_notes_raw.length % 2 !== 0) {
        // TODO: ABORT!
    }

    return split_notes

}

function extractNotes(notes) {
    return raw.split(LINEBREAK_REGEX).map(line => line.replace(PREPENDED_NOISE_REGEX, "")).map(line => line.replace(REMOVE_HTML_LIKE_REGEX, "$1")).map(line => line.trim).filter(line => line.length === 0);
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