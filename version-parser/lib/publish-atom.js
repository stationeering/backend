var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var DynamoDB = new AWS.DynamoDB();
var { Feed } = require('feed');
var htmlencode = require('htmlencode');

function log(message) {
    console.log("PublishAtom: " + message);
}

exports.publishAtom = async function publishAtom() {
  await publishAtomBranch(true);
  await publishAtomBranch(false);
}

async function publishAtomBranch(beta) {
  var branch = (beta ? "beta" : "public");
  log("Publishing ATOM feed for " + branch + "...");

  var versionData = await fetchVersions(beta);
  var feedContent = convertToFeed(branch, versionData);
  await publishToS3(branch, feedContent);
}

async function fetchVersions(beta) {
  log("Retrieving " + (beta ? "beta" : "public") + " version history...");

  var params = {
      ExpressionAttributeNames: {
          "#G": "game"
      },
      ExpressionAttributeValues: {
          ":game": {
              S: "stationeers"
          }
      },
      KeyConditionExpression: "#G = :game",
      ScanIndexForward: false,
      Limit: 30,
      TableName: "Versions",
      ConsistentRead: true
  };

  if (!beta) {
    params.ExpressionAttributeNames["#P"] = "public_date";
    params.FilterExpression = "attribute_exists(#P)";
  }

  var dynamoResponse;

  try {
      log("Finding versions via query....");
      dynamoResponse = await DynamoDB.query(params).promise();
  } catch (err) {
      log("DynamoDB Failed! " + err);
      return [];
  }

  return dynamoResponse.Items.slice(0, 10).map((item) => {
      return dynamoDBToPlainObject(item);
  });
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

function convertToFeed(branch, versionData) {
  var feed = new Feed({
    title: "Stationeering - Branch: " + branch,
    id: "https://data.stationeering.com/versions/" + branch + ".json",
    link: "https://stationeering.com/versions/recent",
    generator: "stationeering.com",
    author: {
      name: "stationeering.com",
      link: "https://stationeering.com/"
    }
  });

  versionData.forEach(version => {
    var buildTime;

    if (version.built_date) {
      var date = new Date(Number.parseInt(version.built_date));
      buildTime = date.getFullYear() + "-" + date.getMonth() + "-" + date.getDay();
    } else {
      buildTime = "Unknown";
    }

    var versionContent;
    
    if (version.notes) {
      versionContent = version.notes.map((note) => "<li>" + htmlencode.htmlEncode(note) + "</li>").join('');
    } else {
      versionContent = "<li>No change log for this version.</li>"
    }
    
    var htmlContent = "<p>Originally Built: " + buildTime + "</p><ul>" + versionContent + "</ul>";

    var date = version.updated_date;

    if (branch === "public" && version.public_date) {
      date = version.public_date;
    }

    if (branch === "beta" && version.beta_date) {
      date = version.beta_date;
    }

    feed.addItem({
      title: version.version,
      id: "urn:stationeers-version:" + version.version,
      content: htmlContent,
      date: new Date(Number.parseInt(date)),
      link: "https://stationeering.com/versions/recent#" + version.version
    });
  })

  return feed.atom1();
}

async function publishToS3(branch, feedContent) {
  try {
    var s3Response = await S3.putObject({ Bucket: "stationeering-data", Key: "versions/" + branch + ".atom", Body: feedContent, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/atom+xml" }).promise();
    log("New atom file written.");
  } catch (err) {
      log("Failed to push atom. " + err);
  }  
}