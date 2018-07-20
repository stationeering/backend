var vdf = require('node-vdf');
var fs = require("fs");

var file = process.argv[2];
var branch = process.argv[3];
var field = process.argv[4];

fs.readFile(file, function (err, data) {
    if (err) throw err;

    var rawVDFWithHeader = data.toString();

    var vdfWithoutAppHeader = rawVDFWithHeader.split('"544550"', 2);

    var saneVDF = '"544550"\n' + vdfWithoutAppHeader[1];

    var parsedVDF = vdf.parse(saneVDF);

    console.log(parsedVDF["544550"]["depots"]["branches"][branch][field]);
});