var { S3Fetcher } = require('./s3-fetcher');
var xml2js = require('xml2js').parseString;

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
            return key.endsWith("worldsettings.xml");
        },
        function (bucket, key, operation) {
            return VALID_BRANCHES.includes(key.split("/", 1)[0]);
        }
    ]);
}

async function processBody(key, body) {
    var branch = key.split("/", 1)[0];
    var data = await parseXMLToJson(body);

    var rawWorlds = data.GameData.WorldSettings[0].WorldSettingData;
    var cleanedWorlds = worlds.map((world) => extractWorld(world));
}

function extractWorld(worldSettingsData) {
    return {
        name: worldSettingsData.Name[0]
    }
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