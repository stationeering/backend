var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var S3 = new AWS.S3();

const PAGE_SIZE = 50;

function log(message) {
    console.log("Stationeering: " + message);
}

exports.handler = async function (event, context, callback) {
  var lastPage = await publishPages();
  await publishRecent(lastPage);
}

function chunk(arr, len) {
  var chunks = [],
      i = 0,
      n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i += len));
  }

  return chunks;
}

async function publishPages() {
  var unpaginatedPublic = await fetchUnpaginatedVersions(false);
  var pagedPublic = chunk(unpaginatedPublic, PAGE_SIZE);
  var previousPage = await fetchMaximumPage();

  var previousFile = (previousPage === 0 ? undefined : "page-" + previousPage + ".json");

  log("Last published page was: " + previousPage + " / " + previousFile);

  for (var versions of pagedPublic) {
    log("Evaluating versions: " + versions.length + " versions found.")
    if (versions.length >= PAGE_SIZE) {      
      var thisPage = previousPage + 1;
      log("New page found! Page " + thisPage);
      
      await publishVersions("page-" + thisPage + ".json", previousFile, versions);
      await updateVersionsWithPage(versions, thisPage);

      previousPage++;
      previousFile = (previousPage === 0 ? undefined : "page-" + previousPage + ".json");
    }
  }

  return previousFile;
}

async function publishRecent(lastPage) {
  log("Finding unpaginated including beta...");
  var allUnpaginated = await fetchUnpaginatedVersions(true);
  log("Found " + allUnpaginated.length + " versions.");
  await publishVersions("head.json", lastPage, allUnpaginated);
}

async function fetchUnpaginatedVersions(includeBeta) {
  log("Retrieving " + (includeBeta ? "beta" : "public") + " version history...");

  var params = {
      ExpressionAttributeNames: {
          "#G": "game",
          "#PG": "page"
      },
      ExpressionAttributeValues: {
          ":game": {
              S: "stationeers"
          }
      },
      FilterExpression: "attribute_not_exists(#PG)",
      KeyConditionExpression: "#G = :game",
      ScanIndexForward: true,
      TableName: "Versions"
  };

  if (!includeBeta) {
    params.ExpressionAttributeNames["#P"] = "public_date";
    params.FilterExpression = params.FilterExpression + " AND attribute_exists(#P)";
  }

  var dynamoResponse;

  try {
      log("Finding versions via query....");
      dynamoResponse = await DynamoDB.query(params).promise();
  } catch (err) {
      log("DynamoDB Failed! " + err);
      return [];
  }

  return dynamoResponse.Items.map((item) => {
      return dynamoDBToPlainObject(item);
  });
}

async function updateVersionsWithPage(versions, page) {
  for (var versionData of versions) {
    log("Performing: " + versionData.version + ": Update page to " + page + ".")

    var params = {
        Key: generateDynamoDBKey(versionData),
        ReturnValues: "NONE",
        TableName: "Versions",
        ConditionExpression: "attribute_exists(#V)",
        ExpressionAttributeNames: {
            "#V": "version",
            "#P": "page",
            "#L": "updated_date"
        },
        ExpressionAttributeValues: {
            ":p": { N: page.toString() },
            ":l": { N: Date.now().toString() }
        },
        UpdateExpression: "SET #P = :p, #L = :l"
    }

    var dynamoResponse;

    try {
        dynamoResponse = await DynamoDB.updateItem(params).promise();
        log("Completed page update.");
    } catch (err) {
        log("DynamoDB Failed! " + err);
    }
  }
}

async function publishVersions(fileName, previousFile, versions) {
  var reversedVersions = versions.reverse();
  var output = { versions: reversedVersions, previous: previousFile };
  var outputJSON = JSON.stringify(output);

  var expiry = (fileName === "head.json") ? 900 : 2592000;

  try {
    var s3Response = await S3.putObject({ Bucket: "stationeering-data", Key: "versions/paginated/" + fileName, Body: outputJSON, CacheControl: "max-age=" + expiry + ",no-cache,no-store,must-revalidate", ContentType: "application/json" }).promise();
    log("New paginated file '" + fileName + "' written.");
  } catch (err) {
    log("Failed to push new paginated file. " + err);
  }  
}

async function fetchMaximumPage() {
  log("Finding existing maximum page number...");

  try {
    var results = await S3.listObjects({Bucket: "stationeering-data", Prefix: "versions/paginated/page-" }).promise();
    var pages = results.Contents.map((object) => object.Key).map((key) => key.match(/(\d+)/)[0]).map((number) => Number.parseInt(number));

    if (pages.length === 0) {
      return 0;
    } else {
      return Math.max(...pages);
    }
  } catch (err) {
    log("Failed to enumerate maximum page number from S3! " + err);
    return 0;
  }
}

function dynamoDBToPlainObject(item) {
  var output = { version: item.version_text.S, version_number: item.version.N };

  if (item.hasOwnProperty("build_id")) {
      output["build_id"] = item.build_id.N;
  }

  if (item.hasOwnProperty("built_date")) {
      output["built_date"] = item.built_date.N;
  }

  if (item.hasOwnProperty("beta_date")) {
      output["beta_date"] = item.beta_date.N;
  }

  if (item.hasOwnProperty("public_date")) {
      output["public_date"] = item.public_date.N;
  }

  if (item.hasOwnProperty("updated_date")) {
      output["updated_date"] = item.updated_date.N;
  }

  if (item.hasOwnProperty("notes")) {
      output["notes"] = item.notes.L.map((entry) => entry.S);
  }

  return output;
}

function generateDynamoDBKey(versionData) {
  return {
      "game": {
          S: "stationeers"
      },
      "version": {
          N: versionAsNumber(versionData.version)
      },
  };
}

function versionAsNumber(version) {
  return Number.parseInt(version.split(".").map((part) => part.padStart(5, "0")).join("")).toString();
}