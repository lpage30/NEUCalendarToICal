# NEUCalendarToICal
Northeastern University's calendars should be ICal format or have ICal option. PDF is not useful to the tech savvy.

## USAGE
obtain 1 or more URLs for Northeastern PDF Calendars  

```
npm run ConvertToICal -- -i <url1> <url2> ... <urln> [-o <icaloutputfile] [-t <ical-title>]


npm run ConvertToICal -- 

  Converts 1 or more Northeastern University Calender PDFs (referenced by uri)  
  to a single icalendar format                                                  

Options

  -t, --title string         (optional) Title for created icalendar. (default: Northeastern University)    
  -o, --output string        (optional) Filename of ical file to create. (default: northeastern.ical       
  -i, --input uri_to_pdf[]   (required) 1 or more URI's each to a pdf file to download and use to create   
                             icalendar file.                                                               
  -h, --help                 Usage or help information                                                     
```
Generates a single ical file: northeaster.ical: 
example:
```
 npm run ConvertToICal -- -i 'https://registrar.northeastern.edu/app/uploads/2019-2020-UG-Expanded-Calendar-List-1.pdf' 'https://registrar.northeastern.edu/app/uploads/2018-2019-UG-Expanded-Calendar-List.pdf' 'https://registrar.northeastern.edu/app/uploads/2020-2021-UG-Basic-Calendar-List.pdf'
```
