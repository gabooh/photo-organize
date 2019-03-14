#!/usr/bin/env node

'use strict'

const program = require('commander')
const fs = require('fs')
const _ = require('lodash')
const exif = require('exif').ExifImage
const moment = require('moment')
const q = require('q')

const validExtensions = ['jpg', 'jpeg', 'mp4']
const morningLimit = 5 // 5am;

let optionDry = false

program.version('1.1.1').usage('<directory> [options]').option('-d, --dry', 'do not perform move', setDryOption)

program.parse(process.argv)

let directoryName = null
if (program.args.length > 1) {
  console.log('Too many arguments.')
  process.exit(1)
} else if (program.args.length === 1) {
  directoryName = program.args[0]
} else {
  directoryName = process.cwd()
}

console.log(`Processing directory '${directoryName}'`)

if (optionDry) {
  console.info('Dry run : no changes will be made.')
}

processDirectory(directoryName)

function setDryOption () {
  optionDry = true
  return true
}

/**
 * Process a directory : list files, get timestamp and move them to appropriate subdirectory.
 * @param directoryName the directory to process
 */
function processDirectory (directoryName) {
  try {
    if (!fs.statSync(directoryName).isDirectory()) {
      console.error(`'${directoryName}' is not a directory`)
      process.exit(1)
    }
  } catch (err) {
    console.error(`'${directoryName}' is not valid : ${err}`)
    process.exit(1)
  }

  if (!_.endsWith(directoryName, '/')) {
    directoryName += '/'
  }

  let files = fs.readdirSync(directoryName)

  let date = null
  _.forEach(_.filter(files, validFile), function (file) {
    getDateFromExif(file).then(function (exifDate) {
      if (exifDate != null && exifDate.isValid()) {
        date = exifDate
      } else {
        date = moment(fs.statSync(directoryName + file).mtime)
      }

      // we remove X hours so that dates in the morning belongs to the previous calendar day
      date.subtract(morningLimit, 'hours')
      let subdirectoryName = date.format('YYYY_MM_DD') + '/'
      if (!optionDry) {
        createDirectory(directoryName + subdirectoryName)
        fs.renameSync(directoryName + file,
          directoryName + subdirectoryName + file)
      }

      console.log(
        `${directoryName + file} -> ${directoryName + subdirectoryName +
        file}`)
    }).then(null, function (err) {
      console.trace(err)
    })
  })
}

/**
 * Get the date of the picture from the exif data
 * @param file the file to read
 * @return {promise|*|Q.promise}
 */
function getDateFromExif (file) {
  let deferred = q.defer()
  try {
    new exif({ image: directoryName + file }, function (error, exifData) {
        if (error) {
          deferred.resolve(null)
          return
        }
        let dateString
        if (exifData['exif']['DateTimeOriginal'] !== undefined) {
          dateString = exifData['exif']['DateTimeOriginal']
        } else if (exifData['exif']['DateTime'] !== undefined) {
          dateString = exifData['exif']['DateTime']
        }
        deferred.resolve(moment(dateString, 'YYYY:MM:DD HH:mm:ss'))
      }
    )
  } catch (err) {
    deferred.reject(`Error: ${err}`)
  }

  return deferred.promise
}

/**
 * Create a directory if it does not already exists
 * @param directoryName the directory to create
 */
function createDirectory (directoryName) {
  if (!fs.existsSync(directoryName)) {
    fs.mkdirSync(directoryName, '0770')
  }
}

/**
 * @param file the file to process
 * @return boolean true if the file is valid for processing, false otherwise
 */
function validFile (file) {
  let extension = file.substring(file.lastIndexOf('.') + 1) // + 1 because we do not want the dot
  return _.includes(validExtensions, extension.toLowerCase())
}