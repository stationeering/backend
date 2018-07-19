var LINEBREAK_REGEX = /[\r]?\n/;
var PREPENDED_NOISE_REGEX = /\s?[-]?\s?/;
var REMOVE_HTML_LIKE_REGEX = /<.*>(.*)<.*>/g;
var NOTE_HEADER_REGEX = /(.*Version \d+.\d+.\d+.\d+.*)/;
var VERSION_EXTRACT_REGEX = /(Version|Update) (\d+.\d+.\d+.\d+)/;

function log(message) {
    console.log("VersionParser: " + message);
}

exports.VersionParser = function parseFile(contents) {
    log("Parsing version file...");
    var [header, versions] = contents.split("UPDATENOTES=", 2);

    // Parse current build information, version and date.
    var current = parseHeader(header);
    var currentVersion = current.version;

    // Parse all notes form previous versions.
    var history = parseVersions(versions).reduce((map, version) => {
        map[version.version] = { version: version.version, notes: version.notes };
        return map;
    }, {});

    // Check to see if current build is present, add if not - case of build with no release notes.
    if (!history.hasOwnProperty(currentVersion)) {
        history[currentVersion] = { version: currentVersion };
    }

    // Add date to current build.
    history[currentVersion]["built"] = current.date;

    log("Parse complete.");

    return { current, history };
}

function parseHeader(header) {
    log("Parsing version headers...");
    var headerLines = header.split(LINEBREAK_REGEX).filter(line => line.length !== 0);

    var parsed = headerLines.reduce((map, line) => {
        var [key, value] = line.split("=");
        map[key] = value;
        return map;
    }, {});

    return { version: parseHeaderVersion(parsed["UPDATEVERSION"]), date: parseHeaderDate(parsed["UPDATEDATE"]) };
}

function parseHeaderVersion(version) {
    return version.split(" ", 2)[1];
}

function parseHeaderDate(date) {
    var justDate = date.split(" ", 2)[1];
    var [day, month, year] = justDate.split("/", 3);

    var dayNumber = Number.parseInt(day, 10);
    var monthNumber = Number.parseInt(month, 10) - 1;
    var yearNumber = Number.parseInt(year, 10);

    return new Date(Date.UTC(yearNumber, monthNumber, dayNumber, 0, 0, 0)).valueOf();
}

function parseVersions(raw) {
    log("Parsing version history...");

    var split_notes = raw.split(NOTE_HEADER_REGEX);

    if (split_notes[0].length === 0) {
        split_notes.shift();
    }

    if (split_notes.length % 2 !== 0) {
        log("Notes did not successfully split.");
        return [];
    }

    var versions = [];

    for (var i = 0; i < split_notes.length; i += 2) {
        var version = extractVersion(split_notes[i]);
        var notes = extractNotes(split_notes[i + 1]);

        versions.push({ version: version, notes: notes });
    }

    return versions;
}

function extractNotes(notes) {
    return notes.split(LINEBREAK_REGEX).map(line => line.replace(PREPENDED_NOISE_REGEX, "")).map(line => line.replace(REMOVE_HTML_LIKE_REGEX, "$1")).map(line => line.trim()).filter(line => line.length !== 0);
}

function extractVersion(versionRaw) {
    var version = versionRaw.match(VERSION_EXTRACT_REGEX);

    if (version) {
        return version[2];
    } else {
        return undefined;
    }
}