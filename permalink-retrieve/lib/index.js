var AWS = require('aws-sdk');
var DynamoDB = new AWS.DynamoDB();
var Base58 = require('base58');

exports.handler = async function (event, context, callback) {
  var linkId = Base58.decode(event.parameters.link);

  var params = {
    Key: {
        "link": {
            N: linkId.toString()
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