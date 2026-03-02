/**
 * MEDFLOW - GOOGLE SHEETS BACKEND (OPTIONAL)
 * 
 * You asked to save data to a Google Sheet. Since pure frontend HTML cannot write to a Google Sheet 
 * without an API Key or Apps Script proxy, I have created this script for you.
 * 
 * If you want the data to ACTUALLY appear in your Google Sheet (instead of just localStorage),
 * copy/paste this code into Google Apps Script and deploy it.
 * 
 * HOW TO USE IT (Takes 1 minute):
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any code there, and paste this entire file.
 * 4. Click "Deploy" (top right) > "New deployment"
 * 5. Select type: "Web app"
 * 6. Under "Execute as", select: "Me"
 * 7. Under "Who has access", select: "Anyone"
 * 8. Click Deploy, authorize the permissions, and COPY THE WEB APP URL provided.
 * 9. Paste that URL into `app.js` at line 2: `const GOOGLE_WEB_APP_URL = "YOUR_URL_HERE";`
 */

const SHEET_NAME = "Requests"; // Make sure your tab in Google Sheets is named 'Requests' or rename this

function doPost(e) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
            || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

        // Add headers if empty
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(["Timestamp", "ID", "Patient", "Request Type", "Priority", "Status", "Doctor Assigned"]);
        }

        const data = JSON.parse(e.postData.contents);

        // Append the incoming frontend data to the sheet!
        sheet.appendRow([
            new Date(),
            data.id,
            data.patient,
            data.type,
            data.priority,
            data.status,
            data.doc
        ]);

        return ContentService.createTextOutput(JSON.stringify({ "success": true })).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ "error": error.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
}

// Required for CORS preflight
function doOptions(e) {
    return ContentService.createTextOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
}
