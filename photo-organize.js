#!/usr/bin/env node

'use strict'

const program = require('commander')
const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const exif = require('exif').ExifImage
const moment = require('moment')
const perf = require('execution-time')()
// const q = require('q')

const validExtensions = ['jpg', 'jpeg', 'mp4']
const morningLimit = 5 // 5am;

let optionDry = false

// setup execution time reporting
perf.start()
process.on('exit', () => {
  console.log(perf.stop().words)
})

program.version('1.2').usage('<directory> [options]').option('-d, --dry', 'do not perform move', setDryOption)

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

if (optionDry) {
  console.info('Dry run : no changes will be made.')
}

if (!_.endsWith(directoryName, '/')) {
  directoryName += '/'
}

processDirectory(directoryName).catch(error => {
  console.error(error)
})

/**
 * Process a directory : list files, get timestamp and move them to appropriate subdirectory.
 */
async function processDirectory () {
  console.log(`Processing directory '${directoryName}'`)

  try {
    if (!fs.statSync(directoryName).isDirectory()) {
      console.error(`'${directoryName}' is not a directory`)
      process.exit(1)
    }
  } catch (err) {
    console.error(`'${directoryName}' is not valid : ${err}`)
    process.exit(1)
  }

  let files = fs.readdirSync(directoryName)

  for (const file of files) {
    if (!validFile(file)) {
      return
    }

    let date = null
    if (path.extname(file) === '.mp4') {
      // exif doesn't support mp4 files
      date = moment(fs.statSync(directoryName + file).mtime)
    } else {
      const exifDate = await getDateFromExif(file)
      if (exifDate != null && exifDate.isValid()) {
        date = exifDate
      }
    }

    if (date === null) {
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
  }

}

/**
 * Get the date of the picture from the exif data
 * @param file the file to read
 * @return {Promise}
 */
function getDateFromExif (file) {
  return new Promise((resolve) => {
    new exif({ image: directoryName + file }, (err, exifData) => {
        if (err) {
          console.error(err)
          resolve(null)
          return
        }

        let dateString
        if (exifData['exif']['DateTimeOriginal'] !== undefined) {
          dateString = exifData['exif']['DateTimeOriginal']
        } else if (exifData['exif']['DateTime'] !== undefined) {
          dateString = exifData['exif']['DateTime']
        }
        resolve(moment(dateString, 'YYYY:MM:DD HH:mm:ss'))
      }
    )
  })
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

function setDryOption () {
  optionDry = true
  return true
}