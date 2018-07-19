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