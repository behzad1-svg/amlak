const fs = require('fs');
const https = require('https');

const data = fs.readFileSync('project.zip');

const req = https.request({
  hostname: 'file.io',
  port: 443,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=---boundary',
  }
}, res => {
  res.on('data', d => process.stdout.write(d));
});

req.write('-----boundary\r\n');
req.write('Content-Disposition: form-data; name="file"; filename="project.zip"\r\n');
req.write('Content-Type: application/zip\r\n\r\n');
req.write(data);
req.write('\r\n-----boundary--\r\n');
req.end();
