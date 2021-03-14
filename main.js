const CommandLineArgs = require('command-line-args')
const CommandLineUsage = require('command-line-usage')
const { writeICalendar } = require('./src/MURSDCalendarsToICalendar')

const DEFAULT_TITLE = 'Mendon Upton Regional School District'
const DEFAULT_OUTPUT= 'mursd.ical'
const uri_to_pdf = (uri) => {
    if(uri.endsWith('pdf')) {
        return new URL(uri)
    }
    throw new Error(`Not URI for PDF: ${uri}`)
}
const optionDefinitions = [
    { name: 'title', alias: 't', type: String, defaultValue: DEFAULT_TITLE,
      description: `(optional) Title for created icalendar. (default: ${DEFAULT_TITLE})`},
    { name: 'output', alias: 'o', type: String, defaultValue: DEFAULT_OUTPUT,
      description: `(optional) Filename of ical file to create. (default: ${DEFAULT_OUTPUT}` },
    { name: 'input', alias: 'i',  multiple: true, type: uri_to_pdf,
      description: '(required) 1 or more URI\'s each to a pdf file to download and use to create icalendar file.' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Usage or help information'},
]

const logUsage = (scriptName) => console.log(CommandLineUsage([
    {
        header: `npm run ${scriptName} -- `,
        content: 'Converts 1 or more MURSD Calender PDFs (referenced by uri) to a single icalendar format',
    },
    {
        header: 'Options',
        optionList: optionDefinitions,
    }
]))

async function main(argv = [], scriptName='main') {
    let args
    try {
        args = CommandLineArgs(optionDefinitions, { argv })
        if(args.help) {
            logUsage(scriptName)
            return
        }
        if (!args.input || args.input.length === 0) throw new Error('No URIs specified to convert')
        if (!args.output) throw new Error('No icalendar output file specified')
        if (!args.title) throw new Error('No icalendar title specified')
    } catch(error) {
        console.error(`ERROR: ${error.message}`)
        logUsage(scriptName)
        return
    }
    const urls = args.input.map(uri => uri.href)
    console.log('Converting MURSD pdfs to icalendar',{
        title: args.title,
        icalendarFile: args.output,
        urls,
    })
    try {
        await writeICalendar(urls, args.title, args.output)
        console.log('Finished creating icalendar file!', args.output)
    } catch(error) {
        console.error('Failed to create icalendar file.', error)
    }

}
if (!module.parent) {
    main(process.argv.slice(2), 'ConvertToICal')
}
module.exports = { main }
