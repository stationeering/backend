var AWS = require('aws-sdk');
var axios = require('axios');
var sharp = require('sharp');

var S3 = new AWS.S3();

exports.handler = async function (event, context) {
  console.log("Stationeering: News Fetcher...");

  await Promise.all([ updateSteam() ])
    .then(function (response) {
      context.succeed("Stationeering: Finished updating news.");
    })
    .catch(function (error) {
      console.log(error);
      context.fail("Stationeering: Failed to update news!");
    });
};

async function updateSteam() {
  console.log("Stationeering: Fetching steam data...");

  let response = await axios({ url: 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=544550&count=10&maxlength=1000&format=json', method: 'get', responseType: 'json' });

  if (response.status !== 200) {
    throw "Non 200 response from Steam API! (" + response.status + ")";
  }

  console.log("Stationeering: Got steam news, cleaning...");

  let posts = response.data.appnews.newsitems.map((news) => cleanSteamNews(news));

  await handleNewsStream("steam", posts);
}

function cleanSteamNews(newsEntry) {
  let contents = newsEntry.contents;
  let imageURL = undefined;

  if (contents.startsWith("http")) {
    imageURL = contents.split(" ", 1)[0];
    contents = contents.replace(imageURL + " ", "");
  }

  return {
    id: newsEntry.gid,
    date: newsEntry.date,
    title: newsEntry.title,
    author: newsEntry.author,
    contents: contents,
    has_image: (imageURL !== undefined),
    original_image: imageURL,
    tags: newsEntry.tags
  };
}

async function handleNewsStream(source, newsStream) {
  let key = "news/" + source + ".json";
  let body = JSON.stringify(newsStream);
  

  console.log("Stationeering: Handling images for " + source + "...");

  await processImages(source, newsStream);

  console.log("Stationeering: Uploading " + source + " news.");

  let request = { Bucket: "stationeering-data", Key: key, Body: body, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "application/json" }; 
  let result = await S3.putObject(request).promise();

  console.log("Stationeering: " + source + " news done.");
}

async function processImages(source, newsStream) {
  let haveImages = newsStream.filter((news) => news.has_image);

  let futures = haveImages.map((news) => handleImage(source, news));

  await Promise.all(futures);
}

async function handleImage(source, news) {
  let key = "news/" + source + "/" + news.id + ".webp";

  console.log("Stationeering: Handling " +  news.original_image);

  try {
    await S3.headObject({ Bucket: "stationeering-data", Key: key }).promise();
    console.log("Stationeering: " + news.original_image + " output exists, skipping.");
    return;
  } catch (err) {}

  console.log("Stationeering: " + news.original_image + " output doesn't exist, fetching original.");

  let imageResponse = await axios({ url: news.original_image, method: 'get', responseType: 'arraybuffer' });

  if (imageResponse.status !== 200) {
    throw "Non 200 response from fetching image: " + news.original_image + " (" + imageResponse.status + ")";
  }

  console.log("Stationeering: " + news.original_image + " fetched, converting...");

  let image = new Buffer(imageResponse.data, 'binary')
  let outputBuffer = undefined;

  try {
    outputBuffer = await sharp(image).resize(300).webp().toBuffer();
  } catch (err) {
    console.log("Stationeering: Failed to handle sharp conversion of " + news.original_image);
    throw err;
  }
  
  console.log("Stationeering: " + news.original_image + " converted, uploading to S3 as " + key + ".");

  let request = { Bucket: "stationeering-data", Key: key, Body: outputBuffer, CacheControl: "max-age=900,no-cache,no-store,must-revalidate", ContentType: "image/webp" }; 
  let result = await S3.putObject(request).promise();

  console.log("Stationeering: " +  news.original_image + " converted to " + key + ".");
}