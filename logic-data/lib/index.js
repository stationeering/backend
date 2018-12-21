var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var { S3Fetcher } = require('./s3-fetcher');
var xml2js = require('xml2js').parseString;

var VALID_BRANCHES = ["public", "beta"];
var UNDESIRED_SUFFIXES = ["thing.xml"];

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
    var keyParts = key.split("/");
    var branch = keyParts[0];
    var file = keyParts.slice(-1)[0];

    var data = await parseXMLToJson(body);

    var outputData;
    var outputName;

    switch(file) {
        case "logictype.xml":
            outputName = "logictype";
            outputData = processLogicType(data);
        break;
        case "logicslottype.xml":
            outputName = "logicslottype";
            outputData = processLogicSlotType(data);
        break;
        case "scriptcommand.xml":
            outputName = "instructions";
            outputData = processScriptCommand(data);
        break;
    }

    await publishToS3(branch, outputName, outputData);
}

function processLogicType(data) {
    return data.LogicTypes.LogicType.reduce((acc, val) => {
        acc[val["_"]] = val["$"]["id"];
        return acc;
    }, {});
}

function processLogicSlotType(data) {
    return data.LogicSlotTypes.LogicSlotType.reduce((acc, val) => {
        acc[val["_"]] = val["$"]["id"];
        return acc;
    }, {});
}

function processScriptCommand(data) {
    return data.Instructions.Instruction.reduce((acc, val) => {
        acc[val["$"]["instruction"]] = { description: val["_"], example: val["$"]["example"] };
        return acc;
    }, {});
}

async function publishToS3(branch, file, data) {
    var jsonLanguage = JSON.stringify(data);
    var key = "logic/" + branch + "/" + file + ".json";

    log("Putting " + key + " to S3...");
    await S3.putObject({ Bucket: "stationeering-data", Key: key, Body: jsonLanguage, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/json" }).promise();
    log("Completed");
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