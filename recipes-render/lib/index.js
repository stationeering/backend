var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var S3 = new AWS.S3();

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
    if (event.hasOwnProperty("Records")) {
        event = JSON.parse(event.Records[0].body);
    }

    var branch = event.branch;

    log("Preparing recipe outputs for " + branch + " branch.");

    var recipes = await fetchAllRecipes(branch);

    await writeToS3(branch, { branch, updated_time: Date.now().toString(), recipes })
}

async function fetchAllRecipes(branch) {
    var params = {
        TableName: "Recipes",
        ExpressionAttributeNames: { "#B": "branch"},
        ExpressionAttributeValues: { ":b": { S: branch } },
        FilterExpression: "#B = :b"
    }

    var response = await DynamoDB.scan(params).promise();

    return response.Items.map((item) => remapDynamoToSane(item));
}

function remapDynamoToSane(dynamoItem) {
    var item = dynamoItem.item.S.replace(/^Beta/, "");
    var manufactory = dynamoItem.manufactory.S;
    var ingredients = Object.keys(dynamoItem.ingredients.M).reduce((acc, name) => {
        acc[name] = dynamoItem.ingredients.M[name].N;
        return acc;
    }, {})

    return { item, manufactory, ingredients };
}

async function writeToS3(branch, object) {
    var json = JSON.stringify(object);

    try {
        var s3Response = await S3.putObject({ Bucket: "stationeering-data", Key: "recipes/" + branch + ".json", Body: json, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/json" }).promise()

    } catch (err) {
        log("Failed to upload to S3! " + err);
    }
}