var AWS = require('aws-sdk');
var request = require('request');

const DynamoDB = new AWS.DynamoDB();

async function uploadData(data) {
    var versions = Object.keys(data);

    for (let version of versions) {
        await uploadDataSingle(version, data[version]);
    }
}

async function uploadDataSingle(version, data) {
    var notes = data.notes;

    var built_date = data.releases.built;
    var beta_date = data.releases.beta;
    var public_date = data.releases.public;

    var params = {
        Item: {
            "game": {
                S: "stationeers"
            },
            "version": {
                N: versionAsNumber(version)
            },
            "version_text": {
                S: version
            }
        },
        TableName: "Versions"
    };

    if (notes && notes.length > 0) {
        var notesList = notes.map((note) => {
            return { S: note };
        })
        params.Item["notes"] = { L: notesList };
    }

    if (built_date) {
        if (built_date !== "unknown") {
            params.Item["built_date"] = { N: Date.parse(built_date).valueOf().toString() };
        } else {
            params.Item["built_date"] = { N: "-1" }
        }
    }

    if (beta_date) {
        if (beta_date !== "unknown") {
            params.Item["beta_date"] = { N: Date.parse(beta_date).valueOf().toString() };
        } else {
            params.Item["beta_date"] = { N: "-1" }
        }
    }

    if (public_date) {
        if (public_date !== "unknown") {
            params.Item["public_date"] = { N: Date.parse(public_date).valueOf().toString() };
        } else {
            params.Item["public_date"] = { N: "-1" }
        }
    }

    params.Item["updated_date"] = { N: Date.now().toString() };

    console.log("Doing... " + version)

    try {
        await DynamoDB.putItem(params,).promise();
    } catch (err) {
        console.log(err);
    }

    console.log("Done.")
}

request.get('https://data.stationeers.melaircraft.net/version.json', async function (error, response, body) {
    if (!error && response.statusCode == 200) {
        var data = JSON.parse(body);
        await uploadData(data);
    } else {
        console.log("Failed.");
    }
});

function versionAsNumber(version) {
    return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}