const { writeFile, unlink } = require('fs')
const fetch = require('node-fetch')
const ical = require('ical-generator')
const pdf2html = require('pdf2html')
const { promisify } = require('util')
const pdfCalendar = 'https://registrar.northeastern.edu/app/uploads/2020-2021-UG-Basic-Calendar-List.pdf'

const writeFileAsync = promisify(writeFile)
const unlinkAsync = promisify(unlink)
const pdf2htmlAsync = promisify(pdf2html.html)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_REGEX = new RegExp('[0-9]{1,2}:[0-9][0-9][ ]*(am|pm|a.m.|p.m.){0,1}', 'ig')
const DEFAULT_DURATION_HRS = 1
const sortDateAsc = (l, r) => l < r ? -1 : l > r ? 1 : 0

/**
 * Extracts date from passed line. The date format should be:
 * 'Month Day Year                 DOW'
 * @param {string} line extracted from HTML
 * @returns {Date | undefined} extracted date (if any) otherwise undefined
 */
const getDate = line => {
    const day = line.slice(-4)
    const datestr = line.substr(0, line.length - 4)
    if(day[0] === ' ' && DOW.includes(day.trim()) && !isNaN(Date.parse(datestr))) {
        return new Date(new Date(datestr).toISOString())
    }
}
/**
 * extract an array of specific datetime times for the passed event extracted from HTML.
 * Subject and detail are searched for time format text 'hh:MM XX' or 'hh:MM X.X'
 * @param {Object} extractedScheduleEvent { startDate, subject, detail } 
 *          object constructed for a single scheduled event extracted from HTML
 * @returns {[Date]} array of Dates sorted by time, None if no times were found
 */
const getTimes = extractedScheduleEvent => {
    const subjectMatches = extractedScheduleEvent.subject.match(TIME_REGEX) || []
    const detailMatches = extractedScheduleEvent.details.match(TIME_REGEX) || []
    return [...subjectMatches, ...detailMatches]
        .map(time=> new Date(`${extractedScheduleEvent.startDate.toISOString().split('T')[0]} ${time.replace(/\./g,'')}`))
        .sort(sortDateAsc)
}
/**
 * Convert the passed event extracted from HTML to
 * an ICal-generator Event object.
 * 
 * @param {Object} extractedScheduleEvent { startDate, subject, detail } 
 * @return {Object} ical object to be passed to ical-generator createEvent
 */
const getICalEvent = extractedScheduleEvent => {
    const times = getTimes(extractedScheduleEvent)
    const start = new Date((times.length > 0 ? times[0] : 
        extractedScheduleEvent.startDate).toISOString())
    const end = times.length === 0 ? null : 
                new Date(times.length > 1 ? times[1].getHours() : 
                        times[0].setHours(times[0].getHours() + DEFAULT_DURATION_HRS))
    return {
        start,
        end,
        allDay: times.length === 0,
        summary: extractedScheduleEvent.subject,
        description: extractedScheduleEvent.details,
    }
}
/**
 * Parse through the HTML file extracting out the lines/line parts 
 * residing between '<p>' and '</p>'. This text contains the schedule information
 * @param {String} html pdf converted to html
 * @returns {[string]} lines, or line parts that can be converted to schedule events
 */
const extractUsableLines = html => {
    const result = []
    const lines = html.split('\n').map(val => val.trim())
    let findStartParagraph = true
    // move through each line
    for(let line of lines) {
        // extract text between <p> and </p> across multiple lines
        // this allows for more than 1 <p> -> </p> in a single line
        while (0 < line.length) {
            if (findStartParagraph) {
                const startIndex = line.indexOf('<p>')
                if (0 <= startIndex) {
                    line = line.substr(startIndex + 3)
                    findStartParagraph = false
                } else {
                    // no start of paragraph found, so break we still have nothing to write
                    // we don't support nested paragraphs (not really)
                    break
                }
            }
            if (!findStartParagraph) {
                const endIndex = line.indexOf('</p>')
                if (0 <= endIndex) {
                    const data = line.substr(0,endIndex)
                    if(0 < data.length) {
                        // string before </p> is within a <p> -> </p> so add it
                        result.push(data)
                    }
                    line = line.substr(endIndex + 4)
                    findStartParagraph = true
                    // found the end of paragraph, so loop back to find the start again
                    continue
                }
            }
            // line must be non-zero and within a paragraph <p> -> </p>
            result.push(line)
            break
        }
    }
    return result
}
/**
 * Extract out all the scheduling events from the passed HTML file
 * @param {String} html pdf converted to html 
 * @return {[Object]} array of extracted Schedule Events { startDate, subject, detail } 
 */
const extractScheduleEvents = html => {
    const result = []
    const lines = extractUsableLines(html)
    let date
    for(const line of lines) {
        const index = result.length - 1
        const newDate = getDate(line)
        if (newDate) {
            date = newDate
            result.push({
                startDate: date,
                subject: '',
                details: '',
            })
            continue
        }
        if (index < 0) {
            continue
        }
        // The 1st line after a date, or a line beginning with a bullet marks a new event
        if (result[index].subject.length === 0) {
            result[index].subject = line.startsWith('&bull;') ? line.substr(6).trim() : line
            continue
        }
        if(line.startsWith('&bull;')) {
            result.push({
                startDate: date,
                subject: line.substr(6).trim(),
                details: '',
            })
            continue
        }
        result[index].details += line
    }
    return result
}
/**
 * Converts array of pdfUrls to array of HTML strings
 * 
 * @param {URI | [URI]} pdfUrls URIs to PDF files to be downloaded and converted to ICAL
 */
const pdfUrlsToHtmls = async pdfUrls => {
    const urls = Array.isArray(pdfUrls) ? pdfUrls : [pdfUrls]
    const result = []
    const tempFilepath = '~tmp.pdf'
    for(url of urls) {
        const response = await fetch(url)
        const pdf = await response.buffer()
        await writeFileAsync(tempFilepath, pdf)
        const html = await pdf2htmlAsync(tempFilepath)
        result.push(html)
    }
    await unlinkAsync(tempFilepath)
    return result
}
/**
 * Construct a single ICalendar from 1+ Urls to PDF Calendars (Northeastern format).
 * 
 * @param {URI | [URI]} calendarPDFUrls URIs to PDFs holding calendars in Northeastern's format.
 * @param {string} calendarTitle Name to give ICalendar
 */
async function createICalendar(calendarPDFUrls, calendarTitle) {
    const htmls = await pdfUrlsToHtmls(calendarPDFUrls)
    const icalEvents = []
    for(html of htmls) {
        const events = extractScheduleEvents(html)
            .map(extractedScheduleEvent => getICalEvent(extractedScheduleEvent))
        icalEvents.push(...events)
    }
    icalEvents.sort((l, r) => sortDateAsc(l.start, r.start))
    const result = ical({
        name: calendarTitle
    })
    icalEvents.forEach(event => result.createEvent(event))
    return result
}
/**
 * Construct and write a single ICalendar from 1+ Urls to PDF Calendars (Northeastern format)
 * to the provided icalendarFilename
 * @param {URI | [URI]} calendarPDFUrls URIs to PDFs holding calendars in Northeastern's format.
 * @param {string} calendarTitle Name to give ICalendar
 * @param {string} icalendarFilename name of icalendar file to be created
 */
async function writeICalendar(calendarPDFUrls, calendarTitle, icalendarFilename) {
    const icalendar = await createICalendar(calendarPDFUrls, calendarTitle)
    await writeFileAsync(icalendarFilename, icalendar.toString())
}
module.exports = {
    createICalendar,
    writeICalendar
}
