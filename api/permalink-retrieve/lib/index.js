var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var intformat = require('biguint-format');
var LegacyBase58 = require('base58');
var Base58 = require('bs58');

exports.handler = async function (event, context, callback) {
  var rawLink = event.parameters.link;
  var linkId;

  if (rawLink.charAt(0) === "_") {
    var trimmedLink = rawLink.substring(1);
    var decodedLink = Base58.decode(trimmedLink);
    linkId = intformat(decodedLink, "dec");
  } else {
    linkId = LegacyBase58.decode(rawLink).toString();
  }

  var params = {
    Key: {
        "link": {
            N: linkId
        }
    },
    TableName: "Permalinks"
  };

  try {
      var dynamoDBResponse = await DynamoDB.getItem(params).promise();   
      
      if (dynamoDBResponse.Item) {
        var response = {
          body: { state: dynamoDBResponse.Item.state.S }
        };
        
        callback(null, response);

      } else {
        callback(new Error("Not Found."));
      }
  } catch (err) {
      console.log(err);
      callback(new Error("Persistence Failure."));
  }
};