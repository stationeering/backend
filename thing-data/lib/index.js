// var AWS = require('aws-sdk');
// var S3 = new AWS.S3();
// var { S3Fetcher } = require('./s3-fetcher');
// var xml2js = require('xml2js').parseString;

// var VALID_BRANCHES = ["public", "beta"];
// var UNDESIRED_SUFFIXES = ["thing.xml"];

// function log(message) {
//     console.log("Stationeering: " + message);
// }

// exports.handler = async function (event, context, callback) {
//     await S3Fetcher(event, callback, processBody, [
//         function (bucket, key, operation) {
//             return operation.startsWith("ObjectCreated");
//         },
//         function (bucket, key, operation) {
//             return key.endsWith(".xml");
//         },
//         function (bucket, key, operation) {
//             return VALID_BRANCHES.includes(key.split("/", 1)[0]);
//         },
//         function (bucket, key, operation) {
//             return !UNDESIRED_SUFFIXES.some((suffix) => key.endsWith(suffix));
//         }
//     ]);
// }

// async function processBody(key, body) {
//     var keyParts = key.split("/");
//     var branch = keyParts[0];
//     var file = keyParts.slice(-1)[0];

//     var data = await parseXMLToJson(body);

//     var outputData;
//     var outputName;

//     switch(file) {
//         case "logictype.xml":
//             outputName = "logictype";
//             outputData = processLogicType(data);
//         break;
//         case "logicslottype.xml":
//             outputName = "logicslottype";
//             outputData = processLogicSlotType(data);
//         break;
//         case "scriptcommand.xml":
//             outputName = "instructions";
//             outputData = processScriptCommand(data);
//         break;
//     }

//     await publishToS3(branch, outputName, outputData);
// }

var flatten = require('flatten');

function parseThings(thingsJSON) {
    let things = thingsJSON.Things.Thing;

    let translatedThings = things.reduce((acc, thing) => {
        acc[thing.$.prefab] = parseThing(thing);
        return acc;
    }, {});

    return backPopulateConstructedBy(translatedThings);
}

function parseThing(thing) {
    let thingOut = {};

    thingOut['temperatures'] = {    
        shatter: thing['TemperatureLimits'][0]['$']['shatter'],
        flashpoint: thing['TemperatureLimits'][0]['$']['flashpoint'],
        autoignition: thing['TemperatureLimits'][0]['$']['autoignition']
    }
    
    if (Object.keys(thing).includes('LogicTypes') && thing['LogicTypes'][0] !== '') {
        thingOut['logicTypes'] = thing['LogicTypes'][0]['LogicType'].reduce((acc, logicType) => {
            acc[logicType['_']] = {
                read: logicType['$'].read === 'true',
                write: logicType['$'].write === 'true',
            }

            return acc;
        }, {});
    }

    if (thing['Slots'] && thing['Slots'].length > 0) {
        thingOut['slots'] = thing['Slots'][0]['Slot'].reduce((acc, slot) => {
            acc[Number.parseInt(slot['$']['index'])] = slot['_'];

            return acc;
        }, []);
    }

    if (thing['Constructs']) {
        thingOut['constructs'] = thing['Constructs'][0]['Thing'].map((t) => t['$']['prefab']);
    }

    if (thing['Modes']) {
        thingOut['modes'] = thing['Modes'][0]['Mode'];
    }

    if (thing['Quantity']) {
        thingOut['stackSize'] = thing['Quantity'][0]['$']['stackSize'];
    }

    if (thing['CreatedReagents']) {
        thingOut['createdReagents'] = thing['CreatedReagents'][0]['Reagent'].reduce((acc, reagent) => {
            acc[reagent['_']] = Number.parseFloat(reagent['$']['quantity']);
            return acc;
        }, {});
    }

    if (thing['CreatedGases']) {
        thingOut['createdGases'] = thing['CreatedGases'][0]['Gas'].reduce((acc, gas) => {
            acc[gas['_']] = Number.parseFloat(gas['$']['quantity']);
            return acc;
        }, {});
    }

    thingOut['objectHeirachy'] = enumerateCSharpClasses(thing['CSharpHeirachy'][0]['Type'][0]);

    flags = {};

    flags['paintable'] = thing['Paintable'][0]['$']['canBe'] === 'true';

    flags['item'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Item');
    flags['constructor'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Items.DynamicThingConstructor') ||
                           thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.MultiConstructor') ||
                           thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Constructor');

    flags['wearable'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Clothing.IWearable');
    flags['tool'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Items.Tool');

    flags['plant'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Items.Plant');
    flags['edible'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Items.INutrition');
    
    flags['structure'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Structure');
    flags['smallGrid'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.SmallGrid');

    flags['logicable'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Pipes.ILogicable');

    flags['entity'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Entity');
    flags['npc'] = thingOut['objectHeirachy'].includes('Assets.Scripts.Objects.Entities.Npc');

    thingOut['flags'] = flags;

    return thingOut;
}

function enumerateCSharpClasses(heirachy) {
    var interfaces;

    if (heirachy['Interfaces']) {
        interfaces = heirachy['Interfaces'][0]['Interface'].map((i) => i['$']['name']);
    }

    if (heirachy['Type']) {
        return flatten([heirachy['$']['name'], interfaces, enumerateCSharpClasses(heirachy['Type'][0])]).filter((n) => n);
    } else {
        return [heirachy['$']['name'], interfaces].filter((n) => n);
    }
}

function backPopulateConstructedBy(things) {
    let thingNames = Object.keys(things);

    for (var thingName of thingNames) {
        if (things[thingName].constructs) {
            for (var creatingThing of things[thingName].constructs) {
                if (!things[creatingThing].constructedBy) {
                    things[creatingThing].constructedBy = [];
                }

                things[creatingThing].constructedBy.push(thingName);
            }
        }
    }

    return things;
}

var fs = require("fs");
var thingXML = fs.readFileSync("thing.json");
var thingXMLJSON = JSON.parse(thingXML);

console.log(JSON.stringify(parseThings(thingXMLJSON), null, 4));