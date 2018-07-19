var AWS = require('aws-sdk');
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
    var cleanedWorlds = rawWorlds.map((world) => extractWorld(world));

    log("Parsed file, " + cleanedWorlds.length + " world(s) found.");
    
    await pushToS3(branch, cleanedWorlds);
}

function extractWorld(worldSettingsData) {    
    return {
        name: worldSettingsData.Name[0],
        description: worldSettingsData.Description[0],
        game_mode: worldSettingsData.GameMode[0],        
        planet: {
            gravity:  Number.parseFloat(worldSettingsData.Gravity[0]),
            dayLength: extractDayLength(worldSettingsData)
        },
        atmosphere: {
            temperature: extractTemperature(worldSettingsData.Kelvin[0]),
            composition: extractComposition(worldSettingsData)
        }
    }
}

function extractDayLength(worldSettingsData) {
    if (worldSettingsData.hasOwnProperty("SolarScale")) {
        return Number.parseFloat(worldSettingsData.SolarScale[0])
    } else {
        return 1.0;
    }
}

function extractTemperature(kelvin) {
    var dumbParse = Number.parseFloat(kelvin);

    if (!Number.isNaN(dumbParse)) {
        return { min: dumbParse, max: dumbParse, avg: dumbParse }
    } 

    var keyFrameTemperatures = kelvin.keys[0].Keyframe.map((key) => Number.parseFloat(key.value[0]));
    var average = keyFrameTemperatures.reduce( ( p, c ) => p + c, 0 ) / keyFrameTemperatures.length;
    return { min: Math.min(...keyFrameTemperatures), max: Math.max(...keyFrameTemperatures), avg: average }
}

function extractComposition(worldSettingsData) {
    if (!worldSettingsData.hasOwnProperty("AtmosphereComposition")) {
        return [];
    }

    var composition = worldSettingsData.AtmosphereComposition[0].SpawnGas;

    return composition.map((gas) => {
        var type = gas.Type[0];
        var quantity = Number.parseFloat(gas.Quantity[0]);

        return { type, quantity };
    })
}

async function pushToS3(branch, worldObject) {
    var jsonWorlds = JSON.stringify(worldObject);
    var key = "scenarios/" + branch + ".json";
    var S3 = new AWS.S3();

    log("Putting " + key + " to S3...");
    await S3.putObject({ Bucket: "stationeering-data", Key: key, Body: jsonWorlds, CacheControl: "max-age=900,no-cache,no-store,must-revalidate" }).promise()
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