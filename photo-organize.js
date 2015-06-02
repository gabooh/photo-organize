#!/usr/bin/env node

'use strict';

var program = require('commander');
var fs = require('fs');
var _ = require('lodash');
var exif = require('exif').ExifImage;
var moment = require('moment');
var q = require('q');

program.version('1.0.0')
  .usage('<directory>');

program.parse(process.argv);

var directoryName = null;
if (program.args.length > 1) {
  console.log("Too many arguments.");
  process.exit(1);
} else if (program.args.length == 1) {
  directoryName = program.args[0];
} else {
  directoryName = process.cwd();
}

console.log(`Processing directory '${directoryName}'`);
processDirectory(directoryName);

/**
 * Process a directory : list files, get timestamp and move them to appropriate subdirectory.
 * @param directoryName
 */
function processDirectory(directoryName) {
  try {
    if (!fs.statSync(directoryName).isDirectory()) {
      console.error(`'${directoryName}' is not a directory`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`'${directoryName}' is not valid : ${err}`);
    process.exit(1);
  }

  if (!_.endsWith(directoryName, '/')) {
    directoryName += '/';
  }

  let files = fs.readdirSync(directoryName);

  let date = null;
  _.forEach(_.filter(files, validFileTypes), function (file) {
    getDateFromExif(file)
      .then(function (exifDate) {
        if (exifDate != null && exifDate.isValid()) {
          date = exifDate;
        } else {
          date = moment(fs.statSync(directoryName + file).mtime);
        }

        let subdirectoryName = date.format('YYYY_MM_DD') + '/';
        createDirectory(directoryName + subdirectoryName);
        fs.renameSync(directoryName + file, directoryName + subdirectoryName + file);

        console.log(`${directoryName + file} -> ${directoryName + subdirectoryName + file}`);
      })
      .then(null, function (err) {
        console.trace(err);
      });
  });
}

/**
 * Get the date of the picture from the exif data
 * @param file the file to read
 * @return {promise|*|Q.promise}
 */
function getDateFromExif(file) {
  var deferred = q.defer();
  try {
    new exif({image: directoryName + file}, function (error, exifData) {
        if (error) {
          deferred.resolve(null);
          return;
        }
        let dateString;
        if (exifData['exif']['DateTimeOriginal'] !== undefined) {
          dateString = exifData['exif']['DateTimeOriginal'];
        } else if (exifData['exif']['DateTime'] !== undefined) {
          dateString = exifData['exif']['DateTime'];
        }
        deferred.resolve(moment(dateString, 'YYYY:MM:DD HH:mm:ss'));
      }
    )
    ;
  } catch (err) {
    deferred.reject(`Error: ${err}`);
  }

  return deferred.promise;
}

/**
 * Create a directory if it does not already exists
 * @param directoryName the directory to create
 */
function createDirectory(directoryName) {
  if (!fs.existsSync(directoryName)) {
    fs.mkdirSync(directoryName, '0770');
  }
}

function validFileTypes(file) {
  return _.endsWith(file.toLowerCase(), '.jpg')
    || _.endsWith(file.toLowerCase(), '.jpeg')
    || _.endsWith(file.toLowerCase(), '.mp4');
}