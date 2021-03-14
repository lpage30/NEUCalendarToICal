const { writeFile, unlink } = require('fs')
const fetch = require('node-fetch')
const ical = require('ical-generator')
const pdf2html = require('pdf2html')
const { promisify } = require('util')
const uuid = require('uuid/v5')
const pdfCalendar = 'https://core-docs.s3.amazonaws.com/documents/asset/uploaded_file/1013113/MURSD_SCHOOL_YEAR_CALENDAR_Revised_November_2020.pdf'
const namespace = Array.from('mursd________org').map(s => s.charCodeAt(0));

const writeFileAsync = promisify(writeFile)
const unlinkAsync = promisify(unlink)
const pdf2htmlAsync = promisify(pdf2html.html)
const sortDateAsc = (l, r) => l < r ? -1 : l > r ? 1 : 0
const DATE_REGEX_STRING = "(\\d{1,2}/\\d{1,2})"
const DATE_REGEX = new RegExp(DATE_REGEX_STRING)
const NEXT_DATE_REGEX = new RegExp(`^(\\s*[,-]\\s*)${DATE_REGEX_STRING}`)
const lcMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTHS = [
    ...lcMonths,
    ...lcMonths.map(mo => `${mo[0].toUpperCase()}${mo.substring(1)}`),
    ...lcMonths.map(mo => mo.toUpperCase()),
]
const END_OF_CALENDAR_REGEX = new RegExp('^\s*Color Key:')
const MARKING_TERM_END_DATES_TITLE_REGEX = new RegExp(' MARKING TERM END DATES:')
const MARKED_TERM_END_REGEX = new RegExp(' Term [1-4]: ')
const TRAILING_REGEX = new RegExp('( S M T W Th F S)|( [0-9]{1,2})*$')
const SCHOOL_YEAR_REGEX = new RegExp('^([0-9]{4})-([0-9]{4})')

const isNewCalendar = line => line.match(SCHOOL_YEAR_REGEX) !== null
const isNewMonthBlock = line => MONTHS.includes((line.match(/^\s*(\w+)/) || [])[1])
const hasTermEndDates = line => line.match(MARKING_TERM_END_DATES_TITLE_REGEX) !== null || line.match(MARKED_TERM_END_REGEX) !== null
const indexOfTermEndDates = line => {
    const title = line.match(MARKING_TERM_END_DATES_TITLE_REGEX)
    if (title !== null) {
        return title.index
    }
    const term = line.match(MARKED_TERM_END_REGEX)
    if (term !== null) {
        return term.index
    }
    return line.length
}
const isEndOfCalendar = line => line.match(END_OF_CALENDAR_REGEX) !== null
const getSchoolYears = line => {
    const result = line.match(SCHOOL_YEAR_REGEX)
    if (result !== null) {
        return { start: result[1], end: result[2] }
    }
    return undefined
}
const monthDateToDate = (monthDayString, schoolYears) => {
    const [month, day] = monthDayString.split('/').map(value => Number(value))
    const year = Number((8 <= month && month <= 12) 
        ? schoolYears.start
        : schoolYears.end)
    return new Date(year, month - 1, day)
}

const convertToDates = (eventDatesString, schoolYears) => {
    const dateRanges = eventDatesString.replace(/:/g,'').split(',').map(range => range.trim())
    const dates = []
    dateRanges.forEach(dateRange => {
        const rangeDates = dateRange.split('-')
            .map(date => monthDateToDate(date.trim(), schoolYears))
        const start = rangeDates[0]
        const end = rangeDates[1] || start
        dates.push(start)
        const days = end.getDate() - start.getDate()
        for (let day = 1; day <= days; day++) {
            const newDate = new Date(start.getTime())
            newDate.setDate(start.getDate() + day)
            dates.push(newDate)
        }
    })
    dates.sort(sortDateAsc)
    const result = dates.reduce((ranges, date) => {
        const result = [...ranges.slice(0, -1)]
        let {start, end} = ranges.slice(-1)[0] || { start: date, end: date}
        if ((end.getDate() + 1) === date.getDate()) {
            end = date
        }
        result.push({
            start,
            end
        })
        return result
    }, [])
    return result

}
const hasEvents = line => line.match(DATE_REGEX) !== null
const indexNextEvent = line => {
    if (hasEvents(line)) {
        return line.match(DATE_REGEX).index
    }
    return (line.match(TRAILING_REGEX) || { index: line.length }).index
}
const getICalEvents = (dates, subject, addedDetail) => {
    const events = []
    dates.forEach(({start, end}) => {
        const uniqueName = `${start.getMonth()}${start.getDay()}${start.getFullYear()}${subject}`;
        const uid = uuid(uniqueName, namespace)
        const event = {
            start,
            end,
            uid,
            allDay: true,
            summary: subject,
            description: addedDetail || '',
        }
        events.push(event)
    })
    return events
}
const extractDatesPrefix = event => {
    let nextIndex = 0
    while(true) {
        const dateMatch = event.substring(nextIndex).match(DATE_REGEX)
        if (dateMatch === null) {
            break
        }
        nextIndex += dateMatch.index + dateMatch[1].length
        const nextDateMatch = event.substring(nextIndex).match(NEXT_DATE_REGEX)
        if (nextDateMatch !== null) {
            nextIndex += nextDateMatch.index + nextDateMatch[1].length
            continue
        }
        const trailingColonMatch = event.substring(nextIndex).match(/^(\s*:)/)
        if (trailingColonMatch !== null) {
            nextIndex += trailingColonMatch.index + trailingColonMatch[1].length
        }
        break
    }
    const datesPrefix = event.substring(0, nextIndex)
    return datesPrefix
}
const extractICalEvents = (line, schoolYears, endNotes) => {
    if (!hasEvents(line)) return []
    let event = line.substring(line.match(DATE_REGEX).index).trim()
    const eventDates = extractDatesPrefix(event)
    event = event.substring(eventDates.length)
    const endEventIndex = indexNextEvent(event)
    const dates = convertToDates(eventDates.trim(), schoolYears)
    const subject = event.substring(0, endEventIndex).trim()
    const addedDetail = Object.keys(endNotes)
        .filter(endNote => 0 <= subject.indexOf(endNote))
        .map(endNote => endNotes[endNote])[0]
    const nextEvent = event.substring(endEventIndex).trim()
    return [
        ...getICalEvents(dates, subject, addedDetail),
        ...extractICalEvents(nextEvent, schoolYears, endNotes)
    ]
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
                    const data = line.substr(0, endIndex)
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
const collectEndNotes = (startIndex, lines) => {
    const endNotes = {}
    for(let i = startIndex; i < lines.length; i+= 1) {
        const line = lines[i]
        if (isNewMonthBlock(line) || isEndOfCalendar(line)) {
            break
        }
        const endNoteMatch = line.match(/\*([^\:]+): /)
        if (endNoteMatch !== null) {
            endNotes[`${endNoteMatch[1]}*`] = line.substring(3 + endNoteMatch[1].length)
        }
    }
    return endNotes
}

const extractICalEventsFromCalendar = html => {
    const result = []
    const lines = extractUsableLines(html)
    let schoolYears = undefined
    let endNotes = undefined
    let lookForEvents = false
    for(let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (isEndOfCalendar(line)) {
            lookForEvents = false
            continue
        }
        if (isNewCalendar(line)) {
            schoolYears = getSchoolYears(line)
            lookForEvents = false
            continue
        }
        if (isNewMonthBlock(line)) {
            lookForEvents = true
            endNotes = collectEndNotes(i+1,lines)
            continue
        }
        if(lookForEvents && hasEvents(line)) {
            let eventLine = line
            if (hasTermEndDates(line)) {
                eventLine = line.substring(0, indexOfTermEndDates(line))
            }
            lineEvents = extractICalEvents(eventLine, schoolYears, endNotes)
            result.push(...lineEvents)
        }
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
    for (html of htmls) {
        icalEvents.push(...extractICalEventsFromCalendar(html))
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
