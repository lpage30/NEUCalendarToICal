# MURSDalendarToICal
Mendon-Upton Regional School District (massachusetts) calendars should be ICal format or have ICal option. PDF is not useful to the tech savvy.

## USAGE
obtain 1 or more URLs for MURSD PDF Calendars  

```
npm run ConvertToICal -- -i <url1> <url2> ... <urln> [-o <icaloutputfile] [-t <ical-title>]


npm run ConvertToICal -- 

  Converts 1 or more MURSD Calender PDFs (referenced by uri)  
  to a single icalendar format                                                  

Options

  -t, --title string         (optional) Title for created icalendar. (default: MURSD)    
  -o, --output string        (optional) Filename of ical file to create. (default: MURSD.ical       
  -i, --input uri_to_pdf[]   (required) 1 or more URI's each to a pdf file to download and use to create   
                             icalendar file.                                                               
  -h, --help                 Usage or help information                                                     
```
Generates a single ical file: MURSD.ical: 
example:
```
 npm run ConvertToICal -- -i 'https://core-docs.s3.amazonaws.com/documents/asset/uploaded_file/1013113/MURSD_SCHOOL_YEAR_CALENDAR_Revised_November_2020.pdf' 'https://core-docs.s3.amazonaws.com/documents/asset/uploaded_file/1138273/MURSD_SCHOOL_YEAR_CALENDAR_2021-2022.pdf'
```
