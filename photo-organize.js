#!/usr/bin/env node

import fs from 'fs'
import {extname} from 'path'

import { format, subHours } from 'date-fns'
import { program } from 'commander'
import { exiftool } from 'exiftool-vendored'

const validExtensions = ['.jpg', '.jpeg', '.mp4']
const morningLimit = 5 // 5am;

let optionDry = false

// setup execution time reporting
console.time('execution')
process.on('exit', () => {
  console.timeEnd('execution')
})

program.version('1.4').usage('<directory> [options]').option('-d, --dry', 'do not perform move', setDryOption)
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

if (!directoryName.endsWith('/')) {
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

  let count = 0
  let countIgnored = 0
  const files = fs.readdirSync(directoryName)

  for (const file of files) {
    if (!validFile(file)) {
      countIgnored++
      continue
    }

    let date = await readExifDate(file)

    if (date === null) {
      date = fs.statSync(directoryName + file).mtime
    }

    // we remove X hours so that dates in the morning belongs to the previous calendar day
    subHours(date, morningLimit)
    const subdirectoryName = format(date, 'yyyy_MM_dd') + '/'
    if (!optionDry) {
      createDirectory(directoryName + subdirectoryName)
      fs.renameSync(directoryName + file,
        directoryName + subdirectoryName + file)
    }

    console.log(`${file} -> ${subdirectoryName + file}`)
    count++
  }

  console.log(`Processed ${count} file(s) in ${directoryName}, plus ${countIgnored} ignored.`)
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
            resolve(tags.CreateDate.toDate())
          } else if (tags.ModifyDate) {
            resolve(tags.ModifyDate.toDate())
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
 * Checks if a file can be processed.
 * dot files are ignored and check files against a list of valid extensions
 *
 * @param file the file to process
 * @return boolean true if the file is valid for processing, false otherwise
 */
function validFile (file) {
  if (file.startsWith('.')) {
    return false
  }

  const fileExtension = extname(file).toLowerCase()
  for (const validExtension of validExtensions) {
    if (fileExtension === validExtension) {
      return true
    }
  }
  return false
}

function setDryOption () {
  optionDry = true
  return true
}
