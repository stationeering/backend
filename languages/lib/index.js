var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var { S3Fetcher } = require('./s3-fetcher');
var xml2js = require('xml2js').parseString;

var VALID_BRANCHES = ["public", "beta"];
var UNDESIRED_SUFFIXES = ["_keys.xml", "_tips.xml"];

var DESIRED_SECTIONS = ["Reagents", "Gases", "Things", "Mineables"];

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
    await S3Fetcher(event, callback, processBody, [
        function (bucket, key, operation) {
            return operation.startsWith("ObjectCreated");
        },
        function (bucket, key, operation) {
            return key.endsWith(".xml");
        },
        function (bucket, key, operation) {
            return VALID_BRANCHES.includes(key.split("/", 1)[0]);
        },
        function (bucket, key, operation) {
            return !UNDESIRED_SUFFIXES.some((suffix) => key.endsWith(suffix));
        }
    ]);
}

async function processBody(key, body) {
    var branch = key.split("/", 1)[0];
    var data = await parseXMLToJson(body);

    var languageData = processStructure(data.Language);

    await publishToS3(branch, languageData);
}

async function publishToS3(branch, languageData) {
    var jsonLanguage = JSON.stringify(languageData);
    var key = "languages/" + branch + "/" + languageData.code + ".json";
    var S3 = new AWS.S3();

    log("Putting " + key + " to S3...");
    await S3.putObject({ Bucket: "stationeering-data", Key: key, Body: jsonLanguage, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/json" }).promise();
    log("Completed");
}

function processStructure(data) {
    var root = { code: data.Code[0].toLowerCase(), name: data.Name[0], sections: {} };

    return Object.keys(data).filter((key) => DESIRED_SECTIONS.includes(key)).reduce((acc, key) => {
        acc.sections[key] = processSection(data[key][0]);
        return acc;
    }, root);
}

function processSection(data) {
    if (data) {
        if (data.hasOwnProperty("Record")) {
            return processSectionRecords(data["Record"]);
        } else if (data.hasOwnProperty("RecordReagent")) {
            return processSectionReagentRecords(data["RecordReagent"]);
        }
    }

    return {};
}

function processSectionRecords(data) {
    return data.reduce((acc, singleData) => {
        acc[singleData.Key[0]] = singleData.Value[0];
        return acc;
    }, {});
}

function processSectionReagentRecords(data) {
    return data.reduce((acc, singleData) => {
        acc[singleData.Key[0]] = { name: singleData.Value[0], unit: singleData.Unit[0] };
        return acc;
    }, {});
}

function parseXMLToJson(body) {
    return new Promise(function (resolve, reject) {
        xml2js(body, function (err, result) {
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
}