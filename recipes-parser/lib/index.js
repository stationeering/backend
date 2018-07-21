var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var SQS = new AWS.SQS();

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
            return key.endsWith(".xml");
        },
        function (bucket, key, operation) {
            return VALID_BRANCHES.includes(key.split("/", 1)[0]);
        }
    ]);
}

async function processBody(key, body) {
    var keyParts = key.split("/");
    var branch = keyParts[0];
    var file = keyParts[keyParts.length - 1];

    var data = await parseXMLToJson(body);

    var recipes = identifyRecipes(data);

    await syncRecipes(branch, file, recipes);
    await notifyChanges(branch);
}

function identifyRecipes(data) {
    return Object.keys(data.GameData).reduce((out, key) => {
        var section = data.GameData[key][0];

        if (!section || !section.hasOwnProperty("RecipeData")) {
            return [];
        }

        var foundRecipes = section.RecipeData.map((data) => processRecipe(key, data));

        return out.concat(foundRecipes);
    }, []);
}

function processRecipe(key, data) {
    var recipe = data.Recipe[0];

    var ingredients = Object.keys(recipe).reduce((out, key) => {
        var quantity = Number.parseFloat(recipe[key][0]);

        if (quantity > 0) {
            out[key] = quantity;
        }

        return out;
    }, {})

    return { item: data.PrefabName[0], manufactory: key, ingredients }
}

async function syncRecipes(branch, file, recipes) {
    var currentTime = Date.now().toString();

    for (let recipe of recipes) {
        await syncRecipe(branch, currentTime, file, recipe);
    }

    await clearOldRecipes(branch, currentTime, file);
}

async function syncRecipe(branch, currentTime, file, recipe) {
    log("Syncing " + recipe.item + " on " + recipe.manufactory + "...");

    var itemName = ((branch === "beta") ? "Beta" : "") + recipe.item;

    var ingredients = Object.keys(recipe.ingredients).reduce((acc, key) => {
        acc[key] = { N: recipe.ingredients[key].toString() }
        return acc;
    }, {});

    var params = {
        Item: {
            "manufactory": {
                S: recipe.manufactory
            },
            "item": {
                S: itemName
            },
            "ingredients": {
                M: ingredients
            },
            "file": {
                S: file
            },
            "update_time": {
                N: currentTime
            },
            "branch": {
                S: branch
            }
        },
        TableName: "Recipes",
        ReturnConsumedCapacity: "TOTAL"
    }

    try {
        var dynamoResponse = await DynamoDB.putItem(params).promise();    
        var units = dynamoResponse.ConsumedCapacity.CapacityUnits;        
        log("Completed insert, consumed " + units + " capacity units.");
        await recoverCapacityUnits(units);
    } catch (err) {
        log("DynamoDB Failed! " + err);
    }
}

async function recoverCapacityUnits(units) {
    return new Promise(function (resolve, reject) {
        setTimeout(() => {
            log("Finished recovering.")
            resolve();
        }, units * 1000);
    });
}

async function clearOldRecipes(branch, currentTime, file) {
    log("Removing any recipes which are no longer available.");

    var params = {
        ExpressionAttributeNames: {
            "#M": "manufactory",
            "#I": "item",
            "#B": "branch",
            "#F": "file",
            "#U": "update_time"
        },
        ExpressionAttributeValues: {
            ":b": { S: branch },
            ":f": { S: file },
            ":u": { N: currentTime }
        },
        FilterExpression: "#B = :b AND #F = :f AND #U < :u",
        ProjectionExpression: "#M, #I",
        TableName: "Recipes"
    };

    try {
        var dynamoResponse = await DynamoDB.scan(params).promise();
        log("Query returned, " + dynamoResponse.Items.length + " item(s) found.");
    } catch (err) {
        log("DynamoDB Failed! " + err);
    }

    for (let recipe of dynamoResponse.Items) {
        var manufactory = recipe.manufactory.S;
        var item = recipe.item.S;

        await removeRecipe(manufactory, item);
    }
    
}

async function removeRecipe(manufactory, item) {
    var params = {
        TableName: "Recipes",
        Key: {
            "manufactory": manufactory,
            "item": "item"
        }
    }

    try {
        var dynamoResponse = await DynamoDB.delete(params).promise();
        log("Deleted " + item + " from " + manufactory + ".");
    } catch (err) {
        log("DynamoDB Failed! " + err);
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

async function notifyChanges(branch) {
    var message = JSON.stringify({ branch: branch });
    var queue = process.env.RecipeQueueURL;

    try {
        await SQS.sendMessage({ MessageBody: message, QueueUrl: queue }).promise();
        log("Notified queue of changes.")
    } catch (err) {
        log("Failed to notify: " + err)
    }
}