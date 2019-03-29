#!/usr/bin/env node

'use strict'

const program = require('commander')
const fs = require('fs')
const _ = require('lodash')
const exiftool = require('exiftool-vendored').exiftool
const moment = require('moment')
const perf = require('execution-time')()

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

processDirectory(directoryName)
  .catch(error => {
    console.error(error)
  }).finally(() => {
    return exiftool.end()
  }
)

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

    let date = await readExifDate(file)

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
 *
 * @param file the media file to read
 * @returns {Promise<Date>}
 */
function readExifDate (file) {
  return new Promise((resolve, reject) => {
    exiftool
      .read(directoryName + file)
      .then((tags) => {
          if (tags.errors.length) {
            console.error(`error reading ${file} : ${tags.errors}`)
            resolve(null)
            return
          }

          if (tags.CreateDate) {
            resolve(moment(tags.CreateDate.toDate()))
          } else if (tags.ModifyDate) {
            resolve(moment(tags.ModifyDate.toDate()))
          } else {
            console.error(`no date found in exif tags for file ${file}`)
            resolve(null)
          }
        }
      )
      .catch(err => {
        console.error(`Error reading tag for ${file} `, err)
        reject(err)
      })
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