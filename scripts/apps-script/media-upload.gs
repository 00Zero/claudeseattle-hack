// Media upload: gives hack.claudeseattle.org a one-time Google Drive upload link into the media
// folder, so attendees can upload photos and videos without seeing or opening the folder.
// Runs as the folder's owner. The site checks who is uploading, calls this with the shared
// secret, and hands the link to the browser, which sends the file straight to Google. A link can
// upload one file and nothing else; the folder stays restricted to the people it's shared with.
//
// Setup, once (script.google.com > New project, signed in as the folder's owner):
// 1. Paste this file.
// 2. Project Settings > Script Properties: add MEDIA_UPLOAD_SECRET (same value as in Vercel) and
//    MEDIA_FOLDER_ID (the ID at the end of the folder's URL).
// 3. Run authorize() once and approve the permissions. The log shows the folder's name.
// 4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the web app
//    URL into Vercel as MEDIA_UPLOAD_URL. "Anyone" only means the URL needs no Google sign-in;
//    every request must carry the secret.
// After editing the script, Deploy > Manage deployments > Edit > New version keeps the same URL.
// No size cap here: Drive takes files up to 5 TB, and the site uploads in chunks it can resume.

// DriveApp.createFile() is never called; naming it makes Apps Script ask for full Drive access
// instead of read-only, which the upload links need.

const ALLOWED_ORIGIN = /^(https:\/\/hack\.claudeseattle\.org|http:\/\/localhost:\d+)$/;

function authorize() {
  console.log('Uploads go to: ' + folder_().getName());
}

// Body: { secret, action: 'start', name, mimeType, size, origin } returns { uploadUrl }.
//       { secret, action: 'check', fileId } returns { name, mimeType, size } if the file is in the folder.
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'Body must be JSON' });
  }
  const secret = PropertiesService.getScriptProperties().getProperty('MEDIA_UPLOAD_SECRET');
  if (!secret || body.secret !== secret) return json_({ error: 'Unauthorized' });
  try {
    if (body.action === 'start') return json_(start_(body));
    if (body.action === 'check') return json_(check_(body));
    return json_({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json_({ error: String(err.message || err) });
  }
}

function start_(body) {
  const name = String(body.name || '').slice(0, 200);
  const mimeType = String(body.mimeType || '');
  const size = Number(body.size);
  const origin = String(body.origin || '');
  if (!name) throw new Error('Missing file name');
  if (!/^(image|video)\//.test(mimeType)) throw new Error('Only photos and videos');
  if (!(size > 0)) throw new Error('The file is empty');
  if (!ALLOWED_ORIGIN.test(origin)) throw new Error('Origin not allowed');

  // fields=id keeps the folder out of what the browser gets back when the upload finishes.
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ name: name, mimeType: mimeType, parents: [folder_().getId()] }),
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
      // The browser that uploads must come from this origin, or Google blocks it.
      Origin: origin,
    },
    muteHttpExceptions: true,
  });
  const uploadUrl = response.getHeaders()['Location'] || response.getHeaders()['location'];
  if (response.getResponseCode() !== 200 || !uploadUrl) {
    throw new Error('Drive returned HTTP ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 300));
  }
  return { uploadUrl: uploadUrl };
}

function check_(body) {
  const file = DriveApp.getFileById(String(body.fileId || ''));
  const folderId = folder_().getId();
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) {
      return { name: file.getName(), mimeType: file.getMimeType(), size: file.getSize() };
    }
  }
  throw new Error('Not in the media folder');
}

function folder_() {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('MEDIA_FOLDER_ID'));
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
